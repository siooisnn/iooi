export const THEME_STORAGE_KEY = "iooi-theme";
export const DEFAULT_THEME = "white-pink";

export const THEME_OPTIONS = [
  { id: "white-pink", label: "经典灰白", description: "干净、安静的原始小窝" },
  { id: "white-wedding", label: "白色婚礼", description: "珍珠白、香槟金与白纱拱门" },
] as const;

export type Theme = (typeof THEME_OPTIONS)[number]["id"];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEME_OPTIONS.some((option) => option.id === value);
}

export const THEME_INIT_SCRIPT = `try{const theme=localStorage.getItem("${THEME_STORAGE_KEY}");if(theme==="white-pink"||theme==="white-wedding")document.documentElement.dataset.theme=theme;}catch{}`;
