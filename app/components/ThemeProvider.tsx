"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { installCuteFx } from "../lib/cute-fx";

function syncBrowserChrome() {
  // Match the top of the blog's shared sky wallpaper.
  const color = "#5cbcff";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    try {
      localStorage.removeItem("iooi-theme");
      localStorage.removeItem("iooi-status-bar-clearance"); // retired tuning slider
    } catch { /* Appearance is fixed even without storage. */ }
    syncBrowserChrome();
    return installCuteFx();
  }, []);
  return children;
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
