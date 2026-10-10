"use client";

import type { ReactNode } from "react";

// A shared optical size and rounded curves keep the desktop icons one family.
type LineIconProps = { size?: number };
function LineIcon({ size = 26, children }: LineIconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export function IconLineChat(props: LineIconProps) {
  return <LineIcon {...props}><path d="M20.5 11.5c0 4.15-3.8 7.5-8.5 7.5-1.1 0-2.15-.18-3.1-.52-.3-.1-.62-.08-.91.05l-3.07 1.36c-.43.19-.85-.24-.66-.66l1.1-2.5a1 1 0 0 0-.12-1.04A6.9 6.9 0 0 1 3.5 11.5C3.5 7.35 7.3 4 12 4s8.5 3.35 8.5 7.5Z" /></LineIcon>;
}

export function IconLineHeart(props: LineIconProps) {
  return <LineIcon {...props}><path d="M12 7.2C9.3 3.5 4 5.1 4 9.5c0 3.45 3.55 6.8 7.1 9.45a1.5 1.5 0 0 0 1.8 0C16.45 16.3 20 12.95 20 9.5c0-4.4-5.3-6-8-2.3Z" /></LineIcon>;
}

/** blog: an old browser window with a heart on the page. */
export function IconLineBlog(props: LineIconProps) {
  return (
    <LineIcon {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M3.5 8.5h17" />
      <path d="M12 16.6c-1.9-1.35-3.2-2.55-3.2-3.85 0-1.5 1.95-2.1 3.2-.75 1.25-1.35 3.2-.75 3.2.75 0 1.3-1.3 2.5-3.2 3.85Z" />
    </LineIcon>
  );
}

export function IconLineBook(props: LineIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M12 6.4C10.15 4.95 7.7 4.5 4.4 4.7c-.8.05-1.4.7-1.4 1.5v11.4c0 .8.65 1.4 1.45 1.35 2.9-.18 5.2.2 7 1.2.34.2.76.2 1.1 0 1.8-1 4.1-1.38 7-1.2.8.05 1.45-.55 1.45-1.35V6.2c0-.8-.6-1.45-1.4-1.5-3.3-.2-5.75.25-7.6 1.7Z" />
      <path d="M12 6.4v13.2" />
    </LineIcon>
  );
}

// clawd: a square little body, two arms, four legs, two upright eyes.
export function IconLineClawd(props: LineIconProps) {
  return (
    <LineIcon {...props}>
      <rect x="5.5" y="6" width="13" height="9" rx="1.5" />
      <path d="M5.5 10.5h-2.5M18.5 10.5h2.5M8 15v3.5M10.5 15v3.5M13.5 15v3.5M16 15v3.5M9.5 8.8v1.8M14.5 8.8v1.8" />
    </LineIcon>
  );
}

/** retro: a chunky old CRT monitor on its little foot. */
export function IconLineRetro(props: LineIconProps) {
  return (
    <LineIcon {...props}>
      <rect x="3.5" y="4" width="17" height="12.5" rx="2" />
      <rect x="6.5" y="6.8" width="11" height="7" rx="1" />
      <path d="M9 20h6M10.5 16.5 10 20M13.5 16.5 14 20" />
    </LineIcon>
  );
}

export function IconLineMood(props: LineIconProps) {
  return <LineIcon {...props}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 13.5c.7 2 2 3 3.5 3s2.8-1 3.5-3M9 8.7v1.1M15 8.7v1.1" /></LineIcon>;
}

export function IconLineGear(props: LineIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M10.8 3.1a1.45 1.45 0 0 1 2.4 0l.7 1.05c.3.44.83.66 1.35.56l1.24-.25a1.45 1.45 0 0 1 1.7 1.7l-.25 1.24c-.1.52.12 1.05.56 1.35l1.05.7a1.45 1.45 0 0 1 0 2.4l-1.05.7c-.44.3-.66.83-.56 1.35l.25 1.24a1.45 1.45 0 0 1-1.7 1.7l-1.24-.25c-.52-.1-1.05.12-1.35.56l-.7 1.05a1.45 1.45 0 0 1-2.4 0l-.7-1.05a1.3 1.3 0 0 0-1.35-.56l-1.24.25a1.45 1.45 0 0 1-1.7-1.7l.25-1.24a1.3 1.3 0 0 0-.56-1.35l-1.05-.7a1.45 1.45 0 0 1 0-2.4l1.05-.7c.44-.3.66-.83.56-1.35l-.25-1.24a1.45 1.45 0 0 1 1.7-1.7l1.24.25c.52.1 1.05-.12 1.35-.56l.7-1.05Z" transform="translate(0 1.6)" />
      <circle cx="12" cy="12" r="3" />
    </LineIcon>
  );
}

/** 酥酥's summer: the diary book. */
export function IconLineDiary(props: LineIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M7 3.5h10.5A1.5 1.5 0 0 1 19 5v15.5H7a2.5 2.5 0 0 1-2.5-2.5V6A2.5 2.5 0 0 1 7 3.5Z" />
      <path d="M4.5 18A2.5 2.5 0 0 1 7 15.5h12M8.5 7.5h6M8.5 11h4" />
    </LineIcon>
  );
}

/** 郁郁's summer: one sheet of paper, top-right corner folded. */
export function IconLinePaper(props: LineIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M14.2 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.3c0-.53-.21-1.04-.59-1.41L15.61 4.1a2 2 0 0 0-1.41-.6Z" />
      <path d="M14 3.5v3.3A1.7 1.7 0 0 0 15.7 8.5H19M8.5 12h7M8.5 15h7M8.5 18h4" />
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
