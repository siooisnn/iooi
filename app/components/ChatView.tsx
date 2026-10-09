"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ClaudeUsageCircle, ClaudeUsageDetails, useClaudeUsage } from "./ClaudeUsageBadge";
import { ContextUsageBadge, type UsageMessage } from "./ContextUsageBadge";
import { buildChatContext } from "../lib/chat-context";
import { readChatResponse } from "../lib/chat-stream";
import { useChatScrollPosition } from "../lib/use-chat-scroll-position";
import { useTwilightLayout } from "../lib/use-twilight-layout";
import { alignLegacySummerCalls } from "../lib/chat-timeline";
import { GPT_MODELS, resolveGptModel } from "../lib/gpt-models";
import type { CodeTaskState } from "../lib/code-task-state";
import type { CodeReleaseState } from "../lib/code-release";
import { imageFields, MAX_IMAGES_PER_MESSAGE, messageImages, stripObjectPlaceholders } from "../lib/message-images";
import { prepareImageForUpload } from "../lib/image-compress";
import { workContextHistory } from "../lib/work-context";
import type { AssistantMode, CacheStats, ChatSession, ClaudeReasoningEffort, DevelopmentModePref, DevelopmentProject, GptReasoningEffort, Message, PendingAttachment, ReplyRequestState, SummerCall, SummerWriteProposal } from "../lib/app-types";
import { CLAUDE_REASONING_OPTIONS, CONTEXT_WINDOW_ROUNDS, DEVELOPMENT_MODE_KEY, GPT_DEFAULT_PROMPT, GPT_REASONING_OPTIONS, MODELS, loadDevelopmentModePrefs } from "../lib/app-settings";
import type { Settings } from "../lib/app-settings";
import { APP_TIME_ZONE, formatChatRoomTime, getDateLabel, getNowContext, getTime, getTodayStr, parseMessageDateTime } from "../lib/app-time";
import { genId, getChatStatusLabel, hasLaterUserMessage, isSummerUtilityMessage, mergeChatMessages, shouldShowChatRoomTime } from "../lib/chat-sessions";
import { apiFetch, saveLocal, syncGptToServer, syncToServer } from "../lib/client-api";
import { CollapsibleSummerCard, ThinkingBlock, renderContent } from "./ChatContent";
import { ChatGlyph } from "./RetroDesktop";

// MSN's nudge: the window shakes. Only the look; nothing is sent.
const NUDGE_FRAMES: Keyframe[] = [
  [0, 0], [-9, 4], [7, -5], [-8, -3], [9, 5], [-6, 6], [7, -4], [-4, 3], [3, -2], [0, 0],
].map(([x, y]) => ({ transform: `translate(${x}px, ${y}px)` }));
const NUDGE_COOLDOWN_MS = 3000;

export const REPLY_REQUEST_LABELS: Record<ReplyRequestState, string> = {
  idle: "",
  preparing: "正在整理这轮消息…",
  waiting: "正在连接并等待回复…",
  searching: "酥酥正在搜索并整理资料…",
  slow: "回复有点慢，仍在等待…",
  "very-slow": "这轮还在后台处理，完成后会自动出现；请先不要重复发送",
  paused: "已暂停等待；如果请求已经送达，回复稍后仍可能回来",
  failed: "连接中断了，但消息已经保存；后台回复完成后，重新打开会自动取回",
};

// 输入框随机小话
export const INPUT_HINTS = [
  "今天的风很适合想我",
  "作业写完了吗就玩手机",
  "说点什么吧，我在",
  "想我了可以直说",
  "今天过得怎么样？",
  "嘘，我在听",
  "饭吃了吗？",
  "有什么开心的事吗",
];

// Chat View
export function ChatView({
  assistantMode,
  settings,
  session,
  sessions,
  updateMessages,
  updateSettings,
  setLastCache,
  setAiMood,
  aiMood,
  setActiveSessionId,
  createSession,
  deleteSession,
  renameSession,
  listEntryMode = false,
  onBackToList,
  retro = false,
}: {
  assistantMode: AssistantMode;
  settings: Settings;
  session: ChatSession;
  sessions: ChatSession[];
  updateMessages: (updater: (msgs: Message[]) => Message[]) => void;
  updateSummary: (summary: string, until: number) => void;
  updateSettings: (p: Partial<Settings>) => void;
  setLastCache: React.Dispatch<React.SetStateAction<CacheStats | null>>;
  setAiMood: React.Dispatch<React.SetStateAction<{ emoji: string; ts: number }>>;
  aiMood: { emoji: string; ts: number };
  setActiveSessionId: (id: string) => void;
  createSession: () => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, name: string) => void;
  listEntryMode?: boolean;
  onBackToList?: () => void;
  /** Retro mode: the room as a 2007 MSN window (see xp-chat.css). */
  retro?: boolean;
}) {
  const isGpt = assistantMode === "gpt";
  const claudeUsage = useClaudeUsage(!isGpt);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [streamingReply, setStreamingReply] = useState("");
  const [replyRequestState, setReplyRequestState] = useState<ReplyRequestState>("idle");
  const [replyRequestDetail, setReplyRequestDetail] = useState("");
  const [codeTaskStatus, setCodeTaskStatus] = useState<{
    sessionId: string; task: CodeTaskState | CodeReleaseState | null;
  } | null>(null);
  const activeCodeTask = codeTaskStatus?.sessionId === session.id ? codeTaskStatus.task : null;
  const [showSessions, setShowSessions] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [developmentModePrefs, setDevelopmentModePrefs] = useState(loadDevelopmentModePrefs);
  const developmentModePref = developmentModePrefs[session.id];
  const developmentMode = !isGpt && developmentModePref?.enabled === true;
  const developmentProject: DevelopmentProject = developmentModePref?.project ?? "iooi";
  const developmentProjectLabel = developmentProject === "iooi" ? "iooi" : "Summer";
  const workUsageMessages = useMemo<UsageMessage[]>(
    () => workContextHistory(session.messages, developmentProject),
    [session.messages, developmentProject],
  );
  function updateDevelopmentModePref(patch: Partial<DevelopmentModePref>) {
    const liveIds = new Set(sessions.map((item) => item.id));
    const next: Record<string, DevelopmentModePref> = {};
    for (const [id, pref] of Object.entries(developmentModePrefs)) {
      if (liveIds.has(id)) next[id] = pref;
    }
    next[session.id] = { enabled: developmentMode, project: developmentProject, ...patch };
    saveLocal(DEVELOPMENT_MODE_KEY, next);
    setDevelopmentModePrefs(next);
  }
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionMessagesRef = useRef<Message[]>(session.messages);
  const sendingRef = useRef(false);
  const uploadingRef = useRef(false);
  const replyRequestIdRef = useRef(0);
  const pausedReplyRequestIdRef = useRef<number | null>(null);
  const activeReplyRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const replyStatusTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const [initialMessageCount] = useState(() => session.messages.length);
  // Routine Summer wake notices stay hidden in every chat theme.
  const quietSummerWake = true;
  const showQuota = !isGpt;
  // Keep stored indices for proposal actions while excluding routine wake
  // notices from visible neighbours, timestamps and bubble grouping.
  const displayMessages = alignLegacySummerCalls(session.messages)
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => !(message.source === "summer_call" &&
      message.content.includes("已读取 Summer 唤醒内容与记忆状态")));
  const { scrollRef, handleScroll, followLatest } = useChatScrollPosition(
    `iooi-scroll-${assistantMode}-${session.id}`,
    session.messages.length + streamingReply.length,
  );
  // Rooms float their title and composer over the messages.
  useTwilightLayout(listEntryMode, scrollRef);

  // ── 巧思:随机输入提示 / 扣6彩蛋 ──
  const [heartRain, setHeartRain] = useState(false);
  const [inputHint] = useState(() => INPUT_HINTS[Math.floor(Math.random() * INPUT_HINTS.length)]);
  const [weatherText, setWeatherText] = useState("");
  const [editingProposalIndex, setEditingProposalIndex] = useState<number | null>(null);
  const [proposalDraft, setProposalDraft] = useState<SummerWriteProposal | null>(null);

  // ── Retro: 抖一抖. The notes live only while this window is open. ──
  const [nudgeNotes, setNudgeNotes] = useState<Array<{ id: string; text: string }>>([]);
  const lastNudgeRef = useRef(0);
  function sendNudge() {
    const now = Date.now();
    const tooSoon = now - lastNudgeRef.current < NUDGE_COOLDOWN_MS;
    setNudgeNotes((notes) => [...notes.slice(-4), {
      id: genId(),
      text: tooSoon ? "你不能如此频繁地发送闪屏振动。" : "你发送了一个闪屏振动。",
    }]);
    followLatest();
    if (tooSoon) return;
    lastNudgeRef.current = now;
    try { navigator.vibrate?.([70, 40, 70]); } catch { /* No vibration on iOS. */ }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    scrollRef.current?.closest<HTMLElement>(".chat-container")
      ?.animate(NUDGE_FRAMES, { duration: 620, easing: "linear" });
  }

  useEffect(() => {
    if (isGpt || !settings.city) return;
    let stale = false;
    apiFetch(`/api/weather?city=${encodeURIComponent(settings.city)}`)
      .then((r) => r.json())
      .then((d) => { if (!stale && d.weather) setWeatherText(d.weather); })
      .catch(() => {});
    const iv = setInterval(() => {
      apiFetch(`/api/weather?city=${encodeURIComponent(settings.city)}`)
        .then((r) => r.json())
        .then((d) => { if (!stale && d.weather) setWeatherText(d.weather); })
        .catch(() => {});
    }, 60 * 60 * 1000);
    return () => { stale = true; clearInterval(iv); };
  }, [isGpt, settings.city]);

  const currentModel = MODELS.find((m) => m.id === settings.model) || MODELS[0];
  const assistantName = isGpt ? (settings.gptName || "GPT") : settings.aiName;
  const assistantAvatar = isGpt ? settings.gptAvatar : settings.aiAvatar;
  const currentGptModel = resolveGptModel(settings.gptModel);
  const currentModelId = isGpt ? currentGptModel.apiId : currentModel.apiId;
  const currentModelLabel = isGpt ? currentGptModel.label : `订阅 · ${currentModel.label}`;
  const summerEndpoint = isGpt ? "/api/gpt/summer" : "/api/summer";

  function clearReplyStatusTimers() {
    for (const timer of replyStatusTimersRef.current) clearTimeout(timer);
    replyStatusTimersRef.current = [];
  }

  function pauseReply() {
    const active = activeReplyRequestRef.current;
    if (!active) return;
    pausedReplyRequestIdRef.current = active.id;
    clearReplyStatusTimers();
    setReplyRequestState("paused");
    setReplyRequestDetail(developmentMode && !isGpt ? "已停止等待画面，开发任务仍在服务器执行。" : "");
    setStreamingReply("");
    active.controller.abort();
  }

  useEffect(() => {
    return () => {
      clearReplyStatusTimers();
      const active = activeReplyRequestRef.current;
      if (active) {
        pausedReplyRequestIdRef.current = active.id;
        active.controller.abort();
      }
    };
  }, []);

  useEffect(() => {
    sessionMessagesRef.current = session.messages;
  }, [session.id, session.messages]);

  useEffect(() => {
    if (isGpt) return;
    let disposed = false;
    let lastSyncedTask = "";
    const checkTask = async () => {
      try {
        const query = `sessionId=${encodeURIComponent(session.id)}`;
        const [taskResponse, releaseResponse] = await Promise.all([
          apiFetch(`/api/code-task?${query}`), apiFetch(`/api/code-release?${query}`),
        ]);
        if (!taskResponse.ok || !releaseResponse.ok) return;
        const [taskData, releaseData] = await Promise.all([
          taskResponse.json() as Promise<{ task?: CodeTaskState | null }>,
          releaseResponse.json() as Promise<{ task?: CodeReleaseState | null }>,
        ]);
        if (disposed) return;
        const task = [taskData.task, releaseData.task]
          .filter((item): item is CodeTaskState | CodeReleaseState => Boolean(item))
          .sort((a, b) => b.startedAt - a.startedAt)[0] || null;
        setCodeTaskStatus({ sessionId: session.id, task });
        if (task && (task.status === "done" || task.status === "error") && lastSyncedTask !== task.taskId) {
          const sync = await apiFetch("/api/sync");
          if (!sync.ok || disposed) return;
          const server = await sync.json() as { sessions?: ChatSession[] };
          const remote = server.sessions?.find((item) => item.id === session.id);
          if (remote && !disposed) {
            updateMessages((messages) => mergeChatMessages(messages, remote.messages));
            lastSyncedTask = task.taskId;
          }
        }
      } catch { /* The next poll retries after network recovery. */ }
    };
    void checkTask();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void checkTask(); }, 4_000);
    const onVisible = () => { if (document.visibilityState === "visible") void checkTask(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { disposed = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [isGpt, session.id, session.kind, updateMessages]);


  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  function buildStablePrompt(): string {
    if (isGpt) {
      return `${GPT_DEFAULT_PROMPT}\n\n你在这个窗口显示的名字是${assistantName}。`;
    }
    return settings.prompt + `\n\n你叫${settings.aiName}。
回复时请正常使用中文标点符号（句号、逗号、问号、感叹号等），不要省略标点。
永远直接对她说话，用"你"而不是"她"。不要写第三人称旁白、独白或场景描写（如"她来了""看着她的消息"），你不是旁白者，你是她的对话对象。
当前时间只来自后台时间上下文；聊天记录正文不包含时间戳，不要在回复开头补写方括号日期时间。
默认回复保持简洁：普通聊天 1 到 3 小段即可，不要复述她刚说过的话，不要主动总结背景或解释 summer。只有她要求分析、技术细节、长文、安抚，或当下确实需要展开时，才写长。
每次回复的最末尾加上 [心情:短词] 标记你此刻的真实状态，用1到4个中文词，不要用emoji。例如 [心情:平静]、[心情:想你]、[心情:有点困]。这个标记会被系统隐藏，她看不到，所以请诚实表达。`;
  }

  function buildDynamicPrompt(sessionCache?: string): string {
    let prompt = `【当前时间】\n${getNowContext()}`;
    if (sessionCache?.trim()) {
      prompt += `\n\n【本窗口会话缓存】\n${sessionCache.trim()}\n（这是同一个聊天窗口里较早内容的前情，用来保持这场对话不断线；自然使用，不要主动说明你看到了缓存。）`;
    }
    if (!isGpt && settings.city && weatherText) {
      prompt += `\n【当前天气】\n${weatherText}\n（自然地知道就好，不用每次都报天气，只在相关或她需要时提起）`;
    }
    return prompt;
  }

  function replaceMessageAt(index: number, updater: (message: Message) => Message | null) {
    const current = sessionMessagesRef.current;
    const next = current.flatMap((message, i) => {
      if (i !== index) return [message];
      const updated = updater(message);
      return updated ? [updated] : [];
    });
    sessionMessagesRef.current = next;
    updateMessages(() => next);
  }

  function proposalFromMessage(message: Message): SummerWriteProposal | null {
    if (message.proposal?.content?.trim()) return message.proposal;
    if (message.source !== "summer_write_proposal") return null;
    const lines = message.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) return null;
    const headerParts = lines[0].split("·").map((part) => part.trim());
    const layerText = headerParts.find((part) => part.includes("提议写入")) || "";
    const layer =
      layerText.includes("芒种") ? "mangzhong" :
      layerText.includes("夏至") ? "xiazhi" :
      layerText.includes("rain") ? "rain" :
      layerText.includes("渡口") || layerText.includes("ferry") ? "ferry" :
      "xiaoshu";
    const weightText = headerParts.find((part) => part.startsWith("权重")) || "";
    const weight = Number(weightText.replace(/\D+/g, "")) || 5;
    return {
      layer,
      title: headerParts[2] || lines[1] || "",
      content: lines.slice(1).join("\n").trim(),
      weight,
      tags: [],
    };
  }

  function proposalCardContent(proposal: SummerWriteProposal, status: "提议写入" | "已加入" | "已存在" = "提议写入") {
    const layerName: Record<string, string> = { mangzhong: "芒种", xiazhi: "夏至", xiaoshu: "小暑", rain: "rain", ferry: "渡口" };
    const layer = proposal.layer || "xiaoshu";
    const title = proposal.title || "未命名";
    const meta = [
      `summer · ${status}${layerName[layer] || layer}`,
      title,
      typeof proposal.weight === "number" ? `权重 ${proposal.weight}` : "",
    ].filter(Boolean).join(" · ");
    return `${meta}\n${String(proposal.content || "").trim()}`.trim();
  }

  function summerCardTitle(message: Message) {
    if (message.source === "summer_call") {
      return message.content.replace(/^summer\s*·\s*/, "").trim() || "summer 检索";
    }
    if (message.source === "summer_write_committed") {
      const proposal = proposalFromMessage(message);
      if (proposal?.status === "duplicate") {
        return proposal.title ? `summer 已存在 · ${proposal.title}` : "summer 已存在";
      }
      return proposal?.title ? `summer 已加入 · ${proposal.title}` : "summer 已加入";
    }
    if (message.source === "summer_write_proposal") {
      const proposal = proposalFromMessage(message);
      return proposal?.title ? `summer 待确认 · ${proposal.title}` : "summer 待确认";
    }
    return "summer";
  }

  function startEditSummerProposal(message: Message, index: number) {
    const proposal = proposalFromMessage(message);
    if (!proposal) return;
    setEditingProposalIndex(index);
    setProposalDraft({
      id: proposal.id,
      status: proposal.status,
      layer: proposal.layer || "xiaoshu",
      title: proposal.title || "",
      content: proposal.content || "",
      weight: proposal.weight ?? 5,
      due: proposal.due || "",
      tags: proposal.tags || [],
    });
  }

  function saveEditedSummerProposal(index: number) {
    if (!proposalDraft?.content?.trim()) return;
    const nextProposal: SummerWriteProposal = {
      ...proposalDraft,
      title: proposalDraft.title || "",
      content: proposalDraft.content.trim(),
      weight: proposalDraft.weight ?? 5,
    };
    replaceMessageAt(index, (old) => ({
      ...old,
      proposal: nextProposal,
      content: proposalCardContent(nextProposal),
    }));
    setEditingProposalIndex(null);
    setProposalDraft(null);
  }

  async function acceptSummerProposal(message: Message, index: number) {
    const proposal = proposalFromMessage(message);
    if (!proposal?.content?.trim()) {
      return;
    }
    const proposalContent = String(proposal.content || "").trim();
    if (!proposalContent) return;
    try {
      const body = proposal.id ? {
        action: "commit_proposal",
        proposal_id: proposal.id,
        patch: {
          layer: proposal.layer || "xiaoshu",
          title: proposal.title || "",
          content: proposalContent,
          weight: proposal.weight ?? 5,
          due: proposal.due || "",
          tags: proposal.tags || [],
        },
      } : {
        layer: proposal.layer || "xiaoshu",
        title: proposal.title || "",
        content: proposalContent,
        weight: proposal.weight ?? 5,
        due: proposal.due || "",
        tags: proposal.tags || [],
        source: "iooi-chat-proposal",
      };
      const res = await apiFetch(summerEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "summer 写入失败");
      const duplicate = Boolean(json.data?.duplicate);
      const committedProposal = { ...proposal, status: duplicate ? "duplicate" : "committed" };
      replaceMessageAt(index, (old) => ({
        ...old,
        source: "summer_write_committed",
        proposal: committedProposal,
        content: proposalCardContent(committedProposal, duplicate ? "已存在" : "已加入"),
      }));
    } catch {
      replaceMessageAt(index, (old) => ({
        ...old,
        content: `${old.content}\n\n写入失败，稍后再试。`,
      }));
    }
  }

  async function ignoreSummerProposal(message: Message, index: number) {
    const proposal = proposalFromMessage(message);
    if (proposal?.id) {
      try {
        await apiFetch(summerEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "discard_proposal", proposal_id: proposal.id }),
        });
      } catch {
        // Local removal is still useful; the pending proposal can be discarded later in summer.
      }
    }
    replaceMessageAt(index, (old) => ({
      ...old,
      source: "summer_write_ignored",
      proposal: proposal ? { ...proposal, status: "discarded" } : old.proposal,
    }));
  }

  async function sendMessage() {
    if ((!input.trim() && !attachments.length) || loading || uploading || sendingRef.current) return;
    const codeRequest = !isGpt && developmentMode;
    // Work mode only takes screenshots; a stray file must not block the send.
    const sendable = codeRequest ? attachments.filter((item) => item.kind === "image") : attachments;
    const typed = stripObjectPlaceholders(input);
    if (!typed.trim() && !sendable.length) return;
    sendingRef.current = true;
    const pendingFile = sendable.find((item) => item.kind === "file");
    const userText = typed.trim() || !pendingFile ? typed : `📄 ${pendingFile.name}`;
    const userMsg: Message = { role: "user", content: userText, time: getTime(), date: getTodayStr(),
      ...imageFields(sendable.filter((item) => item.kind === "image").map((item) => item.url)),
      ...(pendingFile ? { file: pendingFile.url } : {}),
      ...(!isGpt ? { roundId: genId() } : {}),
      ...(codeRequest ? { source: `code_task_${developmentProject}` } : {}),
    };
    setAttachments([]);
    setUploadError("");
    followLatest();
    const baseMessages = sessionMessagesRef.current;
    const messagesWithUser = [...baseMessages, userMsg];
    sessionMessagesRef.current = messagesWithUser;
    updateMessages((msgs) => mergeChatMessages(msgs, messagesWithUser));
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    const requestId = ++replyRequestIdRef.current;
    const controller = new AbortController();
    activeReplyRequestRef.current = { id: requestId, controller };
    pausedReplyRequestIdRef.current = null;
    clearReplyStatusTimers();
    setReplyRequestState("preparing");
    setReplyRequestDetail(codeRequest ? `正在检查并修改 ${developmentProject === "iooi" ? "iooi" : "Summer"} 代码，可能需要几分钟…` : "");
    setStreamingReply("");
    setLoading(true);

    // 彩蛋:扣
    if (userText.includes("扣") || userText.includes("扣六")) {
      setHeartRain(true);
      setTimeout(() => setHeartRain(false), 3200);
    }

    // Auto-rename session on first message
    if (userText.trim() && session.messages.length === 0 && (session.name.startsWith("对话") || session.name.startsWith("GPT 对话"))) {
      const autoName = userText.slice(0, 20) + (userText.length > 20 ? "..." : "");
      renameSession(session.id, autoName);
    }

    try {
      // Both private rooms retain complete visible text, with no rolling summary.
      const allMsgs = [
        ...messagesWithUser.filter((m) => !m.source?.startsWith("summer_") && !m.source?.startsWith("code_task_")).map((m) => {
          return {
            role: m.role, content: m.content,
            ...imageFields(messageImages(m)), ...(m.file ? { file: m.file } : {}),
          };
        }),
      ];
      const context = buildChatContext(allMsgs, {
        mode: "full-window",
        maxUserTurns: CONTEXT_WINDOW_ROUNDS,
      });
      const contextMsgs = context.messages;
      const contextMeta = {
        ...context.stats,
        summary_used: false,
      };
      const recentSummerProposals = isGpt
        ? []
        : messagesWithUser
            .filter((message) => message.source?.startsWith("summer_write_"))
            .slice(-12)
            .flatMap((message) => {
              const proposal = proposalFromMessage(message);
              return proposal ? [proposal] : [];
            });

      setReplyRequestState("waiting");
      replyStatusTimersRef.current = [
        setTimeout(() => {
          if (activeReplyRequestRef.current?.id === requestId && !controller.signal.aborted) {
            setReplyRequestState("slow");
          }
        }, 25_000),
        setTimeout(() => {
          if (activeReplyRequestRef.current?.id === requestId && !controller.signal.aborted) {
            setReplyRequestState("very-slow");
          }
        }, 60_000),
      ];
      const res = await apiFetch(isGpt ? "/api/gpt/chat" : "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: currentModelId,
          systemPrompt: codeRequest ? undefined : buildStablePrompt(),
          dynamicPrompt: codeRequest ? undefined : buildDynamicPrompt(),
          messages: codeRequest
            ? baseMessages.filter((message) => message.source === `code_task_${developmentProject}`)
                .map((message) => ({ role: message.role, content: message.content }))
            : contextMsgs,
          ...(codeRequest ? { codeMode: { project: developmentProject } } : {}),
          thinking: !isGpt && settings.thinking,
          webSearch: isGpt ? settings.gptWebSearch : settings.webSearch,
          reasoningEffort: isGpt ? settings.gptReasoningEffort : settings.claudeReasoningEffort,
          sessionId: session.id,
          userMsg,
          recentSummerProposals,
          quietSummerWake,
          stream: !isGpt,
        }),
        signal: controller.signal,
      });
      const data = isGpt
        ? await res.json()
        : await readChatResponse(res, (delta) => {
            if (!controller.signal.aborted && activeReplyRequestRef.current?.id === requestId) {
              setStreamingReply((current) => current + delta);
            }
          }, (progress) => {
            if (codeRequest && !controller.signal.aborted && activeReplyRequestRef.current?.id === requestId) {
              setReplyRequestDetail(progress);
            }
          });
      setStreamingReply("");
      const responseStatus = typeof data.status === "number" ? data.status : res.status;
      if (!res.ok || responseStatus >= 400) {
        throw new Error(data.reply || "模型请求没有完成");
      }
      if (data.cache) {
        const nextCache: CacheStats = { ...data.cache, ...contextMeta, time: new Date().toLocaleString("zh-CN", { timeZone: APP_TIME_ZONE }) };
        setLastCache(nextCache);
        saveLocal(isGpt ? "iooi-gpt-last-cache" : "iooi-last-cache", nextCache);
        if (isGpt) syncGptToServer({ lastCache: nextCache });
        else syncToServer({ lastCache: nextCache });
      }
      if (!isGpt && data.cache?.backend === "claude-code") {
        window.dispatchEvent(new Event("claude-usage-updated"));
      }
      if (codeRequest && data.cache?.backend === "code-release") {
        setReplyRequestState("idle");
        setReplyRequestDetail("");
        return;
      }
      let reply: string = data.reply || "...";
      const thinkingContent: string = data.thinking || "";

      const moodMatch = reply.match(/\[心情[:：](.+?)\]/);
      if (!isGpt && moodMatch) {
        setAiMood({ emoji: moodMatch[1].trim().slice(0, 12), ts: Date.now() });
      }
      reply = reply.replace(/\[心情[:：].+?\]/g, "").trim();

      const parts = reply.split(/\n{2,}/).filter((p: string) => p.trim());
      const now = data.cache?.reply_persisted_time || getTime();
      const today = data.cache?.reply_persisted_date || getTodayStr();
      const summerCallMsgs: Message[] = (data.cache?.summer_calls || []).map((call: SummerCall) => {
        const bits = [
          "summer",
          call.label || call.tool || "called",
          typeof call.count === "number" ? `${call.count} 条` : "",
          call.status === "fallback" ? "fallback" : "",
        ].filter(Boolean);
        return {
          role: "assistant" as const,
          source: "summer_call",
          roundId: userMsg.roundId,
          content: bits.join(" · "),
          time: now,
          date: today,
        };
      });
      const summerWriteMsgs: Message[] = (data.cache?.summer_write_proposals || []).map((proposal: SummerWriteProposal) => {
        const committed = proposal.status === "committed" || proposal.status === "duplicate";
        const duplicate = proposal.status === "duplicate";
        return {
          role: "assistant" as const,
          source: committed ? "summer_write_committed" : "summer_write_proposal",
          content: proposalCardContent(proposal, duplicate ? "已存在" : committed ? "已加入" : "提议写入"),
          proposal,
          time: now,
          date: today,
        };
      });
      const newMsgs: Message[] = parts.map((p: string, i: number) => ({
        role: "assistant" as const,
        content: p.trim(),
        ...(codeRequest ? { source: `code_task_${developmentProject}` } : {}),
        roundId: userMsg.roundId,
        time: now,
        date: today,
        ...(i === 0 && thinkingContent ? { thinking: thinkingContent } : {}),
      }));
      if (hasLaterUserMessage(sessionMessagesRef.current, userMsg)) {
        return;
      }
      const finalMessages = [...messagesWithUser, ...summerCallMsgs, ...newMsgs, ...summerWriteMsgs];
      sessionMessagesRef.current = mergeChatMessages(sessionMessagesRef.current, finalMessages);
      updateMessages((msgs) => mergeChatMessages(msgs, finalMessages));
      setReplyRequestState("idle");
      setReplyRequestDetail("");

      // GPT keeps its rolling cache. Claude private windows deliberately keep
      // the complete active-window text and neither generate nor inject one.
    } catch (error) {
      setStreamingReply("");
      const wasPaused = controller.signal.aborted && pausedReplyRequestIdRef.current === requestId;
      if (wasPaused) {
        setReplyRequestState("paused");
        setReplyRequestDetail(codeRequest ? "已停止等待画面，开发任务仍在服务器执行。" : "");
      } else {
        setReplyRequestState("failed");
        const serverFailure = error instanceof Error ? error.message.trim() : "";
        const failureText = codeRequest && serverFailure
          ? `开发任务未完成：${serverFailure}。请先检查聊天记录或工作区，再决定是否重试。`
          : typeof navigator !== "undefined" && !navigator.onLine
          ? "现在网络断开了，但刚才的消息已经保存。网络恢复后先重新打开看看；如果仍没有回复，再发送一次。"
          : serverFailure.includes("没有转用 API")
            ? serverFailure
          : error instanceof SyntaxError
            ? "连接中途断开了，但消息已经保存。酥酥可能仍在后台回复，先别重复发送，稍后重新打开会自动取回。"
            : "连接中断了，但消息已经保存。酥酥可能仍在后台回复，先别重复发送，稍后重新打开会自动取回。";
        setReplyRequestDetail(failureText);
      }
    } finally {
      setStreamingReply("");
      clearReplyStatusTimers();
      if (activeReplyRequestRef.current?.id === requestId) {
        activeReplyRequestRef.current = null;
      }
      if (replyRequestIdRef.current === requestId) {
        sendingRef.current = false;
        setLoading(false);
      }
    }
  }

  async function uploadFile(event: React.ChangeEvent<HTMLInputElement>) {
    const picker = event.currentTarget;
    const picked = Array.from(picker.files || []);
    picker.value = "";
    if (!picked.length || uploadingRef.current || loading) return;

    const allowFiles = isGpt && !developmentMode;
    const notes: string[] = [];
    let imageSlots = MAX_IMAGES_PER_MESSAGE - attachments.filter((item) => item.kind === "image").length;
    let fileSlot = allowFiles && !attachments.some((item) => item.kind === "file");
    const queue: File[] = [];
    for (const file of picked) {
      if (file.type.startsWith("image/")) {
        if (imageSlots > 0) { queue.push(file); imageSlots -= 1; }
        else if (!notes.includes("image-limit")) notes.push("image-limit");
      } else if (allowFiles && fileSlot) {
        queue.push(file);
        fileSlot = false;
      } else if (!notes.includes("file")) {
        notes.push("file");
      }
    }
    const messages: string[] = notes.map((note) => note === "image-limit"
      ? `一条消息最多 ${MAX_IMAGES_PER_MESSAGE} 张图片，多出来的没有加上`
      : allowFiles ? "一条消息只能带一个文件" : "这里只能发图片");
    if (!queue.length) {
      setUploadError(messages.join("；") + "。");
      return;
    }

    uploadingRef.current = true;
    setUploading(true);
    setUploadError("");
    try {
      for (const original of queue) {
        const isImage = original.type.startsWith("image/");
        try {
          const file = isImage ? await prepareImageForUpload(original) : original;
          const formData = new FormData();
          formData.append("file", file);
          const res = await apiFetch("/api/upload", { method: "POST", body: formData });
          const data = await res.json();
          if (!res.ok || !data.url) throw new Error(data.error || "上传失败");
          setAttachments((current) => [...current, {
            id: genId(),
            kind: isImage ? "image" : "file",
            url: data.url,
            name: original.name,
          }]);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "上传失败";
          messages.push(`${original.name || "一张图片"}：${reason}`);
        }
      }
    } finally {
      uploadingRef.current = false;
      setUploading(false);
      if (messages.length) setUploadError(messages.join("；") + "。");
    }
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((item) => item.id !== id));
    setUploadError("");
  }

  function handleBackToList() {
    const latestMessages = sessionMessagesRef.current;
    if (latestMessages.length > 0) {
      updateMessages((messages) => mergeChatMessages(messages, latestMessages));
    }
    onBackToList?.();
  }

  const developmentBadge = developmentMode && (
    <span className="dev-mode-badge" title={`工作模式 · ${developmentProjectLabel} 工作区`}>
      工作中•{developmentProjectLabel}
    </span>
  );

  const roomIdentity = (
    <>
      <h1 className="header-title chat-room-title">{assistantName}</h1>
      <span className="header-subtitle chat-room-status">
        {developmentBadge || (isGpt ? "在线" : getChatStatusLabel(aiMood))}
      </span>
    </>
  );

  const retroUserName = settings.userName || "我";

  return (
    <>
      {listEntryMode && retro ? (
        <header className="chat-header chat-room-header xp-chat-header">
          <div className="xp-chat-titlebar">
            <span className="xp-chat-title-icon" aria-hidden="true"><ChatGlyph /></span>
            <h1 className="xp-chat-title">{assistantName} - 对话</h1>
            <div className="xp-chat-controls">
              <i className="xp-chat-btn xp-chat-min" aria-hidden="true" />
              <i className="xp-chat-btn xp-chat-max" aria-hidden="true" />
              <button type="button" className="xp-chat-btn xp-chat-close" onClick={handleBackToList} aria-label="关闭窗口，返回列表" title="关闭">
                <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg>
              </button>
            </div>
          </div>
          <div className="xp-chat-to">
            <span className="xp-chat-to-line">
              收件人：<i className="xp-chat-buddy" aria-hidden="true" /><b>{assistantName}</b>
              <span className="xp-chat-to-status">
                {developmentMode ? `工作中 · ${developmentProjectLabel}` : isGpt ? "在线" : getChatStatusLabel(aiMood)}
              </span>
            </span>
            {showQuota && <ClaudeUsageCircle {...claudeUsage} className="xp-chat-quota" title="剩余百分比：五小时 / 本周；详细额度在聊天设置" />}
          </div>
        </header>
      ) : listEntryMode ? (
        <header className="chat-header chat-room-header single-room-header">
          <div className="header-top">
            <button className="header-icon-btn chat-room-back" onClick={handleBackToList} aria-label="返回列表">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="14.5 5.5 8 12 14.5 18.5" />
              </svg>
            </button>
            <div className="header-center">
              {roomIdentity}
            </div>
            {/* The quota sits top right as plain numbers; the gear and the
                work-context circle live beside the input. */}
            <div className="room-header-usage">
              {showQuota && <ClaudeUsageCircle {...claudeUsage} className="room-header-quota" title="剩余百分比：五小时 / 本周；详细额度在聊天设置" />}
            </div>
          </div>
        </header>
      ) : (
        <header className="chat-header direct-chat-header">
          <div className="header-top">
            <button className="header-icon-btn" onClick={() => setShowSessions(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div className="header-center">
              <h1 className="header-title">{isGpt ? "GPT" : "iooi"}</h1>
              <span className="header-subtitle" style={{ color: "var(--accent-text)" }}>{developmentMode ? <>{assistantName} {developmentBadge}</> : <>{assistantName} {!isGpt && (aiMood.emoji || "")} · {currentModelLabel}</>}</span>
            </div>
            {developmentMode && <ContextUsageBadge kind="work" sessionId={session.id} project={developmentProject} messages={workUsageMessages} />}
            <button className="header-icon-btn" aria-label="聊天设置" aria-expanded={showModelMenu} onClick={() => setShowModelMenu((open) => !open)}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9.5 3-.6 2.4-2 .9-2.3-.7L2 10l1.8 1.7v2.2L2 15.6l2.6 4.4 2.3-.7 2 .9.6 2.4h5l.6-2.4 2-.9 2.3.7 2.6-4.4-1.8-1.7v-2.2L22 10l-2.6-4.4-2.3.7-2-.9L14.5 3Z" transform="translate(0 -1) scale(1 .95)" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
        </header>
      )}

      {showModelMenu && (
        <div className="chat-config-panel room-settings-panel" role="dialog" aria-label="聊天设置">
          <div className="room-settings-heading"><b>聊天设置</b><button type="button" onClick={() => setShowModelMenu(false)} aria-label="关闭聊天设置">×</button></div>
          {!isGpt && <ClaudeUsageDetails {...claudeUsage} />}
          <section className="chat-config-section">
            <p>MODEL</p>
            <div className="chat-config-options">
              {isGpt ? GPT_MODELS.map((model) => (
                <button
                  type="button"
                  key={model.id}
                  className={`chat-config-option${currentGptModel.id === model.id ? " chat-config-option-active" : ""}`}
                  onClick={() => updateSettings({ gptModel: model.id })}
                >
                  {model.label}
                </button>
              )) : MODELS.map((model) => (
                <button
                  type="button"
                  key={model.id}
                  className={`chat-config-option${settings.model === model.id ? " chat-config-option-active" : ""}`}
                  onClick={() => updateSettings({ model: model.id })}
                >
                  {model.label}
                </button>
              ))}
            </div>
            {!isGpt && <p className="settings-hint">酥酥纯文字只走 Claude 订阅；失败时不会改走 API。</p>}
            {isGpt && <p className="settings-hint">GPT-6 Astra 的单价约为 Sol 的 5 倍。</p>}
          </section>

          <section className="chat-config-section">
            <p>INTELLIGENCE</p>
            <div className="chat-config-options">
              {(isGpt ? GPT_REASONING_OPTIONS : CLAUDE_REASONING_OPTIONS).map((option) => {
                const active = isGpt
                  ? settings.gptReasoningEffort === option.value
                  : settings.claudeReasoningEffort === option.value;
                return (
                  <button
                    type="button"
                    key={option.value}
                    className={`chat-config-option${active ? " chat-config-option-active" : ""}`}
                    onClick={() => isGpt
                      ? updateSettings({ gptReasoningEffort: option.value as GptReasoningEffort })
                      : updateSettings({ claudeReasoningEffort: option.value as ClaudeReasoningEffort })}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>

          {!isGpt && (
            <section className="chat-config-section chat-config-toggle-section">
              <p>EXTENDED THINKING</p>
              <button
                type="button"
                className={`chat-config-switch${settings.thinking ? " chat-config-switch-on" : ""}`}
                role="switch"
                aria-checked={settings.thinking}
                onClick={() => updateSettings({ thinking: !settings.thinking })}
              >
                <span>{settings.thinking ? "On" : "Off"}</span><i />
              </button>
            </section>
          )}

          <section className="chat-config-section chat-config-toggle-section">
            <p>WEB SEARCH</p>
            <button
              type="button"
              className={`chat-config-switch${(isGpt ? settings.gptWebSearch : settings.webSearch) ? " chat-config-switch-on" : ""}`}
              role="switch"
              aria-checked={isGpt ? settings.gptWebSearch : settings.webSearch}
              onClick={() => {
                updateSettings(isGpt
                  ? { gptWebSearch: !settings.gptWebSearch }
                  : { webSearch: !settings.webSearch });
              }}
            >
              <span>{(isGpt ? settings.gptWebSearch : settings.webSearch) ? "On" : "Off"}</span><i />
            </button>
          </section>
          {!isGpt && (
            <section className="chat-config-section">
              <div className="chat-config-toggle-section development-mode-heading">
                <p>开发模式</p>
                <button type="button" className={`chat-config-switch${developmentMode ? " chat-config-switch-on" : ""}`}
                  role="switch" aria-checked={developmentMode} disabled={loading}
                  onClick={() => updateDevelopmentModePref({ enabled: !developmentMode })}>
                  <span>{developmentMode ? "On" : "Off"}</span><i />
                </button>
              </div>
              {developmentMode && <>
                <div className="chat-config-options" role="group" aria-label="开发项目">
                  {(["iooi", "summer"] as const).map((project) => (
                    <button type="button" key={project} disabled={loading}
                      className={`chat-config-option${developmentProject === project ? " chat-config-option-active" : ""}`}
                      aria-pressed={developmentProject === project}
                      onClick={() => updateDevelopmentModePref({ project })}>
                      {project === "iooi" ? "iooi" : "Summer"}
                    </button>
                  ))}
                </div>
                <p className="settings-hint">开发对话与普通聊天各用自己的上下文。改完后单独发送“部署”或“推送到 GitHub”；只有收到明确指令才执行。</p>
              </>}
            </section>
          )}
          {!isGpt && <p className="settings-hint room-settings-capability-hint">订阅图片和搜索已接入；文件稍后开放。</p>}
        </div>
      )}

      <section className="chat-messages" ref={scrollRef} onScroll={handleScroll}>
        {session.messages.length === 0 && (
          <div className="empty-chat"><p>说点什么开始聊天吧</p></div>
        )}
        {displayMessages.map(({ message, index }, displayIndex) => {
          if (message.source === "summer_write_ignored") return null;
          const isSummerUtility = listEntryMode && isSummerUtilityMessage(message);
          const animateMessage = !listEntryMode || index >= initialMessageCount;
          const prevMsg = displayIndex > 0 ? displayMessages[displayIndex - 1].message : null;
          const nextMsg = displayIndex < displayMessages.length - 1 ? displayMessages[displayIndex + 1].message : null;
          const prevDate = prevMsg?.date;
          const showDateSep = listEntryMode ? shouldShowChatRoomTime(message, prevMsg) : message.date && message.date !== prevDate;
          const compactTop = !!prevMsg && prevMsg.role === message.role && !showDateSep;
          const compactBottom = !!nextMsg && nextMsg.role === message.role && nextMsg.date === message.date;
          // MSN log: "名字 说 (时间):" heads each run of lines from one person.
          const showSays = retro && !isSummerUtility && (showDateSep || !prevMsg
            || prevMsg.role !== message.role || isSummerUtilityMessage(prevMsg));

          return (
            <div key={index}>
              {showDateSep && (
                <div className="date-separator">
                  <span className="date-separator-text">
                    {listEntryMode
                      ? formatChatRoomTime(parseMessageDateTime(message) || new Date())
                      : getDateLabel(new Date(message.date!), message.time)}
                  </span>
                </div>
              )}
              {showSays && (
                <div className={`xp-msg-says ${message.role === "user" ? "xp-msg-says-user" : "xp-msg-says-ai"}`}>
                  {message.role === "user" ? retroUserName : assistantName} 说{message.time ? ` (${message.time})` : ""}:
                </div>
              )}
              {message.thinking && (
                <div className="thinking-row">
                  <ThinkingBlock content={message.thinking} />
                </div>
              )}
              <div className={`msg-row ${message.role === "user" ? "msg-row-user" : "msg-row-ai"} ${isSummerUtility ? "msg-row-summer-utility" : ""} ${compactTop ? "msg-row-compact-top" : ""} ${compactBottom ? "msg-row-compact-bottom" : ""} ${animateMessage ? "" : "msg-row-static"}`} style={animateMessage ? { animationDelay: `${Math.min(index * 0.03, 0.3)}s` } : undefined}>
                {message.role === "assistant" && !isSummerUtility && (
                  assistantAvatar
                    ? <img src={assistantAvatar} className="avatar avatar-img" alt="" />
                    : <div className="avatar avatar-ai" />
                )}
                <div className={message.role === "user" ? "msg-content-user" : "msg-content-ai"}>
                  {!listEntryMode && <span className="msg-time">{message.source === "heartbeat" ? "💬 " : ""}{message.time}</span>}
                  {messageImages(message).length ? (
                    <div className={`msg-bubble msg-bubble-img ${message.role === "user" ? "msg-bubble-user" : "msg-bubble-ai"}`}>
                      {messageImages(message).length === 1 ? (
                        <img src={messageImages(message)[0]} className="msg-image" alt="" onClick={() => window.open(messageImages(message)[0], "_blank")} />
                      ) : (
                        <div className={`msg-image-grid${messageImages(message).length === 2 || messageImages(message).length === 4 ? " msg-image-grid-2" : ""}`}>
                          {messageImages(message).map((url) => (
                            <img key={url} src={url} className="msg-image-tile" alt="" onClick={() => window.open(url, "_blank")} />
                          ))}
                        </div>
                      )}
                      {message.content && <p className="msg-image-caption">{renderContent(message.content)}</p>}
                    </div>
                  ) : (
                    <div
                      className={`msg-bubble ${message.role === "user" ? "msg-bubble-user" : "msg-bubble-ai"} ${isSummerUtility ? "msg-bubble-summer-utility" : ""} ${message.source === "summer_call" ? "msg-bubble-summer-call" : ""} ${message.source === "summer_write_proposal" || message.source === "summer_write_committed" ? "msg-bubble-summer-write" : ""}`}
                    >
                      {message.source === "summer_write_proposal" && editingProposalIndex === index && proposalDraft ? (
                        <div className="summer-proposal-editor">
                          <div className="summer-proposal-editor-row">
                            <select value={proposalDraft.layer || "xiaoshu"} onChange={(e) => setProposalDraft({ ...proposalDraft, layer: e.target.value as SummerWriteProposal["layer"] })}>
                              <option value="mangzhong">芒种</option>
                              <option value="xiaoshu">小暑</option>
                              <option value="xiazhi">夏至</option>
                              <option value="rain">rain</option>
                              <option value="ferry">ferry</option>
                            </select>
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={proposalDraft.weight ?? 5}
                              onChange={(e) => setProposalDraft({ ...proposalDraft, weight: Number(e.target.value) || 5 })}
                            />
                          </div>
                          <input
                            value={proposalDraft.title || ""}
                            onChange={(e) => setProposalDraft({ ...proposalDraft, title: e.target.value })}
                            placeholder="标题"
                          />
                          <textarea
                            value={proposalDraft.content || ""}
                            onChange={(e) => setProposalDraft({ ...proposalDraft, content: e.target.value })}
                            rows={8}
                            placeholder="内容"
                          />
                          <div className="summer-proposal-actions">
                            <button onClick={() => saveEditedSummerProposal(index)}>保存修改</button>
                            <button onClick={() => { setEditingProposalIndex(null); setProposalDraft(null); }}>取消</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {message.source === "summer_call" || message.source === "summer_write_proposal" || message.source === "summer_write_committed" ? (
                            <CollapsibleSummerCard title={summerCardTitle(message)} content={message.content}>
                              {message.source === "summer_write_proposal" && (
                                <div className="summer-proposal-actions">
                                  <button onClick={() => startEditSummerProposal(message, index)}>编辑</button>
                                  <button onClick={() => acceptSummerProposal(message, index)}>加入 summer</button>
                                  <button onClick={() => ignoreSummerProposal(message, index)}>忽略</button>
                                </div>
                              )}
                            </CollapsibleSummerCard>
                          ) : (
                            renderContent(message.content)
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
                {message.role === "user" && !isSummerUtility && (
                  settings.userAvatar
                    ? <img src={settings.userAvatar} className="avatar avatar-img" alt="" />
                    : <div className="avatar avatar-user" />
                )}
              </div>
            </div>
          );
        })}
        {retro && nudgeNotes.map((note) => (
          <div key={note.id} className="xp-msg-nudge" role="status">{note.text}</div>
        ))}
        {retro && streamingReply && <div className="xp-msg-says xp-msg-says-ai">{assistantName} 说:</div>}
        {streamingReply && (
          <div className="msg-row msg-row-ai msg-row-streaming">
            {assistantAvatar
              ? <img src={assistantAvatar} className="avatar avatar-img" alt="" />
              : <div className="avatar avatar-ai" />
            }
            <div className="msg-content-ai">
              <div className="msg-bubble msg-bubble-ai msg-bubble-streaming" aria-live="polite">
                {renderContent(streamingReply)}
              </div>
            </div>
          </div>
        )}
        {((loading && !streamingReply) || replyRequestState === "paused" || replyRequestState === "failed"
          || (!loading && (activeCodeTask?.status === "running" || activeCodeTask?.status === "interrupted"))) && (
          <div className="msg-row msg-row-ai">
            {assistantAvatar
              ? <img src={assistantAvatar} className="avatar avatar-img" alt="" />
              : <div className="avatar avatar-ai" />
            }
            <div className="msg-content-ai">
              <div className={`msg-bubble msg-bubble-ai reply-status-bubble reply-status-${replyRequestState}`} aria-live="polite">
                {loading && <div className="typing-dots"><span /><span /><span /></div>}
                <span className="reply-status-text">{loading || replyRequestState === "paused" || replyRequestState === "failed"
                  ? replyRequestDetail || (retro && loading && (replyRequestState === "preparing" || replyRequestState === "waiting")
                    ? `${assistantName} 正在输入消息…`
                    : REPLY_REQUEST_LABELS[replyRequestState])
                  : activeCodeTask?.progress}</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {heartRain && (
        <div className="heart-rain" aria-hidden>
          {Array.from({ length: 18 }).map((_, i) => (
            <span key={i} className="heart-drop" style={{ left: `${(i * 53) % 100}%`, animationDelay: `${(i * 0.17) % 1.5}s` }}>
              {i % 6 === 0 ? "6️⃣" : "💖"}
            </span>
          ))}
        </div>
      )}

      <footer className={`chat-footer single-chat-footer${retro ? " xp-chat-footer" : ""}`}>
        {uploadError && <p className="composer-upload-error" role="alert">{uploadError}</p>}
        {attachments.length > 0 && (
          <div className="composer-attachments" aria-label="待发送的附件">
            {attachments.map((item) => (
              <div key={item.id} className={`composer-attachment${item.kind === "file" ? " composer-attachment-file" : ""}`}>
                {item.kind === "image"
                  ? <img src={item.url} alt="" />
                  : <span className="composer-attachment-name">📄 {item.name}</span>}
                <button
                  type="button"
                  className="composer-attachment-remove"
                  onClick={() => removeAttachment(item.id)}
                  aria-label={item.kind === "image" ? "移除这张图片" : "移除这个文件"}
                  title="移除"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {retro ? (
          <>
            <div className="xp-chat-toolbar">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="attach-file-input"
                accept={isGpt ? "image/*,application/pdf,.txt,.md,.csv" : "image/*"}
                disabled={uploading || loading}
                onChange={(event) => void uploadFile(event)}
                aria-label={isGpt ? "上传图片或文件" : "上传图片"}
              />
              <button type="button" className="xp-chat-tool" onClick={() => fileInputRef.current?.click()} disabled={uploading || loading}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <rect x="1.5" y="3" width="13" height="10" rx="1" fill="#fff" stroke="#3a6ea5" />
                  <path d="M2.5 12l3.6-4 2.6 2.7 1.8-1.8 3 3.1z" fill="#4caf3a" />
                  <circle cx="11" cy="6" r="1.4" fill="#f5b800" />
                </svg>
                <span>{uploading ? "上传中…" : isGpt ? "文件" : "图片"}</span>
              </button>
              <button type="button" className="xp-chat-tool" onClick={sendNudge} title="发送闪屏振动">
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M1.5 8h2l1.5-4 2.5 8 2.5-8 1.5 4h3" fill="none" stroke="#d2421c" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
                <span>抖一抖</span>
              </button>
              <span className="xp-chat-toolbar-gap" />
              {developmentMode && (
                <ContextUsageBadge kind="work" sessionId={session.id} project={developmentProject} messages={workUsageMessages} />
              )}
              <button type="button" className="xp-chat-tool" aria-expanded={showModelMenu} onClick={() => setShowModelMenu((open) => !open)}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M6.6 1.5h2.8l.4 1.8 1.3.6 1.6-1 2 2-1 1.6.6 1.3 1.8.4v2.8l-1.8.4-.6 1.3 1 1.6-2 2-1.6-1-1.3.6-.4 1.8H6.6l-.4-1.8-1.3-.6-1.6 1-2-2 1-1.6-.6-1.3-1.8-.4V6.6l1.8-.4.6-1.3-1-1.6 2-2 1.6 1 1.3-.6z" transform="scale(.94) translate(.5 .5)" fill="#9fb3cf" stroke="#3a5a8c" strokeWidth=".9" strokeLinejoin="round" />
                  <circle cx="8" cy="8" r="2.2" fill="#fff" stroke="#3a5a8c" strokeWidth=".9" />
                </svg>
                <span>设置</span>
              </button>
            </div>
            <div className="xp-chat-compose">
              <textarea
                ref={inputRef} value={input} onChange={handleInputChange}
                placeholder={inputHint} rows={2} className="xp-chat-input"
                aria-label="输入消息"
              />
              <button
                type="button"
                onClick={loading ? pauseReply : sendMessage}
                disabled={!loading && ((!input.trim() && !attachments.length) || uploading)}
                className="xp-chat-send"
                aria-label={loading ? "暂停等待回复" : "发送消息"}
              >
                {loading ? <>停止(<u>T</u>)</> : <>发送(<u>S</u>)</>}
              </button>
            </div>
          </>
        ) : (
          <div className="composer-row">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="attach-file-input"
              accept={isGpt
                ? "image/*,application/pdf,.txt,.md,.csv"
                : "image/*"}
              disabled={uploading || loading}
              onChange={(event) => void uploadFile(event)}
              aria-label={isGpt ? "上传图片或文件" : "上传图片"}
            />
            <button
              type="button"
              className={`attach-btn attach-btn-separate${uploading ? " attach-btn-uploading" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || loading}
              aria-label={uploading ? "正在上传" : (isGpt ? "上传图片或文件" : "上传图片")}
              title={uploading ? "正在上传" : (isGpt ? "上传图片或文件" : "上传图片")}
            >
              {uploading ? (
                <span className="attach-upload-spinner" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                </svg>
              )}
            </button>
            <div className="input-wrapper">
              <textarea
                ref={inputRef} value={input} onChange={handleInputChange}
                placeholder={inputHint} rows={1} className="chat-input"
              />
              <button
                type="button"
                onClick={loading ? pauseReply : sendMessage}
                disabled={!loading && ((!input.trim() && !attachments.length) || uploading)}
                className={`send-btn${loading ? " pause-reply-btn" : ""}`}
                aria-label={loading ? "暂停等待回复" : "发送消息"}
                title={loading ? "暂停等待回复" : "发送"}
              >
                {loading ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                  </svg>
                )}
              </button>
            </div>
            {listEntryMode && developmentMode && (
              <ContextUsageBadge kind="work" sessionId={session.id} project={developmentProject} messages={workUsageMessages} />
            )}
            {listEntryMode ? (
              <button
                type="button"
                className="attach-btn attach-btn-separate composer-settings-btn"
                aria-label="聊天设置"
                aria-expanded={showModelMenu}
                title="聊天设置"
                onClick={() => setShowModelMenu((open) => !open)}
              >
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9.5 3-.6 2.4-2 .9-2.3-.7L2 10l1.8 1.7v2.2L2 15.6l2.6 4.4 2.3-.7 2 .9.6 2.4h5l.6-2.4 2-.9 2.3.7 2.6-4.4-1.8-1.7v-2.2L22 10l-2.6-4.4-2.3.7-2-.9L14.5 3Z" transform="translate(0 -1) scale(1 .95)" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            ) : showQuota && <ClaudeUsageCircle {...claudeUsage} />}
          </div>
        )}
      </footer>

      {showSessions && (
        <div className="wall-overlay">
          <header className="wall-header">
            <button className="wall-back" onClick={() => setShowSessions(false)}>← 返回</button>
            <h2 className="wall-title">对话列表</h2>
            <button className="wall-back" onClick={createSession} style={{ color: "var(--accent)" }}>+ 新建</button>
          </header>
          <div className="wall-body">
            {sessions.map((s) => (
              <div key={s.id} className={`session-item ${s.id === session.id ? "session-item-active" : ""}`} style={{ background: s.id === session.id ? "rgba(var(--theme-soft-rgb, 240, 228, 218), 0.4)" : "white", border: "1px solid var(--border-soft)", borderRadius: "16px", padding: "4px", marginBottom: "2px" }}>
                {editingName === s.id ? (
                  <input
                    className="session-rename-input"
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    onBlur={() => { renameSession(s.id, editNameValue || s.name); setEditingName(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { renameSession(s.id, editNameValue || s.name); setEditingName(null); } }}
                    autoFocus
                  />
                ) : (
                  <>
                    <button
                      className="session-item-btn"
                      onClick={() => { setActiveSessionId(s.id); setShowSessions(false); }}
                    >
                      <div className="session-item-info">
                        <span className="session-item-name">{s.name}</span>
                        {s.messages.length > 0 && (
                          <span className="session-item-preview">
                            {s.messages[s.messages.length - 1].content.slice(0, 40)}
                          </span>
                        )}
                      </div>
                      <span className="session-item-count">{s.messages.length}</span>
                    </button>
                    <button className="session-edit-btn" onClick={() => { setEditingName(s.id); setEditNameValue(s.name); }}>✎</button>
                  </>
                )}
                {sessions.length > 1 && (
                  <button className="session-delete-btn" onClick={() => deleteSession(s.id)}>×</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
