"use client";

import { useEffect } from "react";
import { paintBrowserChrome } from "../ThemeProvider";

/* Shared pieces of the white love letter's chat pages. */

export const LETTER_PAPER = "#fbf8f3";

/** Paints the status bar the colour of the paper while a letter page is open. */
export function useLetterChrome(active: boolean) {
  useEffect(() => (active ? paintBrowserChrome(LETTER_PAPER) : undefined), [active]);
}

/** The only ornament in a chat room: one hairline that leaves the title,
    loops once and ends in a small rosebud near the right margin. */
export function LetterRoomFlourish() {
  return (
    <svg className="letter-room-flourish" viewBox="0 0 320 34" preserveAspectRatio="none" aria-hidden="true">
      <path className="letter-room-flourish-line" d="M2 10 C 60 4, 110 22, 168 18 C 214 15, 240 4, 262 10 C 276 14, 274 26, 262 26 C 252 26, 252 16, 266 14 C 282 12, 296 18, 304 24" />
    </svg>
  );
}

/** The writing space: a few hand-drawn hairlines around the composer, never
    quite closed (the left edge stands apart, the top line dips once). */
export function LetterComposerFrame() {
  return (
    <svg className="letter-frame-line" viewBox="0 0 320 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M4 6 C 3.5 30, 4.5 64, 4 96" />
      <path d="M12 4 C 40 2.5, 70 1, 120 1.5 C 160 1.8, 178 1.5, 190 4.5 C 198 7, 204 8.5, 222 8 C 236 7.5, 240 5, 250 4 C 270 3, 296 3.2, 316 3.4 C 316.5 30, 314 66, 311 94" />
      <path d="M10 98 C 60 99.4, 120 98.4, 180 98.6 C 240 98.8, 280 98.2, 309 97.4" />
    </svg>
  );
}

/** A small wobbly ring for each tool in the margin of the composer. */
export function LetterRing({ turn = 0 }: { turn?: number }) {
  return (
    <svg className="letter-tool-ring" viewBox="0 0 36 36" style={{ transform: `rotate(${turn}deg)` }} aria-hidden="true">
      <path d="M18 2.6 C 26.5 2.2, 33.6 8.4, 33.4 17.4 C 33.2 26.4, 27 33.4, 17.6 33.4 C 9 33.6, 2.6 27.2, 2.6 18.6 C 2.4 10, 8.6 3.4, 16.4 2.9" />
    </svg>
  );
}

/** Sending is sealing: a pressed blot of rose wax; two bars while waiting. */
export function LetterSeal({ waiting = false }: { waiting?: boolean }) {
  return (
    <svg className="letter-seal" viewBox="0 0 40 40" aria-hidden="true">
      <path className="letter-seal-wax" d="M20 2.5 C 26 3, 29 1.5, 32.5 5.5 C 36 9, 38.5 12, 37.5 19 C 38.5 25, 36.5 29.5, 33 33 C 29 37, 25 38.5, 19.5 37.5 C 14 38.5, 9.5 36.5, 6.5 33 C 3 29.5, 1.5 25, 2.5 19.5 C 1.5 14, 3.5 9.5, 7 6.5 C 10.5 3, 14.5 2, 20 2.5 Z" />
      <circle className="letter-seal-ring" cx="20" cy="20" r="11.5" />
      {waiting
        ? <path className="letter-seal-pause" d="M17 15.5v9M23 15.5v9" />
        : <text x="20" y="25.5" textAnchor="middle">i</text>}
    </svg>
  );
}

export function LetterGearIcon() {
  return (
    <svg className="letter-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9.5 3-.6 2.4-2 .9-2.3-.7L2 10l1.8 1.7v2.2L2 15.6l2.6 4.4 2.3-.7 2 .9.6 2.4h5l.6-2.4 2-.9 2.3.7 2.6-4.4-1.8-1.7v-2.2L22 10l-2.6-4.4-2.3.7-2-.9L14.5 3Z" transform="translate(0 -1) scale(1 .95)" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function LetterClipIcon() {
  return (
    <svg className="letter-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

export function LetterSmileIcon() {
  return (
    <svg className="letter-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14s1.4 2.8 4 2.8 4-2.8 4-2.8M9 9.5h.01M15 9.5h.01" />
    </svg>
  );
}

export function LetterMenuIcon() {
  return (
    <svg className="letter-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7.5h14M5 12h14M5 16.5h9" />
    </svg>
  );
}

/** A rosebud and two leaves where the flourish comes to rest. */
export function LetterRoomBud() {
  return (
    <svg className="letter-room-bud" viewBox="0 0 36 30" aria-hidden="true">
      <path className="letter-room-bud-stem" d="M4 22 C 12 22, 18 18, 22 12" />
      <path className="letter-room-bud-leaf" d="M10 22 C 12 26, 18 28, 22 26 C 19 22, 14 21, 10 22 Z" />
      <path className="letter-room-bud-leaf" d="M15 18 C 13 13, 15 9, 18 8 C 19 12, 18 16, 15 18 Z" />
      <g transform="translate(23 12) rotate(28)">
        <path className="letter-room-bud-petal" d="M0 0 C -4.5 -3, -4.5 -10, 0 -13 C 4.5 -10, 4.5 -3, 0 0 Z" />
        <path className="letter-room-bud-sepal" d="M0 0 C -3 -2, -4 -5, -4 -7.5 M0 0 C 3 -2, 4 -5, 4 -7.5" />
      </g>
    </svg>
  );
}
