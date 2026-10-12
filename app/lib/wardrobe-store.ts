// Server side of her wardrobe (data/wardrobe.json), and what he sees of it
// through the MCP: the list in words, one garment as her photo plus its
// pixel version, and the doll wearing any set he wants to try.

import { readWardrobeStore } from "./store";
import {
  CATEGORY_LABELS, OUTFIT_SLOTS, PATTERN_LABELS, SLOT_LABELS, WARDROBE_CATEGORIES, outfitFromIds, readWardrobe, shapeLabel,
  type Outfit, type WardrobeItem,
} from "./wardrobe";
import { outfitLooks, renderDoll, renderGarment } from "./wardrobe-pixels";
import { gridsToPng } from "./wardrobe-png";
import { loadUploadImages } from "./upload-images";

export function getWardrobe() {
  return readWardrobe(readWardrobeStore());
}

function day(ms: number) {
  return new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
}

function colorWords(item: WardrobeItem) {
  const [main, second] = item.colors;
  if (item.pattern === "photo") return `照片花色（主色 ${main}）`;
  if (item.pattern === "solid") return `纯色 ${main}`;
  return `${PATTERN_LABELS[item.pattern]} ${main}${second !== main ? ` / ${second}` : ""}`;
}

function itemLine(item: WardrobeItem, wearing: Set<string>) {
  const bits = [
    `[${item.id}] ${item.name}`,
    shapeLabel(item.category, item.shape),
    colorWords(item),
    `${day(item.createdAt)} 放进来`,
    item.photo ? "有照片" : "没照片",
    wearing.has(item.id) ? "小人正穿着" : "",
  ].filter(Boolean);
  return `- ${bits.join(" · ")}${item.note ? `\n  她的备注：${item.note.replace(/\n/g, " ")}` : ""}`;
}

function outfitWords(items: WardrobeItem[], outfit: Outfit) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const parts = OUTFIT_SLOTS.filter((slot) => outfit[slot]).map((slot) => `${SLOT_LABELS[slot]}「${byId.get(outfit[slot]!)?.name}」`);
  return parts.length ? parts.join("、") : "什么都没穿（只有打底）";
}

/** The wardrobe in words, grouped by category. */
export function wardrobeDigest(category?: string) {
  const { items, outfit } = getWardrobe();
  if (!items.length) return "她的衣柜还是空的。";
  const wearing = new Set(Object.values(outfit).filter(Boolean) as string[]);
  const categories = WARDROBE_CATEGORIES.filter((item) => !category || item === category);
  const groups = categories.map((key) => {
    const list = items.filter((item) => item.category === key);
    return list.length ? [`${CATEGORY_LABELS[key]}（${list.length} 件）`, ...list.map((item) => itemLine(item, wearing))].join("\n") : "";
  }).filter(Boolean);
  return [
    `衣柜共 ${items.length} 件。小人现在穿着：${outfitWords(items, outfit)}。`,
    ...(groups.length ? groups : ["这一类还没有衣服。"]),
  ].join("\n\n");
}

export function findWardrobeItem(id: string) {
  return getWardrobe().items.find((item) => item.id === id) || null;
}

type Image = { data: string; mimeType: string };

/** One garment: words, her photo (if it still loads), the pixel version. */
export function wardrobeItemView(item: WardrobeItem): { text: string; images: Image[] } {
  const photo = item.photo ? loadUploadImages([item.photo]) : [];
  const text = [
    `「${item.name}」 id=${item.id}`,
    `${CATEGORY_LABELS[item.category]} · ${shapeLabel(item.category, item.shape)} · ${colorWords(item)}`,
    `${day(item.createdAt)} 放进衣柜${item.updatedAt !== item.createdAt ? `，${day(item.updatedAt)} 改过` : ""}`,
    item.note ? `她的备注：${item.note}` : "",
    photo.length ? "下面第一张是她拍的原照片，第二张是像素版（左边单件，右边穿在小人身上）。" : "她没传照片（或照片读不出来），下面是像素版：左边单件，右边穿在小人身上。",
  ].filter(Boolean).join("\n");
  const pixels = gridsToPng([renderGarment(item), renderDoll([item])], { scale: 6 });
  return {
    text,
    images: [
      ...photo.map((block) => ({ data: block.source.data, mimeType: block.source.media_type })),
      { data: pixels.toString("base64"), mimeType: "image/png" },
    ],
  };
}

/** The doll in a set of clothes (ids), or in what she has on now. Never saves. */
export function tryOnView(ids: unknown): { text: string; image: Image } {
  const { items, outfit: current } = getWardrobe();
  const list = Array.isArray(ids) ? ids.slice(0, 8) : [];
  const outfit = list.length ? outfitFromIds(items, list) : current;
  const looks = outfitLooks(items, outfit);
  const png = gridsToPng([renderDoll(looks)], { scale: 8 });
  return {
    text: `${list.length ? "试穿" : "小人现在穿着"}：${outfitWords(items, outfit)}。${list.length ? "只是试给你看，没有改她小人身上的衣服。" : ""}`,
    image: { data: png.toString("base64"), mimeType: "image/png" },
  };
}
