"use client";

import { useCallback, useEffect, useRef } from "react";

type StoredScrollPosition = {
  top: number;
  atBottom: boolean;
  source: "background";
};

const BOTTOM_THRESHOLD = 72;

function readStoredPosition(storageKey: string): StoredScrollPosition | null {
  try {
    const value = localStorage.getItem(storageKey);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<StoredScrollPosition>;
    if (typeof parsed.top !== "number" || typeof parsed.atBottom !== "boolean" || parsed.source !== "background") return null;
    return { top: Math.max(0, parsed.top), atBottom: parsed.atBottom, source: "background" };
  } catch {
    return null;
  }
}

function clearStoredPosition(storageKey: string) {
  try {
    localStorage.removeItem(storageKey);
  } catch {}
}

function isNearBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_THRESHOLD;
}

export function useChatScrollPosition(storageKey: string, messageCount: number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const stickToBottomRef = useRef(true);
  const pageHiddenRef = useRef(false);

  const saveNow = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        top: element.scrollTop,
        atBottom: isNearBottom(element),
        source: "background",
      } satisfies StoredScrollPosition));
    } catch {}
  }, [storageKey]);

  const handleScroll = useCallback(() => {
    if (!restoredRef.current || !scrollRef.current) return;
    stickToBottomRef.current = isNearBottom(scrollRef.current);
  }, []);

  const followLatest = useCallback(() => {
    stickToBottomRef.current = true;
    const element = scrollRef.current;
    if (!element) return;
    requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
  }, []);

  useEffect(() => {
    restoredRef.current = false;
    const stored = readStoredPosition(storageKey);
    clearStoredPosition(storageKey);
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (!element) return;
      const restore = () => {
        if (stored && !stored.atBottom) {
          element.scrollTop = stored.top;
          stickToBottomRef.current = false;
        } else {
          element.scrollTop = element.scrollHeight;
          stickToBottomRef.current = true;
        }
      };
      restore();
      secondFrame = requestAnimationFrame(() => {
        restore();
        restoredRef.current = true;
      });
    });

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        pageHiddenRef.current = true;
        saveNow();
      } else {
        pageHiddenRef.current = false;
        clearStoredPosition(storageKey);
      }
    };
    const handlePageHide = () => {
      pageHiddenRef.current = true;
      saveNow();
    };
    const handlePageShow = () => {
      pageHiddenRef.current = false;
      clearStoredPosition(storageKey);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      if (pageHiddenRef.current || document.visibilityState === "hidden") saveNow();
      else clearStoredPosition(storageKey);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [saveNow, storageKey]);

  useEffect(() => {
    if (!restoredRef.current || !stickToBottomRef.current) return;
    const frame = requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (!element) return;
      element.scrollTop = element.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messageCount]);

  return { scrollRef, handleScroll, followLatest };
}
