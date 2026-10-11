"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { installCuteFx } from "../lib/cute-fx";

// Most pages are gray; only the sky screens (desktop, blog) are blue on top.
const PAGE_GRAY = "#e8e8e8";
const SKY_TOP = "#5cbcff";

// Screens that want another color at the top push it here; the latest wins.
const chromeLayers: string[] = [];

function syncBrowserChrome() {
  const color = chromeLayers.at(-1);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color ?? PAGE_GRAY);
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
