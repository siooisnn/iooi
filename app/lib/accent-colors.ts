// 经典 theme colour (设置 → 外观 → 主题色). "pink" is the original pale-bubble
// look; the others are 暮光's clear colours, with her bubble in the full colour
// and white text. The palettes live in app/themes/white-pink.css.
export const ACCENT_COLORS = [
  { value: "pink", label: "淡粉", color: "#e44883" },
  { value: "bright-blue", label: "亮蓝", color: "#007aff" },
  { value: "berry", label: "莓果粉", color: "#e8457c" },
  { value: "grape", label: "葡萄紫", color: "#7a5af8" },
  { value: "leaf", label: "青草绿", color: "#1e9a5a" },
] as const;

export type AccentColor = typeof ACCENT_COLORS[number]["value"];

export function resolveAccentColor(value: unknown): AccentColor {
  return ACCENT_COLORS.some((option) => option.value === value) ? value as AccentColor : "pink";
}

export function accentColorLabel(value: AccentColor): string {
  return ACCENT_COLORS.find((option) => option.value === value)?.label ?? "淡粉";
}
