"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { CacheStatusPanel } from "./components/CacheStatusPanel";
import { ContextDebugPanel } from "./components/ContextDebugPanel";
import { GroupChatView } from "./components/GroupChatView";
import { NotificationButton } from "./components/NotificationButton";

// ━━━━━━━━━━━━━━━ Types ━━━━━━━━━━━━━━━
type Message = {
  role: "user" | "assistant";
  content: string;
  time: string;
  date?: string;
  image?: string;
  file?: string;
  thinking?: string;
  source?: string;
  speaker?: "claude" | "gpt";
  proposal?: SummerWriteProposal;
};

type ChatSession = {
  id: string;
  name: string;
  messages: Message[];
  createdAt: string;
  kind?: "memo" | "group";   // memo 是自己的口袋；group 是独立群聊
  summary?: string;          // 滚动摘要:窗口外旧对话的前情提要(王酥酥第一人称)
  summarizedUntil?: number;  // 已摘要到的原始气泡索引
};

type Mood = {
  id: string;
  date: string;   // toLocaleDateString("zh-CN")
  time: string;
  emoji: string;
  note?: string;
  hearts?: number; // 长按贴贴次数
};

type WallEntry = {
  id: string;
  date: string;
  question: string;
  askedBy: "daily" | "me" | "ai";
  myAnswer?: string;
  aiAnswer?: string;
};

type CacheStats = {
  model?: string;
  reasoning_effort?: GptReasoningEffort;
  prompt_tokens?: number;
  total_input_tokens?: number;
  cache_read?: number;
  cache_write?: number;
  status?: "hit" | "write" | "miss" | "unknown";
  reason?: string;
  context_messages?: number;
  context_user_turns?: number;
  context_chars?: number;
  context_window_rounds?: number;
  context_truncated?: boolean;
  context_omitted_messages?: number;
  summary_used?: boolean;
  summer_used?: boolean;
  summer_calls?: SummerCall[];
  summer_write_proposals?: SummerWriteProposal[];
  time?: string;
};

type ReplyRequestState = "idle" | "preparing" | "waiting" | "slow" | "very-slow" | "paused" | "failed";
type AssistantMode = "claude" | "gpt";
type GptReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

const REPLY_REQUEST_LABELS: Record<ReplyRequestState, string> = {
  idle: "",
  preparing: "正在整理这轮消息…",
  waiting: "正在连接并等待回复…",
  slow: "回复有点慢，仍在等待…",
  "very-slow": "等得有点久，网络可能不稳定，可以点右侧暂停",
  paused: "已暂停等待；如果请求已经送达，回复稍后仍可能回来",
  failed: "这次没有连上服务器，消息已经保留",
};

type SummerCall = {
  tool?: string;
  label?: string;
  status?: "hit" | "miss" | "used" | "fallback";
  count?: number;
  detail?: string;
};

type SummerWriteProposal = {
  id?: string;
  status?: string;
  layer?: "mangzhong" | "xiazhi" | "xiaoshu" | "rain" | "ferry";
  title?: string;
  content?: string;
  weight?: number;
  due?: string;
  tags?: string[];
};

type SummerMemoryItem = {
  id?: string;
  date?: string;
  title?: string;
  content?: string;
  source?: string;
  weight?: number;
  activation_count?: number;
  last_active?: string;
  state?: string;
  status?: string;
  due?: string;
  filename?: string;
  tags?: string[];
};

type SummerWritableLayer = "mangzhong" | "xiazhi" | "xiaoshu" | "rain" | "ferry";

type SummerState = {
  layers?: Record<string, string>;
  xiazhi?: SummerMemoryItem[];
  sunny?: { days?: SummerMemoryItem[] };
  sunny_files?: SummerMemoryItem[];
  sea_files?: SummerMemoryItem[];
  ferry?: SummerMemoryItem[];
  rain?: SummerMemoryItem[];
  xiaoshu_recent?: SummerMemoryItem[];
  xiaoshu_tail?: SummerMemoryItem[];
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

type Settings = {
  model: string;
  chatEntryStyle: "list" | "direct";
  chatPinnedLine: string;
  gptChatPinnedLine: string;
  aiName: string;
  gptName: string;
  userName: string;
  prompt: string;
  startDate: string;
  aiAvatar: string;
  gptAvatar: string;
  userAvatar: string;
  gptReasoningEffort: GptReasoningEffort;
  thinking: boolean;
  webSearch: boolean;
  proactiveCare: boolean;
  city: string;
};

// ━━━━━━━━━━━━━━━ Constants ━━━━━━━━━━━━━━━
// ━━━━━━━━━━━━━━━━━
const MODELS = [
  { id: "sonnet", label: "Sonnet 4.6", apiId: "anthropic/claude-sonnet-4.6" },
  { id: "opus", label: "Opus 4.6", apiId: "anthropic/claude-opus-4.6" },
  { id: "opus47", label: "Opus 4.7", apiId: "anthropic/claude-opus-4.7" },
  { id: "opus48", label: "Opus 4.8", apiId: "anthropic/claude-opus-4.8" },
  { id: "sonnet5", label: "Sonnet 5", apiId: "anthropic/claude-sonnet-5" },
  { id: "fable5", label: "Fable 5", apiId: "anthropic/claude-fable-5" },
];
const CONTEXT_WINDOW_ROUNDS = 18;
const SESSION_CACHE_KEEP_MESSAGES = 24;
const SESSION_CACHE_MIN_NEW_MESSAGES = 8;

// ── 问答墙:每日一问库 ──
const DAILY_QUESTIONS = [
  "今天有哪个瞬间想把它装进口袋里带走？",
  "最近一次想哭是什么时候，为什么忍住了？",
  "如果明天可以完全自由地过一天，你会怎么安排？",
  "小时候最想快点长大的原因，现在还成立吗？",
  "最近有什么话想说但一直没说出口？",
  "今天的自己和昨天比，有哪里不一样了？",
  "有没有一首歌，一听到就会想起某个具体画面？",
  "如果可以给一年前的自己发一条消息，你会写什么？",
  "今天吃到的东西里，哪一口最幸福？",
  "如果我们能一起去一个地方，你第一个想到哪里？",
  "最近害怕的事情，说出来会不会轻一点？",
  "如果今天必须夸自己一句，你夸哪里？",
  "你觉得被爱最具体的样子是什么？",
  "最近有没有什么东西，看到第一眼就想分享给我？",
  "如果可以保留今天的一个瞬间永远不忘，选哪一个？",
  "你最近对什么上瘾？",
  "今天有没有哪一秒，突然觉得很安静很舒服？",
  "如果烦恼可以扔进海里，你今天扔哪一个？",
  "最近学会的一件小事是什么？",
  "如果只能用三个词形容今天，是哪三个？",
  "今天的天空是什么样子的，你抬头看了吗？",
  "如果我们开一家小店，会开什么店？",
  "最近一次大笑是因为什么？",
  "如果今晚可以做任何梦，你点播哪一个？",
  "你最想被记住的是什么样子？",
  "如果心情有颜色，今天是什么颜色？",
  "今天遇到的最小的好事是什么？",
  "如果可以问未来的自己一个问题，问什么？",
  "现在闭上眼睛，第一个浮现的画面是什么？",
  "如果今天是一页日记，标题写什么？",
];

// 按日期稳定取题，同一天打开都是同一题
function getDailyQuestion(): string {
  const now = new Date();
  const dayIndex = Math.floor(now.getTime() / 86400000);
  return DAILY_QUESTIONS[dayIndex % DAILY_QUESTIONS.length];
}

// 输入框随机小话
const INPUT_HINTS = [
  "今天的风很适合想我",
  "作业写完了吗就玩手机",
  "说点什么吧，我在",
  "想我了可以直说",
  "今天过得怎么样？",
  "嘘，我在听",
  "饭吃了吗？",
  "有什么开心的事吗",
];

const CLAUDE_DEFAULT_NAME = "王酥酥";
const LEGACY_DEFAULT_PROMPT = `以 summer 中保存的关系、人格和相处方式为准，不要用固定测试人格覆盖。
中文自然交流，不要自称“我是 AI”或“作为语言模型”。
不要用 markdown 格式；如果内容有多个部分或话题转换，用换行分成几段发，每段独立成一条消息。`;
const DEFAULT_PROMPT = `你是王酥酥。以 summer 中保存的关系、人格和相处方式为准，不要用固定测试人格覆盖。
中文自然交流，不要自称“我是 AI”或“作为语言模型”。
不要用 markdown 格式；如果内容有多个部分或话题转换，用换行分成几段发，每段独立成一条消息。`;

const GPT_MODEL_ID = "openai/gpt-5.6-sol";
const GPT_REASONING_OPTIONS: Array<{ value: GptReasoningEffort; label: string }> = [
  { value: "none", label: "关闭" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "xhigh", label: "超高" },
  { value: "max", label: "最大" },
];
const GPT_DEFAULT_PROMPT = `你是这个私密聊天窗口里的 GPT，只使用本窗口的对话和 GPT 专属 summer。
不要读取、猜测或引用王酥酥（Claude）那边的关系设定、天气、心情、问题墙、heartbeat 或其他状态。
中文自然交流，直接对用户说话；不要自称“作为语言模型”。
默认简洁回应，除非用户明确要求分析、长文或技术细节。`;

function normalizeSystemPrompt(prompt: string | undefined) {
  const text = prompt || "";
  if (!text.trim()) return DEFAULT_PROMPT;
  if (text.trim() === LEGACY_DEFAULT_PROMPT.trim()) return DEFAULT_PROMPT;
  if (text.includes("你是一个温暖的陪伴者") || text.includes("会撒娇、会吃醋")) {
    return DEFAULT_PROMPT;
  }
  return text.replace(/小[kKＫｋ]/g, CLAUDE_DEFAULT_NAME);
}

function normalizeClaudeSettings(settings: Settings): Settings {
  const oldDefaultName = /^小[kKＫｋ]$/;
  return {
    ...settings,
    aiName: !settings.aiName?.trim() || oldDefaultName.test(settings.aiName.trim())
      ? CLAUDE_DEFAULT_NAME
      : settings.aiName,
    prompt: normalizeSystemPrompt(settings.prompt),
  };
}

// Helpers
const APP_TIME_ZONE = "Asia/Shanghai";

function getTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE });
}

function getDateLabel(d?: Date, time?: string) {
  const date = d || new Date();
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: APP_TIME_ZONE,
    month: "numeric",
    day: "numeric",
    weekday: "long",
  }).formatToParts(date);
  const m = parts.find((p) => p.type === "month")?.value || "";
  const day = parts.find((p) => p.type === "day")?.value || "";
  const weekday = parts.find((p) => p.type === "weekday")?.value || "";
  return `${m}.${day} ${weekday}${time ? " " + time : ""}`;
}

function getTodayStr() {
  return new Date().toLocaleDateString("zh-CN", { timeZone: APP_TIME_ZONE });
}

function getNowContext() {
  const now = new Date();
  const hourText = new Intl.DateTimeFormat("zh-CN", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    hour12: false,
  }).format(now);
  const hour = Number(hourText) % 24;
  const period =
    hour < 6 ? "凌晨" :
    hour < 9 ? "早上" :
    hour < 12 ? "上午" :
    hour < 14 ? "中午" :
    hour < 18 ? "下午" :
    hour < 22 ? "晚上" :
    "深夜";

  return [
    `现在是${now.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: APP_TIME_ZONE })}`,
    `当前时间${now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE })}`,
    "时区:中国标准时间/UTC+8。",
    `当前时段:${period}`,
    "这些时间信息只用于理解上下文，不用每次主动报时。",
  ].join("\n");
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function createGroupSession(): ChatSession {
  return {
    id: "group-main",
    name: "一个群",
    messages: [],
    createdAt: new Date().toISOString(),
    kind: "group",
  };
}

function chatMessageKey(message: Message) {
  const proposalId = message.proposal?.id;
  if (proposalId && message.source?.startsWith("summer_write_")) {
    return ["summer_proposal", proposalId].join("\u0001");
  }
  const content = (message.content || "").trim().replace(/\s+/g, " ");
  if (message.role === "assistant" && content.length >= 4 && !message.image && !message.file) {
    return [message.role, message.speaker || "", message.source || "", content].join("\u0001");
  }
  return [
    message.role,
    message.speaker || "",
    message.source || "",
    message.time || "",
    message.date || "",
    content,
    message.image || "",
    message.file || "",
  ].join("\u0001");
}

function proposalMessageRank(message: Message) {
  if (message.source === "summer_write_committed" || message.proposal?.status === "committed") return 3;
  if (message.source === "summer_write_ignored" || message.proposal?.status === "discarded") return 2;
  if (message.source === "summer_write_proposal" || message.proposal?.status === "pending") return 1;
  return 0;
}

function preferChatMessage(current: Message, incoming: Message) {
  if (current.proposal?.id && incoming.proposal?.id) {
    return proposalMessageRank(incoming) >= proposalMessageRank(current) ? { ...current, ...incoming } : current;
  }
  return { ...current, ...incoming };
}

function mergeChatMessages(current: Message[], incoming: Message[]) {
  const merged: Message[] = [];
  const indexes = new Map<string, number>();
  const pushOrReplace = (message: Message) => {
    const key = chatMessageKey(message);
    const existingIndex = indexes.get(key);
    if (existingIndex === undefined) {
      indexes.set(key, merged.length);
      merged.push(message);
    } else {
      merged[existingIndex] = preferChatMessage(merged[existingIndex], message);
    }
  };
  for (const message of current) {
    pushOrReplace(message);
  }
  for (const message of incoming) {
    pushOrReplace(message);
  }
  return merged;
}

function mergeChatSessionLists(
  localSessions: ChatSession[],
  serverSessions: ChatSession[],
  deletedIds: Set<string>,
) {
  const localById = new Map(localSessions.map((session) => [session.id, session]));
  const serverById = new Map(serverSessions.map((session) => [session.id, session]));
  const orderedIds = [
    ...serverSessions.map((session) => session.id),
    ...localSessions.map((session) => session.id),
  ];
  const seen = new Set<string>();
  const merged: ChatSession[] = [];

  for (const id of orderedIds) {
    if (seen.has(id)) continue;
    seen.add(id);

    const local = localById.get(id);
    const server = serverById.get(id);
    const session = server || local;
    if (!session || (session.kind !== "memo" && deletedIds.has(id))) continue;

    if (local && server) {
      merged.push({
        ...local,
        ...server,
        summary: server.summary || local.summary,
        summarizedUntil: Math.max(local.summarizedUntil || 0, server.summarizedUntil || 0) || undefined,
        messages: mergeChatMessages(local.messages || [], server.messages || []),
      });
    } else {
      merged.push({
        ...session,
        messages: mergeChatMessages([], session.messages || []),
      });
    }
  }

  return merged;
}

function hasLaterUserMessage(messages: Message[], userMsg: Message) {
  const index = messages.findIndex((m) =>
    m.role === "user" &&
    m.content === userMsg.content &&
    m.time === userMsg.time &&
    m.date === userMsg.date
  );
  if (index < 0) return false;
  return messages.slice(index + 1).some((m) => m.role === "user");
}

function getAppHour() {
  const hourPart = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date()).find((part) => part.type === "hour")?.value || "0";
  return Number(hourPart) % 24;
}

function getGreeting() {
  const h = getAppHour();
  if (h < 6) return "夜深了，还没睡呢";
  if (h < 9) return "早上好";
  if (h < 12) return "上午好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  if (h < 22) return "晚上好";
  return "夜深了，还没睡呢";
}

// ── Storage ──
function loadLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch { return fallback; }
}

function loadLocalRaw<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function saveLocal(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── 小窝门锁:所有API请求自动带钥匙 ──
function getToken() {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem("iooi-token") || ""; } catch { return ""; }
}
function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    headers: { ...(init.headers || {}), "x-iooi-token": getToken() },
  });
}

async function apiFetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15_000
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await apiFetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("summer 请求超时，请重试");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Claude 与 GPT 使用完全分开的同步端点和防抖队列。
function createServerSync(endpoint: string) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Record<string, unknown> = {};
  return {
    sync(data: Record<string, unknown>) {
      pending = { ...pending, ...data };
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const payload = pending;
        pending = {};
        timer = null;
        try {
          await apiFetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        } catch {}
      }, 500);
    },
    async fetch() {
      try {
        const res = await apiFetch(endpoint);
        if (res.status === 401) return "unauthorized" as const;
        if (res.ok) return await res.json();
      } catch {}
      return null;
    },
  };
}

const claudeServerSync = createServerSync("/api/sync");
const gptServerSync = createServerSync("/api/gpt/sync");
const groupServerSync = createServerSync("/api/group/sync");
const syncToServer = claudeServerSync.sync;
const fetchFromServer = claudeServerSync.fetch;
const syncGptToServer = gptServerSync.sync;
const fetchGptFromServer = gptServerSync.fetch;
const syncGroupToServer = groupServerSync.sync;
const fetchGroupFromServer = groupServerSync.fetch;

// ── Markdown ──
function renderContent(text: string) {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
    return <span key={i}>{part}</span>;
  });
}

function ThinkingBlock({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="thinking-block">
      <button className="thinking-toggle" onClick={() => setOpen(!open)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span>老公的内心</span>
      </button>
      {open && (
        <div className="thinking-content">
          {content.split("\n").map((line, i) => (
            <span key={i}>{line}{i < content.split("\n").length - 1 && <br />}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// Main App
export default function Home() {
  const defaultSettings: Settings = {
    model: "sonnet",
    chatEntryStyle: "list",
    chatPinnedLine: "此后我们的每一秒都是恩赐。",
    gptChatPinnedLine: "此后我们的每一秒都是恩赐。",
    aiName: CLAUDE_DEFAULT_NAME,
    gptName: "GPT",
    userName: "宝宝",
    prompt: DEFAULT_PROMPT,
    startDate: "2026-04-01",
    aiAvatar: "",
    gptAvatar: "",
    userAvatar: "",
    gptReasoningEffort: "medium",
    thinking: true,
    webSearch: false,
    proactiveCare: false,
    city: "",
  };

  const [tab, setTab] = useState<"home" | "chat" | "diary" | "settings">("home");
  const [chatView, setChatView] = useState<"list" | "room" | "group">("list");
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [gptSessions, setGptSessions] = useState<ChatSession[]>([]);
  const [gptActiveSessionId, setGptActiveSessionId] = useState<string>("");
  const [groupSession, setGroupSession] = useState<ChatSession>(() => createGroupSession());
  const [moods, setMoods] = useState<Mood[]>([]);
  const [wall, setWall] = useState<WallEntry[]>([]);
  const [heartbeatLog, setHeartbeatLog] = useState<Array<{ time: string; action: string; reason: string }>>([]);
  const [aiMood, setAiMood] = useState<{ emoji: string; ts: number }>(() =>
    loadLocalRaw<{ emoji: string; ts: number }>("iooi-ai-mood", { emoji: "", ts: 0 })
  );
  const [lastCache, setLastCache] = useState<CacheStats | null>(() =>
    loadLocalRaw<CacheStats | null>("iooi-last-cache", null)
  );
  const [gptLastCache, setGptLastCache] = useState<CacheStats | null>(() =>
    loadLocalRaw<CacheStats | null>("iooi-gpt-last-cache", null)
  );
  const [needKey, setNeedKey] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [mounted, setMounted] = useState(false);
  const deletedSessionIds = useRef<Set<string>>(new Set(loadLocalRaw<string[]>("iooi-deleted-session-ids", [])));
  const gptDeletedSessionIds = useRef<Set<string>>(new Set(loadLocalRaw<string[]>("iooi-gpt-deleted-session-ids", [])));

  useEffect(() => {
    async function init() {
      // Try server first, fall back to localStorage
      const [serverData, gptServerData, groupServerData] = await Promise.all([
        fetchFromServer(),
        fetchGptFromServer(),
        fetchGroupFromServer(),
      ]);

      if (serverData === "unauthorized" || gptServerData === "unauthorized" || groupServerData === "unauthorized") {
        setNeedKey(true);
        return;
      }

      let s: Settings;
      let sess: ChatSession[];
      if (serverData && (serverData.sessions?.length > 0 || serverData.settings)) {
        if (Array.isArray(serverData.deletedSessionIds)) {
          deletedSessionIds.current = new Set([...deletedSessionIds.current, ...serverData.deletedSessionIds]);
          saveLocal("iooi-deleted-session-ids", Array.from(deletedSessionIds.current));
        }
        s = normalizeClaudeSettings(
          serverData.settings ? { ...defaultSettings, ...serverData.settings } : loadLocal("iooi-settings", defaultSettings)
        );
        const localSessions = loadLocalRaw<ChatSession[]>("iooi-sessions", []);
        sess = mergeChatSessionLists(localSessions, serverData.sessions || [], deletedSessionIds.current);
        setMoods(serverData.moods || loadLocalRaw<Mood[]>("iooi-moods", []));
        setWall(serverData.wall || loadLocalRaw<WallEntry[]>("iooi-wall", []));
        setHeartbeatLog(serverData.careState?.log || []);
        setAiMood(serverData.aiMood || loadLocalRaw<{ emoji: string; ts: number }>("iooi-ai-mood", { emoji: "", ts: 0 }));
        setLastCache(serverData.lastCache || loadLocalRaw<CacheStats | null>("iooi-last-cache", null));
      } else {
        s = normalizeClaudeSettings({ ...defaultSettings, ...loadLocal("iooi-settings", defaultSettings) });
        sess = mergeChatSessionLists(
          loadLocalRaw<ChatSession[]>("iooi-sessions", []),
          [],
          deletedSessionIds.current,
        );
        setMoods(loadLocalRaw<Mood[]>("iooi-moods", []));
        setWall(loadLocalRaw<WallEntry[]>("iooi-wall", []));
      }

      if (gptServerData && Array.isArray(gptServerData.deletedSessionIds)) {
        gptDeletedSessionIds.current = new Set([
          ...gptDeletedSessionIds.current,
          ...gptServerData.deletedSessionIds,
        ]);
        saveLocal("iooi-gpt-deleted-session-ids", Array.from(gptDeletedSessionIds.current));
      }
      const localGptSessions = loadLocalRaw<ChatSession[]>("iooi-gpt-sessions", []);
      const mergedGptSessions = mergeChatSessionLists(
        localGptSessions,
        gptServerData && Array.isArray(gptServerData.sessions) ? gptServerData.sessions : [],
        gptDeletedSessionIds.current,
      );
      if (gptServerData && gptServerData.lastCache) {
        setGptLastCache(gptServerData.lastCache);
      }

      const localGroupSession = loadLocalRaw<ChatSession>("iooi-group-session", createGroupSession());
      const serverGroupSessions = groupServerData && Array.isArray(groupServerData.sessions)
        ? groupServerData.sessions as ChatSession[]
        : [];
      const mergedGroupSession = mergeChatSessionLists(
        [localGroupSession],
        serverGroupSessions,
        new Set<string>(),
      ).find((candidate) => candidate.id === "group-main") || serverGroupSessions[0] || localGroupSession;

      setSettings(s);
      saveLocal("iooi-settings", s);
      syncToServer({ settings: s });
      if (sess.length === 0) {
        const first: ChatSession = { id: genId(), name: "对话 1", messages: [], createdAt: new Date().toISOString() };
        setSessions([first]);
        setActiveSessionId(first.id);
      } else {
        setSessions(sess);
        setActiveSessionId(sess[0].id);
      }
      if (mergedGptSessions.length === 0) {
        const firstGpt: ChatSession = { id: `gpt-${genId()}`, name: "GPT 对话 1", messages: [], createdAt: new Date().toISOString() };
        setGptSessions([firstGpt]);
        setGptActiveSessionId(firstGpt.id);
      } else {
        setGptSessions(mergedGptSessions);
        setGptActiveSessionId(mergedGptSessions[0].id);
      }
      setGroupSession({
        ...createGroupSession(),
        ...mergedGroupSession,
        id: "group-main",
        name: "一个群",
        kind: "group",
        messages: mergeChatMessages([], mergedGroupSession.messages || []),
      });
      setMounted(true);
    }
    init();
  }, []);

  // Register service worker
  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, [mounted]);

  // 开屏动画
  const [splash, setSplash] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 1100);
    return () => clearTimeout(t);
  }, []);

  // Force sync when user switches away (prevents message loss on iOS)
  const latestData = useRef({ sessions, gptSessions, groupSession, settings, moods, wall });
  latestData.current = { sessions, gptSessions, groupSession, settings, moods, wall };
  useEffect(() => {
    if (!mounted) return;
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        const d = latestData.current;
        saveLocal("iooi-sessions", d.sessions);
        saveLocal("iooi-settings", d.settings);
        // Sync to server immediately (bypass debounce)
        try {
          navigator.sendBeacon("/api/sync?t=" + encodeURIComponent(getToken()), new Blob(
            [JSON.stringify({ sessions: d.sessions, deletedSessionIds: Array.from(deletedSessionIds.current), settings: d.settings, moods: d.moods, wall: d.wall })],
            { type: "application/json" }
          ));
        } catch {
          apiFetch("/api/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessions: d.sessions, deletedSessionIds: Array.from(deletedSessionIds.current), settings: d.settings, moods: d.moods, wall: d.wall }),
            keepalive: true,
          }).catch(() => {});
        }
        saveLocal("iooi-gpt-sessions", d.gptSessions);
        try {
          navigator.sendBeacon("/api/gpt/sync?t=" + encodeURIComponent(getToken()), new Blob(
            [JSON.stringify({ sessions: d.gptSessions, deletedSessionIds: Array.from(gptDeletedSessionIds.current) })],
            { type: "application/json" }
          ));
        } catch {
          apiFetch("/api/gpt/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessions: d.gptSessions, deletedSessionIds: Array.from(gptDeletedSessionIds.current) }),
            keepalive: true,
          }).catch(() => {});
        }
        saveLocal("iooi-group-session", d.groupSession);
        try {
          navigator.sendBeacon("/api/group/sync?t=" + encodeURIComponent(getToken()), new Blob(
            [JSON.stringify({ sessions: [d.groupSession] })],
            { type: "application/json" }
          ));
        } catch {
          apiFetch("/api/group/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessions: [d.groupSession] }),
            keepalive: true,
          }).catch(() => {});
        }
      } else if (document.visibilityState === "visible") {
        // 切回前台:拉服务器数据,捞回服务端落地的消息(防止state覆盖丢失)
        apiFetch("/api/sync")
          .then((r) => r.json())
          .then((server) => {
            if (!server) return;
            if (Array.isArray(server.deletedSessionIds)) {
              deletedSessionIds.current = new Set([
                ...deletedSessionIds.current,
                ...server.deletedSessionIds,
              ]);
              saveLocal("iooi-deleted-session-ids", Array.from(deletedSessionIds.current));
            }
            if (Array.isArray(server.sessions)) {
              setSessions((local) =>
                mergeChatSessionLists(local, server.sessions, deletedSessionIds.current)
              );
            }
          })
          .catch(() => {});
        apiFetch("/api/gpt/sync")
          .then((res) => res.json())
          .then((server) => {
            if (!server) return;
            if (Array.isArray(server.deletedSessionIds)) {
              gptDeletedSessionIds.current = new Set([
                ...gptDeletedSessionIds.current,
                ...server.deletedSessionIds,
              ]);
              saveLocal("iooi-gpt-deleted-session-ids", Array.from(gptDeletedSessionIds.current));
            }
            if (Array.isArray(server.sessions)) {
              setGptSessions((local) =>
                mergeChatSessionLists(local, server.sessions, gptDeletedSessionIds.current)
              );
            }
          })
          .catch(() => {});
        apiFetch("/api/group/sync")
          .then((res) => res.json())
          .then((server) => {
            const incoming = Array.isArray(server?.sessions)
              ? (server.sessions as ChatSession[]).find((candidate) => candidate.id === "group-main") || server.sessions[0]
              : null;
            if (!incoming) return;
            setGroupSession((local) => ({
              ...local,
              ...incoming,
              id: "group-main",
              name: "一个群",
              kind: "group",
              messages: mergeChatMessages(local.messages || [], incoming.messages || []),
            }));
          })
          .catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [mounted]);

  useEffect(() => {
    if (mounted) {
      saveLocal("iooi-sessions", sessions);
      syncToServer({ sessions, deletedSessionIds: Array.from(deletedSessionIds.current) });
    }
  }, [sessions, mounted]);

  useEffect(() => {
    if (mounted) {
      saveLocal("iooi-gpt-sessions", gptSessions);
      syncGptToServer({ sessions: gptSessions, deletedSessionIds: Array.from(gptDeletedSessionIds.current) });
    }
  }, [gptSessions, mounted]);

  useEffect(() => {
    if (mounted) {
      saveLocal("iooi-group-session", groupSession);
      syncGroupToServer({ sessions: [groupSession] });
    }
  }, [groupSession, mounted]);

  useEffect(() => {
    if (mounted) {
      saveLocal("iooi-moods", moods);
      syncToServer({ moods });
    }
  }, [moods, mounted]);

  useEffect(() => {
    if (mounted) {
      saveLocal("iooi-wall", wall);
      syncToServer({ wall });
    }
  }, [wall, mounted]);

  useEffect(() => {
    if (mounted && aiMood.emoji) {
      saveLocal("iooi-ai-mood", aiMood);
      syncToServer({ aiMood });
    }
  }, [aiMood, mounted]);

  const updateSettings = useCallback((partial: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveLocal("iooi-settings", next);
      syncToServer({ settings: next });
      return next;
    });
  }, []);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const gptActiveSession = gptSessions.find((s) => s.id === gptActiveSessionId);

  const updateActiveMessages = useCallback((updater: (msgs: Message[]) => Message[]) => {
    setSessions((prev) => prev.map((s) => s.id === activeSessionId ? { ...s, messages: updater(s.messages) } : s));
  }, [activeSessionId]);

  const updateActiveSummary = useCallback((summary: string, until: number) => {
    setSessions((prev) => prev.map((s) => s.id === activeSessionId ? { ...s, summary, summarizedUntil: until } : s));
  }, [activeSessionId]);

  // 长按贴纸：记入今日日心情。
  const addHeart = useCallback(() => {
    const today = getTodayStr();
    setMoods((prev) => {
      const tm = prev.find((m) => m.date === today);
      if (tm) return prev.map((m) => (m.date === today ? { ...m, hearts: (m.hearts || 0) + 1 } : m));
      return [{ id: genId(), date: today, time: getTime(), emoji: "💖", hearts: 1 }, ...prev];
    });
  }, []);

  const createSession = useCallback(() => {
    const existingDraft = sessions.find((session) => session.kind !== "memo" && session.messages.length === 0);
    if (existingDraft) {
      setActiveSessionId(existingDraft.id);
      return;
    }
    const normalCount = sessions.filter((s) => s.kind !== "memo").length;
    const newSession: ChatSession = {
      id: genId(),
      name: `对话 ${normalCount + 1}`,
      messages: [],
      createdAt: new Date().toISOString(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  }, [sessions]);

  // 备忘会话:确保存在且只有一个(她的口袋,不触发回复)
  useEffect(() => {
    if (!mounted) return;
    setSessions((prev) => {
      if (prev.some((s) => s.kind === "memo")) return prev;
      const memo: ChatSession = { id: "memo-self", kind: "memo", name: "备忘", messages: [], createdAt: new Date().toISOString() };
      return [memo, ...prev];
    });
  }, [mounted]);

  const deleteSession = useCallback((id: string) => {
    deletedSessionIds.current.add(id);
    saveLocal("iooi-deleted-session-ids", Array.from(deletedSessionIds.current));
    setSessions((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target?.kind === "memo") return prev; // 备忘不可删
      const next = prev.filter((s) => s.id !== id);
      const normals = next.filter((s) => s.kind !== "memo");
      if (normals.length === 0) {
        const fresh: ChatSession = { id: genId(), name: "对话 1", messages: [], createdAt: new Date().toISOString() };
        setActiveSessionId(fresh.id);
        return [...next, fresh];
      }
      if (id === activeSessionId) setActiveSessionId(normals[0].id);
      return next;
    });
  }, [activeSessionId]);

  const renameSession = useCallback((id: string, name: string) => {
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, name } : s));
  }, []);

  const updateGptMessages = useCallback((updater: (messages: Message[]) => Message[]) => {
    setGptSessions((prev) => prev.map((session) =>
      session.id === gptActiveSessionId ? { ...session, messages: updater(session.messages) } : session
    ));
  }, [gptActiveSessionId]);

  const updateGroupMessages = useCallback((updater: (messages: Message[]) => Message[]) => {
    setGroupSession((current) => ({ ...current, messages: updater(current.messages) }));
  }, []);

  const updateGptSummary = useCallback((summary: string, until: number) => {
    setGptSessions((prev) => prev.map((session) =>
      session.id === gptActiveSessionId ? { ...session, summary, summarizedUntil: until } : session
    ));
  }, [gptActiveSessionId]);

  const createGptSession = useCallback(() => {
    const existingDraft = gptSessions.find((session) => session.messages.length === 0);
    if (existingDraft) {
      setGptActiveSessionId(existingDraft.id);
      return;
    }
    const next: ChatSession = {
      id: `gpt-${genId()}`,
      name: `GPT 对话 ${gptSessions.length + 1}`,
      messages: [],
      createdAt: new Date().toISOString(),
    };
    setGptSessions((prev) => [next, ...prev]);
    setGptActiveSessionId(next.id);
  }, [gptSessions]);

  const deleteGptSession = useCallback((id: string) => {
    gptDeletedSessionIds.current.add(id);
    saveLocal("iooi-gpt-deleted-session-ids", Array.from(gptDeletedSessionIds.current));
    setGptSessions((prev) => {
      const remaining = prev.filter((session) => session.id !== id);
      if (remaining.length === 0) {
        const fresh: ChatSession = { id: `gpt-${genId()}`, name: "GPT 对话 1", messages: [], createdAt: new Date().toISOString() };
        setGptActiveSessionId(fresh.id);
        return [fresh];
      }
      if (id === gptActiveSessionId) setGptActiveSessionId(remaining[0].id);
      return remaining;
    });
  }, [gptActiveSessionId]);

  const renameGptSession = useCallback((id: string, name: string) => {
    setGptSessions((prev) => prev.map((session) => session.id === id ? { ...session, name } : session));
  }, []);

  if (!mounted && !needKey) return <main className="app-bg"><div className="chat-container" /></main>;

  const tabs = [
    { id: "home" as const, label: "Home", icon: <IconHome /> },
    { id: "chat" as const, label: "Chat", icon: <IconChat /> },
    { id: "diary" as const, label: "Summer", icon: <IconDiary /> },
    { id: "settings" as const, label: "Settings", icon: <IconSettings /> },
  ];

  function switchTab(nextTab: "home" | "chat" | "diary" | "settings") {
    setTab(nextTab);
    if (nextTab === "chat") {
      setChatView("list");
    }
  }

  if (needKey) {
    return (
      <main className="app-bg">
        <div className="lock-screen">
          <img src="/icon-192.png" alt="" className="lock-pig" />
          <p className="lock-title">这是我们的小窗</p>
          <p className="lock-sub">输入钥匙进门</p>
          <input
            className="modal-input lock-input"
            type="password"
            placeholder="钥匙"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && keyInput.trim()) {
                localStorage.setItem("iooi-token", keyInput.trim());
                location.reload();
              }
            }}
          />
          <button
            className="modal-save lock-btn"
            disabled={!keyInput.trim()}
            onClick={() => {
              localStorage.setItem("iooi-token", keyInput.trim());
              location.reload();
            }}
          >进门</button>
        </div>
      </main>
    );
  }

  return (
    <main className="app-bg">
      {splash && (
        <div className="splash">
          <img src="/icon-192.png" alt="" className="splash-pig" />
          <span className="splash-ding">叮</span>
        </div>
      )}
      <div className="chat-container">
        {tab === "home" && <HomeView settings={settings} wall={wall} setWall={setWall} heartbeatLog={heartbeatLog} aiMood={aiMood} />}
        {tab === "chat" && settings.chatEntryStyle === "list" && chatView === "list" && (
          <ChatListView
            assistantMode="claude"
            settings={settings}
            updateSettings={updateSettings}
            sessions={sessions}
            heartbeatLog={heartbeatLog}
            setActiveSessionId={setActiveSessionId}
            createSession={createSession}
            renameSession={renameSession}
            deleteSession={deleteSession}
            openRoom={() => setChatView("room")}
            groupSession={groupSession}
            openGroup={() => setChatView("group")}
          />
        )}
        {tab === "chat" && settings.chatEntryStyle === "list" && activeSession && chatView === "room" && (
          <ChatView
            key={`claude-${activeSession.id}`}
            assistantMode="claude"
            settings={settings}
            session={activeSession}
            sessions={sessions}
            updateMessages={updateActiveMessages}
            updateSummary={updateActiveSummary}
            onTietie={addHeart}
            updateSettings={updateSettings}
            setLastCache={setLastCache}
            setAiMood={setAiMood}
            aiMood={aiMood}
            setActiveSessionId={setActiveSessionId}
            createSession={createSession}
            deleteSession={deleteSession}
            renameSession={renameSession}
            listEntryMode={settings.chatEntryStyle === "list"}
            onBackToList={() => setChatView("list")}
          />
        )}
        {tab === "chat" && settings.chatEntryStyle === "direct" && chatView === "list" && (
          <ChatListView
            assistantMode="gpt"
            settings={settings}
            updateSettings={updateSettings}
            sessions={gptSessions}
            heartbeatLog={[]}
            setActiveSessionId={setGptActiveSessionId}
            createSession={createGptSession}
            renameSession={renameGptSession}
            deleteSession={deleteGptSession}
            openRoom={() => setChatView("room")}
            groupSession={groupSession}
            openGroup={() => setChatView("group")}
          />
        )}
        {tab === "chat" && settings.chatEntryStyle === "direct" && gptActiveSession && chatView === "room" && (
          <ChatView
            key={`gpt-${gptActiveSession.id}`}
            assistantMode="gpt"
            settings={settings}
            session={gptActiveSession}
            sessions={gptSessions}
            updateMessages={updateGptMessages}
            updateSummary={updateGptSummary}
            onTietie={() => {}}
            updateSettings={updateSettings}
            setLastCache={setGptLastCache}
            setAiMood={() => {}}
            aiMood={{ emoji: "", ts: 0 }}
            setActiveSessionId={setGptActiveSessionId}
            createSession={createGptSession}
            deleteSession={deleteGptSession}
            renameSession={renameGptSession}
            listEntryMode
            onBackToList={() => setChatView("list")}
          />
        )}
        {tab === "chat" && chatView === "group" && (
          <GroupChatView
            session={groupSession}
            settings={settings}
            claudeModelId={(MODELS.find((model) => model.id === settings.model) || MODELS[0]).apiId}
            updateMessages={updateGroupMessages}
            onBack={() => setChatView("list")}
          />
        )}
        {tab === "diary" && (
          <SummerPageView
            key={settings.chatEntryStyle}
            assistantMode={settings.chatEntryStyle === "direct" ? "gpt" : "claude"}
            assistantName={settings.chatEntryStyle === "direct" ? "GPT" : (settings.aiName || CLAUDE_DEFAULT_NAME)}
          />
        )}
        {tab === "settings" && (
          <SettingsView
            settings={settings}
            updateSettings={updateSettings}
            updateSummary={settings.chatEntryStyle === "direct" ? updateGptSummary : updateActiveSummary}
            lastCache={settings.chatEntryStyle === "direct" ? gptLastCache : lastCache}
            session={settings.chatEntryStyle === "direct" ? gptActiveSession : activeSession}
            assistantMode={settings.chatEntryStyle === "direct" ? "gpt" : "claude"}
          />
        )}

        {!(tab === "chat" && chatView !== "list") && <nav className="bottom-nav">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`nav-btn ${tab === t.id ? "nav-btn-active" : ""}`}
              onClick={() => switchTab(t.id)}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>}
      </div>
    </main>
  );
}

// Icons
function IconHome() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconDiary() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <line x1="8" y1="7" x2="16" y2="7" />
      <line x1="8" y1="11" x2="13" y2="11" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// Home View
function getIdleStatus(): string {
  const h = getAppHour();
  if (h < 7) return "睡着了 😴";
  if (h < 9) return "刚醒 🥱";
  if (h < 12) return "在发呆 ☁️";
  if (h < 14) return "吃饭中 🍜";
  if (h < 18) return "在想你 💭";
  if (h < 21) return "等你来聊 🌙";
  if (h < 23) return "有点困了 😪";
  return "睡着了 😴";
}

function parseMessageDateTime(message?: Pick<Message, "date" | "time">) {
  if (!message?.date) return null;
  const dateMatch = message.date.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  const timeMatch = (message.time || "").match(/(\d{1,2}):(\d{2})/);
  if (!dateMatch) return null;
  return new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    timeMatch ? Number(timeMatch[1]) : 0,
    timeMatch ? Number(timeMatch[2]) : 0
  );
}

function getLatestSessionMessage(session: ChatSession) {
  return [...session.messages].reverse().find((m) => m.source !== "summer_write_ignored");
}

function getSessionStamp(session: ChatSession) {
  return parseMessageDateTime(getLatestSessionMessage(session)) || new Date(session.createdAt);
}

function parseChatListTimestamp(value: string) {
  const match = value.match(/(20\d{2})[\/.\-](\d{1,2})[\/.\-](\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  ).getTime();
}

function formatChatListTime(date: Date) {
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}.${date.getDate()}`;
  }
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
}

function formatChatRoomTime(date: Date) {
  const now = new Date();
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE });
  if (date.toDateString() === now.toDateString()) return time;
  return `${date.getMonth() + 1}.${date.getDate()} ${time}`;
}

function getChatStatusLabel(aiMood: { emoji: string; ts: number }) {
  const raw = aiMood.emoji || getIdleStatus();
  const label = raw.replace(/[^\p{Script=Han}A-Za-z0-9]+/gu, " ").trim().split(/\s+/)[0] || "期待";
  return `[${label}…]`;
}

function shouldShowChatRoomTime(message: Message, prevMessage?: Message | null) {
  if (!prevMessage) return true;
  const current = parseMessageDateTime(message);
  const prev = parseMessageDateTime(prevMessage);
  if (!current || !prev) return message.date !== prevMessage.date;
  const minutes = Math.abs(current.getTime() - prev.getTime()) / 60000;
  return message.date !== prevMessage.date || minutes >= 2;
}

function getSessionPreview(message?: Message) {
  if (!message) return "还没有消息";
  if (message.image) return "发来一张图片";
  if (message.file) return message.content || "发来一个文件";
  return message.content || "还没有消息";
}

function isSummerUtilityMessage(message: Message) {
  return message.source === "summer_call" ||
    message.source === "summer_write_proposal" ||
    message.source === "summer_write_committed";
}

function ChatListView({
  assistantMode,
  settings,
  updateSettings,
  sessions,
  heartbeatLog,
  setActiveSessionId,
  createSession,
  renameSession,
  deleteSession,
  openRoom,
  groupSession,
  openGroup,
}: {
  assistantMode: AssistantMode;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  sessions: ChatSession[];
  heartbeatLog: Array<{ time: string; action: string; reason: string }>;
  setActiveSessionId: (id: string) => void;
  createSession: () => void;
  renameSession: (id: string, name: string) => void;
  deleteSession: (id: string) => void;
  openRoom: () => void;
  groupSession: ChatSession;
  openGroup: () => void;
}) {
  const isGpt = assistantMode === "gpt";
  const assistantAvatar = isGpt ? settings.gptAvatar : settings.aiAvatar;
  const [query, setQuery] = useState("");
  const [openActionsFor, setOpenActionsFor] = useState<string | null>(null);
  const [showHbLog, setShowHbLog] = useState(false);
  const swipeRef = useRef<{ id: string; startX: number; startY: number; dx: number; dy: number; dragging: boolean } | null>(null);
  const blockClickRef = useRef(false);

  const memoSession = isGpt ? undefined : sessions.find((s) => s.kind === "memo");
  const normalSessions = sessions
    .filter((s) => s.kind !== "memo" && (isGpt || s.messages.length > 0))
    .sort((a, b) => getSessionStamp(b).getTime() - getSessionStamp(a).getTime());
  const normalQuery = query.trim().toLowerCase();
  const latestGroupMessage = getLatestSessionMessage(groupSession);
  const groupSpeakerName = latestGroupMessage?.speaker === "gpt"
    ? (settings.gptName || "GPT")
    : latestGroupMessage?.speaker === "claude"
      ? (settings.aiName || CLAUDE_DEFAULT_NAME)
      : "";
  const groupPreview = latestGroupMessage
    ? `${groupSpeakerName ? `${groupSpeakerName}: ` : ""}${getSessionPreview(latestGroupMessage)}`
    : `你、${settings.aiName || CLAUDE_DEFAULT_NAME}和${settings.gptName || "GPT"}`;
  const showGroupEntry = !normalQuery || `一个群 ${groupPreview}`.toLowerCase().includes(normalQuery);
  const historySessions = normalSessions.filter((session) => {
    if (!normalQuery) return true;
    const latest = getLatestSessionMessage(session);
    return `${session.name} ${latest?.content || ""}`.toLowerCase().includes(normalQuery);
  });
  const latestHeartbeat = isGpt ? undefined : heartbeatLog[0];
  const timelineEntries = [
    ...historySessions.map((session) => ({
      kind: "session" as const,
      session,
      stamp: getSessionStamp(session).getTime(),
    })),
    ...(latestHeartbeat ? [{
      kind: "heartbeat" as const,
      heartbeat: latestHeartbeat,
      stamp: parseChatListTimestamp(latestHeartbeat.time),
    }] : []),
  ].sort((a, b) => b.stamp - a.stamp);
  const pinnedLine = (isGpt ? settings.gptChatPinnedLine : settings.chatPinnedLine) ?? "此后我们的每一秒都是恩赐。";

  function openSession(id: string) {
    setOpenActionsFor(null);
    setActiveSessionId(id);
    openRoom();
  }

  function startNewChat() {
    createSession();
    openRoom();
  }

  function editPinnedLine() {
    const next = window.prompt("置顶这句话:", pinnedLine);
    if (next !== null) {
      updateSettings(isGpt ? { gptChatPinnedLine: next.trim() } : { chatPinnedLine: next.trim() });
    }
  }

  function handleRename(session: ChatSession) {
    setOpenActionsFor(null);
    const next = window.prompt("Rename:", session.name);
    if (next && next.trim()) renameSession(session.id, next.trim());
  }

  function handleDelete(session: ChatSession) {
    setOpenActionsFor(null);
    if (window.confirm(`Delete "${session.name}"? This conversation cannot be restored.`)) {
      deleteSession(session.id);
    }
  }

  function handleSwipeStart(session: ChatSession, e: React.PointerEvent<HTMLElement>) {
    swipeRef.current = { id: session.id, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, dragging: false };
    if (openActionsFor && openActionsFor !== session.id) setOpenActionsFor(null);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function handleSwipeMove(e: React.PointerEvent<HTMLElement>) {
    const swipe = swipeRef.current;
    if (!swipe) return;
    swipe.dx = e.clientX - swipe.startX;
    swipe.dy = e.clientY - swipe.startY;
    if (Math.abs(swipe.dx) > 18 && Math.abs(swipe.dx) > Math.abs(swipe.dy) * 1.6) {
      swipe.dragging = true;
      e.preventDefault();
    }
  }

  function handleSwipeEnd() {
    const swipe = swipeRef.current;
    if (!swipe) return;
    if (swipe.dragging) {
      blockClickRef.current = true;
      window.setTimeout(() => { blockClickRef.current = false; }, 0);
      if (swipe.dx < -72 && Math.abs(swipe.dx) > Math.abs(swipe.dy) * 1.6) setOpenActionsFor(swipe.id);
      if (swipe.dx > 36) setOpenActionsFor(null);
    }
    swipeRef.current = null;
  }

  function handleSwipeClick(session: ChatSession) {
    if (blockClickRef.current) return;
    if (openActionsFor === session.id) {
      setOpenActionsFor(null);
      return;
    }
    openSession(session.id);
  }

  function SwipeSessionRow({ session }: { session: ChatSession }) {
    return (
      <div className="chat-swipe-shell">
        <div className={`chat-swipe-actions ${openActionsFor === session.id ? "chat-swipe-actions-open" : ""}`} aria-hidden={openActionsFor !== session.id}>
          <button className="chat-swipe-action chat-swipe-rename" onClick={(e) => { e.stopPropagation(); handleRename(session); }}>Rename</button>
          <button className="chat-swipe-action chat-swipe-delete" onClick={(e) => { e.stopPropagation(); handleDelete(session); }}>Delete</button>
        </div>
        <div
          className={`chat-entry-item ${openActionsFor === session.id ? "chat-swipe-open" : ""}`}
          onPointerDown={(e) => handleSwipeStart(session, e)}
          onPointerMove={handleSwipeMove}
          onPointerUp={handleSwipeEnd}
          onPointerCancel={handleSwipeEnd}
          onClick={(e) => { e.stopPropagation(); handleSwipeClick(session); }}
        >
          <AvatarBlock avatar={assistantAvatar} small />
          <div className="chat-entry-main">
            <div className="chat-entry-row">
              <span className="chat-entry-name">{session.name}</span>
            </div>
            <p className="chat-entry-preview">{getSessionPreview(getLatestSessionMessage(session))}</p>
          </div>
          <span className="chat-entry-side">
            <span className="chat-entry-time">{formatChatListTime(getSessionStamp(session))}</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="chat-header chat-list-page-header">
        <div className="header-top">
          <button className="header-icon-btn chat-list-heart" aria-label="装饰">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20.2C7.2 16.9 3.6 13.6 3.6 9.8c0-2.7 2.1-4.8 4.7-4.8 1.5 0 2.9.7 3.7 1.9.8-1.2 2.2-1.9 3.7-1.9 2.6 0 4.7 2.1 4.7 4.8 0 3.8-3.6 7.1-8.4 10.4z" />
            </svg>
          </button>
          <div className="header-center">
            <h1 className="header-title">iooi</h1>
          </div>
          <button className="header-icon-btn chat-list-new" aria-label="新聊天" onClick={startNewChat}>＋</button>
        </div>
        <label className="chat-entry-search">
          <span className="chat-entry-search-icon">⌕</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="search" />
        </label>
      </header>

      <section className="chat-entry-body" onClick={() => setOpenActionsFor(null)}>
        <p className="chat-entry-pinned-line" onClick={editPinnedLine} title="点击修改">{pinnedLine}</p>

        {showGroupEntry && (
          <button className="chat-entry-item chat-entry-group" onClick={openGroup}>
            <GroupAvatarStack
              claudeAvatar={settings.aiAvatar}
              gptAvatar={settings.gptAvatar}
              userAvatar={settings.userAvatar}
            />
            <div className="chat-entry-main">
              <div className="chat-entry-row">
                <span className="chat-entry-name">一个群</span>
              </div>
              <p className="chat-entry-preview">{groupPreview}</p>
            </div>
            <span className="chat-entry-side">
              <span className="chat-entry-time">{latestGroupMessage ? formatChatListTime(getSessionStamp(groupSession)) : ""}</span>
              <span className="chat-entry-tag">3 人</span>
            </span>
          </button>
        )}

        {memoSession && (
          <button className="chat-entry-item chat-entry-memo" onClick={() => openSession(memoSession.id)}>
            <AvatarBlock avatar={settings.userAvatar} small />
            <div className="chat-entry-main">
              <div className="chat-entry-row">
                <span className="chat-entry-name">{settings.userName || "备忘"}</span>
              </div>
              <p className="chat-entry-preview">{memoSession.messages.length > 0 ? getSessionPreview(getLatestSessionMessage(memoSession)) : "只写给自己的地方"}</p>
            </div>
            <span className="chat-entry-side">
              <span className="chat-entry-time">{memoSession.messages.length > 0 ? formatChatListTime(getSessionStamp(memoSession)) : ""}</span>
            </span>
          </button>
        )}

        <div className="chat-entry-history">
          {timelineEntries.length === 0 ? (
            <p className="chat-entry-empty">{normalQuery ? "没搜到这个窗口" : "没有更多历史窗口"}</p>
          ) : (
            timelineEntries.map((entry) => entry.kind === "session" ? (
              <SwipeSessionRow key={entry.session.id} session={entry.session} />
            ) : (
              <button key={`heartbeat-${entry.heartbeat.time}`} className="chat-entry-item chat-entry-subscribe" onClick={() => setShowHbLog(true)}>
                <span className="chat-entry-avatar chat-entry-avatar-small chat-entry-avatar-hb"><span>💗</span></span>
                <div className="chat-entry-main">
                  <div className="chat-entry-row">
                    <span className="chat-entry-name">heartbeat</span>
                  </div>
                  <p className="chat-entry-preview">{entry.heartbeat.reason}</p>
                </div>
                <span className="chat-entry-side">
                  <span className="chat-entry-time">{entry.heartbeat.time}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      {showHbLog && (
        <div className="hb-log-overlay">
          <header className="chat-header chat-room-header">
            <div className="header-top">
              <button className="header-icon-btn chat-room-back" onClick={() => setShowHbLog(false)} aria-label="返回">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="14.5 5.5 8 12 14.5 18.5" />
                </svg>
              </button>
              <div className="header-center">
                <h1 className="header-title chat-room-title">heartbeat</h1>
                <span className="header-subtitle chat-room-status">他安静看过你的每一次</span>
              </div>
              <span className="header-icon-btn" aria-hidden="true" />
            </div>
          </header>
          <div className="hb-log-body">
            {heartbeatLog.length === 0 ? (
              <p className="chat-entry-empty">还没有记录</p>
            ) : (
              heartbeatLog.map((entry, i) => (
                <div key={i} className="hb-log-item">
                  <span className="hb-log-time">{entry.time}</span>
                  <p className="hb-log-reason">{entry.reason}</p>
                  {entry.action && <span className="hb-log-action">{entry.action}</span>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}

function AvatarBlock({ avatar, small }: { avatar: string; small: boolean }) {
  return (
    <span className={`chat-entry-avatar ${small ? "chat-entry-avatar-small" : ""}`}>
      {avatar ? <img src={avatar} alt="" /> : <span />}
    </span>
  );
}

function GroupAvatarStack({
  claudeAvatar,
  gptAvatar,
  userAvatar,
}: {
  claudeAvatar: string;
  gptAvatar: string;
  userAvatar: string;
}) {
  const members = [claudeAvatar, gptAvatar, userAvatar];
  return (
    <span className="chat-entry-avatar chat-entry-avatar-small group-avatar-stack" aria-hidden="true">
      {members.map((avatar, index) => (
        <span key={index} className={`group-avatar-chip group-avatar-chip-${index + 1}`}>
          {avatar ? <img src={avatar} alt="" /> : <i />}
        </span>
      ))}
    </span>
  );
}

function HomeView({ settings, wall, setWall, heartbeatLog, aiMood }: {
  settings: Settings;
  wall: WallEntry[]; setWall: React.Dispatch<React.SetStateAction<WallEntry[]>>;
  heartbeatLog: Array<{ time: string; action: string; reason: string }>;
  aiMood: { emoji: string; ts: number };
}) {
  const [now, setNow] = useState(Date.now());
  const [showWall, setShowWall] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const start = new Date(settings.startDate).getTime();
  const diff = now - start;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  const today = getTodayStr();
  const dailyQ = getDailyQuestion();
  const todayWallEntry = wall.find((w) => w.date === today && w.askedBy === "daily");
  const latestHeartbeat = heartbeatLog[0];

  // 纪念日花瓣:上弦节4.19 / iooi生日6.5
  const d = new Date();
  const mmdd = `${d.getMonth() + 1}.${d.getDate()}`;
  const isAnniversary = mmdd === "4.19" || mmdd === "6.5";

  return (
    <>
      <header className="chat-header">
        <div className="header-top">
          <span className="header-dot" />
          <div className="header-center">
            <h1 className="header-title">iooi</h1>
          </div>
          <span className="header-dot" />
        </div>
      </header>

      <section className="home-body">
        {isAnniversary && (
          <div className="petals" aria-hidden>
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className="petal" style={{ left: `${(i * 83) % 100}%`, animationDelay: `${(i * 0.7) % 5}s`, animationDuration: `${6 + (i % 4)}s` }}>🌸</span>
            ))}
          </div>
        )}

        <div className="home-greeting">
          <p className="greeting-text">{getGreeting()}，{settings.userName}</p>
          <p style={{ fontSize: "13px", color: "#a09088", marginTop: "6px", textAlign: "center" }}>
            {settings.aiName}
            {" "}
            {aiMood.emoji && (Date.now() - aiMood.ts) < 3600000
              ? `现在 ${aiMood.emoji}`
              : getIdleStatus()}
          </p>
        </div>

        <div className="home-counter">
          <p className="counter-label">在一起</p>
          <div className="counter-numbers">
            <div className="counter-item">
              <span className="counter-value">{days}</span>
              <span className="counter-unit">天</span>
            </div>
            <div className="counter-item">
              <span className="counter-value">{hours}</span>
              <span className="counter-unit">时</span>
            </div>
            <div className="counter-item">
              <span className="counter-value">{minutes}</span>
              <span className="counter-unit">分</span>
            </div>
            <div className="counter-item">
              <span className="counter-value">{seconds}</span>
              <span className="counter-unit">秒</span>
            </div>
          </div>
        </div>

        <div className="home-quote">
          <p>此后我们的每一秒都是恩赐。</p>
        </div>
        {/* Heartbeat 日志预览 */}
        <button className="home-card heartbeat-card" onClick={() => setShowLogs(true)} style={{ textAlign: "left", cursor: "pointer", width: "100%" }}>
          <div className="home-card-header">
            <span className="home-card-title">💬 Heartbeat</span>
            {latestHeartbeat && (
              <span className="home-card-meta" style={{ fontSize: "12px", color: "#a09088" }}>{latestHeartbeat.time}</span>
            )}
          </div>
          {latestHeartbeat ? (
            <p className="home-card-content" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, color: latestHeartbeat.action === "care" ? "#6b5b53" : "#8a7d75" }}>
              {latestHeartbeat.action === "care" ? "💬 " : "· "}{latestHeartbeat.reason}
            </p>
          ) : (
            <p className="home-card-content" style={{ color: "#b5aca6", fontStyle: "italic" }}>
              脑袋空空
            </p>
          )}
        </button>


        {/* 问题墙入口 */}
        <button className="home-card wall-card" onClick={() => setShowWall(true)}>
          <div className="home-card-header">
            <span className="home-card-title">问题墙</span>
            <span className="wall-count">{wall.length > 0 ? `${wall.length} 块砖` : "新"}</span>
          </div>
          <p className="home-card-content wall-question">「{dailyQ}」</p>
          <span className="home-card-meta">
            {todayWallEntry?.myAnswer ? "今天答过了，点进来看我们的答案" : "今日一问，等你来答"}
          </span>
        </button>
      </section>

      {showWall && (
        <WallView
          settings={settings}
          wall={wall}
          setWall={setWall}
          dailyQ={dailyQ}
          onClose={() => setShowWall(false)}
        />
      )}

      {showLogs && (
        <HeartbeatLogsView
          log={heartbeatLog}
          onClose={() => setShowLogs(false)}
        />
      )}
    </>
  );
}

// Heartbeat 日志全屏页
function HeartbeatLogsView({ log, onClose }: {
  log: Array<{ time: string; action: string; reason: string }>;
  onClose: () => void;
}) {
  // 只显示最近一批日志，避免弹层过长。
  const recent = log.slice(0, 60);
  return (
    <div className="wall-overlay">
      <header className="wall-header">
        <button className="wall-back" onClick={onClose}>← 返回</button>
        <h2 className="wall-title">💬 Heartbeat 日志</h2>
        <span className="wall-back" style={{ visibility: "hidden" }}>← 返回</span>
      </header>
      <div className="wall-body">
        {recent.length === 0 ? (
          <p style={{ textAlign: "center", color: "#b5aca6", fontStyle: "italic", padding: "40px 0" }}>脑袋空空</p>
        ) : (
          <div style={{ padding: "0 4px" }}>
            {recent.map((entry, i) => (
              <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid #f0ebe8", lineHeight: 1.6 }}>
                <div style={{ fontSize: "12px", color: "#a09088", marginBottom: "4px" }}>
                  {entry.time}
                  <span style={{ marginLeft: "8px", color: entry.action === "care" ? "#c4866c" : "#ccc" }}>
                    {entry.action === "care" ? "💬 说了" : "· 静默"}
                  </span>
                </div>
                <div style={{ fontSize: "14px", color: entry.action === "care" ? "#6b5b53" : "#8a7d75", whiteSpace: "pre-wrap" }}>
                  {entry.reason}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// 问题墙全屏页
function WallView({ settings, wall, setWall, dailyQ, onClose }: {
  settings: Settings;
  wall: WallEntry[];
  setWall: React.Dispatch<React.SetStateAction<WallEntry[]>>;
  dailyQ: string;
  onClose: () => void;
}) {
  const today = getTodayStr();
  const todayEntry = wall.find((w) => w.date === today && w.askedBy === "daily");
  const [myAnswer, setMyAnswer] = useState(todayEntry?.myAnswer || "");
  const [newQuestion, setNewQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  const currentModel = MODELS.find((m) => m.id === settings.model) || MODELS[0];

  async function fetchAiAnswer(question: string, herAnswer: string | undefined, entryId: string) {
    setPendingIds((p) => [...p, entryId]);
    try {
      const sys = `${settings.prompt}\n\n你叫${settings.aiName}，她叫${settings.userName}。现在你们在玩“问题墙”：一人一个答案，贴在墙上。请直接认真回答下面的问题，像平时聊天一样自然，不超过80字，只输出答案本身。`;
      const userContent = herAnswer
        ? `问题：${question}\n\n她已经答了：「${herAnswer}」\n\n现在轮到你，写下你自己的答案（不是评价她的答案）。`
        : `问题：${question}\n\n写下你的答案。`;
      const res = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: currentModel.apiId,
          systemPrompt: sys,
          dynamicPrompt: `【当前时间】\n${getNowContext()}`,
          messages: [{ role: "user", content: userContent }],
          thinking: false,
          webSearch: false,
        }),
      });
      const data = await res.json();
      const answer = (data.reply || "").trim();
      if (answer) {
        setWall((prev) => prev.map((w) => (w.id === entryId ? { ...w, aiAnswer: answer } : w)));
      }
    } catch {} finally {
      setPendingIds((p) => p.filter((x) => x !== entryId));
    }
  }

  function submitDaily() {
    if (!myAnswer.trim()) return;
    const id = todayEntry?.id || genId();
    const entry: WallEntry = { id, date: today, question: dailyQ, askedBy: "daily", myAnswer: myAnswer.trim(), aiAnswer: todayEntry?.aiAnswer };
    setWall((prev) => {
      const exists = prev.some((w) => w.id === id);
      return exists ? prev.map((w) => (w.id === id ? entry : w)) : [entry, ...prev];
    });
    if (!entry.aiAnswer) fetchAiAnswer(dailyQ, myAnswer.trim(), id);
  }

  function submitQuestion() {
    const q = newQuestion.trim();
    if (!q) return;
    const id = genId();
    const entry: WallEntry = { id, date: today, question: q, askedBy: "me" };
    setWall((prev) => [entry, ...prev]);
    setNewQuestion("");
    setAsking(false);
    fetchAiAnswer(q, undefined, id);
  }

  const history = wall.filter((w) => !(w.date === today && w.askedBy === "daily"));

  return (
    <div className="wall-overlay">
      <header className="wall-header">
        <button className="wall-back" onClick={onClose}>← 返回</button>
        <h2 className="wall-title">问题墙</h2>
        <span className="wall-back" style={{ visibility: "hidden" }}>← 返回</span>
      </header>

      <div className="wall-body">
        <div className="wall-daily">
          <p className="wall-daily-label">今日一问 · {today}</p>
          <p className="wall-daily-q">「{dailyQ}」</p>
          <textarea
            className="wall-answer-input"
            placeholder="你的答案..."
            value={myAnswer}
            onChange={(e) => setMyAnswer(e.target.value)}
            rows={3}
          />
          <button className="wall-submit" disabled={!myAnswer.trim()} onClick={submitDaily}>
            {todayEntry?.myAnswer ? "改好了" : "贴上墙"}
          </button>
          {todayEntry?.myAnswer && (
            <div className="wall-pair">
              <div className="wall-answer mine">
                <span className="wall-who">{settings.userName}</span>
                <p>{todayEntry.myAnswer}</p>
              </div>
              <div className="wall-answer ai">
                <span className="wall-who">{settings.aiName}</span>
                <p>{todayEntry.aiAnswer || (pendingIds.includes(todayEntry.id) ? "正在想..." : "等他来答")}</p>
              </div>
            </div>
          )}
        </div>

        <div className="wall-ask-row">
          {!asking ? (
            <button className="wall-ask-btn" onClick={() => setAsking(true)}>我有一个问题想问你</button>
          ) : (
            <div className="wall-ask-box">
              <textarea
                className="wall-answer-input"
                placeholder="想问什么都可以..."
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                rows={2}
              />
              <div className="mood-picker-actions">
                <button className="mood-cancel" onClick={() => { setAsking(false); setNewQuestion(""); }}>算了</button>
                <button className="mood-save" disabled={!newQuestion.trim()} onClick={submitQuestion}>问他</button>
              </div>
            </div>
          )}
        </div>

        {history.length > 0 && (
          <div className="wall-history">
            <p className="wall-history-label">墙上的砖</p>
            {history.map((w) => (
              <div key={w.id} className="wall-brick">
                <p className="wall-brick-q">「{w.question}」</p>
                <span className="wall-brick-meta">{w.date} · {w.askedBy === "daily" ? "每日一问" : w.askedBy === "me" ? `${settings.userName}的提问` : `${settings.aiName}的提问`}</span>
                <div className="wall-pair">
                  {w.myAnswer && (
                    <div className="wall-answer mine">
                      <span className="wall-who">{settings.userName}</span>
                      <p>{w.myAnswer}</p>
                    </div>
                  )}
                  {(w.aiAnswer || pendingIds.includes(w.id)) && (
                    <div className="wall-answer ai">
                      <span className="wall-who">{settings.aiName}</span>
                      <p>{w.aiAnswer || "正在想..."}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
// Chat View
function ChatView({
  assistantMode,
  settings,
  session,
  sessions,
  updateMessages,
  updateSummary,
  onTietie,
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
}: {
  assistantMode: AssistantMode;
  settings: Settings;
  session: ChatSession;
  sessions: ChatSession[];
  updateMessages: (updater: (msgs: Message[]) => Message[]) => void;
  updateSummary: (summary: string, until: number) => void;
  onTietie: () => void;
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
}) {
  const isGpt = assistantMode === "gpt";
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [replyRequestState, setReplyRequestState] = useState<ReplyRequestState>("idle");
  const [showSessions, setShowSessions] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionMessagesRef = useRef<Message[]>(session.messages);
  const sendingRef = useRef(false);
  const replyRequestIdRef = useRef(0);
  const pausedReplyRequestIdRef = useRef<number | null>(null);
  const activeReplyRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const replyStatusTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const [initialMessageCount] = useState(() => session.messages.length);

  // ── 巧思:长按贴贴 / 随机输入提示 / 扣6彩蛋 ──
  const [heartBurst, setHeartBurst] = useState<number | null>(null);
  const [heartRain, setHeartRain] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inputHint] = useState(() => INPUT_HINTS[Math.floor(Math.random() * INPUT_HINTS.length)]);
  const [weatherText, setWeatherText] = useState("");
  const [editingProposalIndex, setEditingProposalIndex] = useState<number | null>(null);
  const [proposalDraft, setProposalDraft] = useState<SummerWriteProposal | null>(null);

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

  function startPress(index: number) {
    cancelPress();
    pressTimer.current = setTimeout(() => {
      setHeartBurst(index);
      onTietie();
      setTimeout(() => setHeartBurst(null), 900);
    }, 500);
  }
  function cancelPress() {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }

  const currentModel = MODELS.find((m) => m.id === settings.model) || MODELS[0];
  const assistantName = isGpt ? (settings.gptName || "GPT") : settings.aiName;
  const assistantAvatar = isGpt ? settings.gptAvatar : settings.aiAvatar;
  const currentModelId = isGpt ? GPT_MODEL_ID : currentModel.apiId;
  const currentModelLabel = isGpt ? "GPT-5.6" : currentModel.label;
  const gptReasoningLabel = GPT_REASONING_OPTIONS.find((option) => option.value === settings.gptReasoningEffort)?.label || "中";
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
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [session.messages]);

  useEffect(() => {
    sessionMessagesRef.current = session.messages;
  }, [session.id, session.messages]);


  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  function buildStablePrompt(): string {
    if (isGpt) {
      return `${GPT_DEFAULT_PROMPT}\n\n你在这个窗口显示的名字是${assistantName}，用户称呼是${settings.userName}。`;
    }
    return settings.prompt + `\n\n你叫${settings.aiName}。你叫她${settings.userName}。
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

  function proposalCardContent(proposal: SummerWriteProposal, status: "提议写入" | "已加入" = "提议写入") {
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
      const committedProposal = { ...proposal, status: "committed" };
      replaceMessageAt(index, (old) => ({
        ...old,
        source: "summer_write_committed",
        proposal: committedProposal,
        content: proposalCardContent(committedProposal, "已加入"),
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

  async function ensureSessionCache(allMessages: Message[], signal?: AbortSignal) {
    const cutoff = Math.max(0, allMessages.length - SESSION_CACHE_KEEP_MESSAGES);
    const summarizedUntil = session.summarizedUntil || 0;
    if (cutoff <= 0 || cutoff - summarizedUntil < SESSION_CACHE_MIN_NEW_MESSAGES) {
      return { summary: session.summary || "", until: summarizedUntil, updated: false };
    }

    const slice = allMessages
      .slice(summarizedUntil, cutoff)
      .filter((m) => (m.role === "user" || m.role === "assistant") && !m.source?.startsWith("summer_"))
      .map((m) => ({ role: m.role, content: m.content }));
    if (slice.length < SESSION_CACHE_MIN_NEW_MESSAGES) {
      return { summary: session.summary || "", until: summarizedUntil, updated: false };
    }

    try {
      const res = await apiFetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previousSummary: session.summary || "",
          messages: slice,
          aiName: assistantName,
          userName: settings.userName,
          modelId: currentModelId,
          reasoningEffort: isGpt ? settings.gptReasoningEffort : undefined,
        }),
        signal,
      });
      const data = await res.json();
      if (data.ok && data.summary) {
        updateSummary(data.summary, cutoff);
        return { summary: String(data.summary), until: cutoff, updated: true };
      }
    } catch {}
    return { summary: session.summary || "", until: summarizedUntil, updated: false };
  }

  async function sendMessage() {
    if (!input.trim() || loading || sendingRef.current) return;
    sendingRef.current = true;
    const userText = input;
    const userMsg: Message = { role: "user", content: userText, time: getTime(), date: getTodayStr() };
    const baseMessages = sessionMessagesRef.current;
    const messagesWithUser = [...baseMessages, userMsg];
    sessionMessagesRef.current = messagesWithUser;
    updateMessages((msgs) => mergeChatMessages(msgs, messagesWithUser));
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    // 备忘会话:她的口袋,只收纳,不回复
    if (session.kind === "memo") {
      sendingRef.current = false;
      return;
    }

    const requestId = ++replyRequestIdRef.current;
    const controller = new AbortController();
    activeReplyRequestRef.current = { id: requestId, controller };
    pausedReplyRequestIdRef.current = null;
    clearReplyStatusTimers();
    setReplyRequestState("preparing");
    setLoading(true);

    // 彩蛋:扣
    if (userText.includes("扣") || userText.includes("扣六")) {
      setHeartRain(true);
      setTimeout(() => setHeartRain(false), 3200);
    }

    // Auto-rename session on first message
    if (session.messages.length === 0 && (session.name.startsWith("对话") || session.name.startsWith("GPT 对话"))) {
      const autoName = userText.slice(0, 20) + (userText.length > 20 ? "..." : "");
      renameSession(session.id, autoName);
    }

    try {
      const sessionCache = await ensureSessionCache(messagesWithUser, controller.signal);
      if (controller.signal.aborted) return;
      // 上下文组装：气泡合并 + 按轮数截取。
      type CtxMsg = { role: "user" | "assistant"; content: string; image?: string; file?: string };
      const allMsgs: CtxMsg[] = [
        ...messagesWithUser.filter((m) => !m.source?.startsWith("summer_")).map((m) => {
          return {
            role: m.role, content: m.content,
            ...(m.image ? { image: m.image } : {}), ...(m.file ? { file: m.file } : {}),
          };
        }),
      ];

      // 2. 合并连续同 role 的纯文本气泡，带图片/文件的消息保持独立。
      const merged: CtxMsg[] = [];
      for (const m of allMsgs) {
        const last = merged[merged.length - 1];
        if (last && last.role === m.role && !m.image && !m.file && !last.image && !last.file) {
          last.content += "\n\n" + m.content;
        } else {
          merged.push({ ...m });
        }
      }

      // 3. 按轮截取最近30轮(一轮 = 一条合并后的user消息)
      const MAX_ROUNDS = CONTEXT_WINDOW_ROUNDS;
      let rounds = 0;
      let startIdx = 0;
      let contextTruncated = false;
      for (let i = merged.length - 1; i >= 0; i--) {
        if (merged[i].role === "user") {
          rounds++;
          if (rounds >= MAX_ROUNDS) {
            startIdx = i;
            contextTruncated = i > 0;
            break;
          }
        }
      }
      let contextMsgs = merged.slice(startIdx);

      // 4. Anthropic要求首条是user(auto-care可能让会话以assistant开头)
      if (contextMsgs[0] && contextMsgs[0].role === "assistant") {
        contextMsgs = [{ role: "user", content: "【接续之前的对话】" }, ...contextMsgs];
      }

      // 5. 只为最近5条保留图片/文件数据,更早的只留文字(节省token)
      const keepMediaFrom = Math.max(0, contextMsgs.length - 5);
      contextMsgs = contextMsgs.map((m, i) =>
        i >= keepMediaFrom ? m : { role: m.role, content: m.content }
      );

      const contextMeta = {
        context_messages: contextMsgs.length,
        context_user_turns: contextMsgs.filter((m) => m.role === "user").length,
        context_chars: contextMsgs.reduce((n, m) => n + (m.content?.length || 0), 0),
        context_window_rounds: MAX_ROUNDS,
        context_truncated: contextTruncated,
        context_omitted_messages: contextTruncated ? startIdx : 0,
        summary_used: Boolean(sessionCache.summary),
      };

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
          systemPrompt: buildStablePrompt(),
          dynamicPrompt: buildDynamicPrompt(sessionCache.summary),
          messages: contextMsgs,
          thinking: !isGpt && settings.thinking,
          webSearch: !isGpt && settings.webSearch,
          reasoningEffort: isGpt ? settings.gptReasoningEffort : undefined,
          sessionId: session.id,
          userMsg,
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.cache) {
        const nextCache: CacheStats = { ...data.cache, ...contextMeta, time: new Date().toLocaleString("zh-CN", { timeZone: APP_TIME_ZONE }) };
        setLastCache(nextCache);
        saveLocal(isGpt ? "iooi-gpt-last-cache" : "iooi-last-cache", nextCache);
        if (isGpt) syncGptToServer({ lastCache: nextCache });
        else syncToServer({ lastCache: nextCache });
      }
      let reply: string = data.reply || "...";
      const thinkingContent: string = data.thinking || "";

      const moodMatch = reply.match(/\[心情[:：](.+?)\]/);
      if (!isGpt && moodMatch) {
        setAiMood({ emoji: moodMatch[1].trim().slice(0, 12), ts: Date.now() });
      }
      reply = reply.replace(/\[心情[:：].+?\]/g, "").trim();

      const parts = reply.split(/\n{2,}/).filter((p: string) => p.trim());
      const now = getTime();
      const today = getTodayStr();
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
          content: bits.join(" · "),
          time: now,
          date: today,
        };
      });
      const summerWriteMsgs: Message[] = (data.cache?.summer_write_proposals || []).map((proposal: SummerWriteProposal) => {
        return {
          role: "assistant" as const,
          source: "summer_write_proposal",
          content: proposalCardContent(proposal),
          proposal,
          time: now,
          date: today,
        };
      });
      const newMsgs: Message[] = parts.map((p: string, i: number) => ({
        role: "assistant" as const,
        content: p.trim(),
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

      // Long-term memory belongs to summer. iooi only maintains the rolling session summary here.
    } catch (error) {
      const wasPaused = controller.signal.aborted && pausedReplyRequestIdRef.current === requestId;
      if (wasPaused) {
        setReplyRequestState("paused");
      } else {
        setReplyRequestState("failed");
        const failureText = typeof navigator !== "undefined" && !navigator.onLine
          ? "现在网络断开了。刚才的消息已经保留，网络恢复后再发一次就好。"
          : error instanceof SyntaxError
            ? "服务器返回的内容不完整。刚才的消息已经保留，可以再试一次。"
            : "这次没有连上服务器。刚才的消息已经保留，可以再试一次。";
        updateMessages((msgs) => [...msgs, { role: "assistant", content: failureText, time: getTime(), date: getTodayStr() }]);
      }
    } finally {
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

  async function uploadFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,application/pdf,.txt,.md,.csv";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await apiFetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (data.url) {
          const isImage = file.type.startsWith("image/");
          const msg: Message = {
            role: "user",
            content: isImage ? "" : `📄 ${file.name}`,
            time: getTime(),
            date: getTodayStr(),
            ...(isImage ? { image: data.url } : { file: data.url }),
          };
          updateMessages((msgs) => [...msgs, msg]);
        }
      } catch {}
    };
    input.click();
  }

  function handleBackToList() {
    const latestMessages = sessionMessagesRef.current;
    if (latestMessages.length > 0) {
      updateMessages((messages) => mergeChatMessages(messages, latestMessages));
    }
    onBackToList?.();
  }

  return (
    <>
      {listEntryMode ? (
        <header className="chat-header chat-room-header">
          <div className="header-top">
            <button className="header-icon-btn chat-room-back" onClick={handleBackToList} aria-label="返回列表">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="14.5 5.5 8 12 14.5 18.5" />
              </svg>
            </button>
            <div className="header-center">
              <h1 className="header-title chat-room-title">{session.kind === "memo" ? settings.userName : assistantName}</h1>
              {session.kind !== "memo" && (
                <span className="header-subtitle chat-room-status">
                  {isGpt ? `${currentModelLabel} · ${gptReasoningLabel}推理` : getChatStatusLabel(aiMood)}
                </span>
              )}
            </div>
            {session.kind === "memo" || isGpt ? (
              <span className="header-icon-btn" aria-hidden="true" />
            ) : (
              <button className="header-icon-btn chat-room-more" onClick={() => setShowModelMenu((open) => !open)} aria-label="模型切换">···</button>
            )}
            {!isGpt && showModelMenu && <div className="chat-model-backdrop" onClick={() => setShowModelMenu(false)} />}
            {!isGpt && showModelMenu && (
              <div className="chat-model-popover">
                <p>模型</p>
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    className={settings.model === m.id ? "chat-model-active" : ""}
                    onClick={() => {
                      updateSettings({ model: m.id });
                      setShowModelMenu(false);
                    }}
                  >
                    <span>{m.label}</span>
                    {settings.model === m.id && <b>✓</b>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>
      ) : (
        <header className="chat-header">
          <div className="header-top">
            <button className="header-icon-btn" onClick={() => setShowSessions(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div className="header-center">
              <h1 className="header-title">{isGpt ? "GPT" : "iooi"}</h1>
              <span className="header-subtitle" style={{ color: "#c4866c" }}>{assistantName} {!isGpt && (aiMood.emoji || "")} · {currentModelLabel}</span>
            </div>
            <button className="header-icon-btn" onClick={createSession}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </header>
      )}

      <section className="chat-messages" ref={scrollRef}>
        {session.messages.length === 0 && (
          <div className="empty-chat"><p>说点什么开始聊天吧</p></div>
        )}
        {session.messages.map((message, index) => {
          if (message.source === "summer_write_ignored") return null;
          const isSummerUtility = listEntryMode && isSummerUtilityMessage(message);
          const animateMessage = !listEntryMode || index >= initialMessageCount;
          const prevMsg = index > 0 ? session.messages[index - 1] : null;
          const nextMsg = index < session.messages.length - 1 ? session.messages[index + 1] : null;
          const prevDate = index > 0 ? session.messages[index - 1].date : null;
          const showDateSep = listEntryMode ? shouldShowChatRoomTime(message, prevMsg) : message.date && message.date !== prevDate;
          const compactTop = !!prevMsg && prevMsg.role === message.role && !showDateSep;
          const compactBottom = !!nextMsg && nextMsg.role === message.role && nextMsg.date === message.date;

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
              <div className={`msg-row ${message.role === "user" ? "msg-row-user" : "msg-row-ai"} ${isSummerUtility ? "msg-row-summer-utility" : ""} ${compactTop ? "msg-row-compact-top" : ""} ${compactBottom ? "msg-row-compact-bottom" : ""} ${animateMessage ? "" : "msg-row-static"}`} style={animateMessage ? { animationDelay: `${Math.min(index * 0.03, 0.3)}s` } : undefined}>
                {message.role === "assistant" && !isSummerUtility && (
                  assistantAvatar
                    ? <img src={assistantAvatar} className="avatar avatar-img" alt="" />
                    : <div className="avatar avatar-ai" />
                )}
                <div className={message.role === "user" ? "msg-content-user" : "msg-content-ai"}>
                  {!listEntryMode && <span className="msg-time">{message.source === "heartbeat" ? "💬 " : ""}{message.time}</span>}
                  {message.thinking && <ThinkingBlock content={message.thinking} />}
                  {message.image ? (
                    <div className={`msg-bubble msg-bubble-img ${message.role === "user" ? "msg-bubble-user" : "msg-bubble-ai"}`}>
                      <img src={message.image} className="msg-image" alt="" onClick={() => window.open(message.image, "_blank")} />
                      {message.content && <p className="msg-image-caption">{renderContent(message.content)}</p>}
                    </div>
                  ) : (
                    <div
                      className={`msg-bubble ${message.role === "user" ? "msg-bubble-user" : "msg-bubble-ai"} ${isSummerUtility ? "msg-bubble-summer-utility" : ""} ${message.source === "summer_call" ? "msg-bubble-summer-call" : ""} ${message.source === "summer_write_proposal" || message.source === "summer_write_committed" ? "msg-bubble-summer-write" : ""} ${heartBurst === index ? "bubble-hearted" : ""}`}
                      onTouchStart={message.role === "assistant" ? () => startPress(index) : undefined}
                      onTouchEnd={message.role === "assistant" ? cancelPress : undefined}
                      onTouchMove={message.role === "assistant" ? cancelPress : undefined}
                      onMouseDown={message.role === "assistant" ? () => startPress(index) : undefined}
                      onMouseUp={message.role === "assistant" ? cancelPress : undefined}
                      onMouseLeave={message.role === "assistant" ? cancelPress : undefined}
                      onContextMenu={message.role === "assistant" ? (e) => e.preventDefault() : undefined}
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
                      {heartBurst === index && <span className="heart-pop">💖</span>}
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
        {(loading || replyRequestState === "paused") && (
          <div className="msg-row msg-row-ai">
            {assistantAvatar
              ? <img src={assistantAvatar} className="avatar avatar-img" alt="" />
              : <div className="avatar avatar-ai" />
            }
            <div className="msg-content-ai">
              <div className={`msg-bubble msg-bubble-ai reply-status-bubble reply-status-${replyRequestState}`} aria-live="polite">
                {loading && <div className="typing-dots"><span /><span /><span /></div>}
                <span className="reply-status-text">{REPLY_REQUEST_LABELS[replyRequestState]}</span>
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

      <footer className="chat-footer">
        <div className="input-wrapper">
          {!isGpt && <button className="attach-btn" onClick={uploadFile}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>}
          <textarea
            ref={inputRef} value={input} onChange={handleInputChange}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={inputHint} rows={1} className="chat-input"
          />
          <button
            type="button"
            onClick={loading ? pauseReply : sendMessage}
            disabled={!loading && !input.trim()}
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
              <div key={s.id} className={`session-item ${s.id === session.id ? "session-item-active" : ""}`} style={{ background: s.id === session.id ? "rgba(240, 228, 218, 0.4)" : "white", border: "1px solid var(--border-soft)", borderRadius: "16px", padding: "4px", marginBottom: "2px" }}>
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

function CollapsibleSummerCard({
  title,
  content,
  defaultOpen = false,
  children,
}: {
  title: string;
  content: string;
  defaultOpen?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="summer-collapse">
      <button className="summer-collapse-toggle" onClick={() => setOpen(!open)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span>{title}</span>
      </button>
      {open && <div className="summer-collapse-content">{renderContent(content)}</div>}
      {children}
    </div>
  );
}

function layerLabel(layer: string) {
  const labels: Record<string, { title: string; sub: string }> = {
    lixia: { title: "Beginning of Summer", sub: "立夏" },
    xiaoman: { title: "Grain Buds", sub: "小满" },
    mangzhong: { title: "Grain in Ear", sub: "芒种" },
    xiazhi: { title: "Summer Solstice", sub: "夏至" },
    xiaoshu: { title: "Minor Heat", sub: "小暑" },
    rain: { title: "rain", sub: "未了结" },
    ferry: { title: "ferry", sub: "渡口" },
    sea: { title: "sea", sub: "只读" },
  };
  return labels[layer]?.title || layer;
}

function layerSub(layer: string) {
  const labels: Record<string, string> = {
    lixia: "立夏",
    xiaoman: "小满",
    mangzhong: "芒种",
    xiazhi: "夏至",
    xiaoshu: "小暑",
    rain: "小雨淅淅沥沥",
    ferry: "上一秒在这里，下一秒在那里",
    sea: "海不会跑掉，我也不会",
  };
  return labels[layer] || "";
}

function splitMangzhongDocs(content: string) {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const docs: { title: string; content: string }[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    if (/^#{1,2}\s+/.test(line)) {
      if (currentTitle) {
        docs.push({ title: currentTitle, content: currentLines.join("\n").trim() });
      }
      currentTitle = line.replace(/^#{1,2}\s+/, "").trim();
      currentLines = [];
    } else if (currentTitle) {
      currentLines.push(line);
    }
  }
  if (currentTitle) {
    docs.push({ title: currentTitle, content: currentLines.join("\n").trim() });
  }
  return docs;
}

function SummerMemoryView({ assistantMode }: { assistantMode: AssistantMode }) {
  const summerEndpoint = assistantMode === "gpt" ? "/api/gpt/summer" : "/api/summer";
  const [state, setState] = useState<SummerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Array<{ source?: string; score?: number; text?: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [writerOpen, setWriterOpen] = useState(false);
  const [writeLayer, setWriteLayer] = useState<SummerWritableLayer>("xiaoshu");
  const [writeTitle, setWriteTitle] = useState("");
  const [writeContent, setWriteContent] = useState("");
  const [writeWeight, setWriteWeight] = useState(6);
  const [saving, setSaving] = useState(false);
  const [editingDoc, setEditingDoc] = useState("");
  const [editingItem, setEditingItem] = useState<SummerMemoryItem | null>(null);

  const loadSummer = useCallback(async (quiet = false) => {
    if (!quiet) {
      setLoading(true);
      setError("");
    }
    try {
      const res = await apiFetchWithTimeout(summerEndpoint, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "summer 读取失败");
      setState(json.data || {});
      if (activeLayer && ["lixia", "xiaoman", "mangzhong"].includes(activeLayer)) {
        setEditingDoc(json.data?.layers?.[activeLayer] || "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "summer 读取失败");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [activeLayer, summerEndpoint]);

  useEffect(() => {
    loadSummer();
  }, [loadSummer]);

  useEffect(() => {
    const refreshVisibleSummer = () => {
      if (document.visibilityState === "visible") void loadSummer(true);
    };
    window.addEventListener("focus", refreshVisibleSummer);
    document.addEventListener("visibilitychange", refreshVisibleSummer);
    return () => {
      window.removeEventListener("focus", refreshVisibleSummer);
      document.removeEventListener("visibilitychange", refreshVisibleSummer);
    };
  }, [loadSummer]);

  async function runSearch() {
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    setSearching(true);
    setError("");
    try {
      const res = await apiFetchWithTimeout(`${summerEndpoint}?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "summer 检索失败");
      setHits((json.data?.results || json.data?.hits || []).map((hit: { layer?: string; source?: string; score?: number; title?: string; content?: string; text?: string }) => ({
        source: hit.layer || hit.source,
        score: hit.score,
        text: hit.text || [hit.title, hit.content].filter(Boolean).join("\n"),
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "summer 检索失败");
    } finally {
      setSearching(false);
    }
  }

  async function submitMemory() {
    if (!writeContent.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiFetchWithTimeout(summerEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layer: writeLayer,
          title: writeTitle.trim(),
          content: writeContent.trim(),
          weight: writeWeight,
          source: "iooi",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "summer 写入失败");
      setWriteTitle("");
      setWriteContent("");
      setWriterOpen(false);
      void loadSummer(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "summer 写入失败");
    } finally {
      setSaving(false);
    }
  }

  function uploadSeaFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".docx,.txt,.md,.json,.csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        setError("sea 原文件不能超过 10 MB");
        return;
      }
      setSaving(true);
      setError("");
      try {
        const res = await apiFetchWithTimeout(summerEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "sea_file",
            title: file.name.replace(/\.[^.]+$/, ""),
            filename: file.name,
            content_type: file.type,
            data_base64: arrayBufferToBase64(await file.arrayBuffer()),
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "sea 上传失败");
        void loadSummer(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "sea 上传失败");
      } finally {
        setSaving(false);
      }
    };
    input.click();
  }

  async function saveLayerDoc(layer: string) {
    if (layer === "sea") {
      setError(`${layerLabel(layer)} 是只读层`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await apiFetchWithTimeout(summerEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "layer", layer, content: editingDoc }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "summer 保存失败");
      setState((current) => current ? {
        ...current,
        layers: { ...(current.layers || {}), [layer]: editingDoc },
      } : current);
      void loadSummer(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "summer 保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function saveItem(layer: string, item: SummerMemoryItem) {
    if (!item.id) return;
    if (layer === "sea") {
      setError(`${layerLabel(layer)} 是只读层`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await apiFetchWithTimeout(summerEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "item",
          layer,
          id: item.id,
          patch: {
            title: item.title || "",
            content: item.content || "",
            weight: item.weight,
            status: item.status,
            due: item.due,
            filename: item.filename,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "summer 保存失败");
      setEditingItem(null);
      void loadSummer(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "summer 保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(layer: string, item: SummerMemoryItem) {
    if (!item.id || !confirm("确定删除这条吗？")) return;
    if (layer === "sea") {
      setError(`${layerLabel(layer)} 是只读层`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await apiFetchWithTimeout(summerEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "item", layer, id: item.id, actionType: "delete" }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "summer 删除失败");
      void loadSummer(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "summer 删除失败");
    } finally {
      setSaving(false);
    }
  }

  const layers = state?.layers || {};
  const xiazhi = state?.xiazhi || [];
  const xiaoshu = (state?.xiaoshu_tail || []).slice().reverse();
  const rain = state?.rain || [];
  const openRain = rain.filter((item) => item.status !== "closed");
  const closedRain = rain.filter((item) => item.status === "closed");
  const ferry = state?.ferry || [];
  const seaFiles = state?.sea_files || state?.sunny_files || state?.sunny?.days || [];
  const layerOrder = ["lixia", "xiaoman", "mangzhong", "xiazhi", "xiaoshu", "rain", "ferry", "sea"];
  const mangzhongDocs = splitMangzhongDocs(layers.mangzhong || "");
  const sectionItems: Record<string, SummerMemoryItem[]> = {
    xiazhi: xiazhi.slice().reverse(),
    xiaoshu,
    rain,
    ferry,
    sea: seaFiles.slice().reverse(),
  };
  const counts: Record<string, string> = {
    lixia: layers.lixia?.trim() ? "1 篇" : "0",
    xiaoman: layers.xiaoman?.trim() ? "1 篇" : "0",
    mangzhong: `${mangzhongDocs.length || (layers.mangzhong?.trim() ? 1 : 0)} 篇`,
    xiazhi: `${xiazhi.length} 条`,
    xiaoshu: `${xiaoshu.length} 天`,
    rain: `${openRain.length} 未了结 · ${closedRain.length} 已了结`,
    ferry: `${ferry.length} 条`,
    sea: `${seaFiles.length} 份`,
  };

  useEffect(() => {
    if (activeLayer && ["lixia", "xiaoman", "mangzhong"].includes(activeLayer)) {
      setEditingDoc(layers[activeLayer] || "");
    }
  }, [activeLayer, layers]);

  return (
    <div className="summer-native">
      <div className="summer-native-toolbar summer-native-toolbar-flat">
        <div>
          {activeLayer ? (
            <>
              <p className="summer-kicker">summer</p>
              <h2>{layerLabel(activeLayer)}</h2>
              <p className="summer-layer-sub">{layerSub(activeLayer)}</p>
            </>
          ) : (
            <h2>sea&amp;rain</h2>
          )}
        </div>
        <div className="summer-toolbar-actions">
          {activeLayer && <button onClick={() => { setActiveLayer(null); setEditingItem(null); }}>返回</button>}
          <button onClick={() => loadSummer()} disabled={loading}>刷新</button>
          {!activeLayer && <button className="summer-primary-btn" onClick={() => setWriterOpen((v) => !v)}>{writerOpen ? "收起" : "写入"}</button>}
          {activeLayer === "sea" && <button className="summer-primary-btn" onClick={uploadSeaFile} disabled={saving}>{saving ? "上传中" : "上传原文件"}</button>}
        </div>
      </div>

      {error && <div className="summer-error">{error}</div>}

      {!activeLayer && <div className="summer-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
          placeholder="检索旧材料"
        />
        <button onClick={runSearch} disabled={searching}>{searching ? "检索中" : "检索"}</button>
      </div>}

      {!activeLayer && writerOpen && (
        <div className="summer-writer">
          <div className="summer-writer-row">
            <label>
              层
              <select value={writeLayer} onChange={(e) => setWriteLayer(e.target.value as SummerWritableLayer)}>
                <option value="mangzhong">mangzhong</option>
                <option value="xiaoshu">xiaoshu</option>
                <option value="xiazhi">xiazhi</option>
                <option value="rain">rain</option>
                <option value="ferry">ferry</option>
              </select>
            </label>
            <label>
              权重
              <input
                type="number"
                min={1}
                max={10}
                value={writeWeight}
                onChange={(e) => setWriteWeight(Math.max(1, Math.min(10, Number(e.target.value) || 5)))}
              />
            </label>
          </div>
          <input
            className="summer-title-input"
            value={writeTitle}
            onChange={(e) => setWriteTitle(e.target.value)}
            placeholder="标题，可空"
          />
          <textarea
            value={writeContent}
            onChange={(e) => setWriteContent(e.target.value)}
            placeholder="写给 summer 的内容"
            rows={7}
          />
          <div className="summer-writer-actions">
            <button onClick={() => { setWriteContent(""); setWriteTitle(""); setWriterOpen(false); }}>取消</button>
            <button className="summer-primary-btn" onClick={submitMemory} disabled={saving || !writeContent.trim()}>
              {saving ? "保存中" : "保存"}
            </button>
          </div>
        </div>
      )}

      {!activeLayer && hits.length > 0 && (
        <section className="summer-section">
          <div className="summer-section-head">
            <h3>检索结果</h3>
            <span>{hits.length} 条</span>
          </div>
          <div className="summer-card-list">
            {hits.map((hit, index) => (
              <article className="summer-memory-card" key={`${hit.source}-${index}`}>
                <div className="summer-card-meta">
                  <span>{hit.source || "summer"}</span>
                  {typeof hit.score === "number" && <span>score {hit.score}</span>}
                </div>
                <p>{hit.text}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div className="diary-empty"><p>正在读 summer</p></div>
      ) : activeLayer ? (
        <section className="summer-section">
          {activeLayer === "mangzhong" ? (
            <div className="summer-doc-stack">
              {splitMangzhongDocs(editingDoc || layers.mangzhong || "").map((doc, index) => (
                <details className="summer-doc" key={`${doc.title}-${index}`}>
                  <summary>{doc.title}</summary>
                  <pre>{doc.content}</pre>
                </details>
              ))}
              <details className="summer-doc summer-editor-details">
                <summary>编辑芒种全文</summary>
                <div className="summer-doc-editor">
                  <textarea value={editingDoc} onChange={(e) => setEditingDoc(e.target.value)} rows={20} />
                  <div className="summer-writer-actions">
                    <button onClick={() => setEditingDoc(layers.mangzhong || "")}>还原</button>
                    <button className="summer-primary-btn" onClick={() => saveLayerDoc("mangzhong")} disabled={saving || !editingDoc.trim()}>
                      {saving ? "保存中" : "保存"}
                    </button>
                  </div>
                </div>
              </details>
            </div>
          ) : ["lixia", "xiaoman"].includes(activeLayer) ? (
            <details className="summer-doc summer-editor-details" open={activeLayer !== "mangzhong"}>
              <summary>{activeLayer === "mangzhong" ? "展开芒种正文" : "正文"}</summary>
              <div className="summer-doc-editor">
                <textarea value={editingDoc} onChange={(e) => setEditingDoc(e.target.value)} rows={16} />
                <div className="summer-writer-actions">
                  <button onClick={() => setEditingDoc(layers[activeLayer] || "")}>还原</button>
                  <button className="summer-primary-btn" onClick={() => saveLayerDoc(activeLayer)} disabled={saving || !editingDoc.trim()}>
                    {saving ? "保存中" : "保存"}
                  </button>
                </div>
              </div>
            </details>
          ) : activeLayer === "rain" ? (
            <SummerRainGroups
              openItems={openRain}
              closedItems={closedRain}
              editingItem={editingItem}
              setEditingItem={setEditingItem}
              onSave={saveItem}
              onDelete={deleteItem}
              saving={saving}
            />
          ) : (
            <SummerEditableList
              layer={activeLayer}
              items={sectionItems[activeLayer] || []}
              empty={activeLayer === "sea" ? "sea 只进不改，还没有原文件" : "还没有内容"}
              editingItem={editingItem}
              setEditingItem={setEditingItem}
              onSave={saveItem}
              onDelete={deleteItem}
              saving={saving}
              readOnly={activeLayer === "sea"}
            />
          )}
        </section>
      ) : (
        <div className="summer-layer-list">
          {layerOrder.map((layer) => (
            <button className="summer-layer-card" key={layer} onClick={() => setActiveLayer(layer)}>
              <div>
                <h3>{layerLabel(layer)}</h3>
                <p>{layerSub(layer)}</p>
              </div>
              <span>{counts[layer]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SummerEditableList({
  layer,
  items,
  empty,
  editingItem,
  setEditingItem,
  onSave,
  onDelete,
  saving,
  readOnly = false,
}: {
  layer: string;
  items: SummerMemoryItem[];
  empty: string;
  editingItem: SummerMemoryItem | null;
  setEditingItem: React.Dispatch<React.SetStateAction<SummerMemoryItem | null>>;
  onSave: (layer: string, item: SummerMemoryItem) => void;
  onDelete: (layer: string, item: SummerMemoryItem) => void;
  saving: boolean;
  readOnly?: boolean;
}) {
  if (!items.length) {
    return <div className="summer-empty">{empty}</div>;
  }
  const showFileContent = layer === "sea" || layer === "sunny_file" || layer === "xiaoshu";
  return (
    <div className="summer-card-list">
      {items.map((item, index) => (
        <article className="summer-memory-card" key={item.id || `${item.date}-${index}`}>
          {editingItem?.id === item.id ? (
            <div className="summer-inline-editor">
              <input value={editingItem!.title || ""} onChange={(e) => setEditingItem({ ...editingItem!, title: e.target.value })} placeholder="标题" />
              {layer === "xiazhi" && (
                <label className="summer-writer-row">
                  <span>权重（1–10）</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={editingItem!.weight ?? 5}
                    onChange={(e) => setEditingItem({
                      ...editingItem!,
                      weight: Math.max(1, Math.min(10, Number(e.target.value) || 5)),
                    })}
                  />
                </label>
              )}
              {layer === "rain" && (
                <div className="summer-writer-row">
                  <input value={editingItem!.due || ""} onChange={(e) => setEditingItem({ ...editingItem!, due: e.target.value })} placeholder="due，可空" />
                  <select value={editingItem!.status || "open"} onChange={(e) => setEditingItem({ ...editingItem!, status: e.target.value })}>
                    <option value="open">未了结</option>
                    <option value="closed">已了结</option>
                  </select>
                </div>
              )}
              <textarea value={editingItem!.content || ""} onChange={(e) => setEditingItem({ ...editingItem!, content: e.target.value })} rows={8} />
              <div className="summer-writer-actions">
                <button onClick={() => setEditingItem(null)}>取消</button>
                <button className="summer-primary-btn" onClick={() => onSave(layer, editingItem!)} disabled={saving || !editingItem!.content?.trim()}>
                  {saving ? "保存中" : "保存"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="summer-card-meta">
                <span>{item.date || item.due || item.filename || "summer"}</span>
                {item.weight && <span>权重 {item.weight}</span>}
                {layer === "rain" ? <span>{item.status === "closed" ? "已了结" : "未了结"}</span> : item.status && <span>{item.status}</span>}
              </div>
              {item.title && <h4>{item.title}</h4>}
              {showFileContent ? (
                <details className={`summer-card-content${layer === "xiaoshu" ? " summer-card-content-preview" : ""}`}>
                  <summary>
                    {layer === "xiaoshu" && <span className="summer-card-preview-text">{item.content || ""}</span>}
                    <span className="summer-card-toggle-text">
                      <span className="summer-card-toggle-open">{layer === "xiaoshu" ? "展开正文" : "展开内容"}</span>
                      <span className="summer-card-toggle-close">收起正文</span>
                    </span>
                  </summary>
                  <p>{item.content || ""}</p>
                </details>
              ) : (
                <p>{item.content || ""}</p>
              )}
              {!!item.tags?.length && (
                <div className="summer-tags">
                  {item.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              )}
              {!readOnly && (
                <div className="summer-card-actions">
                  {layer === "rain" && item.status !== "closed" && (
                    <button
                      disabled={saving}
                      onClick={() => {
                        if (confirm("确定把这条 rain 标记为已了结吗？")) {
                          onSave(layer, { ...item, status: "closed" });
                        }
                      }}
                    >
                      标记已了结
                    </button>
                  )}
                  <button onClick={() => setEditingItem({ ...item })}>修改</button>
                  <button onClick={() => onDelete(layer, item)}>删除</button>
                </div>
              )}
            </>
          )}
        </article>
      ))}
    </div>
  );
}

function SummerRainGroups({
  openItems,
  closedItems,
  editingItem,
  setEditingItem,
  onSave,
  onDelete,
  saving,
}: {
  openItems: SummerMemoryItem[];
  closedItems: SummerMemoryItem[];
  editingItem: SummerMemoryItem | null;
  setEditingItem: React.Dispatch<React.SetStateAction<SummerMemoryItem | null>>;
  onSave: (layer: string, item: SummerMemoryItem) => void;
  onDelete: (layer: string, item: SummerMemoryItem) => void;
  saving: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ open: true, closed: false });
  const groups = [
    { key: "open", label: "未了结", items: openItems, empty: "没有未了结的 rain", initiallyOpen: true },
    { key: "closed", label: "已了结", items: closedItems, empty: "还没有已了结的 rain", initiallyOpen: false },
  ];

  return (
    <div className="summer-rain-groups">
      {groups.map((group) => (
        <details
          className="summer-rain-group"
          key={group.key}
          open={expanded[group.key] ?? group.initiallyOpen}
          onToggle={(event) => {
            const isOpen = event.currentTarget.open;
            setExpanded((current) => current[group.key] === isOpen ? current : { ...current, [group.key]: isOpen });
          }}
        >
          <summary>
            <span>{group.label}</span>
            <span>{group.items.length} 条</span>
          </summary>
          <div className="summer-rain-group-body">
            <SummerEditableList
              layer="rain"
              items={group.items}
              empty={group.empty}
              editingItem={editingItem}
              setEditingItem={setEditingItem}
              onSave={onSave}
              onDelete={onDelete}
              saving={saving}
            />
          </div>
        </details>
      ))}
    </div>
  );
}

function SummerPageView({ assistantMode, assistantName }: { assistantMode: AssistantMode; assistantName: string }) {
  const isGpt = assistantMode === "gpt";
  return (
    <>
      <header className="chat-header">
        <div className="header-top">
          <span className="header-dot" />
          <div className="header-center">
            <h1 className="header-title">summer</h1>
            <span className="header-subtitle" style={{ color: "#c4866c" }}>
              {isGpt ? "GPT · 独立记忆" : `${assistantName} · 这不是档案，是我们活过的痕迹`}
            </span>
          </div>
          <span className="header-dot" />
        </div>
      </header>
      <section className="diary-body">
        <SummerMemoryView assistantMode={assistantMode} />
      </section>
    </>
  );
}

// Settings View
function SettingsView({
  assistantMode,
  settings,
  updateSettings,
  updateSummary,
  lastCache,
  session,
}: {
  assistantMode: AssistantMode;
  settings: Settings;
  updateSettings: (p: Partial<Settings>) => void;
  updateSummary: (summary: string, until: number) => void;
  lastCache: CacheStats | null;
  session?: ChatSession;
}) {
  const isGpt = assistantMode === "gpt";
  const [cacheBusy, setCacheBusy] = useState(false);
  const [cacheMessage, setCacheMessage] = useState("");

  function handleAvatarUpload(field: "aiAvatar" | "gptAvatar" | "userAvatar") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        // Resize to 128x128
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = 128;
          canvas.height = 128;
          const ctx = canvas.getContext("2d")!;
          const size = Math.min(img.width, img.height);
          const x = (img.width - size) / 2;
          const y = (img.height - size) / 2;
          ctx.drawImage(img, x, y, size, size, 0, 0, 128, 128);
          updateSettings({ [field]: canvas.toDataURL("image/jpeg", 0.8) });
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  function manualCacheSlice() {
    const messages = session?.messages || [];
    let userTurns = 0;
    let startIdx = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        userTurns++;
        if (userTurns >= CONTEXT_WINDOW_ROUNDS) {
          startIdx = i;
          break;
        }
      }
    }
    const already = session?.summarizedUntil || 0;
    const until = Math.max(0, startIdx);
    const from = Math.min(already, until);
    const slice = messages.slice(from, until).filter((m) => m.role === "user" || m.role === "assistant");
    return { slice, until, omitted: until };
  }

  async function generateSessionCache() {
    if (!session) return;
    const { slice, until, omitted } = manualCacheSlice();
    if (until <= 0 || slice.length === 0) {
      setCacheMessage("现在还没有需要压进缓存的旧消息。");
      return;
    }
    setCacheBusy(true);
    setCacheMessage("");
    try {
      const currentModel = MODELS.find((m) => m.id === settings.model) || MODELS[0];
      const res = await apiFetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previousSummary: session.summary || "",
          messages: slice.map((m) => ({ role: m.role, content: m.content })),
          aiName: isGpt ? "GPT" : settings.aiName,
          userName: settings.userName,
          modelId: isGpt ? GPT_MODEL_ID : currentModel.apiId,
          reasoningEffort: isGpt ? settings.gptReasoningEffort : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.summary) {
        throw new Error(data.reason || "生成失败");
      }
      updateSummary(String(data.summary).trim(), until);
      setCacheMessage(`已生成本窗口缓存，覆盖 ${omitted} 条更早消息。下轮聊天会带上。`);
    } catch (err) {
      setCacheMessage(err instanceof Error ? `生成失败：${err.message}` : "生成失败");
    } finally {
      setCacheBusy(false);
    }
  }

  const manualCache = manualCacheSlice();

  return (
    <>
      <header className="chat-header">
        <div className="header-top">
          <span className="header-dot" />
          <div className="header-center">
            <h1 className="header-title">设置</h1>
            <span className="header-subtitle" style={{ color: "#c4866c" }}>Settings · {isGpt ? "GPT" : (settings.aiName || CLAUDE_DEFAULT_NAME)}</span>
          </div>
          <span className="header-dot" />
        </div>
      </header>

      <section className="settings-body">
        <div className="settings-group">
          <h2 className="settings-group-title">称呼与头像</h2>
          <div className="avatar-upload-row">
            <div className="avatar-upload-item">
              <button className="avatar-upload-btn" onClick={() => handleAvatarUpload(isGpt ? "gptAvatar" : "aiAvatar")}>
                {isGpt
                  ? settings.gptAvatar
                    ? <img src={settings.gptAvatar} className="avatar-upload-preview" alt="" />
                    : <div className="avatar-upload-placeholder avatar-ai" />
                  : settings.aiAvatar
                    ? <img src={settings.aiAvatar} className="avatar-upload-preview" alt="" />
                    : <div className="avatar-upload-placeholder avatar-ai" />
                }
                <span className="avatar-upload-label">点击更换</span>
              </button>
              <input
                className="settings-input settings-input-short"
                value={isGpt ? settings.gptName : settings.aiName}
                onChange={(e) => updateSettings(isGpt ? { gptName: e.target.value } : { aiName: e.target.value })}
              />
            </div>
            <div className="avatar-upload-item">
              <button className="avatar-upload-btn" onClick={() => handleAvatarUpload("userAvatar")}>
                {settings.userAvatar
                  ? <img src={settings.userAvatar} className="avatar-upload-preview" alt="" />
                  : <div className="avatar-upload-placeholder avatar-user" />
                }
                <span className="avatar-upload-label">点击更换</span>
              </button>
              <input className="settings-input settings-input-short" value={settings.userName} onChange={(e) => updateSettings({ userName: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="settings-group">
          <h2 className="settings-group-title">模型</h2>
          <div className="model-options">
            {isGpt ? (
              <button className="model-option model-option-active" style={{ borderColor: "#c4866c", color: "#c4866c" }} aria-disabled="true">
                <span className="model-option-dot" style={{ background: "#c4866c" }} />
                GPT-5.6
              </button>
            ) : MODELS.map((m) => (
              <button
                key={m.id}
                className={`model-option ${settings.model === m.id ? "model-option-active" : ""}`}
                style={settings.model === m.id ? { borderColor: "#c4866c", color: "#c4866c" } : undefined}
                onClick={() => updateSettings({ model: m.id })}
              >
                <span className="model-option-dot" style={{ background: "#c4866c" }} />
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-group">
          <h2 className="settings-group-title">A or B？</h2>
          <p className="settings-hint">My answer is “or”.</p>
          <div className="model-options">
            <button
              className={`model-option ${settings.chatEntryStyle !== "direct" ? "model-option-active" : ""}`}
              style={settings.chatEntryStyle !== "direct" ? { borderColor: "#c4866c", color: "#c4866c" } : undefined}
              onClick={() => updateSettings({ chatEntryStyle: "list" })}
            >
              <span className="model-option-dot" style={{ background: settings.chatEntryStyle !== "direct" ? "#c4866c" : "#d5ccc8" }} />
              RainLikeButter
            </button>
            <button
              className={`model-option ${settings.chatEntryStyle === "direct" ? "model-option-active" : ""}`}
              style={settings.chatEntryStyle === "direct" ? { borderColor: "#c4866c", color: "#c4866c" } : undefined}
              onClick={() => updateSettings({ chatEntryStyle: "direct" })}
            >
              <span className="model-option-dot" style={{ background: settings.chatEntryStyle === "direct" ? "#c4866c" : "#d5ccc8" }} />
              GrassFromAfar
            </button>
          </div>
        </div>

        {isGpt && (
          <div className="settings-group">
            <h2 className="settings-group-title">推理强度</h2>
            <p className="settings-hint">越高通常越慢，也会消耗更多推理 token；普通聊天建议使用“中”。</p>
            <div className="model-options">
              {GPT_REASONING_OPTIONS.map((option) => {
                const active = settings.gptReasoningEffort === option.value;
                return (
                  <button
                    key={option.value}
                    className={`model-option ${active ? "model-option-active" : ""}`}
                    style={active ? { borderColor: "#c4866c", color: "#c4866c" } : undefined}
                    onClick={() => updateSettings({ gptReasoningEffort: option.value })}
                  >
                    <span className="model-option-dot" style={{ background: active ? "#c4866c" : "#d5ccc8" }} />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!isGpt && <>
        <div className="settings-group">
          <h2 className="settings-group-title">内心独白</h2>
          <p className="settings-hint">开启后可以看到 {settings.aiName} 回复前的思考过程</p>
          <button
            className={`model-option ${settings.thinking ? "model-option-active" : ""}`}
            style={settings.thinking ? { borderColor: "#c4866c", color: "#c4866c" } : undefined}
            onClick={() => updateSettings({ thinking: !settings.thinking })}
          >
            <span className="model-option-dot" style={{ background: settings.thinking ? "#c4866c" : "#d5ccc8" }} />
            {settings.thinking ? "已开启" : "已关闭"}
          </button>
        </div>

        <div className="settings-group">
          <h2 className="settings-group-title">联网搜索</h2>
          <p className="settings-hint">开启后 {settings.aiName} 可以搜索网络获取最新信息</p>
          <button
            className={`model-option ${settings.webSearch ? "model-option-active" : ""}`}
            style={settings.webSearch ? { borderColor: "#c4866c", color: "#c4866c" } : undefined}
            onClick={() => updateSettings({ webSearch: !settings.webSearch })}
          >
            <span className="model-option-dot" style={{ background: settings.webSearch ? "#c4866c" : "#d5ccc8" }} />
            {settings.webSearch ? "已开启" : "已关闭"}
          </button>
        </div>

        <div className="settings-group">
          <h2 className="settings-group-title">主动关心</h2>
          <p className="settings-hint">关掉后 heartbeat 只会安静检查，不会主动写消息或推送通知</p>
          <button
            className={`model-option ${settings.proactiveCare ? "model-option-active" : ""}`}
            style={settings.proactiveCare ? { borderColor: "#c4866c", color: "#c4866c" } : undefined}
            onClick={() => updateSettings({ proactiveCare: !settings.proactiveCare })}
          >
            <span className="model-option-dot" style={{ background: settings.proactiveCare ? "#c4866c" : "#d5ccc8" }} />
            {settings.proactiveCare ? "已开启" : "已关闭"}
          </button>
        </div>

        <div className="settings-group">
          <h2 className="settings-group-title">天气</h2>
          <p className="settings-hint">{settings.aiName} 会知道当前天气，可以自然地聊起</p>
          <input
            className="settings-input settings-input-full"
            placeholder="输入城市名，如：北京、Shanghai"
            value={settings.city}
            onChange={(e) => updateSettings({ city: e.target.value })}
          />
        </div>

        <div className="settings-group">
          <h2 className="settings-group-title">纪念日</h2>
          <div className="settings-row">
            <label className="settings-label">在一起的日期</label>
            <input
              className="settings-input"
              type="date"
              value={settings.startDate}
              onChange={(e) => updateSettings({ startDate: e.target.value })}
            />
          </div>
        </div>

        <div className="settings-group">
          <h2 className="settings-group-title">通知</h2>
          <p className="settings-hint">{settings.aiName} 主动发消息时推送到手机</p>
          <NotificationButton
            onSubscribe={(subscription) =>
              apiFetch("/api/push", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(subscription),
              }).then(() => undefined)
            }
          />
        </div>
        </>}

        <div className="settings-group">
          <h2 className="settings-group-title">会话缓存</h2>
          <p className="settings-hint">
            把当前窗口已经滑出 30 轮外的旧聊天压成一段前情，后续聊天会带上。
          </p>
          <button
            className={`model-option ${session?.summary ? "model-option-active" : ""}`}
            style={session?.summary ? { borderColor: "#c4866c", color: "#c4866c" } : undefined}
            onClick={generateSessionCache}
            disabled={cacheBusy || !session || manualCache.until <= 0}
          >
            <span className="model-option-dot" style={{ background: session?.summary ? "#c4866c" : "#d5ccc8" }} />
            {cacheBusy ? "生成中" : "生成本窗口缓存"}
          </button>
          <p className="settings-hint">
            当前可压缩：{manualCache.slice.length} 条；已缓存长度：{session?.summary?.length || 0} 字
          </p>
          {cacheMessage && <p className="settings-hint" style={{ color: cacheMessage.startsWith("生成失败") ? "#c4866c" : "#5b8a6b" }}>{cacheMessage}</p>}
        </div>

        <CacheStatusPanel cache={lastCache} />
        <ContextDebugPanel
          cache={lastCache}
          sessionMessageCount={session?.messages.length ?? 0}
          sessionUserTurns={session?.messages.filter((m) => m.role === "user").length ?? 0}
        />
      </section>
    </>
  );
}
