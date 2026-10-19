"use client";

import type { ReactNode } from "react";

// 小砖's shared wardrobe. Each piece is drawn in the sprite's own 16×12 grid
// (body x 3–13, y 2–8.2; arms at y 4–6), so it sits on him at any size.

export type ClawdSlot = "head" | "body" | "hand";
export type ClawdOutfit = Partial<Record<ClawdSlot, string>>;

export const CLAWD_SLOTS: { key: ClawdSlot; label: string }[] = [
  { key: "head", label: "头上" },
  { key: "body", label: "身上" },
  { key: "hand", label: "手里" },
];

// `view` frames a small piece more tightly in its wardrobe tile.
type Piece = { id: string; name: string; slot: ClawdSlot; art: ReactNode; view?: string };

export const CLAWD_PIECES: Piece[] = [
  {
    id: "beanie",
    name: "毛线帽",
    slot: "head",
    art: (
      <>
        <rect x="4.2" y="0.2" width="7.6" height="1.6" fill="#8ea3b9" />
        <rect x="5.2" y="0.2" width="0.6" height="1.6" fill="#7d93aa" />
        <rect x="7.2" y="0.2" width="0.6" height="1.6" fill="#7d93aa" />
        <rect x="9.2" y="0.2" width="0.6" height="1.6" fill="#7d93aa" />
        <rect x="3.6" y="1.6" width="8.8" height="0.9" fill="#c3d0dc" />
        <rect x="7.3" y="-0.8" width="1.4" height="1.1" fill="#eef1f4" />
      </>
    ),
  },
  {
    id: "bow",
    name: "蝴蝶结",
    slot: "head",
    art: (
      <>
        <rect x="10.2" y="0.6" width="1.4" height="1.6" fill="#eba2b1" />
        <rect x="12.4" y="0.6" width="1.4" height="1.6" fill="#eba2b1" />
        <rect x="11.6" y="1" width="0.8" height="0.9" fill="#cf7488" />
      </>
    ),
  },
  {
    id: "sprout",
    name: "小芽芽",
    slot: "head",
    art: (
      <>
        <rect x="7.8" y="0" width="0.45" height="2" fill="#6b9257" />
        <rect x="6.5" y="-0.2" width="1.3" height="0.8" fill="#8dbd70" />
        <rect x="8.25" y="-0.8" width="1.3" height="0.8" fill="#8dbd70" />
      </>
    ),
  },
  {
    id: "scarf",
    name: "围巾",
    slot: "body",
    art: (
      <>
        <rect x="3" y="6" width="10" height="1.1" fill="#e2bd5a" />
        <rect x="5" y="6" width="0.7" height="1.1" fill="#c99f3c" />
        <rect x="8" y="6" width="0.7" height="1.1" fill="#c99f3c" />
        <rect x="11" y="6" width="0.7" height="1.1" fill="#c99f3c" />
        <rect x="9.6" y="7.1" width="1.2" height="1.6" fill="#e2bd5a" />
        <rect x="9.6" y="8.2" width="1.2" height="0.5" fill="#c99f3c" />
      </>
    ),
  },
  {
    id: "bowtie",
    name: "小领结",
    slot: "body",
    art: (
      <>
        <rect x="6.7" y="6.3" width="1.1" height="1.3" fill="#3f4b5e" />
        <rect x="8.2" y="6.3" width="1.1" height="1.3" fill="#3f4b5e" />
        <rect x="7.6" y="6.6" width="0.8" height="0.7" fill="#56647a" />
      </>
    ),
  },
  {
    id: "flower",
    name: "小花",
    slot: "hand",
    view: "10.2 0.2 9 5.2",
    art: (
      <>
        <rect x="14.85" y="2.2" width="0.3" height="2" fill="#6b9257" />
        <rect x="14.6" y="1.1" width="0.8" height="0.7" fill="#f2b3c2" />
        <rect x="14.6" y="2.3" width="0.8" height="0.7" fill="#f2b3c2" />
        <rect x="14" y="1.7" width="0.7" height="0.8" fill="#f2b3c2" />
        <rect x="15.3" y="1.7" width="0.7" height="0.8" fill="#f2b3c2" />
        <rect x="14.65" y="1.75" width="0.7" height="0.7" fill="#f3cf63" />
      </>
    ),
  },
  {
    id: "balloon",
    name: "气球",
    slot: "hand",
    view: "8.2 -4 14 8.6",
    art: (
      <>
        <rect x="15.05" y="-0.6" width="0.2" height="4.8" fill="#9a9a9a" />
        <rect x="14.3" y="-3.6" width="1.7" height="2.6" fill="#9cc4da" />
        <rect x="14" y="-3.2" width="2.3" height="1.8" fill="#9cc4da" />
        <rect x="14.6" y="-3.2" width="0.5" height="0.6" fill="#d3e6f0" />
        <rect x="14.9" y="-1" width="0.5" height="0.4" fill="#86b0c7" />
      </>
    ),
  },
];

const BY_ID = new Map(CLAWD_PIECES.map((piece) => [piece.id, piece]));

export function clawdPiece(id: string | undefined): Piece | null {
  return (id && BY_ID.get(id)) || null;
}

/** What he's wearing in one slot, drawn in sprite coordinates. */
export function ClawdWear({ outfit, slot }: { outfit: ClawdOutfit; slot: ClawdSlot }) {
  const piece = clawdPiece(outfit[slot]);
  return piece ? <g className={`clawd-wear clawd-wear-${slot}`}>{piece.art}</g> : null;
}

/** A piece on its own, framed for a wardrobe tile. */
export function ClawdPieceThumb({ piece }: { piece: Piece }) {
  // Frame each slot around where the piece sits on him, with a faint
  // silhouette so you can see what it's for.
  const view = piece.view ?? (piece.slot === "head" ? "1 -1.8 14 7" : piece.slot === "body" ? "1 2.6 14 7" : "8.6 -4.2 14 9");
  return (
    <svg className="clawd-thumb" viewBox={view} aria-hidden="true">
      <g className="clawd-thumb-ghost">
        <rect x="3" y="2" width="10" height="6.2" />
        <rect x="1" y="4" width="2" height="2" />
        <rect x="13" y="4" width="2" height="2" />
      </g>
      {piece.art}
    </svg>
  );
}
