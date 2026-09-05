"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { normalizeTheme, THEME_COLORS, THEME_STORAGE_KEY } from "../lib/theme";
import type { Theme } from "../lib/theme";

const THEME_EVENT = "iooi-theme-change";
const ThemeContext = createContext<Theme>("warm");

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  syncBrowserChrome();
}

function syncBrowserChrome() {
  const root = document.documentElement;
  const theme = normalizeTheme(root.dataset.theme ?? null);
  const color = theme === "white-pink" && root.dataset.page === "diary"
    ? "#ffffff"
    : THEME_COLORS[theme];
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

function subscribe(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.storageArea === localStorage && (event.key === THEME_STORAGE_KEY || event.key === null)) {
      applyTheme(normalizeTheme(event.newValue));
      onChange();
    }
  }
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  return normalizeTheme(document.documentElement.dataset.theme ?? null);
}

function getServerSnapshot(): Theme {
  return "warm";
}

export function setTheme(theme: Theme) {
  applyTheme(theme);
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Still switch when storage is unavailable. */ }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    syncBrowserChrome();
  }, [theme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
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
