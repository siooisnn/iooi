export const THEME_STORAGE_KEY = "iooi-theme";
export const DEFAULT_THEME = "white-pink";

export const THEME_OPTIONS = [
  { id: "white-pink", label: "XP", description: "回到熟悉的复古小窝" },
  { id: "letter", label: "Letter", description: "首页、聊天列表和对话页是同一封信，其余页面保持经典 XP" },
] as const;

export type Theme = (typeof THEME_OPTIONS)[number]["id"];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEME_OPTIONS.some((option) => option.id === value);
}

export const THEME_INIT_SCRIPT = `try{const theme=localStorage.getItem("${THEME_STORAGE_KEY}");if(${JSON.stringify(THEME_OPTIONS.map((option) => option.id))}.includes(theme))document.documentElement.dataset.theme=theme;}catch{}`;
