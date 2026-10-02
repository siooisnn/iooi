// Solid bubble colours. Saturated ones carry white text; pale ones carry a
// deep same-hue ink so they stay soft on light backgrounds.
export const TWILIGHT_BUBBLE_COLORS = [
  { value: "bright-blue", label: "亮蓝", color: "#007aff", ink: "#fff" },
  { value: "berry", label: "莓果粉", color: "#e8457c", ink: "#fff" },
  { value: "grape", label: "葡萄紫", color: "#7a5af8", ink: "#fff" },
  { value: "leaf", label: "青草绿", color: "#1e9a5a", ink: "#fff" },
  { value: "sakura", label: "樱花粉", color: "#ffd2e0", ink: "#5c2a3d" },
  { value: "sky", label: "天空蓝", color: "#cfe5ff", ink: "#1b3a5e" },
  { value: "butter", label: "奶油黄", color: "#fff0b3", ink: "#5a4614" },
] as const;

export type TwilightBubbleColor = typeof TWILIGHT_BUBBLE_COLORS[number]["value"];

// Earlier muted (Morandi) choices map onto their closest clear colour.
const LEGACY_BUBBLE_COLORS: Record<string, TwilightBubbleColor> = {
  rose: "berry",
  blue: "bright-blue",
  sage: "leaf",
  lilac: "grape",
  caramel: "sakura",
};

export function resolveTwilightBubbleColor(
  value: unknown,
  fallback: TwilightBubbleColor = "berry",
): TwilightBubbleColor {
  if (typeof value === "string" && LEGACY_BUBBLE_COLORS[value]) return LEGACY_BUBBLE_COLORS[value];
  return TWILIGHT_BUBBLE_COLORS.some((option) => option.value === value)
    ? value as TwilightBubbleColor
    : fallback;
}

// 浅色: white frosted bars with dark ink. 深色: black frosted bars with white ink.
// The tone only affects the header/footer bars, never the bubbles or panels.
export const TWILIGHT_TONES = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
] as const;

export type TwilightTone = typeof TWILIGHT_TONES[number]["value"];

export function resolveTwilightTone(value: unknown, fallback: TwilightTone = "dark"): TwilightTone {
  return value === "light" || value === "dark" ? value : fallback;
}

// The AI bubble, used on both tones (浅色/深色 only change the bars). The
// time and date stamps follow the same choice so they match the bubbles.
export const TWILIGHT_AI_BUBBLES = [
  // The cream stamp is paler and lighter-inked than the bubble so it stays soft.
  { value: "cream", label: "奶白", color: "#fbf3e8", ink: "#4a3628", stamp: "rgba(255, 251, 245, 0.78)", stampInk: "#8a7567" },
  { value: "white", label: "白底", color: "#ffffff", ink: "#1c1c1e", stamp: "rgba(255, 255, 255, 0.94)", stampInk: "#1c1c1e" },
] as const;

export type TwilightAiBubble = typeof TWILIGHT_AI_BUBBLES[number]["value"];

export function resolveTwilightAiBubble(value: unknown): TwilightAiBubble {
  return value === "white" ? "white" : "cream";
}

// Glass strength is a 0–100 slider; 50 keeps the original 暮光 blur.
export const DEFAULT_TWILIGHT_GLASS = 50;

export function resolveTwilightGlass(value: unknown): number {
  const number = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : DEFAULT_TWILIGHT_GLASS;
}

export function twilightGlassScale(value: number): string {
  return String(resolveTwilightGlass(value) / DEFAULT_TWILIGHT_GLASS);
}
