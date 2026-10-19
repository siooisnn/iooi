import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { readStickerStore, withStickerStore } from "./store";
import { STICKER_LIMIT, stickerExtension, stickerName, type Sticker } from "./stickers";

function catalog(store: Record<string, unknown> | null): Sticker[] {
  const raw = store?.stickers;
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.some((s) => !s || typeof s.id !== "string" || typeof s.name !== "string" || typeof s.url !== "string" || !/^\/uploads\/[A-Za-z0-9_-]+\.(png|gif|jpg|webp)$/.test(s.url))) throw new Error("表情库暂时无法读取，已停止修改以保护现有数据。");
  return raw;
}
export function readStickers() { return catalog(readStickerStore()); }
export async function addSticker(bytes: Uint8Array, name: string) {
  const ext = stickerExtension(bytes);
  const label = stickerName(name);
  return withStickerStore((store) => {
    const stickers = catalog(store);
    if (stickers.length >= STICKER_LIMIT) throw new Error(`表情库最多${STICKER_LIMIT}张，先移出一些再上传。`);
    const id = `st_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const filename = `${id}.${ext}`;
    const dir = join(process.cwd(), "uploads");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), bytes, { flag: "wx" });
    const sticker: Sticker = { id, name: label, url: `/uploads/${filename}` };
    store.stickers = [...stickers, sticker];
    return sticker;
  });
}
export async function changeSticker(action: unknown, id: unknown, name?: unknown) {
  return withStickerStore((store) => {
    const stickers = catalog(store);
    const found = stickers.find((s) => s.id === id);
    if (!found) throw new Error("这张表情已经不在库里了。");
    if (action === "rename") found.name = stickerName(name);
    else if (action === "remove") { store.stickers = stickers.filter((s) => s.id !== id); return; }
    else throw new Error("不认识这个操作。");
    store.stickers = stickers;
  });
}
