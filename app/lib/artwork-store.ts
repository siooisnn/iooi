import { createHash, randomUUID } from "crypto";
import { readArtworkStore, withArtworkStore } from "./store";
import { ARTWORK_LIMITS, type Artwork } from "./artworks";

function rows(raw: Record<string, unknown> | null): Artwork[] {
  if (!raw || !Object.keys(raw).length) return [];
  if (!Array.isArray(raw.items) || !raw.items.every((a) => a && typeof a.id === "string" && typeof a.title === "string" && typeof a.html === "string" && typeof a.createdAt === "number")) throw new Error("作品盒记录格式异常，已停止写入以保留原作品。");
  return raw.items as Artwork[];
}
export function listArtworks() { return rows(readArtworkStore()); }
function name(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > ARTWORK_LIMITS.title) throw new Error("作品名请写在80字以内。");
  return value.trim();
}
export async function updateArtwork(action: unknown, input: Record<string, unknown>) {
  return withArtworkStore((raw) => {
    const items = rows(raw);
    let result: Artwork;
    if (action === "save") {
      const title = name(input.title);
      if (typeof input.html !== "string" || !input.html.trim() || input.html.length > ARTWORK_LIMITS.source) throw new Error("作品代码为空或太长了，请控制在20万字以内。");
      const html = input.html;
      const hash = createHash("sha256").update(html).digest("hex");
      const existing = items.find((a) => createHash("sha256").update(a.html).digest("hex") === hash);
      if (existing) { delete existing.removedAt; result = existing; }
      else {
        if (items.length >= ARTWORK_LIMITS.count) throw new Error("作品盒已满（最多100件），请先下载整理。");
        result = { id: randomUUID(), title, html, createdAt: Date.now() };
        items.unshift(result);
      }
    } else {
      const found = items.find((a) => a.id === input.id);
      if (!found) throw new Error("没有找到这件作品，请刷新作品盒。");
      result = found;
      if (action === "rename") result.title = name(input.title);
      else if (action === "remove") result.removedAt = Date.now();
      else if (action === "restore") delete result.removedAt;
      else throw new Error("不认识这个作品盒操作。");
    }
    raw.items = items;
    return result;
  });
}
