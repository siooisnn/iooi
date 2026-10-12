// Colours out of her photo: a few main colours of the part she boxed
// (a small k-means), and a little palette-indexed grid of it for the
// "照片花色" pattern. Pure, so it runs the same in the browser and in tests.

import type { WardrobeTexture } from "./wardrobe";

type Rgb = [number, number, number];

function hex([r, g, b]: Rgb) {
  return `#${[r, g, b].map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0")).join("")}`;
}

function rgbOf(value: string): Rgb {
  const n = parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function distance(a: Rgb, b: Rgb) {
  // Weighted a little like the eye: green counts most.
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
}

/** Opaque pixels of RGBA data, as colours. */
function pixelsOf(data: ArrayLike<number>): Rgb[] {
  const out: Rgb[] = [];
  for (let i = 0; i + 3 < data.length; i += 4) if (data[i + 3] >= 128) out.push([data[i], data[i + 1], data[i + 2]]);
  return out;
}

function nearest(pixel: Rgb, centers: Rgb[]) {
  let best = 0, bestD = Infinity;
  centers.forEach((center, index) => {
    const d = distance(pixel, center);
    if (d < bestD) { bestD = d; best = index; }
  });
  return best;
}

/**
 * The main colours of RGBA pixel data, biggest share first, each with its
 * share (0..1). Starts from evenly spread pixels, so the same photo always
 * gives the same answer.
 */
export function paletteFromPixels(data: ArrayLike<number>, k = 5): { color: string; share: number }[] {
  const pixels = pixelsOf(data);
  if (!pixels.length) return [];
  // Seeds: farthest-point picks, starting from the middle pixel.
  const centers: Rgb[] = [pixels[Math.floor(pixels.length / 2)]];
  while (centers.length < k) {
    let far = -1, farD = 0;
    pixels.forEach((pixel, index) => {
      const d = Math.min(...centers.map((center) => distance(pixel, center)));
      if (d > farD) { farD = d; far = index; }
    });
    if (far < 0 || farD < 40) break;
    centers.push(pixels[far]);
  }
  let counts = new Array(centers.length).fill(0);
  for (let round = 0; round < 8; round += 1) {
    const sums = centers.map(() => [0, 0, 0]);
    counts = new Array(centers.length).fill(0);
    for (const pixel of pixels) {
      const index = nearest(pixel, centers);
      counts[index] += 1;
      sums[index][0] += pixel[0]; sums[index][1] += pixel[1]; sums[index][2] += pixel[2];
    }
    centers.forEach((center, index) => {
      if (counts[index]) centers[index] = [sums[index][0] / counts[index], sums[index][1] / counts[index], sums[index][2] / counts[index]];
    });
  }
  const found = centers.map((center, index) => ({ color: hex(center), share: counts[index] / pixels.length }))
    .filter((item) => item.share > 0)
    .sort((a, b) => b.share - a.share);
  // Two clusters that came out the same colour are one.
  return found.filter((item, index) => !found.slice(0, index).some((other) => other.color === item.color));
}

/** The main colour and the next one that's clearly different (or the main again). */
export function mainColors(palette: { color: string }[]): [string, string] {
  const main = palette[0]?.color || "#c8b6a6";
  const main3 = rgbOf(main);
  const second = palette.slice(1).find((item) => distance(rgbOf(item.color), main3) > 2400)?.color || palette[1]?.color || main;
  return [main, second];
}

/** RGBA pixel data (w×h) as a texture on the given palette. */
export function textureFromPixels(data: ArrayLike<number>, w: number, h: number, palette: string[]): WardrobeTexture | null {
  const colors = palette.slice(0, 10).map(rgbOf);
  if (!colors.length || w < 2 || h < 2 || data.length < w * h * 4) return null;
  let cells = "";
  for (let i = 0; i < w * h; i += 1) {
    const at = i * 4;
    cells += data[at + 3] >= 128 ? String(nearest([data[at], data[at + 1], data[at + 2]], colors)) : "0";
  }
  return { w, h, palette: palette.slice(0, 10), cells };
}
