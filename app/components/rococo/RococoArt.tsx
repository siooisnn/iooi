import type { CSSProperties } from "react";

export function RococoDivider({ className = "" }: { className?: string }) {
  return (
    <svg className={`rococo-divider ${className}`} viewBox="0 0 260 34" fill="none" aria-hidden="true">
      <path d="M4 17h112m28 0h112" />
      <path d="m130 12 5 5-5 5-5-5 5-5Z" />
    </svg>
  );
}

export function RococoRose({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={`rococo-rose ${className}`} style={style} viewBox="0 0 150 190" fill="none" aria-hidden="true">
      <g className="rococo-ink-lines">
        <path d="M105 184c-4-41-28-65-49-86-15-15-20-31-13-48" />
        <path d="M83 140c19-15 35-13 45-7-8 16-24 22-43 14M65 116c-21-2-33 8-37 20 17 7 31 1 41-12M54 94c15-16 29-17 40-12-5 16-18 23-36 19M42 71c-18 1-29-6-33-17 15-8 29-3 38 10" />
        <path d="M99 151c14-3 23 1 29 9M48 105c-11-2-20 1-27 8M73 85c7-8 15-11 24-10" />
      </g>
      <g className="rococo-rose-petals">
        <path d="M42 19c12-14 35-10 40 5 15-7 29 7 23 21 12 10 5 29-10 30-5 16-25 20-36 8-15 8-32-2-31-17-15-7-14-27 0-34-1-7 5-12 14-13Z" />
        <path d="M44 34c8-10 22-7 25 3 12-5 22 5 16 15 8 8 0 19-10 16-5 10-19 10-23 0-12 4-20-7-13-16-7-7-3-16 5-18Z" />
        <path d="M54 42c9-6 18 2 14 10 9 4 5 14-4 12-5 8-16 2-12-6-8-4-6-13 2-16Z" />
        <path d="M39 28c-2 16 6 20 17 18M82 25c-12 3-15 12-10 21M96 51c-13-6-22 0-23 10M65 77c3-12-4-19-14-18M32 60c11 4 17-1 18-10" />
      </g>
      <g className="rococo-leaf-hatch">
        <path d="M89 142l30-5M93 137l7 12M102 134l6 9M60 121l-25 10M53 120l-4 11M45 123l-3 7M52 89l31-3M60 84l4 11M69 82l4 8M36 64L15 56M29 60l-2-7" />
      </g>
    </svg>
  );
}

export function RococoBow({ className = "" }: { className?: string }) {
  return (
    <svg className={`rococo-bow ${className}`} viewBox="0 0 180 130" fill="none" aria-hidden="true">
      <g className="rococo-ribbon-lines">
        <path d="M89 43C65 8 24 8 20 30c-4 23 36 31 69 20M91 43c24-35 65-35 69-13 4 23-36 31-69 20" />
        <path d="M83 49C61 70 58 95 45 119l26-13 15 17 4-67M97 49c22 21 25 46 38 70l-26-13-15 17-4-67" />
        <path d="M24 25c20-7 43 4 61 24M156 25c-20-7-43 4-61 24M71 106l7-43M109 106l-7-43" />
        <path d="M81 39c4-7 14-7 18 0l2 13c-5 8-17 8-22 0l2-13Z" />
      </g>
      <path className="rococo-ribbon-wash" d="M84 43C61 15 29 14 25 30c-3 15 30 23 59 17ZM96 43c23-28 55-29 59-13 3 15-30 23-59 17Z" />
    </svg>
  );
}

export function RococoCorner({ className = "" }: { className?: string }) {
  return (
    <svg className={`rococo-corner ${className}`} viewBox="0 0 240 300" fill="none" aria-hidden="true">
      <g>
        <path d="M-8 282C43 254 22 205 56 180c30-22 57 6 40 27-15 19-44-2-27-17M36 230c36 0 69-20 76-52 8-37-25-57-43-37-16 18 4 43 21 27M67 176c-4-42 25-65 54-82 37-22 35-55 14-58-20-3-27 29-8 35M94 114c-20-21-19-49 2-68 20-18 16-42 1-45M51 204c-18-10-31-6-45 7M74 160c-23-3-37-14-42-32M111 91c20-2 35-13 43-31M82 136c19 2 35-5 47-20" />
        <path d="M29 211c-3-18 4-30 20-36 4 17-3 30-20 36ZM32 128c17 2 28 12 32 29-18-1-29-11-32-29ZM154 60c-2 17-12 28-29 32 1-18 11-29 29-32ZM129 116c-16 5-25 16-27 32 17-4 26-15 27-32ZM96 46c-14-8-20-21-17-37 16 7 22 20 17 37Z" />
        <path d="M9 274c22-3 38 5 46 23M5 254c20-2 34 4 43 17M177 65c22 2 36 15 40 36M185 51c18 2 29 11 35 27" />
        <circle cx="59" cy="194" r="3" /><circle cx="91" cy="124" r="2.5" /><circle cx="119" cy="82" r="2" />
      </g>
    </svg>
  );
}

export function RococoFrame({ className = "" }: { className?: string }) {
  return (
    <svg className={`rococo-frame ${className}`} viewBox="0 0 360 142" fill="none" preserveAspectRatio="none" aria-hidden="true">
      <path d="M22 73C5 51 24 26 48 33 42 9 76 4 91 20c18-25 45-17 51-6 20-15 56-15 76 0 6-11 33-19 51 6 15-16 49-11 43 13 24-7 43 18 26 40 17 22 2 47-22 40-8 22-40 22-53 8-23 15-60 11-83 3-23 8-60 12-83-3-13 14-45 14-53-8-24 7-39-18-22-40Z" />
      <path d="M35 72c-8-15 6-28 22-23-2-17 20-22 32-9 17-17 40-13 52-4 21-11 57-11 78 0 12-9 35-13 52 4 12-13 34-8 32 9 16-5 30 8 22 23 8 15-6 28-22 23 2 17-20 22-32 9-17 17-40 13-52 4-21 11-57 11-78 0-12 9-35 13-52-4-12 13-34 8-32-9-16 5-30-8-22-23Z" />
      <path d="M21 65c-17-4-20 12-9 17 8 4 15-3 10-8M339 65c17-4 20 12 9 17-8 4-15-3-10-8M65 30c-10-14 5-24 13-14M295 30c10-14-5-24-13-14M64 111c-9 14 6 23 14 13M296 111c9 14-6 23-14 13" />
    </svg>
  );
}

export function RococoArtIcon({ kind }: { kind: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.35, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...common}>
      {kind === "chat" && <><path d="M7 10h34v25H7z" /><path d="m8 12 16 14 16-14M8 34l11-12M40 34 29 22" /><path d="M20 29c2-4 6-4 8 0-2 4-6 4-8 0Z" /></>}
      {kind === "heartbeat" && <><path d="M24 39S7 29 7 18c0-9 12-11 17-3 5-8 17-6 17 3 0 11-17 21-17 21Z" /><path d="M9 24h8l3-7 5 14 4-10 3 3h8" /></>}
      {kind === "blog" && <><path d="M12 6h25v36H12zM9 9h5M9 16h5M9 23h5M9 30h5M9 37h5" /><path d="M19 15h12M19 21h12M19 27h8" /><path d="M29 37c-5-4-5-9 0-8 5-1 5 4 0 8Z" /></>}
      {kind === "reading" && <><path d="M5 11c8-3 14-1 19 4 5-5 11-7 19-4v28c-8-3-14-1-19 4-5-5-11-7-19-4V11Z" /><path d="M24 15v28M10 17c4-1 7 0 10 2M10 23c4-1 7 0 10 2M28 19c3-2 6-3 10-2M28 25c3-2 6-3 10-2" /></>}
      {kind === "surf" && <><circle cx="24" cy="24" r="17" /><ellipse cx="24" cy="24" rx="8" ry="17" /><path d="M7 24h34M10 15c8 3 20 3 28 0M10 33c8-3 20-3 28 0" /></>}
      {kind === "clawd" && <><path d="M14 18c0-8 20-8 20 0v15H14V18ZM14 22 7 17l-3 6 8 5M34 22l7-5 3 6-8 5M18 33l-2 7M24 33v8M30 33l2 7" /><path d="M19 20h.1M29 20h.1" strokeWidth="3" /></>}
      {kind === "mood" && <><circle cx="24" cy="24" r="17" /><path d="M16 20h.1M32 20h.1M16 29c5 5 11 5 16 0" /><path d="M9 10C5 4 15 2 17 8M31 7c3-7 12-3 8 3" /></>}
      {kind === "dayday" && <><path d="M8 19h32v23H8zM5 18l5-11h28l5 11" /><path d="M5 18c0 7 8 7 8 0 0 7 8 7 8 0 0 7 8 7 8 0 0 7 8 7 8 0" /><path d="M14 27h9v15M29 27h6v9h-6z" /></>}
      {kind === "artworks" && <><path d="m8 36 8-25 25 8-8 25-25-8Z" /><path d="m12 33 8-18 17 6-8 18-17-6Z" /><path d="m15 29 5-6 5 4 4-3 4 7" /></>}
      {kind === "susu-phone" && <><rect x="14" y="5" width="20" height="38" rx="5" /><path d="M20 10h8M18 36h12" /><path d="M21 23c-5-5-9 3 3 9 12-6 8-14 3-9-2-3-4-3-6 0Z" /></>}
      {kind === "capsule" && <><path d="M7 13h34v25H7zM7 14l17 14 17-14" /><path d="M18 6c2-5 10-5 12 0l-2 7h-8l-2-7Z" /><path d="M20 31c2-4 6-4 8 0-2 4-6 4-8 0Z" /></>}
      {kind === "settings" && <><path d="m20 5 8 0 1 5 5 2 5-2 4 7-4 4v5l4 4-4 7-5-2-5 2-1 5h-8l-1-5-5-2-5 2-4-7 4-4v-5l-4-4 4-7 5 2 5-2 1-5Z" /><circle cx="24" cy="24" r="6" /></>}
      {kind === "moon" && <><path d="M34 6c-16 3-20 24-5 33-12 5-24-3-24-16S22 0 34 6Z" /><path d="m36 22 1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5 1.5-4Z" /></>}
      {(kind === "summer-claude" || kind === "summer-gpt") && <><path d="M10 5h28v38H10zM15 5v38" /><path d="M21 14h11M21 20h11M21 26h8" /><path d="m31 33 0 10 4-3 4 3V33" /></>}
    </svg>
  );
}

export function RococoFlourish({ className = "" }: { className?: string }) {
  return (
    <svg className={`rococo-flourish ${className}`} viewBox="0 0 420 90" fill="none" aria-hidden="true">
      <path d="M2 58c70 2 73-38 125-30 36 6 33 42 11 39-18-3-11-29 7-22 30 12 31 32 65 32s35-20 65-32c18-7 25 19 7 22-22 3-25-33 11-39 52-8 55 32 125 30" />
      <path d="M70 48c-18 17-40 18-54 7M350 48c18 17 40 18 54 7M171 63c-15 14-32 16-48 9M249 63c15 14 32 16 48 9M194 68c2-20 10-29 16-40 6 11 14 20 16 40-9 11-23 11-32 0Z" />
      <circle cx="210" cy="62" r="3" />
    </svg>
  );
}
