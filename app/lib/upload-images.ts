// Server only: turns iooi upload URLs into image blocks a model can look at.
// The blog uses it so he sees the photos in her posts, both when he comes to
// comment and when he reads a post through the MCP. A missing or oversized
// file is skipped, never fatal: he still gets the words.

import { existsSync, readFileSync } from "fs";
import { basename, extname, resolve, sep } from "path";
import type { ClaudeImageBlock } from "@/app/lib/claude-code";

type MediaType = ClaudeImageBlock["source"]["media_type"];

const TYPES: Record<string, MediaType> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const ONE_LIMIT = 5 * 1024 * 1024;
const TOTAL_LIMIT = 15 * 1024 * 1024;

function loadOne(url: string): ClaudeImageBlock | null {
  const dir = resolve(process.cwd(), "uploads");
  if (!/^\/uploads\/[A-Za-z0-9._-]{1,120}$/.test(url) || url.includes("..")) return null;
  const name = basename(url);
  const path = resolve(dir, name);
  const mediaType = TYPES[extname(name).toLowerCase()];
  if (!mediaType || !path.startsWith(`${dir}${sep}`) || !existsSync(path)) return null;
  const data = readFileSync(path).toString("base64");
  if (data.length > ONE_LIMIT) return null;
  return { type: "image", source: { type: "base64", media_type: mediaType, data } };
}

/** The images that could be read, in order, within a total size budget. */
export function loadUploadImages(urls: string[]): ClaudeImageBlock[] {
  const blocks: ClaudeImageBlock[] = [];
  let total = 0;
  for (const url of urls) {
    let block: ClaudeImageBlock | null = null;
    try {
      block = loadOne(url);
    } catch {}
    if (!block || total + block.source.data.length > TOTAL_LIMIT) continue;
    total += block.source.data.length;
    blocks.push(block);
  }
  return blocks;
}
