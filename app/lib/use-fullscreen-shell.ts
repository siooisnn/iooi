"use client";

import { useEffect } from "react";
import type { RefObject } from "react";

// Home, chat list, summer and settings fill the whole screen like 暮光 rooms:
// the title floats over the page and the tab bar floats as a glass pill. Each
// page swaps in its own header, so the shell keeps measuring whichever header
// and tab bar are currently mounted and exposes their heights to the CSS.
export function useFullscreenShell(enabled: boolean, containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;

    let frame = 0;
    let header: Element | null = null;
    let nav: Element | null = null;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; update(); });
    };
    const resize = new ResizeObserver(schedule);
    const update = () => {
      const nextHeader = container.querySelector(":scope > .chat-header");
      const nextNav = container.querySelector(":scope > .bottom-nav");
      // Only re-observe when the element changed, otherwise observe() would
      // fire another resize callback and keep the loop spinning.
      if (nextHeader !== header || nextNav !== nav) {
        resize.disconnect();
        header = nextHeader;
        nav = nextNav;
        if (header) resize.observe(header, { box: "border-box" });
        if (nav) resize.observe(nav, { box: "border-box" });
      }
      // Measured from the page edges: the tab bar floats above the bottom
      // edge, so its own height is not the space it covers.
      const box = container.getBoundingClientRect();
      const headerSpace = header ? Math.max(0, Math.ceil(header.getBoundingClientRect().bottom - box.top)) : 0;
      const navSpace = nav ? Math.max(0, Math.ceil(box.bottom - nav.getBoundingClientRect().top)) : 0;
      container.style.setProperty("--shell-header-space", `${headerSpace}px`);
      container.style.setProperty("--shell-nav-space", `${navSpace}px`);
    };

    update();
    const mutations = new MutationObserver(schedule);
    mutations.observe(container, { childList: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("pageshow", schedule);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pageshow", schedule);
      container.style.removeProperty("--shell-header-space");
      container.style.removeProperty("--shell-nav-space");
    };
  }, [enabled, containerRef]);
}
