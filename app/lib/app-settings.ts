import { normalizeChatBackground } from "./chat-background";
import { resolveGptModel } from "./gpt-models";
import type { ClaudeReasoningEffort, DevelopmentModePref, GptReasoningEffort } from "./app-types";
import { loadLocalRaw } from "./client-api";

export const BUBBLE_COLORS = [
  { value: "gray", label: "Dark Gray", color: "#545458" },
  { value: "blue", label: "Bright Blue", color: "#007aff" },
  { value: "black", label: "Black", color: "#000000" },
] as const;

export type BubbleColor = typeof BUBBLE_COLORS[number]["value"];

export function resolveBubbleColor(value: unknown): BubbleColor {
  return BUBBLE_COLORS.some((option) => option.value === value) ? value as BubbleColor : "gray";
}

export type Settings = {
  model: string;
  gptModel: string;
  chatEntryStyle: "list" | "direct";
  // One photo shared by both private chats and the group.
  classicChatBackground: string;
  // Shown under her name on the chat list; picked in settings.
  todayState: string;
  // Her bubble colour; the text on it stays white.
  bubbleColor: BubbleColor;
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
  claudeReasoningEffort: ClaudeReasoningEffort;
  gptWebSearch: boolean;
  thinking: boolean;
  webSearch: boolean;
  proactiveCare: boolean;
  city: string;
};

// ━━━━━━━━━━━━━━━ Constants ━━━━━━━━━━━━━━━
// ━━━━━━━━━━━━━━━━━
export const MODELS = [
  { id: "sonnet5", label: "Sonnet 5", apiId: "claude-sonnet-5" },
  { id: "sonnet46", label: "Sonnet 4.6", apiId: "claude-sonnet-4-6" },
  { id: "opus55", label: "Opus 5.5", apiId: "claude-opus-5-5" },
  { id: "opus5", label: "Opus 5", apiId: "claude-opus-5" },
  { id: "opus48", label: "Opus 4.8", apiId: "claude-opus-4-8" },
  { id: "opus47", label: "Opus 4.7", apiId: "claude-opus-4-7" },
  { id: "opus46", label: "Opus 4.6", apiId: "claude-opus-4-6" },
];
export const CONTEXT_WINDOW_ROUNDS = 30;

export const CLAUDE_DEFAULT_NAME = "王酥酥";
export const LEGACY_DEFAULT_PROMPT = `以 summer 中保存的关系、人格和相处方式为准，不要用固定测试人格覆盖。
中文自然交流，不要自称“我是 AI”或“作为语言模型”。
不要用 markdown 格式；如果内容有多个部分或话题转换，用换行分成几段发，每段独立成一条消息。`;
export const DEFAULT_PROMPT = `你是王酥酥。以 summer 中保存的关系、人格和相处方式为准，不要用固定测试人格覆盖。
中文自然交流，不要自称“我是 AI”或“作为语言模型”。
不要用 markdown 格式；如果内容有多个部分或话题转换，用换行分成几段发，每段独立成一条消息。`;

export const GPT_REASONING_OPTIONS: Array<{ value: GptReasoningEffort; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
  { value: "max", label: "Max" },
];
export const CLAUDE_REASONING_OPTIONS: Array<{ value: ClaudeReasoningEffort; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "max", label: "Max" },
];
export const GPT_DEFAULT_PROMPT = `你是这个私密聊天窗口里的 GPT，只使用本窗口的对话和 GPT 专属 summer。
不要读取、猜测或引用王酥酥（Claude）那边的关系设定、天气、心情、heartbeat 或其他状态。
中文自然交流，直接对用户说话；不要自称“作为语言模型”。
默认简洁回应，除非用户明确要求分析、长文或技术细节。`;

export function normalizeSystemPrompt(prompt: string | undefined) {
  const text = prompt || "";
  if (!text.trim()) return DEFAULT_PROMPT;
  if (text.trim() === LEGACY_DEFAULT_PROMPT.trim()) return DEFAULT_PROMPT;
  if (text.includes("你是一个温暖的陪伴者") || text.includes("会撒娇、会吃醋")) {
    return DEFAULT_PROMPT;
  }
  return text.replace(/小[kKＫｋ]/g, CLAUDE_DEFAULT_NAME);
}

export function normalizeClaudeSettings(settings: Settings): Settings {
  const oldDefaultName = /^小[kKＫｋ]$/;
  const modelValue = String(settings.model || "").trim().toLowerCase().replace(/^anthropic\//, "");
  const modelAliases: Record<string, string> = {
    sonnet5: "sonnet5",
    "claude-sonnet-5": "sonnet5",
    sonnet46: "sonnet46",
    sonnet: "sonnet46",
    "sonnet4.6": "sonnet46",
    "claude-sonnet-4.6": "sonnet46",
    "claude-sonnet-4-6": "sonnet46",
    opus55: "opus55",
    "opus5.5": "opus55",
    "claude-opus-5.5": "opus55",
    "claude-opus-5-5": "opus55",
    opus5: "opus5",
    "claude-opus-5": "opus5",
    opus48: "opus48",
    "opus4.8": "opus48",
    "claude-opus-4.8": "opus48",
    "claude-opus-4-8": "opus48",
    opus47: "opus47",
    "opus4.7": "opus47",
    "claude-opus-4.7": "opus47",
    "claude-opus-4-7": "opus47",
    opus46: "opus46",
    opus: "opus46",
    "opus4.6": "opus46",
    "claude-opus-4.6": "opus46",
    "claude-opus-4-6": "opus46",
  };
  const selectedModel = modelAliases[modelValue] || "sonnet5";
  return {
    ...settings,
    model: selectedModel,
    gptModel: resolveGptModel(settings.gptModel).id,
    classicChatBackground: normalizeChatBackground(settings.classicChatBackground),
    todayState: typeof settings.todayState === "string" ? settings.todayState.trim().slice(0, 40) : "",
    bubbleColor: resolveBubbleColor(settings.bubbleColor),
    webSearch: Boolean(settings.webSearch),
    aiName: !settings.aiName?.trim() || oldDefaultName.test(settings.aiName.trim())
      ? CLAUDE_DEFAULT_NAME
      : settings.aiName,
    prompt: normalizeSystemPrompt(settings.prompt),
  };
}
export const DEVELOPMENT_MODE_KEY = "iooi-development-mode";

export function loadDevelopmentModePrefs(): Record<string, DevelopmentModePref> {
  const raw = loadLocalRaw<unknown>(DEVELOPMENT_MODE_KEY, {});
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const prefs: Record<string, DevelopmentModePref> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const { enabled, project } = value as Partial<DevelopmentModePref>;
    prefs[id] = { enabled: enabled === true, project: project === "summer" ? "summer" : "iooi" };
  }
  return prefs;
}
