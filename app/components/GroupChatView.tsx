"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  gptReasoningEffort: string;
  claudeReasoningEffort: string;
};

type ModelMessage = {
  role: "user" | "assistant";
  content: string;
  image?: string;
  file?: string;
};
type ReplyState = "idle" | "preparing" | "waiting" | "slow" | "very-slow" | "paused";

const GROUP_CONTEXT_ROUNDS = 18;
const GROUP_SUMMARY_KEEP_MESSAGES = 36;
const GROUP_SUMMARY_MIN_NEW_MESSAGES = 9;
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

function buildModelMessages(messages: GroupChatMessage[], target: GroupSpeaker, settings: GroupSettings) {
  const prepared: ModelMessage[] = [];
  for (const message of messages) {
    if (message.source?.startsWith("summer_")) continue;
    let next: ModelMessage;
    if (message.role === "user") {
      next = {
        role: "user",
        content: `【${settings.userName || "用户"}在群里说】\n${message.content || (message.image ? "请看这张图片。" : "请看这个文件。")}`,
        ...(message.image ? { image: message.image } : {}),
        ...(message.file ? { file: message.file } : {}),
      };
    } else if (message.speaker === target) {
      next = { role: "assistant", content: message.content };
    } else {
      const other = message.speaker ? speakerName(message.speaker, settings) : "另一位成员";
      next = { role: "user", content: `【${other}在群里说】\n${message.content}` };
    }
    const last = prepared[prepared.length - 1];
    if (last?.role === next.role && !last.image && !last.file && !next.image && !next.file) last.content += `\n\n${next.content}`;
    else prepared.push(next);
  }

  let rounds = 0;
  let start = 0;
  for (let i = prepared.length - 1; i >= 0; i--) {
    if (prepared[i].role !== "user") continue;
    rounds++;
    if (rounds >= GROUP_CONTEXT_ROUNDS) {
      start = i;
      break;
    }
  }
  const sliced = prepared.slice(start);
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
你现在以“${me}”的身份参加“一个群”，群成员是${settings.userName || "用户"}、${settings.aiName || "王酥酥"}和${settings.gptName || "GPT"}。
带有“${other}在群里说”的内容是另一位成员刚才的发言，你可以自然接话、赞同或提出不同看法。
只代表你自己说话，不要替另一位成员发言，不要模拟下一轮对话。每次只回复这一轮，然后停下。
默认简洁自然，直接面向群里的人说话。你只能使用自己的 summer，绝不能声称看见另一位模型的私聊或 summer。
如需长期记忆，只能提出写入你自己 summer 的待确认建议。`;
}

function groupSessionPreview(session: GroupSession) {
  const latest = [...session.messages].reverse().find((message) => !message.source?.startsWith("summer_"));
  if (!latest) return "还没有消息";
  if (latest.image) return "[图片]";
  if (latest.file) return latest.content || "[文件]";
  return latest.content.replace(/\s+/g, " ").slice(0, 32) || "新消息";
}

function proposalContent(proposal: GroupSummerWriteProposal, speaker: GroupSpeaker, settings: GroupSettings, committed = false) {
  const layerNames: Record<string, string> = {
    mangzhong: "芒种",
    xiazhi: "夏至",
    xiaoshu: "小暑",
    rain: "rain",
    ferry: "渡口",
  };
  const owner = `${speakerName(speaker, settings)} Summer`;
  const status = committed ? "已加入" : "待确认";
  return `${owner} · ${status} · ${layerNames[proposal.layer || "xiaoshu"] || proposal.layer}\n${proposal.title || "未命名"}\n${proposal.content || ""}`.trim();
}

function Avatar({ src, user = false }: { src: string; user?: boolean }) {
  if (src) return <img src={src} className="avatar avatar-img" alt="" />;
  return <div className={`avatar ${user ? "avatar-user" : "avatar-ai"}`} />;
}

export function GroupChatView({
  session,
  sessions,
  settings,
  claudeModelId,
  updateMessages,
  updateSummary,
  setActiveSessionId,
  createSession,
  onBack,
}: {
  session: GroupSession;
  sessions: GroupSession[];
  settings: GroupSettings;
  claudeModelId: string;
  updateMessages: (updater: (messages: GroupChatMessage[]) => GroupChatMessage[]) => void;
  updateSummary: (summary: string, until: number) => void;
  setActiveSessionId: (id: string) => void;
  createSession: () => void;
  onBack: () => void;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [replyState, setReplyState] = useState<ReplyState>("idle");
  const [activeSpeaker, setActiveSpeaker] = useState<GroupSpeaker | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef(session.messages);
  const sendingRef = useRef(false);
  const activeControllerRef = useRef<AbortController | null>(null);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const summaryInFlightRef = useRef(false);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current = [];
  }, []);

  useEffect(() => {
    messagesRef.current = session.messages;
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [session.messages]);

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
    activeControllerRef.current.abort();
  }

  async function requestSpeaker(
    speaker: GroupSpeaker,
    messages: GroupChatMessage[],
    userMessage: GroupChatMessage,
    signal: AbortSignal,
  ) {
    beginSpeakerStatus(speaker);
    const response = await groupFetch(speaker === "gpt" ? "/api/gpt/chat" : "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelId: speaker === "gpt" ? "openai/gpt-5.6-sol" : claudeModelId,
        systemPrompt: groupSystemPrompt(speaker, settings),
        dynamicPrompt: [
          `【当前时间】\n${currentContext()}`,
          session.summary ? `【群聊较早内容的共享摘要】\n${session.summary}` : "",
          "这是群聊，不接入天气、心情墙或 heartbeat。",
        ].filter(Boolean).join("\n\n"),
        messages: buildModelMessages(messages, speaker, settings),
        thinking: speaker === "claude" && settings.thinking,
        webSearch: false,
        reasoningEffort: speaker === "gpt" ? settings.gptReasoningEffort : settings.claudeReasoningEffort,
        sessionId: `${session.id}-${speaker}`,
        userMsg: userMessage,
        groupUserText: userMessage.content,
        skipPersist: true,
      }),
      signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.reply || "模型请求失败");

    const timestamp = nowTime();
    const date = today();
    const rawReply = String(data.reply || "...").replace(/\[心情[:：].+?\]/g, "").trim();
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

  async function refreshSharedSummary(messages: GroupChatMessage[]) {
    if (summaryInFlightRef.current) return;
    const until = Math.max(0, messages.length - GROUP_SUMMARY_KEEP_MESSAGES);
    const already = session.summarizedUntil || 0;
    if (until - already < GROUP_SUMMARY_MIN_NEW_MESSAGES) return;

    const olderMessages = messages.slice(already, until)
      .filter((message) => !message.source?.startsWith("summer_") && message.source !== "group_error")
      .map((message) => ({
        role: message.role,
        speaker: message.speaker,
        content: message.content || (message.image ? "[发送了一张图片]" : message.file ? "[发送了一个文件]" : ""),
      }))
      .filter((message) => message.content.trim());
    if (olderMessages.length === 0) return;

    summaryInFlightRef.current = true;
    setSummarizing(true);
    try {
      const response = await groupFetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "group",
          previousSummary: session.summary || "",
          messages: olderMessages,
          aiName: settings.aiName || "王酥酥",
          gptName: settings.gptName || "GPT",
          userName: settings.userName || "用户",
          modelId: "anthropic/claude-sonnet-4.6",
        }),
      });
      const data = await response.json();
      if (response.ok && data.ok && data.summary) {
        updateSummary(String(data.summary).trim(), until);
      }
    } catch {
      // 摘要失败不影响当轮群聊，下次达到条件时会自动重试。
    } finally {
      summaryInFlightRef.current = false;
      setSummarizing(false);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading || uploading || sendingRef.current) return;
    sendingRef.current = true;
    const previousMessages = messagesRef.current;
    const userMessage: GroupChatMessage = { role: "user", content: text, time: nowTime(), date: today() };
    let working = [...previousMessages, userMessage];
    messagesRef.current = working;
    updateMessages(() => working);
    setInput("");
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
          const additions = await requestSpeaker(speaker, working, userMessage, controller.signal);
          if (controller.signal.aborted) break;
          working = [...working, ...additions];
        } catch (error) {
          if (controller.signal.aborted) throw error;
          working = [...working, {
            role: "assistant",
            speaker,
            source: "group_error",
            content: `${speakerName(speaker, settings)} 这次没有连上，另一位会继续回复。`,
            time: nowTime(),
            date: today(),
          }];
        }
        messagesRef.current = working;
        updateMessages(() => working);
      }
      if (!controller.signal.aborted) {
        setReplyState("idle");
        void refreshSharedSummary(working);
      }
    } catch {
      if (controller.signal.aborted) setReplyState("paused");
    } finally {
      clearTimers();
      activeControllerRef.current = null;
      sendingRef.current = false;
      setLoading(false);
    }
  }

  async function uploadFile() {
    if (uploading || loading) return;
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/*,application/pdf,.txt,.md,.csv";
    picker.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("file", file);
      setUploading(true);
      try {
        const response = await groupFetch("/api/upload", { method: "POST", body: formData });
        const data = await response.json();
        if (!response.ok || !data.url) throw new Error(data.error || "上传失败");
        const isImage = file.type.startsWith("image/");
        const message: GroupChatMessage = {
          role: "user",
          content: isImage ? "" : `📄 ${file.name}`,
          time: nowTime(),
          date: today(),
          ...(isImage ? { image: data.url } : { file: data.url }),
        };
        const messages = [...messagesRef.current, message];
        messagesRef.current = messages;
        updateMessages(() => messages);
      } catch {
        const message: GroupChatMessage = {
          role: "assistant",
          source: "group_error",
          content: "文件这次没有传上去，请再试一次。",
          time: nowTime(),
          date: today(),
        };
        const messages = [...messagesRef.current, message];
        messagesRef.current = messages;
        updateMessages(() => messages);
      } finally {
        setUploading(false);
      }
    };
    picker.click();
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
      replaceMessage(index, (old) => ({
        ...old,
        source: "summer_write_committed",
        proposal: { ...proposal, status: "committed" },
        content: proposalContent(proposal, message.speaker!, settings, true),
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

  const statusText = replyState === "paused"
    ? "已暂停，已经收到的回复会保留"
    : activeSpeaker
      ? `${speakerName(activeSpeaker, settings)}${replyState === "preparing" ? " 正在准备…" : replyState === "slow" ? " 还在认真想…" : replyState === "very-slow" ? " 这轮有点久，仍在等待…" : " 正在回复…"}`
      : "正在准备群聊…";

  function insertMention(speaker: GroupSpeaker) {
    const name = speakerName(speaker, settings);
    const prefix = `@${name} `;
    setInput((current) => current.startsWith(prefix) ? current : `${prefix}${current}`);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <>
      <header className="chat-header chat-room-header">
        <div className="header-top">
          <button className="header-icon-btn chat-room-back" onClick={onBack} aria-label="返回">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="14.5 5.5 8 12 14.5 18.5" />
            </svg>
          </button>
          <button className="header-center group-session-title" type="button" onClick={() => setShowSessions((open) => !open)} aria-expanded={showSessions}>
            <h1 className="header-title chat-room-title">一个群</h1>
            <span className="header-subtitle chat-room-status">
              {session.name}{session.summary ? " · 已记住前情" : ""}{summarizing ? " · 整理前情中" : ""}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
            </span>
          </button>
          <button className="header-icon-btn group-session-new" type="button" onClick={createSession} aria-label="新群聊">＋</button>
        </div>
      </header>

      {showSessions && (
        <div className="group-session-switcher">
          {sessions.map((group) => (
            <button
              type="button"
              key={group.id}
              className={group.id === session.id ? "group-session-row group-session-row-active" : "group-session-row"}
              onClick={() => {
                setActiveSessionId(group.id);
                setShowSessions(false);
              }}
            >
              <span><b>{group.name}</b><small>{groupSessionPreview(group)}</small></span>
              {group.id === session.id && <i>✓</i>}
            </button>
          ))}
          <button type="button" className="group-session-create-row" onClick={() => { createSession(); setShowSessions(false); }}>＋ 新群聊</button>
        </div>
      )}

      <section className="chat-messages" ref={scrollRef}>
        {session.messages.length === 0 && (
          <div className="empty-chat"><p>你、{settings.aiName || "王酥酥"}和{settings.gptName || "GPT"}都在这里</p></div>
        )}
        {session.messages.map((message, index) => {
          const isUser = message.role === "user";
          const isUtility = message.source?.startsWith("summer_");
          const owner = message.speaker ? speakerName(message.speaker, settings) : "";
          const avatar = message.speaker === "gpt" ? settings.gptAvatar : settings.aiAvatar;
          const showDate = index === 0 || message.date !== session.messages[index - 1]?.date;
          return (
            <div key={`${message.time}-${index}`}>
              {showDate && message.date && <div className="date-separator"><span className="date-separator-text">{message.date}</span></div>}
              <div className={`msg-row ${isUser ? "msg-row-user" : "msg-row-ai"} ${isUtility ? "msg-row-summer-utility" : ""}`}>
                {!isUser && !isUtility && <Avatar src={avatar} />}
                <div className={isUser ? "msg-content-user" : "msg-content-ai"}>
                  <span className={`msg-time ${!isUser ? "group-speaker-meta" : ""}`}>{!isUser && owner ? `${owner} · ` : ""}{message.time}</span>
                  {isUtility ? (
                    <div className={`group-summer-card ${message.source === "summer_write_ignored" ? "group-summer-card-muted" : ""}`}>
                      <div className="group-summer-owner">{owner} · 独立 Summer</div>
                      <div className="group-summer-content">{message.content}</div>
                      {message.source === "summer_write_proposal" && (
                        <div className="summer-proposal-actions">
                          <button onClick={() => acceptProposal(message, index)}>加入 {speakerName(message.speaker!, settings)} Summer</button>
                          <button onClick={() => discardProposal(message, index)}>忽略</button>
                        </div>
                      )}
                      {message.source === "summer_write_ignored" && <div className="group-summer-state">已忽略</div>}
                    </div>
                  ) : message.image ? (
                    <div className={`msg-bubble msg-bubble-img ${isUser ? "msg-bubble-user" : "msg-bubble-ai"}`}>
                      <img src={message.image} className="msg-image" alt="" onClick={() => window.open(message.image, "_blank")} />
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
                      {message.content.split("\n").map((line, lineIndex) => <span key={lineIndex}>{line}{lineIndex < message.content.split("\n").length - 1 && <br />}</span>)}
                    </div>
                  )}
                </div>
                {isUser && <Avatar src={settings.userAvatar} user />}
              </div>
            </div>
          );
        })}
        {(loading || replyState === "paused") && (
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
        <div className="group-mention-row">
          <button type="button" onClick={() => insertMention("claude")}>@{settings.aiName || "王酥酥"}</button>
          <button type="button" onClick={() => insertMention("gpt")}>@{settings.gptName || "GPT"}</button>
        </div>
        <div className="composer-row">
          <button
            type="button"
            className={`attach-btn attach-btn-separate${uploading ? " attach-btn-uploading" : ""}`}
            onClick={() => void uploadFile()}
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
          </button>
          <div className="input-wrapper">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                event.target.style.height = "auto";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="和他们说点什么…"
              rows={1}
              className="chat-input"
            />
            <button
              type="button"
              onClick={loading ? pauseReply : () => void sendMessage()}
              disabled={!loading && (!input.trim() || uploading)}
              className={`send-btn${loading ? " pause-reply-btn" : ""}`}
              aria-label={loading ? "暂停等待回复" : "发送消息"}
            >
              {loading ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="white" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
              )}
            </button>
          </div>
        </div>
      </footer>
    </>
  );
}
