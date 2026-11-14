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
