"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

function syncBrowserChrome() {
  const root = document.documentElement;
  const color = root.dataset.chatChrome === "glass"
    ? root.style.getPropertyValue("--chat-chrome-color") || "#eee8f2"
    : root.dataset.page === "diary" ? "#ffffff" : "#f5f5f5";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    try { localStorage.removeItem("iooi-theme"); } catch { /* Appearance is fixed even without storage. */ }
    syncBrowserChrome();
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

// Extend the room backdrop to the document canvas and match browser chrome.
// iOS can still reserve a status-bar region outside the web viewport.
export function useChatBrowserChrome(active: boolean, background: string) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.dataset.chatChrome = "glass";
    root.style.setProperty("--chat-chrome-color", background ? "#606c7b" : "#eee8f2");
    root.style.setProperty("--chat-document-background", background
      ? `url("${background}")`
      : "linear-gradient(155deg, #eee8f2 0%, #f5e8ed 45%, #e3e9ee 100%)");
    syncBrowserChrome();

    let image: HTMLImageElement | undefined;
    if (background) {
      image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 4;
        const context = canvas.getContext("2d");
        if (!context || !image) return;
        context.drawImage(image, 0, 0, image.naturalWidth, Math.max(1, image.naturalHeight / 8), 0, 0, 16, 4);
        const pixels = context.getImageData(0, 0, 16, 4).data;
        const totals = [0, 0, 0];
        for (let i = 0; i < pixels.length; i += 4) {
          for (let channel = 0; channel < 3; channel++) totals[channel] += pixels[i + channel];
        }
        const color = "#" + totals.map(total => Math.round(total / 64).toString(16).padStart(2, "0")).join("");
        root.style.setProperty("--chat-chrome-color", color);
        syncBrowserChrome();
      };
      image.src = background;
    }

    return () => {
      if (image) image.onload = null;
      delete root.dataset.chatChrome;
      root.style.removeProperty("--chat-chrome-color");
      root.style.removeProperty("--chat-document-background");
      syncBrowserChrome();
    };
  }, [active, background]);
}
