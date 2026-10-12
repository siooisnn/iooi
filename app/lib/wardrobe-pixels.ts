// The pixel doll and her clothes, on one 32×64 grid so every garment lines up
// on the body. Each shape paints tags into a mask: b = the garment's colour
// or pattern, d = a darker fold or seam, l = a lighter collar or sole,
// a = the second colour (a buckle, a strap), r / q = ribbing and pleats.
// Pure functions: her page draws the grid on a canvas, the MCP turns it into
// a PNG so he can see the same thing.

import type { Outfit, PixelLook, WardrobeItem } from "./wardrobe";
import { slotOf } from "./wardrobe";

export const DOLL_W = 32;
export const DOLL_H = 64;

/** One colour per cell, row by row; null is see-through. */
export type PixelGrid = { w: number; h: number; cells: (string | null)[] };

type Mask = (string | null)[];

class Painter {
  mask: Mask = new Array(DOLL_W * DOLL_H).fill(null);
  /** x0..x1 on row y. */
  span(y: number, x0: number, x1: number, tag = "b") {
    if (y < 0 || y >= DOLL_H) return;
    for (let x = Math.max(0, x0); x <= Math.min(DOLL_W - 1, x1); x += 1) this.mask[y * DOLL_W + x] = tag;
  }
  /** x0..x1 on row y and the same on the other side of the body. */
  m(y: number, x0: number, x1: number, tag = "b") {
    this.span(y, x0, x1, tag);
    this.span(y, DOLL_W - 1 - x1, DOLL_W - 1 - x0, tag);
  }
  /** Rows y0..y1 of a mirrored span. */
  rows(y0: number, y1: number, x0: number, x1: number, tag = "b") {
    for (let y = y0; y <= y1; y += 1) this.m(y, x0, x1, tag);
  }
}

// ── The body: the rows every garment follows ──
// Shoulder row 19, chest 20–24, waist 25–31, hips 32–34, legs 35–58, feet 59–60.

/** The torso's left edge per row (the right edge mirrors it). */
function torsoLeft(y: number) {
  if (y <= 18) return 14;
  if (y <= 24) return 10;
  if (y <= 31) return 11;
  return 10;
}

/** A garment body that follows the torso from row y0 to y1. */
function torso(p: Painter, y0: number, y1: number, tag = "b") {
  for (let y = y0; y <= y1; y += 1) p.m(y, torsoLeft(y), 15, tag);
}

// ── Tops ──

function longSleeves(p: Painter, cuff = true) {
  p.rows(20, 33, 8, 9);
  if (cuff) p.m(33, 8, 9, "d");
}

const TOPS: Record<string, (p: Painter) => void> = {
  tee(p) {
    p.m(19, 10, 13); torso(p, 20, 32);
    p.rows(20, 23, 8, 9);
  },
  longsleeve(p) {
    p.m(19, 10, 13); torso(p, 20, 32);
    longSleeves(p);
  },
  shirt(p) {
    p.m(19, 10, 11); p.m(19, 12, 13, "l");
    p.m(20, 10, 13); p.m(20, 14, 14, "l");
    torso(p, 21, 32);
    for (let y = 21; y <= 32; y += 1) p.m(y, 15, 15, y % 3 === 0 ? "l" : "d");
    longSleeves(p);
  },
  sweater(p) {
    p.m(19, 10, 13); p.m(19, 12, 13, "r");
    torso(p, 20, 30); torso(p, 31, 32, "r");
    p.rows(20, 23, 8, 9); p.rows(24, 31, 7, 9); p.rows(32, 33, 8, 9, "r");
  },
  offshoulder(p) {
    p.m(20, 7, 15, "r"); p.m(21, 7, 15, "d");
    torso(p, 22, 27); torso(p, 28, 32, "r");
    p.rows(22, 31, 7, 9); p.rows(32, 33, 8, 9, "r");
  },
  camisole(p) {
    p.rows(19, 20, 12, 12, "d");
    torso(p, 21, 32);
  },
  hoodie(p) {
    p.m(17, 11, 13, "d"); p.m(18, 10, 13, "d");
    p.m(19, 10, 13); torso(p, 20, 32);
    p.rows(21, 24, 14, 14, "l");
    p.m(27, 12, 15, "d"); p.rows(28, 30, 12, 12, "d");
    longSleeves(p);
    p.m(32, 11, 15, "r");
  },
};

// ── Outer layers: open in front so the top shows, except the puffer ──

const OUTERS: Record<string, (p: Painter) => void> = {
  jacket(p) {
    p.m(19, 10, 11); p.m(19, 12, 13, "l");
    p.rows(20, 21, 10, 12); p.rows(20, 21, 13, 13, "l");
    p.rows(22, 32, 10, 12); p.rows(22, 32, 13, 13, "d");
    p.m(33, 10, 13, "d");
    p.rows(20, 32, 7, 9); p.rows(24, 32, 9, 9, "d"); p.m(33, 7, 9, "d");
  },
  cardigan(p) {
    p.m(19, 11, 13);
    p.rows(20, 32, 10, 12); p.rows(20, 32, 13, 13, "l");
    for (const y of [22, 25, 28, 31]) p.m(y, 13, 13, "a");
    p.rows(33, 34, 10, 13, "r");
    p.rows(20, 31, 8, 9); p.rows(32, 33, 8, 9, "r");
  },
  coat(p) {
    p.m(19, 10, 11); p.m(19, 12, 13, "l");
    p.m(20, 10, 11); p.m(20, 12, 13, "l");
    p.m(21, 10, 12); p.m(21, 13, 13, "l");
    p.m(22, 10, 12); p.m(22, 13, 13, "l");
    p.rows(23, 33, 10, 12); p.rows(23, 33, 13, 13, "d");
    p.rows(34, 46, 9, 13); p.rows(34, 46, 14, 14, "d");
    p.m(47, 9, 14, "d");
    p.rows(20, 32, 7, 9); p.rows(24, 32, 9, 9, "d"); p.m(33, 7, 9, "d");
  },
  puffer(p) {
    p.rows(17, 18, 12, 15);
    p.rows(19, 36, 9, 15);
    for (const y of [23, 27, 31, 35]) p.m(y, 9, 15, "d");
    p.rows(19, 33, 6, 8); p.rows(24, 33, 8, 8, "d");
    for (const y of [24, 28, 32]) p.m(y, 6, 8, "d");
  },
};

// ── Pants ──

function waist(p: Painter) {
  p.m(32, 10, 15, "d");
  p.rows(33, 34, 10, 15);
  // The crotch, so the slip underneath doesn't peek out between the legs.
  p.rows(35, 36, 13, 15);
}

const PANTS: Record<string, (p: Painter) => void> = {
  straight(p) { waist(p); p.rows(35, 58, 10, 14); },
  wide(p) {
    waist(p);
    for (let y = 35; y <= 58; y += 1) p.m(y, 10 - Math.floor((y - 35) / 8), 14);
  },
  leggings(p) { waist(p); p.rows(35, 50, 11, 14); p.rows(51, 58, 12, 14); },
  shorts(p) { waist(p); p.rows(35, 39, 10, 14); },
};

// ── Skirts (and the one-piece dress) ──

function flare(p: Painter, y0: number, y1: number, every: number, tag = "b") {
  for (let y = y0; y <= y1; y += 1) p.m(y, 10 - Math.floor((y - y0) / every), 15, tag);
}

const SKIRTS: Record<string, (p: Painter) => void> = {
  mini(p) { p.m(31, 11, 15, "d"); flare(p, 32, 40, 3); },
  midi(p) { p.m(31, 11, 15, "d"); flare(p, 32, 48, 4); },
  pleated(p) { p.m(31, 11, 15, "d"); p.rows(32, 33, 10, 15); flare(p, 34, 48, 4, "q"); },
  long(p) { p.m(31, 11, 15, "d"); flare(p, 32, 56, 6); },
  dress(p) {
    p.m(19, 10, 13); torso(p, 20, 30);
    p.rows(20, 22, 8, 9);
    p.m(31, 11, 15, "d");
    flare(p, 32, 46, 4);
  },
};

// ── Shoes ──

const SHOES: Record<string, (p: Painter) => void> = {
  sneakers(p) {
    p.rows(57, 58, 11, 14); p.m(57, 12, 13, "l");
    p.m(59, 10, 14); p.m(60, 10, 14, "l");
  },
  maryjane(p) {
    p.m(58, 12, 14, "d"); p.m(58, 13, 13, "a");
    p.m(59, 11, 14); p.m(60, 10, 14); p.m(61, 10, 14, "d");
  },
  boots(p) {
    p.m(47, 11, 14, "d"); p.rows(48, 58, 11, 14);
    p.m(59, 10, 14); p.m(60, 10, 14, "d");
  },
  sandals(p) {
    p.m(59, 11, 14);
    p.m(61, 10, 14); p.m(62, 10, 14, "d");
  },
};

const SHAPES: Record<string, Record<string, (p: Painter) => void>> = {
  top: TOPS, outer: OUTERS, pants: PANTS, skirt: SKIRTS, shoes: SHOES,
};

export function hasShape(category: string, shape: string) {
  return Boolean(SHAPES[category]?.[shape]);
}

function garmentMask(look: Pick<PixelLook, "category" | "shape">): Mask {
  const p = new Painter();
  SHAPES[look.category]?.[look.shape]?.(p);
  return p.mask;
}

// ── Colour ──

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: number[]) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

export function mixColor(a: string, b: string, t: number) {
  const ca = rgb(a), cb = rgb(b);
  return toHex(ca.map((v, i) => v + (cb[i] - v) * t));
}

/** Darker; a near-black garment shows its folds a little lighter instead. */
export function darken(hex: string, amount = 0.22) {
  const [r, g, b] = rgb(hex);
  // Near-black can't get darker enough to show, so its folds go a little grey.
  if (r + g + b < 90) return mixColor(hex, "#5a5660", amount * 1.4);
  return mixColor(hex, "#1a1020", amount);
}

export function lighten(hex: string, amount = 0.28) {
  return mixColor(hex, "#ffffff", amount);
}

/** Black ink or white, whichever reads on this colour. */
export function inkOn(hex: string) {
  const [r, g, b] = rgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#2b2024" : "#ffffff";
}

type Box = { x0: number; y0: number; x1: number; y1: number };

function boxOf(mask: Mask): Box | null {
  let box: Box | null = null;
  mask.forEach((tag, i) => {
    if (!tag) return;
    const x = i % DOLL_W, y = Math.floor(i / DOLL_W);
    if (!box) box = { x0: x, y0: y, x1: x, y1: y };
    else { box.x0 = Math.min(box.x0, x); box.y0 = Math.min(box.y0, y); box.x1 = Math.max(box.x1, x); box.y1 = Math.max(box.y1, y); }
  });
  return box;
}

/** The garment's own colour at one cell, before folds and seams. */
function patternAt(look: PixelLook, x: number, y: number, box: Box): string {
  const [main, second] = look.colors;
  switch (look.pattern) {
    case "stripes": return y % 3 === 0 ? second : main;
    case "vstripes": return x % 3 === 0 ? second : main;
    case "plaid": {
      const across = y % 4 === 0, down = x % 4 === 0;
      return across && down ? darken(second, 0.2) : across || down ? second : main;
    }
    case "dots": return y % 3 === 1 && (x + (Math.floor(y / 3) % 2) * 2) % 4 === 1 ? second : main;
    case "photo": {
      const texture = look.texture;
      if (!texture) return main;
      const u = Math.min(texture.w - 1, Math.floor(((x - box.x0 + 0.5) / (box.x1 - box.x0 + 1)) * texture.w));
      const v = Math.min(texture.h - 1, Math.floor(((y - box.y0 + 0.5) / (box.y1 - box.y0 + 1)) * texture.h));
      return texture.palette[Number(texture.cells[v * texture.w + u])] || main;
    }
    default: return main;
  }
}

function colorFor(look: PixelLook, tag: string, x: number, y: number, box: Box) {
  const base = patternAt(look, x, y, box);
  switch (tag) {
    case "d": return darken(base);
    case "l": return lighten(base);
    case "a": return look.colors[1] === look.colors[0] ? lighten(base, 0.45) : look.colors[1];
    case "r": return x % 2 === 0 ? darken(base, 0.16) : base;
    case "q": return x % 3 === 0 ? darken(base, 0.2) : base;
    default: return base;
  }
}

// ── The doll herself: long hair, black on top and gold below, the curtain
// bangs pushed to both sides, black-rimmed glasses. ──

const SKIN = "#f7d8c4";
const SKIN_SHADE = "#e9b9a0";
const OUTLINE = "#3a2830";

function hairColor(y: number) {
  if (y <= 10) return "#2a2321";
  if (y <= 12) return "#3f2c22";
  if (y <= 14) return "#6f4227";
  if (y <= 16) return "#a65f2f";
  return "#c97c40";
}

type Layer = { mask: Mask; color: (tag: string, x: number, y: number) => string; edges: boolean };

function hairBack(): Layer {
  const p = new Painter();
  p.rows(5, 18, 9, 15);
  p.rows(19, 20, 9, 12);
  return { mask: p.mask, color: (_tag, _x, y) => hairColor(y), edges: false };
}

function body(): Layer {
  const p = new Painter();
  p.m(4, 12, 15, "s"); p.rows(5, 14, 11, 15, "s"); p.m(15, 12, 15, "s"); p.m(16, 13, 15, "s");
  p.m(17, 14, 15, "S"); p.m(18, 14, 15, "s");
  p.m(19, 10, 15, "s"); p.rows(20, 24, 10, 15, "s"); p.rows(25, 31, 11, 15, "s"); p.rows(32, 34, 10, 15, "s");
  p.rows(20, 33, 8, 9, "s"); p.rows(34, 35, 8, 9, "s");
  p.rows(35, 50, 11, 14, "s"); p.rows(51, 58, 12, 14, "s"); p.rows(59, 60, 11, 14, "s");
  // A plain slip underneath, so the doll is never bare.
  p.rows(21, 24, 10, 15, "u"); p.rows(25, 31, 11, 15, "u"); p.rows(32, 36, 11, 15, "u");
  p.m(19, 12, 12, "u"); p.m(20, 12, 12, "u");
  // Glasses: two black rims with a bridge, an eye and a glint inside each.
  p.m(10, 11, 14, "g"); p.rows(11, 12, 11, 11, "g"); p.rows(11, 12, 14, 14, "g"); p.m(13, 12, 13, "g");
  p.m(11, 15, 15, "g");
  p.m(11, 12, 12, "L"); p.m(11, 13, 13, "e"); p.m(12, 13, 13, "e"); p.m(12, 12, 12, "L");
  p.m(14, 12, 12, "p");
  p.span(15, 15, 16, "m");
  const colors: Record<string, string> = {
    s: SKIN, S: SKIN_SHADE, g: "#18161a", e: "#2b1d1d", L: "#fdeee4", p: "#f5a3a8", m: "#c75f6b", u: "#f1ecef",
  };
  return { mask: p.mask, color: (tag) => colors[tag] || SKIN, edges: false };
}

function hairFront(): Layer {
  const p = new Painter();
  p.m(2, 13, 15); p.m(3, 11, 15); p.rows(4, 6, 10, 15);
  p.rows(4, 4, 15, 15, "h"); // the parting
  p.m(5, 15, 15, "s"); p.m(6, 15, 15, "s");
  p.m(7, 11, 14); p.m(8, 11, 13); p.m(9, 11, 12);
  p.rows(7, 16, 10, 10);
  p.rows(17, 26, 10, 11); p.m(27, 10, 10);
  p.m(3, 12, 13, "x");
  return {
    mask: p.mask,
    color: (tag, _x, y) => tag === "s" ? SKIN : tag === "h" ? "#1a1514" : tag === "x" ? "#4a3f3b" : hairColor(y),
    edges: false,
  };
}

function garmentLayer(look: PixelLook): Layer | null {
  const mask = garmentMask(look);
  const box = boxOf(mask);
  if (!box) return null;
  return { mask, color: (tag, x, y) => colorFor(look, tag, x, y, box), edges: true };
}

/** Paints layers bottom-up. A garment's edge darkens where it lies on something. */
function compose(layers: Layer[], outline = true): PixelGrid {
  const cells: (string | null)[] = new Array(DOLL_W * DOLL_H).fill(null);
  for (const layer of layers) {
    const under = cells.slice();
    layer.mask.forEach((tag, i) => {
      if (!tag) return;
      const x = i % DOLL_W, y = Math.floor(i / DOLL_W);
      let color = layer.color(tag, x, y);
      if (layer.edges) {
        const rim = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([nx, ny]) => {
          if (nx < 0 || ny < 0 || nx >= DOLL_W || ny >= DOLL_H) return false;
          const n = ny * DOLL_W + nx;
          return !layer.mask[n] && under[n] !== null;
        });
        if (rim) color = darken(color, 0.16);
      }
      cells[i] = color;
    });
  }
  if (outline) {
    const filled = cells.slice();
    filled.forEach((color, i) => {
      if (color) return;
      const x = i % DOLL_W, y = Math.floor(i / DOLL_W);
      const near = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([nx, ny]) =>
        nx >= 0 && ny >= 0 && nx < DOLL_W && ny < DOLL_H && filled[ny * DOLL_W + nx]);
      if (near) cells[i] = OUTLINE;
    });
  }
  return { w: DOLL_W, h: DOLL_H, cells };
}

/** Which way up the clothes go: shoes, then bottoms, the top, a dress, the outer layer. */
function dressingOrder(items: PixelLook[]) {
  const rank = (look: PixelLook) =>
    look.category === "shoes" ? 0
      : look.category === "pants" ? 1
        : look.category === "skirt" ? (look.shape === "dress" ? 3 : 1)
          : look.category === "top" ? 2 : 4;
  return [...items].sort((a, b) => rank(a) - rank(b));
}

/** The doll wearing these (at most one per slot; anything missing stays bare). */
export function renderDoll(looks: PixelLook[]): PixelGrid {
  const clothes = dressingOrder(looks).map(garmentLayer).filter((layer): layer is Layer => Boolean(layer));
  return compose([hairBack(), body(), ...clothes, hairFront()]);
}

/** The outfit's items, in slot order, ready for renderDoll. */
export function outfitLooks(items: WardrobeItem[], outfit: Outfit): WardrobeItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return Object.values(outfit).map((id) => (id ? byId.get(id) : undefined))
    .filter((item): item is WardrobeItem => Boolean(item) && outfit[slotOf(item!.category)] === item!.id);
}

/** One garment on its own, cropped to its outline. */
export function renderGarment(look: PixelLook): PixelGrid {
  const layer = garmentLayer(look);
  if (!layer) return { w: 1, h: 1, cells: [null] };
  const full = compose([layer]);
  const box = boxOf(full.cells.map((cell) => (cell ? "x" : null)))!;
  const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
  const cells: (string | null)[] = [];
  for (let y = box.y0; y <= box.y1; y += 1) for (let x = box.x0; x <= box.x1; x += 1) cells.push(full.cells[y * DOLL_W + x]);
  return { w, h, cells };
}
