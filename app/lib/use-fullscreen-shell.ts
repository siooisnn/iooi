"use client";

import { useEffect } from "react";
import type { RefObject } from "react";

// The desktop and its app pages fill the whole screen like 暮光 rooms, and on
// every app page the round ‹ floats at the bottom right. Each page mounts its
// own, so the shell keeps measuring whichever header (if any) and ‹ are
// currently mounted and exposes the space they cover to the CSS.
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
      const nextNav = container.querySelector(":scope > .page-back-float");
      // Only re-observe when the element changed, otherwise observe() would
      // fire another resize callback and keep the loop spinning.
      if (nextHeader !== header || nextNav !== nav) {
        resize.disconnect();
        header = nextHeader;
        nav = nextNav;
        if (header) resize.observe(header, { box: "border-box" });
        if (nav) resize.observe(nav, { box: "border-box" });
      }
      // Measured from the page edges: the ‹ floats above the bottom edge, so
      // its own height is not the space it covers.
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
