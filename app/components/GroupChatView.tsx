"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { readChatResponse } from "../lib/chat-stream";
import { useChatScrollPosition } from "../lib/use-chat-scroll-position";
import { useTwilightLayout } from "../lib/use-twilight-layout";
import { ClaudeUsageCircle, useClaudeUsage } from "./ClaudeUsageBadge";
import { imageFields, MAX_IMAGES_PER_MESSAGE, messageImages, stripObjectPlaceholders } from "../lib/message-images";
import { prepareImageForUpload } from "../lib/image-compress";
import { ContextUsageBadge, type UsageMessage } from "./ContextUsageBadge";
import { ChatGlyph } from "./RetroDesktop";

type PendingAttachment = { id: string; kind: "image" | "file"; url: string; name: string };

export type GroupSpeaker = "claude" | "gpt";

export type GroupSummerWriteProposal = {
  id?: string;
  status?: string;
  layer?: "mangzhong" | "xiazhi" | "xiaoshu" | "rain" | "ferry";
  title?: string;
  content?: string;
  weight?: number;
  due?: string;
  tags?: string[];
};

export type GroupChatMessage = {
  role: "user" | "assistant";
  content: string;
  time: string;
  date?: string;
  image?: string;
  images?: string[];
  file?: string;
  thinking?: string;
  source?: string;
  speaker?: GroupSpeaker;
  proposal?: GroupSummerWriteProposal;
};

type GroupSession = {
  id: string;
  name: string;
  messages: GroupChatMessage[];
  createdAt: string;
  summary?: string;
  summarizedUntil?: number;
};

type GroupSettings = {
  aiName: string;
  gptName: string;
  userName: string;
  aiAvatar: string;
  gptAvatar: string;
  userAvatar: string;
  prompt: string;
  thinking: boolean;
  webSearch: boolean;
  gptWebSearch: boolean;
  gptReasoningEffort: string;
  claudeReasoningEffort: string;
};

type ModelMessage = {
  role: "user" | "assistant";
  content: string;
  image?: string;
  images?: string[];
  file?: string;
};
type ReplyState = "idle" | "preparing" | "waiting" | "slow" | "very-slow" | "paused";

// Her settings nickname is display-only; models always see this fixed label.
const GROUP_USER_LABEL = "她";

const GPT_GROUP_PROMPT = `你是 GPT，正在一个名为“一个群”的三人群聊里。群成员是用户、王酥酥（Claude）和你。
你只能读取这间群聊的消息和属于 GPT 的独立 summer；不要读取、猜测或引用王酥酥（Claude）的私聊与 summer。`;

function token() {
  try { return localStorage.getItem("iooi-token") || ""; } catch { return ""; }
}

function groupFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    headers: { ...(init.headers || {}), "x-iooi-token": token() },
  });
}

function nowTime() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  });
}

function today() {
  return new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function currentContext() {
  const now = new Date();
  return [
    now.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Shanghai" }),
    now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }),
    "中国标准时间 / UTC+8",
  ].join(" ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasMention(text: string, names: string[]) {
  return names.some((name) => name.trim() && new RegExp(`@${escapeRegExp(name.trim())}(?:\\s|$|[，。！？、,.!?])`, "i").test(text));
}

function previousRoundFirstSpeaker(messages: GroupChatMessage[]) {
  for (let userIndex = messages.length - 1; userIndex >= 0; userIndex--) {
    if (messages[userIndex].role !== "user") continue;
    for (let i = userIndex + 1; i < messages.length; i++) {
      if (messages[i].role === "assistant" && messages[i].speaker && !messages[i].source?.startsWith("summer_")) {
        return messages[i].speaker;
      }
    }
  }
  return null;
}

function selectTargets(text: string, previousMessages: GroupChatMessage[], settings: GroupSettings): GroupSpeaker[] {
  const asksClaude = hasMention(text, ["Claude", settings.aiName || "Claude"]);
  const asksGpt = hasMention(text, ["GPT", settings.gptName || "GPT"]);
  if (asksClaude && !asksGpt) return ["claude"];
  if (asksGpt && !asksClaude) return ["gpt"];
  const previousFirst = previousRoundFirstSpeaker(previousMessages);
  return previousFirst === "claude" ? ["gpt", "claude"] : ["claude", "gpt"];
}

function speakerName(speaker: GroupSpeaker, settings: GroupSettings) {
  return speaker === "gpt" ? (settings.gptName || "GPT") : (settings.aiName || "王酥酥");
}

function stripLeakedThinking(text: string, startsInsideThinking = false) {
  const markerPattern = /<\/?(?:antml:)?thinking(?:\s[^>]*)?>|(?:^|\n)[ \t]*antml:thinking[ \t]*(?=\n|$)/gi;
  let content = "";
  let cursor = 0;
  let insideThinking = startsInsideThinking;
  let match: RegExpExecArray | null;

  while ((match = markerPattern.exec(text)) !== null) {
    if (!insideThinking) content += text.slice(cursor, match.index);
    insideThinking = !match[0].trim().startsWith("</");
    cursor = match.index + match[0].length;
  }
  if (!insideThinking) content += text.slice(cursor);

  return {
    content: content.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    insideThinking,
  };
}

function visibleGroupMessages(messages: GroupChatMessage[]) {
  const visible: Array<{ message: GroupChatMessage; originalIndex: number }> = [];
  let insideClaudeThinking = false;

  messages.forEach((message, originalIndex) => {
    const isClaudeReply = message.role === "assistant"
      && message.speaker === "claude"
      && !message.source?.startsWith("summer_");
    if (!isClaudeReply) {
      insideClaudeThinking = false;
      visible.push({ message, originalIndex });
      return;
    }

    const sanitized = stripLeakedThinking(message.content, insideClaudeThinking);
    insideClaudeThinking = sanitized.insideThinking;
    if (!sanitized.content && !messageImages(message).length && !message.file) return;
    visible.push({
      message: sanitized.content === message.content ? message : { ...message, content: sanitized.content },
      originalIndex,
    });
  });

  return visible;
}

function buildModelMessages(messages: GroupChatMessage[], target: GroupSpeaker, settings: GroupSettings, until: number) {
  const prepared: ModelMessage[] = [];
  for (const { message, originalIndex } of visibleGroupMessages(messages)) {
    if (originalIndex < until || message.source?.startsWith("summer_") || message.source === "group_error") continue;
    let next: ModelMessage;
    if (message.role === "user") {
      next = {
        role: "user",
        content: `【${GROUP_USER_LABEL}在群里说】\n${message.content || (messageImages(message).length ? "请看这些图片。" : "请看这个文件。")}`,
        ...imageFields(messageImages(message)),
        ...(message.file ? { file: message.file } : {}),
      };
    } else if (message.speaker === target) {
      next = { role: "assistant", content: message.content };
    } else {
      const other = message.speaker ? speakerName(message.speaker, settings) : "另一位成员";
      next = { role: "user", content: `【${other}在群里说】\n${message.content}` };
    }
    const last = prepared[prepared.length - 1];
    if (last?.role === next.role && !messageImages(last).length && !last.file && !messageImages(next).length && !next.file) last.content += `\n\n${next.content}`;
    else prepared.push(next);
  }

  const sliced = prepared;
  if (sliced[0]?.role === "assistant") {
    sliced.unshift({ role: "user", content: "【接续这间群之前的聊天】" });
  }
  const keepMediaFrom = Math.max(0, sliced.length - 5);
  return sliced.map((message, index) => index >= keepMediaFrom
    ? message
    : { role: message.role, content: message.content });
}

function groupSystemPrompt(speaker: GroupSpeaker, settings: GroupSettings) {
  const me = speakerName(speaker, settings);
  const other = speakerName(speaker === "claude" ? "gpt" : "claude", settings);
  const base = speaker === "claude" ? settings.prompt : GPT_GROUP_PROMPT;
  return `${base}\n\n【群聊规则】
你现在以“${me}”的身份参加“一个群”，群成员是${GROUP_USER_LABEL}、${settings.aiName || "王酥酥"}和${settings.gptName || "GPT"}。
带有“${other}在群里说”的内容是另一位成员刚才的发言，你可以自然接话、赞同或提出不同看法。
只代表你自己说话，不要替另一位成员发言，不要模拟下一轮对话。每次只回复这一轮，然后停下。
默认简洁自然，直接面向群里的人说话。你只能使用自己的 summer，绝不能声称看见另一位模型的私聊或 summer。
如需长期记忆，只能提出写入你自己 summer 的待确认建议。`;
}

function renderGroupInline(text: string) {
  const parts = text.split(/(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g);
  return parts.filter(Boolean).map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) {
      return (
        <a key={index} className="chat-message-link" href={link[2]} target="_blank" rel="noopener noreferrer">
          {link[1]}
        </a>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    return <span key={index}>{part}</span>;
  });
}

function renderGroupContent(text: string) {
  const lines = text.split("\n");
  return lines.map((line, index) => (
    <Fragment key={index}>
      {renderGroupInline(line)}
      {index < lines.length - 1 && <br />}
    </Fragment>
  ));
}

// Summer notes fold to one line, like the private chat: the first line (owner,
// status, layer) plus the title is the toggle, and the rest opens on tap.
// Accept/ignore buttons stay visible so a pending proposal never hides them.
function GroupSummerCard({ message, children }: { message: GroupChatMessage; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [head = "", ...rest] = message.content.split("\n");
  const isWrite = message.source?.startsWith("summer_write_");
  const ignored = message.source === "summer_write_ignored";
  const title = [head, isWrite ? rest[0] : "", ignored ? "已忽略" : ""].filter(Boolean).join(" · ");
  const body = rest.join("\n").trim();
  return (
    <div className={`group-summer-card summer-collapse${ignored ? " group-summer-card-muted" : ""}`}>
      {body ? (
        <button type="button" className="summer-collapse-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>{title}</span>
        </button>
      ) : (
        <div className="summer-collapse-toggle summer-collapse-static"><span>{title}</span></div>
      )}
      {open && body && <div className="summer-collapse-content">{renderGroupContent(body)}</div>}
      {children}
    </div>
  );
}

function proposalContent(
  proposal: GroupSummerWriteProposal,
  speaker: GroupSpeaker,
  settings: GroupSettings,
  state: "pending" | "committed" | "duplicate" = "pending",
) {
  const layerNames: Record<string, string> = {
    mangzhong: "芒种",
    xiazhi: "夏至",
    xiaoshu: "小暑",
    rain: "rain",
    ferry: "渡口",
  };
  const owner = `${speakerName(speaker, settings)} Summer`;
  const status = state === "duplicate" ? "已存在" : state === "committed" ? "已加入" : "待确认";
  return `${owner} · ${status} · ${layerNames[proposal.layer || "xiaoshu"] || proposal.layer}\n${proposal.title || "未命名"}\n${proposal.content || ""}`.trim();
}

function Avatar({ src, user = false }: { src: string; user?: boolean }) {
  if (src) return <img src={src} className="avatar avatar-img" alt="" />;
  return <div className={`avatar ${user ? "avatar-user" : "avatar-ai"}`} />;
}

export function GroupChatView({
  session,
  settings,
  claudeModelId,
  gptModelId,
  updateSettings,
  updateMessages,
  updateSummary,
  onBack,
  retro = false,
}: {
  session: GroupSession;
  settings: GroupSettings;
  claudeModelId: string;
  gptModelId: string;
  updateSettings: (partial: Partial<Pick<GroupSettings, "webSearch" | "gptWebSearch">>) => void;
  updateMessages: (updater: (messages: GroupChatMessage[]) => GroupChatMessage[]) => void;
  updateSummary: (summary: string, until: number) => void;
  onBack: () => void;
  retro?: boolean;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingReply, setStreamingReply] = useState<{ speaker: GroupSpeaker; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [replyState, setReplyState] = useState<ReplyState>("idle");
  const [activeSpeaker, setActiveSpeaker] = useState<GroupSpeaker | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const claudeUsage = useClaudeUsage();
  const [showWebSearchMenu, setShowWebSearchMenu] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const uploadingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef(session.messages);
  const sendingRef = useRef(false);
  const activeControllerRef = useRef<AbortController | null>(null);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const { scrollRef, handleScroll, followLatest } = useChatScrollPosition(
    `iooi-scroll-group-${session.id}`,
    session.messages.length + (streamingReply?.text.length || 0),
  );
  // The group room floats its title and composer over the messages.
  useTwilightLayout(true, scrollRef);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current = [];
  }, []);

  useEffect(() => {
    messagesRef.current = session.messages;
  }, [session.messages]);

  const usageMessages = useMemo<UsageMessage[]>(() => visibleGroupMessages(session.messages)
    .filter(({ message }) => !message.source?.startsWith("summer_") && message.source !== "group_error")
    .map(({ message, originalIndex }) => ({
      index: originalIndex, role: message.role,
      speaker: message.role === "user" ? GROUP_USER_LABEL : speakerName(message.speaker || "claude", settings),
      content: message.content || (messageImages(message).length ? "[发送了图片]" : message.file ? "[发送了一个文件]" : ""),
      media: Boolean(messageImages(message).length || message.file),
    })), [session.messages, settings]);
  const usageSystemPrompt = useMemo(() => [groupSystemPrompt("claude", settings), groupSystemPrompt("gpt", settings)].join("\n"), [settings]);

  useEffect(() => () => {
    clearTimers();
    activeControllerRef.current?.abort();
  }, [clearTimers]);

  function replaceMessage(index: number, next: (message: GroupChatMessage) => GroupChatMessage) {
    const messages = messagesRef.current.map((message, i) => i === index ? next(message) : message);
    messagesRef.current = messages;
    updateMessages(() => messages);
  }

  function beginSpeakerStatus(speaker: GroupSpeaker) {
    clearTimers();
    setActiveSpeaker(speaker);
    setReplyState("waiting");
    timersRef.current = [
      setTimeout(() => setReplyState("slow"), 25_000),
      setTimeout(() => setReplyState("very-slow"), 60_000),
    ];
  }

  function pauseReply() {
    if (!activeControllerRef.current) return;
    clearTimers();
    setReplyState("paused");
    setStreamingReply(null);
    activeControllerRef.current.abort();
  }

  async function requestSpeaker(
    speaker: GroupSpeaker,
    messages: GroupChatMessage[],
    userMessage: GroupChatMessage,
    signal: AbortSignal,
    context: { summary: string; until: number },
  ) {
    beginSpeakerStatus(speaker);
    setStreamingReply(null);
    const response = await groupFetch(speaker === "gpt" ? "/api/gpt/chat" : "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelId: speaker === "gpt" ? gptModelId : claudeModelId,
        systemPrompt: groupSystemPrompt(speaker, settings),
        dynamicPrompt: [
          `【当前时间】\n${currentContext()}`,
          context.summary ? `【群聊较早内容的共享摘要】\n${context.summary}` : "",
          "这是群聊，不接入天气、心情墙或 heartbeat。",
        ].filter(Boolean).join("\n\n"),
        messages: buildModelMessages(messages, speaker, settings, context.until),
        thinking: speaker === "claude" && settings.thinking,
        webSearch: speaker === "gpt" ? settings.gptWebSearch : settings.webSearch,
        reasoningEffort: speaker === "gpt" ? settings.gptReasoningEffort : settings.claudeReasoningEffort,
        sessionId: `${session.id}-${speaker}`,
        userMsg: userMessage,
        groupUserText: userMessage.content,
        recentSummerProposals: messages
          .filter((message) => message.speaker === speaker && message.source?.startsWith("summer_write_") && message.proposal)
          .slice(-12)
          .map((message) => message.proposal),
        skipPersist: true,
        stream: speaker === "claude",
        groupSessionId: session.id,
        groupSessionName: session.name,
        groupSpeakerName: speakerName(speaker, settings),
      }),
      signal,
    });
    const data = speaker === "claude"
      ? await readChatResponse(response, (delta) => {
          if (!signal.aborted) {
            setStreamingReply((current) => ({ speaker, text: `${current?.speaker === speaker ? current.text : ""}${delta}` }));
          }
        })
      : await response.json();
    setStreamingReply(null);
    if (speaker === "claude") window.dispatchEvent(new Event("claude-usage-updated"));
    const responseStatus = typeof data.status === "number" ? data.status : response.status;
    if (responseStatus >= 400) throw new Error(data.reply || "模型请求失败");

    const timestamp = String(data.cache?.group_persisted_time || nowTime());
    const date = String(data.cache?.group_persisted_date || today());
    const rawReply = stripLeakedThinking(
      String(data.reply || "...").replace(/\[心情[:：].+?\]/g, ""),
    ).content || "...";
    const utilityMessages: GroupChatMessage[] = (data.cache?.summer_calls || []).map((call: { label?: string; tool?: string; count?: number }) => ({
      role: "assistant",
      speaker,
      source: "summer_call",
      content: `${speakerName(speaker, settings)} Summer · ${call.label || call.tool || "检索"}${typeof call.count === "number" ? ` · ${call.count} 条` : ""}`,
      time: timestamp,
      date,
    }));
    const replyMessages: GroupChatMessage[] = rawReply.split(/\n{2,}/).map((part: string) => part.trim()).filter(Boolean).map((content: string) => ({
      role: "assistant",
      speaker,
      content,
      time: timestamp,
      date,
    }));
    const proposalMessages: GroupChatMessage[] = (data.cache?.summer_write_proposals || []).map((proposal: GroupSummerWriteProposal) => ({
      role: "assistant",
      speaker,
      source: "summer_write_proposal",
      proposal,
      content: proposalContent(proposal, speaker, settings),
      time: timestamp,
      date,
    }));
    return [...utilityMessages, ...replyMessages, ...proposalMessages];
  }

  async function prepareGroupContext(messages: GroupChatMessage[], signal: AbortSignal) {
    const response = await groupFetch("/api/group-context", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({
        sessionId: session.id,
        systemPrompt: [groupSystemPrompt("claude", settings), groupSystemPrompt("gpt", settings)].join("\n"),
        messages: visibleGroupMessages(messages)
          .filter(({ message }) => !message.source?.startsWith("summer_") && message.source !== "group_error")
          .map(({ message, originalIndex }) => ({
            index: originalIndex, role: message.role,
            speaker: message.role === "user" ? GROUP_USER_LABEL : speakerName(message.speaker || "claude", settings),
            content: message.content || (messageImages(message).length ? "[发送了图片]" : message.file ? "[发送了一个文件]" : ""),
            media: Boolean(messageImages(message).length || message.file),
          })),
      }),
    });
    try {
      const result = await readChatResponse<{ status?: number; reply?: string; summary: string; until: number }>(response, () => {}, (text) => {
        if (!signal.aborted) setSummarizing(text.startsWith("正在压缩"));
      });
      if ((result.status || response.status) >= 400) throw new Error(result.reply || "上下文压缩失败；原记录已保留。");
      if (result.summary !== (session.summary || "") || result.until !== (session.summarizedUntil || 0)) updateSummary(result.summary, result.until);
      return result;
    } finally {
      setSummarizing(false);
    }
  }

  async function sendMessage() {
    const text = stripObjectPlaceholders(input).trim();
    if ((!text && !attachments.length) || loading || uploading || sendingRef.current) return;
    sendingRef.current = true;
    followLatest();
    const previousMessages = messagesRef.current;
    const pendingFile = attachments.find((item) => item.kind === "file");
    const userMessage: GroupChatMessage = { role: "user", content: text || (pendingFile ? `📄 ${pendingFile.name}` : ""),
      time: nowTime(), date: today(),
      ...imageFields(attachments.filter((item) => item.kind === "image").map((item) => item.url)),
      ...(pendingFile ? { file: pendingFile.url } : {}),
    };
    let working = [...previousMessages, userMessage];
    messagesRef.current = working;
    updateMessages(() => working);
    setInput("");
    setAttachments([]);
    setUploadError("");
    setShowWebSearchMenu(false);
    if (inputRef.current) inputRef.current.style.height = "auto";

    const controller = new AbortController();
    activeControllerRef.current = controller;
    setLoading(true);
    setReplyState("preparing");
    const targets = selectTargets(text, previousMessages, settings);

    try {
      for (const speaker of targets) {
        if (controller.signal.aborted) break;
        try {
          setActiveSpeaker(speaker);
          setStreamingReply(null);
          const context = await prepareGroupContext(working, controller.signal);
          if (controller.signal.aborted) break;
          const additions = await requestSpeaker(speaker, working, userMessage, controller.signal, context);
          if (controller.signal.aborted) break;
          working = [...working, ...additions];
        } catch (error) {
          setStreamingReply(null);
          if (controller.signal.aborted) throw error;
          const reason = error instanceof Error ? error.message : "";
          working = [...working, {
            role: "assistant",
            speaker,
            source: "group_error",
            content: reason.includes("上下文") || (speaker === "claude" && reason.includes("没有转用 API"))
              ? reason
              : `${speakerName(speaker, settings)} 这次没有连上，另一位会继续回复。`,
            time: nowTime(),
            date: today(),
          }];
        }
        messagesRef.current = working;
        updateMessages(() => working);
      }
      if (!controller.signal.aborted) {
        setReplyState("idle");
      }
    } catch {
      if (controller.signal.aborted) setReplyState("paused");
    } finally {
      setStreamingReply(null);
      clearTimers();
      activeControllerRef.current = null;
      sendingRef.current = false;
      setLoading(false);
    }
  }

  // The picker lives in the DOM (see the hidden input below). A detached
  // input can be garbage-collected on iOS before "change" fires, which made
  // a picked photo silently vanish and need two or three tries.
  async function uploadFile(event: ChangeEvent<HTMLInputElement>) {
    const picker = event.currentTarget;
    const picked = Array.from(picker.files || []);
    picker.value = "";
    if (!picked.length || uploadingRef.current || loading) return;
    const notes: string[] = [];
    let imageSlots = MAX_IMAGES_PER_MESSAGE - attachments.filter((item) => item.kind === "image").length;
    let fileSlot = !attachments.some((item) => item.kind === "file");
    const queue: File[] = [];
    for (const file of picked) {
      if (file.type.startsWith("image/")) {
        if (imageSlots > 0) { queue.push(file); imageSlots -= 1; }
        else if (!notes.includes("image-limit")) notes.push("image-limit");
      } else if (fileSlot) {
        queue.push(file);
        fileSlot = false;
      } else if (!notes.includes("file")) notes.push("file");
    }
    const messages: string[] = notes.map((note) => note === "image-limit"
      ? `一条消息最多 ${MAX_IMAGES_PER_MESSAGE} 张图片，多出来的没有加上`
      : "一条消息只能带一个文件");
    if (!queue.length) { setUploadError(messages.join("；") + "。"); return; }
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
          const response = await groupFetch("/api/upload", { method: "POST", body: formData });
          const data = await response.json();
          if (!response.ok || !data.url) throw new Error(data.error || "上传失败");
          setAttachments((current) => [...current, {
            id: Math.random().toString(36).slice(2), kind: isImage ? "image" : "file",
            url: data.url, name: original.name,
          }]);
        } catch (error) {
          messages.push(`${original.name || "一张图片"}：${error instanceof Error ? error.message : "上传失败"}`);
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

  async function acceptProposal(message: GroupChatMessage, index: number) {
    if (!message.speaker || !message.proposal?.content?.trim()) return;
    const proposal = message.proposal;
    const endpoint = message.speaker === "gpt" ? "/api/gpt/summer" : "/api/summer";
    try {
      const body = proposal.id ? {
        action: "commit_proposal",
        proposal_id: proposal.id,
        patch: {
          layer: proposal.layer || "xiaoshu",
          title: proposal.title || "",
          content: proposal.content,
          weight: proposal.weight ?? 5,
          due: proposal.due || "",
          tags: proposal.tags || [],
        },
      } : {
        layer: proposal.layer || "xiaoshu",
        title: proposal.title || "",
        content: proposal.content,
        weight: proposal.weight ?? 5,
        due: proposal.due || "",
        tags: proposal.tags || [],
        source: "iooi-group-proposal",
      };
      const response = await groupFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error("summer 写入失败");
      const duplicate = Boolean(data.data?.duplicate);
      replaceMessage(index, (old) => ({
        ...old,
        source: "summer_write_committed",
        proposal: { ...proposal, status: duplicate ? "duplicate" : "committed" },
        content: proposalContent(proposal, message.speaker!, settings, duplicate ? "duplicate" : "committed"),
      }));
    } catch {
      replaceMessage(index, (old) => ({ ...old, content: `${old.content}\n\n写入失败，稍后再试。` }));
    }
  }

  async function discardProposal(message: GroupChatMessage, index: number) {
    if (!message.speaker) return;
    if (message.proposal?.id) {
      const endpoint = message.speaker === "gpt" ? "/api/gpt/summer" : "/api/summer";
      try {
        await groupFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "discard_proposal", proposal_id: message.proposal.id }),
        });
      } catch {}
    }
    replaceMessage(index, (old) => ({
      ...old,
      source: "summer_write_ignored",
      proposal: old.proposal ? { ...old.proposal, status: "discarded" } : old.proposal,
    }));
  }

  const statusText = summarizing ? "正在压缩上下文…" : replyState === "paused"
    ? "已暂停，已经收到的回复会保留"
    : activeSpeaker
      ? `${speakerName(activeSpeaker, settings)}${replyState === "preparing" ? " 正在准备…" : replyState === "slow" ? " 还在认真想…" : replyState === "very-slow" ? " 这轮有点久，仍在等待…" : " 正在回复…"}`
      : "正在准备群聊…";

  function insertMention(speaker: GroupSpeaker) {
    const name = speakerName(speaker, settings);
    const prefix = `@${name} `;
    setInput((current) => current.startsWith(prefix) ? current : `${prefix}${current}`);
    setShowMenu(false);
    setShowWebSearchMenu(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const displayedMessages = visibleGroupMessages(session.messages).filter(({ message }) =>
    !(message.source === "summer_call" && message.content.includes("已读取 Summer 唤醒内容与记忆状态")));

  return (
    <>
      <header className="chat-header chat-room-header group-room-header">
        {retro ? <>
          <div className="xp-chat-titlebar">
            <span className="xp-chat-title-icon" aria-hidden="true"><ChatGlyph /></span>
            <span className="xp-chat-title">{session.name || "一个群"} - 群聊</span>
            <div className="xp-chat-controls">
              <span className="xp-chat-btn xp-chat-min" aria-hidden="true" />
              <span className="xp-chat-btn xp-chat-max" aria-hidden="true" />
              <button type="button" className="xp-chat-btn xp-chat-close" onClick={onBack} aria-label="返回">
                <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" /></svg>
              </button>
            </div>
          </div>
          <div className="xp-chat-to">
            <div className="xp-group-members" aria-label="群成员">
              <span className="xp-chat-buddy" aria-hidden="true" />
              <span>{settings.userName || "你"}、{settings.aiName || "王酥酥"}、{settings.gptName || "GPT"}</span>
            </div>
            <ClaudeUsageCircle {...claudeUsage} className="xp-chat-quota" title="剩余百分比：五小时 / 本周" />
          </div>
        </> :
        <div className="header-top">
          <button className="header-icon-btn chat-room-back" onClick={onBack} aria-label="返回">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="14.5 5.5 8 12 14.5 18.5" />
            </svg>
          </button>
          <div
            className="header-center group-session-title"
            aria-label={`一个群${session.summary ? "，已记住前情" : ""}${summarizing ? "，整理前情中" : ""}`}
          >
            <h1 className="header-title chat-room-title">一个群</h1>
          </div>
          {/* The quota is plain numbers top right; the context circle sits
              beside the input. New group windows open from the chat list. */}
          <div className="room-header-usage">
            <ClaudeUsageCircle {...claudeUsage} className="room-header-quota" title="剩余百分比：五小时 / 本周" />
          </div>
        </div>}
      </header>

      <section className="chat-messages" ref={scrollRef} onScroll={handleScroll}>
        {displayedMessages.length === 0 && (
          <div className="empty-chat"><p>你、{settings.aiName || "王酥酥"}和{settings.gptName || "GPT"}都在这里</p></div>
        )}
        {displayedMessages.map(({ message, originalIndex: index }, displayedIndex) => {
          const isUser = message.role === "user";
          const isUtility = message.source?.startsWith("summer_");
          const owner = message.speaker ? speakerName(message.speaker, settings) : "";
          const avatar = message.speaker === "gpt" ? settings.gptAvatar : settings.aiAvatar;
          const showDate = displayedIndex === 0 || message.date !== displayedMessages[displayedIndex - 1]?.message.date;
          return (
            <div key={`${message.time}-${index}`}>
              {showDate && message.date && <div className="date-separator"><span className="date-separator-text">{message.date}</span></div>}
              {retro && !isUtility && <div className={`xp-msg-says${message.speaker === "gpt" ? " xp-msg-says-gpt" : ""}`}>
                {isUser ? settings.userName || "你" : owner} 说{message.time ? ` (${message.time})` : ""}:
              </div>}
              <div className={`msg-row ${isUser ? "msg-row-user" : "msg-row-ai"} ${isUtility ? "msg-row-summer-utility" : ""}`}>
                {!isUser && !isUtility && <Avatar src={avatar} />}
                <div className={isUser ? "msg-content-user" : "msg-content-ai"}>
                  {!retro && <span className={`msg-time ${!isUser ? "group-speaker-meta" : ""}`}>{!isUser && owner ? `${owner} · ` : ""}{message.time}</span>}
                  {isUtility ? (
                    <GroupSummerCard message={message}>
                      {message.source === "summer_write_proposal" && (
                        <div className="summer-proposal-actions">
                          <button onClick={() => acceptProposal(message, index)}>加入 {speakerName(message.speaker!, settings)} Summer</button>
                          <button onClick={() => discardProposal(message, index)}>忽略</button>
                        </div>
                      )}
                    </GroupSummerCard>
                  ) : messageImages(message).length > 0 ? (
                    <div className={`msg-bubble msg-bubble-img ${isUser ? "msg-bubble-user" : "msg-bubble-ai"}`}>
                      {messageImages(message).length === 1 ? (
                        <img src={messageImages(message)[0]} className="msg-image" alt="" onClick={() => window.open(messageImages(message)[0], "_blank")} />
                      ) : (
                        <div className={`msg-image-grid${messageImages(message).length === 2 || messageImages(message).length === 4 ? " msg-image-grid-2" : ""}`}>
                          {messageImages(message).map((url) => (
                            <img key={url} src={url} className="msg-image-tile" alt="" onClick={() => window.open(url, "_blank")} />
                          ))}
                        </div>
                      )}
                      {message.content && <p className="msg-image-caption">{message.content}</p>}
                    </div>
                  ) : message.file ? (
                    <a className={`msg-bubble group-file-bubble ${isUser ? "msg-bubble-user" : "msg-bubble-ai"}`} href={message.file} target="_blank" rel="noreferrer">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span>{message.content || "打开文件"}</span>
                    </a>
                  ) : (
                    <div className={`msg-bubble ${isUser ? "msg-bubble-user" : "msg-bubble-ai"} ${message.source === "group_error" ? "group-error-bubble" : ""}`}>
                      {renderGroupContent(message.content)}
                    </div>
                  )}
                </div>
                {isUser && <Avatar src={settings.userAvatar} user />}
              </div>
            </div>
          );
        })}
        {streamingReply?.text && (
          <Fragment>
          {retro && <div className="xp-msg-says">{speakerName(streamingReply.speaker, settings)} 说:</div>}
          <div className="msg-row msg-row-ai msg-row-streaming">
            <Avatar src={streamingReply.speaker === "gpt" ? settings.gptAvatar : settings.aiAvatar} />
            <div className="msg-content-ai">
              {!retro && <span className="msg-time group-speaker-meta">{speakerName(streamingReply.speaker, settings)}</span>}
              <div className="msg-bubble msg-bubble-ai msg-bubble-streaming" aria-live="polite">
                {renderGroupContent(streamingReply.text)}
              </div>
            </div>
          </div>
          </Fragment>
        )}
        {((loading && !streamingReply?.text) || replyState === "paused") && (
          <div className="msg-row msg-row-ai">
            {activeSpeaker && <Avatar src={activeSpeaker === "gpt" ? settings.gptAvatar : settings.aiAvatar} />}
            <div className="msg-content-ai">
              <div className={`msg-bubble msg-bubble-ai reply-status-bubble reply-status-${replyState}`} aria-live="polite">
                {loading && <div className="typing-dots"><span /><span /><span /></div>}
                <span className="reply-status-text">{statusText}</span>
              </div>
            </div>
          </div>
        )}
      </section>

      <footer className="chat-footer group-chat-footer">
        {retro && <div className="xp-chat-toolbar">
          <button type="button" className="xp-chat-tool" aria-label="群聊菜单" aria-expanded={showMenu}
            onClick={() => { setShowMenu((open) => !open); setShowWebSearchMenu(false); }}>
            <span aria-hidden="true">@</span><span>点名 / 搜索</span>
          </button>
          <button type="button" className="xp-chat-tool" onClick={() => fileInputRef.current?.click()} disabled={uploading || loading} aria-label="上传图片或文件">
            <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3" width="13" height="10" rx="1" fill="#fff" stroke="#3a6ea5" /><path d="M2.5 12l3.6-4 2.6 2.7 1.8-1.8 3 3.1z" fill="#4caf3a" /><circle cx="11" cy="6" r="1.4" fill="#f5b800" /></svg>
            <span>{uploading ? "上传中…" : "文件"}</span>
          </button>
          <span className="xp-chat-toolbar-gap" />
          <ContextUsageBadge kind="group" sessionId={session.id} messages={usageMessages} systemPrompt={usageSystemPrompt} />
        </div>}
        {uploadError && <p className="composer-upload-error" role="alert">{uploadError}</p>}
        {attachments.length > 0 && (
          <div className="composer-attachments" aria-label="待发送的附件">
            {attachments.map((item) => (
              <div key={item.id} className={`composer-attachment${item.kind === "file" ? " composer-attachment-file" : ""}`}>
                {item.kind === "image" ? <img src={item.url} alt="" /> : <span className="composer-attachment-name">📄 {item.name}</span>}
                <button type="button" className="composer-attachment-remove" onClick={() => removeAttachment(item.id)}
                  aria-label={item.kind === "image" ? "移除这张图片" : "移除这个文件"} title="移除">×</button>
              </div>
            ))}
          </div>
        )}
        {showMenu && showWebSearchMenu && (
          <div className="group-web-search-panel" aria-label="Web Search 设置">
            <div className="group-web-search-option">
              <span>{settings.aiName || "王酥酥"}</span>
              <button
                type="button"
                className={`chat-config-switch${settings.webSearch ? " chat-config-switch-on" : ""}`}
                role="switch"
                aria-checked={settings.webSearch}
                onClick={() => updateSettings({ webSearch: !settings.webSearch })}
                disabled={loading}
              >
                <span>{settings.webSearch ? "On" : "Off"}</span><i />
              </button>
            </div>
            <div className="group-web-search-option">
              <span>王郁郁</span>
              <button
                type="button"
                className={`chat-config-switch${settings.gptWebSearch ? " chat-config-switch-on" : ""}`}
                role="switch"
                aria-checked={settings.gptWebSearch}
                onClick={() => updateSettings({ gptWebSearch: !settings.gptWebSearch })}
                disabled={loading}
              >
                <span>{settings.gptWebSearch ? "On" : "Off"}</span><i />
              </button>
            </div>
          </div>
        )}
        {showMenu && <div className="group-mention-row group-composer-menu" role="group" aria-label="群聊菜单">
          <button type="button" onClick={() => insertMention("claude")}>@{settings.aiName || "王酥酥"}</button>
          <button type="button" onClick={() => insertMention("gpt")}>@{settings.gptName || "GPT"}</button>
          <button
            type="button"
            className={`group-web-search-trigger${showWebSearchMenu || settings.webSearch || settings.gptWebSearch ? " group-web-search-trigger-active" : ""}`}
            aria-expanded={showWebSearchMenu}
            onClick={() => setShowWebSearchMenu((open) => !open)}
            disabled={loading}
          >
            Web Search
          </button>
        </div>}
        <div className={retro ? "xp-chat-compose" : "composer-row"}>
          {!retro &&
          <button type="button" className="attach-btn attach-btn-separate group-menu-trigger" aria-label="群聊菜单" aria-expanded={showMenu}
            onClick={() => { setShowMenu((open) => !open); setShowWebSearchMenu(false); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="attach-file-input"
            accept="image/*,application/pdf,.txt,.md,.csv"
            disabled={uploading || loading}
            onChange={(event) => void uploadFile(event)}
            aria-label="上传图片或文件"
          />
          {!retro && <button
            type="button"
            className={`attach-btn attach-btn-separate${uploading ? " attach-btn-uploading" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || loading}
            aria-label={uploading ? "正在上传" : "上传图片或文件"}
            title={uploading ? "正在上传" : "上传图片或文件"}
          >
            {uploading ? (
              <span className="attach-upload-spinner" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
            )}
          </button>}
          <div className={retro ? "xp-group-input" : "input-wrapper"}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                event.target.style.height = "auto";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
              }}
              placeholder="和他们说点什么…"
              rows={retro ? 2 : 1}
              className={retro ? "xp-chat-input" : "chat-input"}
              aria-label="输入消息"
            />
            <button
              type="button"
              onClick={loading ? pauseReply : () => void sendMessage()}
              disabled={!loading && ((!input.trim() && !attachments.length) || uploading)}
              className={retro ? "xp-chat-send" : `send-btn${loading ? " pause-reply-btn" : ""}`}
              aria-label={loading ? "暂停等待回复" : "发送消息"}
            >
              {retro ? (loading ? "暂停" : "发送") : loading ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="white" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
              )}
            </button>
          </div>
          {!retro && <ContextUsageBadge kind="group" sessionId={session.id} messages={usageMessages} systemPrompt={usageSystemPrompt} />}
        </div>
      </footer>
    </>
  );
}
