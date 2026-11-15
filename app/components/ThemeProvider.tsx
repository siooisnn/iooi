"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { installCuteFx } from "../lib/cute-fx";
import { DEFAULT_THEME, isTheme, THEME_STORAGE_KEY } from "../lib/theme";
import type { Theme } from "../lib/theme";

const PAGE_GRAY = "#e8e8e8";
const SKY_TOP = "#5cbcff";

type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}

// Screens that want another color at the top push it here; the latest wins.
const chromeLayers: string[] = [];

function syncBrowserChrome() {
  const color = chromeLayers.at(-1);
  const pageColor = PAGE_GRAY;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color ?? pageColor);
  for (const node of [document.documentElement, document.body]) {
    if (color) node.style.backgroundColor = color;
    else node.style.removeProperty("background-color");
  }
}

/** iOS fills the status bar strip with the page/theme color, so a screen
 *  whose top is not the page gray repaints it while it is shown. The
 *  returned function takes the color back off. */
export function paintBrowserChrome(color: string) {
  chromeLayers.push(color);
  syncBrowserChrome();
  return () => {
    const index = chromeLayers.lastIndexOf(color);
    if (index >= 0) chromeLayers.splice(index, 1);
    syncBrowserChrome();
  };
}

/** Rendered inside a sky-wallpaper screen: the status bar matches its top. */
export function SkyChrome() {
  useEffect(() => paintBrowserChrome(SKY_TOP), []);
  return null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  // Once something picks a theme (her tap, or the copy saved on the server),
  // the first-frame read of the browser's storage must not undo it.
  const picked = useRef(false);

  const setTheme = useCallback((next: Theme) => {
    picked.current = true;
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* The theme still applies without storage. */ }
    setThemeState(next);
    syncBrowserChrome();
  }, []);

  useEffect(() => {
    let initial: Theme = DEFAULT_THEME;
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (isTheme(stored)) initial = stored;
      localStorage.removeItem("iooi-status-bar-clearance"); // retired tuning slider
    } catch { /* The default theme applies without storage. */ }
    if (!picked.current) document.documentElement.dataset.theme = initial;
    syncBrowserChrome();
    const frame = window.requestAnimationFrame(() => { if (!picked.current) setThemeState(initial); });
    const removeCuteFx = installCuteFx();
    return () => {
      window.cancelAnimationFrame(frame);
      removeCuteFx();
    };
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePage(page: "home" | "chat" | "diary" | "settings") {
  useEffect(() => {
    document.documentElement.dataset.page = page;
    syncBrowserChrome();
    return () => {
      delete document.documentElement.dataset.page;
      syncBrowserChrome();
    };
  }, [page]);
}
