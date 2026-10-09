"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

// The message scroller fills the room behind the floating controls. Its final
// spacer follows safe areas and textarea growth; top padding clears the header.
export function useTwilightLayout(enabled: boolean, scrollRef: RefObject<HTMLElement | null>) {
  const followingBottom = useRef(true);
  useEffect(() => {
    const messages = scrollRef.current;
    if (!messages) return;
    const track = () => {
      followingBottom.current = messages.scrollHeight - messages.scrollTop - messages.clientHeight <= 72;
    };
    track();
    messages.addEventListener("scroll", track);
    return () => messages.removeEventListener("scroll", track);
  }, [scrollRef]);

  useEffect(() => {
    if (!enabled) return;
    const messages = scrollRef.current;
    const room = messages?.closest<HTMLElement>(".chat-container");
    const app = room?.closest<HTMLElement>(".app-bg");
    const header = room?.querySelector<HTMLElement>(".chat-header");
    const footer = room?.querySelector<HTMLElement>(".chat-footer");
    if (!messages || !room || !app || !header || !footer) return;

    let frame = 0;
    let previousHeader: number | null = null;
    const viewport = window.visualViewport;
    const update = () => {
      const atBottom = previousHeader === null ? followingBottom.current
        : messages.scrollHeight - messages.scrollTop - messages.clientHeight <= 72;
      const visualHeight = viewport?.height ?? window.innerHeight;
      const standalone = window.matchMedia("(display-mode: standalone)").matches
        || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const landscape = window.screen.orientation?.type.startsWith("landscape")
        ?? window.innerWidth > window.innerHeight;
      const screenHeight = landscape
        ? Math.min(window.screen.width, window.screen.height)
        : Math.max(window.screen.width, window.screen.height);
      const fullHeight = Math.max(window.innerHeight, document.documentElement.clientHeight, ios && standalone ? screenHeight : 0);
      // iOS standalone can initially report a visual viewport that omits the
      // bottom safe area. Keep keyboard resizing, but fill the screen at rest.
      const keyboardOpen = fullHeight - visualHeight > 150;
      app.style.setProperty("--twilight-viewport-height", `${ios && standalone && !keyboardOpen ? fullHeight : visualHeight}px`);
      app.style.setProperty("--twilight-viewport-top", `${ios && standalone && !keyboardOpen ? 0 : viewport?.offsetTop ?? 0}px`);
      const top = Math.ceil(header.getBoundingClientRect().height);
      const bottom = Math.ceil(footer.getBoundingClientRect().height);
      room.style.setProperty("--twilight-header-space", `${top}px`);
      room.style.setProperty("--twilight-footer-space", `${bottom}px`);
      const headerShift = previousHeader === null ? 0 : top - previousHeader;
      if (atBottom || headerShift !== 0) {
        // Layout corrections must finish before the next resize observation;
        // otherwise a smooth scroll can be mistaken for reading older messages.
        const behavior = messages.style.scrollBehavior;
        messages.style.scrollBehavior = "auto";
        if (atBottom) messages.scrollTop = messages.scrollHeight;
        else messages.scrollTop += headerShift;
        messages.style.scrollBehavior = behavior;
      }
      previousHeader = top;
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; update(); });
    };
    update();
    const observer = new ResizeObserver(schedule);
    observer.observe(header, { box: "border-box" });
    observer.observe(footer, { box: "border-box" });
    observer.observe(room, { box: "border-box" });
    window.addEventListener("resize", schedule);
    window.addEventListener("pageshow", schedule);
    document.addEventListener("visibilitychange", schedule);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    const settleTimers = [250, 1000].map((delay) => setTimeout(schedule, delay));
    return () => {
      cancelAnimationFrame(frame);
      settleTimers.forEach(clearTimeout);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pageshow", schedule);
      document.removeEventListener("visibilitychange", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      room.style.removeProperty("--twilight-header-space");
      room.style.removeProperty("--twilight-footer-space");
      app.style.removeProperty("--twilight-viewport-height");
      app.style.removeProperty("--twilight-viewport-top");
    };
  }, [enabled, scrollRef]);
}
