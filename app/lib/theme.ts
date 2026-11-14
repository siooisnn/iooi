export const THEME_STORAGE_KEY = "iooi-theme";
export const DEFAULT_THEME = "white-pink";

export const THEME_OPTIONS = [
  { id: "white-pink", label: "经典 XP", description: "回到熟悉的复古小窝" },
  { id: "rococo", label: "洛可可情书", description: "雾蓝、冷白与古典情书" },
  // Only the home page changes; every other page keeps the classic XP styles.
  { id: "letter", label: "白色情书", description: "首页、聊天列表和对话页是同一封信，其余页面保持经典 XP" },
] as const;

export type Theme = (typeof THEME_OPTIONS)[number]["id"];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEME_OPTIONS.some((option) => option.id === value);
}

export const THEME_INIT_SCRIPT = `try{const theme=localStorage.getItem("${THEME_STORAGE_KEY}");if(${JSON.stringify(THEME_OPTIONS.map((option) => option.id))}.includes(theme))document.documentElement.dataset.theme=theme;}catch{}`;
