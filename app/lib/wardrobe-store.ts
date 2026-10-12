// Her real photos and selected outfit, shared with the page and read-only MCP.
import { readWardrobeStore } from "./store";
import {
  CATEGORY_LABELS, OUTFIT_SLOTS, SLOT_LABELS, WARDROBE_CATEGORIES, outfitFromIds, readWardrobe,
  type Outfit, type WardrobeItem,
} from "./wardrobe";
import { loadUploadImages } from "./upload-images";

export function getWardrobe() { return readWardrobe(readWardrobeStore()); }
function day(ms: number) { return new Date(ms + 8 * 3600_000).toISOString().slice(0, 10); }
function itemLine(item: WardrobeItem, selected: Set<string>) {
  return `- [${item.id}] ${item.name} · ${CATEGORY_LABELS[item.category]} · ${day(item.createdAt)} 放进来 · ${item.photo ? "有照片" : "没照片"}${selected.has(item.id) ? " · 在当前搭配里" : ""}${item.note ? `\n  她的备注：${item.note.replace(/\n/g, " ")}` : ""}`;
}
function outfitWords(items: WardrobeItem[], outfit: Outfit) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const parts = OUTFIT_SLOTS.filter((slot) => outfit[slot]).map((slot) => `${SLOT_LABELS[slot]}「${byId.get(outfit[slot]!)?.name}」`);
  return parts.length ? parts.join("、") : "还没有选衣服";
}
export function wardrobeDigest(category?: string) {
  const { items, outfit } = getWardrobe();
  if (!items.length) return "她的衣柜还是空的。";
  const selected = new Set(Object.values(outfit).filter(Boolean) as string[]);
  const groups = WARDROBE_CATEGORIES.filter((key) => !category || key === category).map((key) => {
    const list = items.filter((item) => item.category === key);
    return list.length ? [`${CATEGORY_LABELS[key]}（${list.length} 件）`, ...list.map((item) => itemLine(item, selected))].join("\n") : "";
  }).filter(Boolean);
  return [`衣柜共 ${items.length} 件。当前搭配：${outfitWords(items, outfit)}。`, ...(groups.length ? groups : ["这一类还没有衣服。"])].join("\n\n");
}
export function findWardrobeItem(id: string) { return getWardrobe().items.find((item) => item.id === id) || null; }
type Image = { data: string; mimeType: string };
function photosOf(items: WardrobeItem[]) {
  const images: Image[] = [], names: string[] = [], missing: string[] = [];
  let total = 0;
  for (const item of items) {
    const block = item.photo ? loadUploadImages([item.photo])[0] : undefined;
    if (!block || total + block.source.data.length > 15 * 1024 * 1024) { missing.push(item.name); continue; }
    total += block.source.data.length;
    images.push({ data: block.source.data, mimeType: block.source.media_type });
    names.push(`「${item.name}」`);
  }
  return { images, description: [names.length ? `下面的原照片依次是：${names.join("、")}。` : "", missing.length ? `没有可查看的照片：${missing.map((name) => `「${name}」`).join("、")}；请根据备注交流，不要猜衣服的样子。` : ""].filter(Boolean).join("\n") };
}
export function wardrobeItemView(item: WardrobeItem): { text: string; images: Image[] } {
  const photos = photosOf([item]);
  return { text: [`「${item.name}」 id=${item.id}`, CATEGORY_LABELS[item.category],
    `${day(item.createdAt)} 放进衣柜${item.updatedAt !== item.createdAt ? `，${day(item.updatedAt)} 改过` : ""}`,
    item.note ? `她的备注：${item.note}` : "", photos.description,
  ].filter(Boolean).join("\n"), images: photos.images };
}
/** Preview a combination from the original photos; never changes her board. */
export function tryOnView(ids: unknown): { text: string; images: Image[] } {
  const { items, outfit: current } = getWardrobe();
  const list = Array.isArray(ids) ? ids.slice(0, 8) : [];
  const outfit = list.length ? outfitFromIds(items, list) : current;
  const byId = new Map(items.map((item) => [item.id, item]));
  const picked = OUTFIT_SLOTS.map((slot) => outfit[slot] ? byId.get(outfit[slot]!) : undefined).filter((item): item is WardrobeItem => Boolean(item));
  const photos = photosOf(picked);
  return { text: [`${list.length ? "搭配预览" : "当前搭配"}：${outfitWords(items, outfit)}。`,
    ...picked.map((item) => itemLine(item, new Set())), photos.description,
    list.length ? "只是一起看看这几件，没有修改她保存的搭配。" : "",
  ].filter(Boolean).join("\n"), images: photos.images };
}
