"use client";

import type { ReactNode } from "react";

// ── Desktop app icons: black 1.5px lines, no fill. ──
type LineIconProps = { size?: number };
function LineIcon({ size = 26, children }: LineIconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export function IconLineChat(props: LineIconProps) {
  return <LineIcon {...props}><path d="M20.5 11.5c0 4.14-3.8 7.5-8.5 7.5a9.6 9.6 0 0 1-3.2-.54L4 20l1.2-3.6A7.06 7.06 0 0 1 3.5 11.5C3.5 7.36 7.3 4 12 4s8.5 3.36 8.5 7.5z" /></LineIcon>;
}

export function IconLineHeart(props: LineIconProps) {
  return <LineIcon {...props}><path d="M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z" /></LineIcon>;
}

export function IconLineSnowflake(props: LineIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M12 2.5v19M3.77 7.25l16.46 9.5M3.77 16.75l16.46-9.5" />
      <path d="M9.5 4.5 12 6.5l2.5-2M9.5 19.5 12 17.5l2.5 2" />
      <path d="M4.3 10.4l3.1-.6-1.1-3M19.7 13.6l-3.1.6 1.1 3" />
      <path d="M6.3 17l1.1-3-3.1-.6M17.7 7l-1.1 3 3.1.6" />
    </LineIcon>
  );
}

export function IconLineBook(props: LineIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M12 6.5C10.2 5 7.3 4.5 3 4.8v13.4c4.3-.3 7.2.2 9 1.7 1.8-1.5 4.7-2 9-1.7V4.8c-4.3-.3-7.2.2-9 1.7z" />
      <path d="M12 6.5v13.4" />
    </LineIcon>
  );
}

export function IconLineGear(props: LineIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      <circle cx="12" cy="12" r="3" />
    </LineIcon>
  );
}

/** 酥酥's summer: the diary book. */
export function IconLineDiary(props: LineIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M8 7h8M8 11h5" />
    </LineIcon>
  );
}

/** 郁郁's summer: one sheet of paper, top-right corner folded. */
export function IconLinePaper(props: LineIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M14.5 2.5H6a1.5 1.5 0 0 0-1.5 1.5v16A1.5 1.5 0 0 0 6 21.5h12a1.5 1.5 0 0 0 1.5-1.5V7.5z" />
      <path d="M14.5 2.5v5h5" />
      <path d="M8 11.5h8M8 14.5h8M8 17.5h5" />
    </LineIcon>
  );
}

export function IconBack({ size = 18 }: LineIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="14.5 5.5 8 12 14.5 18.5" />
    </svg>
  );
}
