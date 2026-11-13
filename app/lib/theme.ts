export const THEME_STORAGE_KEY = "iooi-theme";
export const DEFAULT_THEME = "white-pink";

export const THEME_OPTIONS = [
  { id: "white-pink", label: "经典 XP", description: "回到熟悉的复古小窝" },
  { id: "rococo", label: "洛可可情书", description: "花体、藤蔓与法式婚礼手账" },
] as const;

export type Theme = (typeof THEME_OPTIONS)[number]["id"];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEME_OPTIONS.some((option) => option.id === value);
}

export const THEME_INIT_SCRIPT = `try{const theme=localStorage.getItem("${THEME_STORAGE_KEY}");if(theme==="white-pink"||theme==="rococo")document.documentElement.dataset.theme=theme;}catch{}`;
