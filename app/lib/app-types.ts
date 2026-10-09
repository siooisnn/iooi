
// ━━━━━━━━━━━━━━━ Types ━━━━━━━━━━━━━━━
export type Message = {
  role: "user" | "assistant";
  content: string;
  time: string;
  date?: string;
  image?: string;
  images?: string[];
  file?: string;
  thinking?: string;
  source?: string;
  roundId?: string;
  speaker?: "claude" | "gpt";
  proposal?: SummerWriteProposal;
};

// Picked but not yet sent; lives only in the composer until she presses send.
export type PendingAttachment = { id: string; kind: "image" | "file"; url: string; name: string };

export type ChatSession = {
  id: string;
  name: string;
  messages: Message[];
  createdAt: string;
  kind?: "memo" | "group";   // memo 是自己的口袋；group 是独立群聊
  summary?: string;          // 滚动摘要:窗口外旧对话的前情提要(王酥酥第一人称)
  summarizedUntil?: number;  // 已摘要到的原始气泡索引
};

export type Mood = {
  id: string;
  date: string;   // toLocaleDateString("zh-CN")
  time: string;
  emoji: string;
  note?: string;
  hearts?: number; // 长按贴贴次数
};

export type FragmentEntry = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type CacheStats = {
  model?: string;
  backend?: "claude-code" | "api";
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
  context_mode?: "full-window" | "rolling-summary";
  context_truncated?: boolean;
  context_omitted_messages?: number;
  summary_used?: boolean;
  summer_used?: boolean;
  total_ms?: number;
  user_persist_ms?: number;
  summer_ms?: number;
  queue_wait_ms?: number;
  claude_duration_ms?: number;
  claude_round_trip_ms?: number;
  proposal_ms?: number;
  reply_persist_ms?: number;
  summer_calls?: SummerCall[];
  summer_write_proposals?: SummerWriteProposal[];
  time?: string;
};

export type ReplyRequestState = "idle" | "preparing" | "waiting" | "searching" | "slow" | "very-slow" | "paused" | "failed";
export type AssistantMode = "claude" | "gpt";
export type GptReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";
export type ClaudeReasoningEffort = "low" | "medium" | "high" | "max";

export type SummerCall = {
  tool?: string;
  label?: string;
  status?: "hit" | "miss" | "used" | "fallback";
  count?: number;
  detail?: string;
};

export type SummerWriteProposal = {
  id?: string;
  status?: string;
  layer?: "mangzhong" | "xiazhi" | "xiaoshu" | "rain" | "ferry";
  title?: string;
  content?: string;
  weight?: number;
  due?: string;
  tags?: string[];
};

export type SummerMemoryItem = {
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

export type SummerWritableLayer = "mangzhong" | "xiazhi" | "xiaoshu" | "rain" | "ferry";

export type SummerState = {
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

// 开发模式按会话记在本地:切 tab、返回列表、刷新都不会自己关掉。
export type DevelopmentProject = "iooi" | "summer";
export type DevelopmentModePref = { enabled: boolean; project: DevelopmentProject };

export type ChatListTab = "chats" | "groups" | "moments";
