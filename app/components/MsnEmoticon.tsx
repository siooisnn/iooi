"use client";

import { useId } from "react";
import type { ReactNode } from "react";

/* MSN Messenger 7-style emoticons for the XP mood window: a glossy yellow
   face with a dark outline, 19px-ish, the way :) (H) 8-| |-) looked in 2007.
   Each DAILY_MOODS value gets its own; a custom mood falls back to :). */

const INK = "#3b2a00";

function Face({ id, children }: { id: string; children: ReactNode }) {
  return (
    <>
      <defs>
        <radialGradient id={id} cx="38%" cy="30%" r="72%">
          <stop stopColor="#fff7b0" />
          <stop offset=".55" stopColor="#ffd83a" />
          <stop offset="1" stopColor="#efa800" />
        </radialGradient>
      </defs>
      <circle cx="10" cy="10.5" r="8.8" fill={`url(#${id})`} stroke="#9a6400" strokeWidth=".9" />
      <ellipse cx="7.2" cy="5.4" rx="3.6" ry="1.7" fill="#fff" opacity=".7" transform="rotate(-18 7.2 5.4)" />
      {children}
    </>
  );
}

const eyes = (
  <g fill={INK}>
    <ellipse cx="7" cy="8.6" rx=".95" ry="1.5" />
    <ellipse cx="13" cy="8.6" rx=".95" ry="1.5" />
  </g>
);

const line = { fill: "none", stroke: INK, strokeWidth: 1.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function art(mood: string, id: string): ReactNode {
  switch (mood) {
    case "happy": // :D
      return (
        <Face id={id}>
          {eyes}
          <path d="M5.4 11.6h9.2c0 2.9-2 4.8-4.6 4.8s-4.6-1.9-4.6-4.8z" fill="#fff" stroke={INK} strokeWidth=".9" strokeLinejoin="round" />
          <path d="M7.2 14.9c.8.9 1.8 1.4 2.8 1.4s2-.5 2.8-1.4" fill="#e8584a" />
        </Face>
      );
    case "lucky": // a four-leaf clover
      return (
        <>
          <defs>
            <radialGradient id={id} cx="35%" cy="30%" r="75%">
              <stop stopColor="#d8ffa8" />
              <stop offset=".55" stopColor="#63c83a" />
              <stop offset="1" stopColor="#2b8a1a" />
            </radialGradient>
          </defs>
          <path d="M10.2 10.6c.6 3.2 1.8 5.8 4.4 8" fill="none" stroke="#2f7a1a" strokeWidth="1.5" strokeLinecap="round" />
          <g fill={`url(#${id})`} stroke="#1d5a12" strokeWidth=".8">
            <circle cx="6.9" cy="6.6" r="3.5" />
            <circle cx="13.3" cy="6.6" r="3.5" />
            <circle cx="6.9" cy="13" r="3.5" />
            <circle cx="13.3" cy="13" r="3.5" />
          </g>
          <circle cx="10.1" cy="9.8" r="1.3" fill="#3f9a26" />
          <g fill="#fff" opacity=".7">
            <ellipse cx="5.9" cy="5.3" rx="1.5" ry=".8" />
            <ellipse cx="12.3" cy="5.3" rx="1.5" ry=".8" />
          </g>
        </>
      );
    case "chill": // (H): the sunglasses one
      return (
        <Face id={id}>
          <g fill="#1d1d1d">
            <rect x="3.8" y="6.6" width="5.3" height="3.4" rx="1.3" />
            <rect x="10.9" y="6.6" width="5.3" height="3.4" rx="1.3" />
          </g>
          <path d="M9 7.4h2M3.4 7.2 2.2 6.6M16.6 7.2l1.2-.6" stroke="#1d1d1d" strokeWidth="1" strokeLinecap="round" />
          <path d="M4.9 7.6l1.4-.1M12 7.6l1.4-.1" stroke="#fff" strokeWidth=".7" strokeLinecap="round" opacity=".8" />
          <path d="M6.6 12.9c1.3 1.7 2.6 2.3 4 2.1 1.2-.2 2.2-.9 3-2.3" {...line} />
        </Face>
      );
    case "busy": // a sweat drop and a wobbly mouth
      return (
        <Face id={id}>
          {eyes}
          <path d="M6.4 13.8q1.2-1 2.4 0t2.4 0 2.4 0" {...line} />
          <path d="M16.2 2.6c1.1 1.6 1.7 2.6 1.7 3.4a1.7 1.7 0 0 1-3.4 0c0-.8.6-1.8 1.7-3.4z" fill="#8ad0ff" stroke="#2a6fb8" strokeWidth=".6" />
          <ellipse cx="15.7" cy="5.6" rx=".4" ry=".7" fill="#fff" />
        </Face>
      );
    case "studying": // 8-| the nerd glasses
      return (
        <Face id={id}>
          <g fill="#fff" stroke={INK} strokeWidth="1">
            <circle cx="6.8" cy="8.4" r="2.5" />
            <circle cx="13.2" cy="8.4" r="2.5" />
          </g>
          <path d="M9.3 8.2h1.4" stroke={INK} strokeWidth="1" />
          <g fill={INK}>
            <circle cx="7.1" cy="8.7" r="1" />
            <circle cx="13.5" cy="8.7" r="1" />
          </g>
          <path d="M6.4 12.6c1.1 1.6 2.3 2.3 3.6 2.3s2.5-.7 3.6-2.3" {...line} />
          <path d="M9 13.9h2v1.3H9z" fill="#fff" stroke={INK} strokeWidth=".6" />
        </Face>
      );
    case "thinking": // *-) eyes up, one brow raised
      return (
        <Face id={id}>
          <path d="M11.6 5.4q1.6-1.3 3.4-.3" {...line} strokeWidth={1} />
          <g fill={INK}>
            <ellipse cx="6.5" cy="7.8" rx=".95" ry="1.4" />
            <ellipse cx="12.6" cy="7.8" rx=".95" ry="1.4" />
          </g>
          <path d="M7.2 14.2l5.4-1.2" {...line} />
          <g fill="#fff" stroke="#7f9db9" strokeWidth=".5">
            <circle cx="16.9" cy="3.6" r=".8" />
            <circle cx="18.4" cy="1.8" r="1.1" />
          </g>
        </Face>
      );
    case "sleepy": // |-) and a blue z
      return (
        <Face id={id}>
          <path d="M5.5 8.6q1.5 1.1 3 0M11.5 8.6q1.5 1.1 3 0" {...line} />
          <ellipse cx="10" cy="13.8" rx="1.2" ry="1.4" fill={INK} />
          <path d="M14.4 1.4h2.6l-2.6 2.8h2.6M17.6 4.6h1.6l-1.6 1.7h1.6" fill="none" stroke="#2a6fb8" strokeWidth=".9" strokeLinejoin="round" strokeLinecap="round" />
        </Face>
      );
    case "exhausted": // half-shut eyes and gloom lines
      return (
        <Face id={id}>
          <path d="M7 3.4v1.8M10 3v2M13 3.4v1.8" stroke="#6c8fd6" strokeWidth=".9" strokeLinecap="round" />
          <path d="M5.4 8.2h3.2M11.4 8.2h3.2" {...line} />
          <g fill={INK}>
            <path d="M5.7 8.4a1.3 1.3 0 0 0 2.6 0z" />
            <path d="M11.7 8.4a1.3 1.3 0 0 0 2.6 0z" />
          </g>
          <path d="M5.8 13.6q1.05-.9 2.1 0t2.1 0 2.1 0 2.1 0" {...line} />
        </Face>
      );
    case "low mood": // :(
      return (
        <Face id={id}>
          <path d="M5.2 6.4l2.9-1M14.8 6.4l-2.9-1" {...line} strokeWidth={1} />
          {eyes}
          <path d="M6.4 15.2c1.1-1.8 2.3-2.6 3.6-2.6s2.5.8 3.6 2.6" {...line} />
        </Face>
      );
    case "broken": // (U)
      return (
        <>
          <defs>
            <radialGradient id={id} cx="35%" cy="30%" r="75%">
              <stop stopColor="#ff9db4" />
              <stop offset=".55" stopColor="#ef2b4f" />
              <stop offset="1" stopColor="#a30d2b" />
            </radialGradient>
          </defs>
          <path d="M10 18.4C4 14.2 1.4 11.2 1.4 7.2 1.4 4.4 3.6 2.4 6.2 2.4c1.7 0 2.9 1 3.8 2.5.9-1.5 2.1-2.5 3.8-2.5 2.6 0 4.8 2 4.8 4.8 0 4-2.6 7-8.6 11.2Z" fill={`url(#${id})`} stroke="#7a0a20" strokeWidth=".9" />
          <ellipse cx="5.6" cy="5.4" rx="2.2" ry="1.2" fill="#fff" opacity=".55" transform="rotate(-25 5.6 5.4)" />
          <path d="M10 4.9 8.6 8.4l2.6 2.2-2 3 1.2 2.6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M10 4.9 8.6 8.4l2.6 2.2-2 3 1.2 2.6" fill="none" stroke="#7a0a20" strokeWidth=".7" strokeLinejoin="round" strokeLinecap="round" />
        </>
      );
    case "missing you": // big shiny eyes, blush and a tear
      return (
        <Face id={id}>
          <g fill="#ff8aa0" opacity=".65">
            <ellipse cx="4.8" cy="12" rx="1.6" ry="1" />
            <ellipse cx="15.2" cy="12" rx="1.6" ry="1" />
          </g>
          <g fill={INK}>
            <circle cx="7" cy="8.8" r="1.9" />
            <circle cx="13" cy="8.8" r="1.9" />
          </g>
          <g fill="#fff">
            <circle cx="7.6" cy="8.1" r=".75" />
            <circle cx="13.6" cy="8.1" r=".75" />
            <circle cx="6.4" cy="9.6" r=".35" />
            <circle cx="12.4" cy="9.6" r=".35" />
          </g>
          <path d="M8.3 14.2q1.7-1.2 3.4 0" {...line} />
          <path d="M5.6 11.2c.7 1 1 1.6 1 2.1a1 1 0 0 1-2 0c0-.5.3-1.1 1-2.1z" fill="#8ad0ff" stroke="#2a6fb8" strokeWidth=".5" />
        </Face>
      );
    default: // :)
      return (
        <Face id={id}>
          {eyes}
          <path d="M5.9 12.2c1.1 2.2 2.5 3.2 4.1 3.2s3-1 4.1-3.2" {...line} />
        </Face>
      );
  }
}

export function MsnEmoticon({ mood, className = "msn-emoticon" }: { mood: string; className?: string }) {
  const id = `msn-${useId().replace(/:/g, "")}`;
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      {art(mood, id)}
    </svg>
  );
}
