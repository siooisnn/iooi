"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

function watchTwilightBubbles(messages: HTMLElement) {
  const bubbles = new Set<HTMLElement>();
  const shapes = new WeakMap<HTMLElement, string>();
  const draw = (bubble: HTMLElement) => {
    const bounds = bubble.getBoundingClientRect();
    const width = Math.round(bounds.width * 100) / 100;
    const height = Math.round(bounds.height * 100) / 100;
    if (!width || !height) return;
    const tail = !bubble.closest(".msg-row-compact-bottom");
    const signature = `${width}:${height}:${tail}`;
    if (shapes.get(bubble) === signature) return;
    shapes.set(bubble, signature);

    const right = width + 6;
    const bottom = height + 3;
    const radius = Math.min(22, width / 2, height / 2);
    // A single closed path avoids an antialiased gap where a separate tail
    // touches a rounded body. Pixel dimensions keep every corner equally round.
    const path = `M${6 + radius} 0H${right - radius}A${radius} ${radius} 0 0 1 ${right} ${radius}`
      + `V${height - radius}A${radius} ${radius} 0 0 1 ${right - radius} ${height}H${6 + radius}`
      + (tail
        ? `C${6 + radius * 0.6} ${height} 8 ${bottom} 1 ${bottom}Q0.1 ${bottom} 1 ${bottom - 1}`
          + `C5 ${height - 2} 6 ${height - 7} 6 ${height - 14}`
        : `A${radius} ${radius} 0 0 1 6 ${height - radius}`)
      + `V${radius}A${radius} ${radius} 0 0 1 ${6 + radius} 0Z`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width + 12} ${bottom}"><path fill="black" d="${path}"/></svg>`;
    bubble.style.setProperty("--chat-bubble-mask", `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
  };
  const resize = new ResizeObserver((entries) => {
    for (const entry of entries) draw(entry.target as HTMLElement);
  });
  const sync = () => {
    const current = new Set(messages.querySelectorAll<HTMLElement>(".msg-bubble:not(.msg-bubble-summer-utility)"));
    for (const bubble of bubbles) {
      if (current.has(bubble)) continue;
      resize.unobserve(bubble);
      bubble.style.removeProperty("--chat-bubble-mask");
      bubbles.delete(bubble);
      shapes.delete(bubble);
    }
    for (const bubble of current) {
      if (bubbles.has(bubble)) continue;
      bubbles.add(bubble);
      draw(bubble);
      resize.observe(bubble, { box: "border-box" });
    }
  };
  const mutations = new MutationObserver((records) => {
    if (records.some((record) => record.type === "childList")) sync();
    for (const record of records) {
      if (record.type !== "attributes" || !(record.target instanceof HTMLElement)) continue;
      if (record.target.matches(".msg-bubble")) sync();
      for (const bubble of record.target.querySelectorAll<HTMLElement>(".msg-bubble:not(.msg-bubble-summer-utility)")) draw(bubble);
    }
  });
  sync();
  mutations.observe(messages, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  return () => {
    resize.disconnect();
    mutations.disconnect();
    for (const bubble of bubbles) bubble.style.removeProperty("--chat-bubble-mask");
  };
}

// The message scroller fills the room; only its first/last content reserves
// space for the floating controls. Insets follow safe areas and textarea growth.
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
      app.style.setProperty("--twilight-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      app.style.setProperty("--twilight-viewport-top", `${viewport?.offsetTop ?? 0}px`);
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
    const stopBubbles = watchTwilightBubbles(messages);
    const observer = new ResizeObserver(schedule);
    observer.observe(header, { box: "border-box" });
    observer.observe(footer, { box: "border-box" });
    observer.observe(room, { box: "border-box" });
    window.addEventListener("resize", schedule);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      stopBubbles();
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      room.style.removeProperty("--twilight-header-space");
      room.style.removeProperty("--twilight-footer-space");
      app.style.removeProperty("--twilight-viewport-height");
      app.style.removeProperty("--twilight-viewport-top");
    };
  }, [enabled, scrollRef]);
}
