// Server only: a pixel grid as a PNG, each cell a square of `scale` pixels,
// so he can look at the doll and the clothes through the MCP. Node's zlib
// does the compression; no image library needed.

import { deflateSync } from "zlib";
import type { PixelGrid } from "./wardrobe-pixels";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function rgba(color: string | null, background: string | null): [number, number, number, number] {
  const hex = color || background;
  if (!hex) return [0, 0, 0, 0];
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

/** Grids side by side (a gap of one cell between them), scaled up, as PNG bytes. */
export function gridsToPng(grids: PixelGrid[], { scale = 6, background = "#f6f1e7", pad = 2 }: { scale?: number; background?: string | null; pad?: number } = {}): Buffer {
  const cellsW = grids.reduce((sum, grid) => sum + grid.w, 0) + pad * (grids.length + 1);
  const cellsH = Math.max(...grids.map((grid) => grid.h)) + pad * 2;
  const width = cellsW * scale, height = cellsH * scale;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  // Where each cell column comes from.
  const sources: { grid: PixelGrid; x: number }[][] = [];
  let left = pad;
  for (const grid of grids) {
    for (let x = 0; x < grid.w; x += 1) sources[left + x] = [{ grid, x }];
    left += grid.w + pad;
  }
  for (let py = 0; py < height; py += 1) {
    const row = py * (width * 4 + 1);
    raw[row] = 0;
    const cy = Math.floor(py / scale) - pad;
    for (let px = 0; px < width; px += 1) {
      const source = sources[Math.floor(px / scale)]?.[0];
      let color: string | null = null;
      if (source) {
        const top = Math.floor((cellsH - pad * 2 - source.grid.h) / 2);
        const y = cy - top;
        if (y >= 0 && y < source.grid.h) color = source.grid.cells[y * source.grid.w + source.x];
      }
      const [r, g, b, a] = rgba(color, background);
      raw.set([r, g, b, a], row + 1 + px * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}
