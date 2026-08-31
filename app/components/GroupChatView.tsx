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
};

type ModelMessage = { role: "user" | "assistant"; content: string };
type ReplyState = "idle" | "preparing" | "waiting" | "slow" | "very-slow" | "paused";

const GROUP_CONTEXT_ROUNDS = 18;
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
      next = { role: "user", content: `【${settings.userName || "用户"}在群里说】\n${message.content}` };
    } else if (message.speaker === target) {
      next = { role: "assistant", content: message.content };
    } else {
      const other = message.speaker ? speakerName(message.speaker, settings) : "另一位成员";
      next = { role: "user", content: `【${other}在群里说】\n${message.content}` };
    }
    const last = prepared[prepared.length - 1];
    if (last?.role === next.role) last.content += `\n\n${next.content}`;
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
  return sliced;
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
  settings,
  claudeModelId,
  updateMessages,
  onBack,
}: {
  session: GroupSession;
  settings: GroupSettings;
  claudeModelId: string;
  updateMessages: (updater: (messages: GroupChatMessage[]) => GroupChatMessage[]) => void;
  onBack: () => void;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [replyState, setReplyState] = useState<ReplyState>("idle");
  const [activeSpeaker, setActiveSpeaker] = useState<GroupSpeaker | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef(session.messages);
  const sendingRef = useRef(false);
  const activeControllerRef = useRef<AbortController | null>(null);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

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
        dynamicPrompt: `【当前时间】\n${currentContext()}\n\n这是群聊，不接入天气、心情墙或 heartbeat。`,
        messages: buildModelMessages(messages, speaker, settings),
        thinking: speaker === "claude" && settings.thinking,
        webSearch: false,
        reasoningEffort: speaker === "gpt" ? settings.gptReasoningEffort : undefined,
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

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading || sendingRef.current) return;
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
      if (!controller.signal.aborted) setReplyState("idle");
    } catch {
      if (controller.signal.aborted) setReplyState("paused");
    } finally {
      clearTimers();
      activeControllerRef.current = null;
      sendingRef.current = false;
      setLoading(false);
    }
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
          <div className="header-center">
            <h1 className="header-title chat-room-title">一个群</h1>
            <span className="header-subtitle chat-room-status">不点名时都回复 · @名字可单独叫人</span>
          </div>
          <span className="header-icon-btn" aria-hidden="true" />
        </div>
      </header>

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
            disabled={!loading && !input.trim()}
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
      </footer>
    </>
  );
}
