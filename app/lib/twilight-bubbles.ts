export const TWILIGHT_BUBBLE_COLORS = [
  { value: "rose", label: "玫瑰粉", color: "#b44c73", ink: "#fff" },
  { value: "blue", label: "雾蓝", color: "#3979a8", ink: "#fff" },
  { value: "sage", label: "鼠尾草绿", color: "#527b69", ink: "#fff" },
  { value: "lilac", label: "丁香紫", color: "#8064a2", ink: "#fff" },
  { value: "caramel", label: "焦糖棕", color: "#946548", ink: "#fff" },
  { value: "bright-blue", label: "亮蓝", color: "#007aff", ink: "#fff" },
] as const;

export type TwilightBubbleColor = typeof TWILIGHT_BUBBLE_COLORS[number]["value"];

export function resolveTwilightBubbleColor(
  value: unknown,
  fallback: TwilightBubbleColor = "rose",
): TwilightBubbleColor {
  return TWILIGHT_BUBBLE_COLORS.some((option) => option.value === value)
    ? value as TwilightBubbleColor
    : fallback;
}
