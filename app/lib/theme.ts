export type Theme = "warm" | "white-pink";

export const THEME_STORAGE_KEY = "iooi-theme";
export const THEME_COLORS: Record<Theme, string> = {
  warm: "#fefbf8",
  "white-pink": "#f5f5f5",
};

export function normalizeTheme(value: string | null): Theme {
  return value === "white-pink" ? "white-pink" : "warm";
}

// Runs in the head before the page is painted; only our two known values are used.
export const THEME_INIT_SCRIPT = `(() => {
  let theme = "warm";
  try { if (localStorage.getItem("${THEME_STORAGE_KEY}") === "white-pink") theme = "white-pink"; } catch {}
  document.documentElement.dataset.theme = theme;
})()`;
