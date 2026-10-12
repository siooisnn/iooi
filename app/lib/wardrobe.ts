// Her wardrobe: clothes she photographed, each turned into a pixel garment
// cut on one of our ready-made shapes and filled with the colours (or a
// little texture) taken from the photo. Pure data and checks here, shared by
// her page, the API and the MCP; the drawing is in wardrobe-pixels.ts.

export const WARDROBE_CATEGORIES = ["top", "outer", "pants", "skirt", "shoes"] as const;
export type WardrobeCategory = typeof WARDROBE_CATEGORIES[number];

export const CATEGORY_LABELS: Record<WardrobeCategory, string> = {
  top: "上衣", outer: "外套", pants: "裤子", skirt: "裙子", shoes: "鞋子",
};

/** The ready-made shapes, per category, in the order her picker shows them. */
export const WARDROBE_SHAPES: Record<WardrobeCategory, { id: string; label: string }[]> = {
  top: [
    { id: "tee", label: "短袖" }, { id: "longsleeve", label: "长袖" }, { id: "shirt", label: "衬衫" },
    { id: "sweater", label: "毛衣" }, { id: "offshoulder", label: "露肩" }, { id: "camisole", label: "吊带" },
    { id: "hoodie", label: "卫衣" },
  ],
  outer: [
    { id: "jacket", label: "短外套" }, { id: "cardigan", label: "开衫" }, { id: "coat", label: "大衣" },
    { id: "puffer", label: "羽绒服" },
  ],
  pants: [
    { id: "straight", label: "直筒裤" }, { id: "wide", label: "阔腿裤" }, { id: "leggings", label: "紧身裤" },
    { id: "shorts", label: "短裤" },
  ],
  skirt: [
    { id: "mini", label: "短裙" }, { id: "midi", label: "中长裙" }, { id: "pleated", label: "百褶裙" },
    { id: "long", label: "长裙" }, { id: "dress", label: "连衣裙" },
  ],
  shoes: [
    { id: "sneakers", label: "运动鞋" }, { id: "maryjane", label: "单鞋" }, { id: "boots", label: "靴子" },
    { id: "sandals", label: "拖鞋凉鞋" },
  ],
};

export const WARDROBE_PATTERNS = ["solid", "stripes", "vstripes", "plaid", "dots", "photo"] as const;
export type WardrobePattern = typeof WARDROBE_PATTERNS[number];
export const PATTERN_LABELS: Record<WardrobePattern, string> = {
  solid: "纯色", stripes: "横条纹", vstripes: "竖条纹", plaid: "格子", dots: "波点", photo: "照片花色",
};

/** A small grid cut from the photo: palette indices, row by row. */
export type WardrobeTexture = { w: number; h: number; palette: string[]; cells: string };

/** Everything the pixel drawing needs. */
export type PixelLook = {
  category: WardrobeCategory;
  shape: string;
  pattern: WardrobePattern;
  colors: [string, string];
  texture?: WardrobeTexture | null;
};

export type WardrobeItem = PixelLook & {
  id: string;
  name: string;
  note: string;
  photo: string;
  createdAt: number;
  updatedAt: number;
};

/** What the doll has on. Pants and skirts share one slot. */
export const OUTFIT_SLOTS = ["top", "outer", "bottom", "shoes"] as const;
export type OutfitSlot = typeof OUTFIT_SLOTS[number];
export type Outfit = Partial<Record<OutfitSlot, string>>;
export const SLOT_LABELS: Record<OutfitSlot, string> = { top: "上衣", outer: "外套", bottom: "下装", shoes: "鞋子" };

export const WARDROBE_LIMITS = { items: 600, name: 30, note: 300 };

export function slotOf(category: WardrobeCategory): OutfitSlot {
  return category === "pants" || category === "skirt" ? "bottom" : category;
}

export function isWardrobeId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value);
}

export function isCategory(value: unknown): value is WardrobeCategory {
  return typeof value === "string" && (WARDROBE_CATEGORIES as readonly string[]).includes(value);
}

export function shapeLabel(category: WardrobeCategory, shape: string) {
  return WARDROBE_SHAPES[category].find((item) => item.id === shape)?.label || shape;
}

const HEX = /^#[0-9a-f]{6}$/;

export function cleanColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hex = value.trim().toLowerCase();
  return HEX.test(hex) ? hex : null;
}

/** Only our own upload URLs, so nothing outside the uploads folder gets shown or read. */
export function cleanPhoto(value: unknown): string {
  return typeof value === "string" && /^\/uploads\/[A-Za-z0-9._-]{1,120}$/.test(value) && !value.includes("..") ? value : "";
}

export function cleanTexture(value: unknown): WardrobeTexture | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const w = Number(raw.w), h = Number(raw.h);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 2 || h < 2 || w > 32 || h > 32) return null;
  if (!Array.isArray(raw.palette) || !raw.palette.length || raw.palette.length > 10) return null;
  const palette = raw.palette.map(cleanColor);
  if (palette.some((color) => !color)) return null;
  const cells = typeof raw.cells === "string" ? raw.cells : "";
  if (cells.length !== w * h || [...cells].some((cell) => !/^\d$/.test(cell) || Number(cell) >= palette.length)) return null;
  return { w, h, palette: palette as string[], cells };
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanNote(value: unknown) {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim().slice(0, WARDROBE_LIMITS.note) : "";
}

/** The pixel part of an item from untrusted input; throws in words she can read. */
export function cleanLook(input: Record<string, unknown>, base?: PixelLook): PixelLook {
  const category = input.category === undefined && base ? base.category : input.category;
  if (!isCategory(category)) throw new Error("选一下是上衣、外套、裤子、裙子还是鞋子。");
  const shape = input.shape === undefined && base && base.category === category ? base.shape : input.shape;
  if (typeof shape !== "string" || !WARDROBE_SHAPES[category].some((item) => item.id === shape)) throw new Error("选一个版型。");
  const pattern = input.pattern === undefined ? base?.pattern ?? "solid" : input.pattern;
  if (typeof pattern !== "string" || !(WARDROBE_PATTERNS as readonly string[]).includes(pattern)) throw new Error("花色不对。");
  const rawColors = input.colors === undefined ? base?.colors : input.colors;
  const colors = Array.isArray(rawColors) ? rawColors.map(cleanColor) : [];
  if (!colors[0]) throw new Error("颜色不对。");
  const texture = input.texture === undefined ? base?.texture ?? null : cleanTexture(input.texture);
  if (pattern === "photo" && !texture) throw new Error("照片花色要先从照片里取色。");
  return {
    category, shape, pattern: pattern as WardrobePattern,
    colors: [colors[0], colors[1] || colors[0]],
    ...(texture ? { texture } : {}),
  };
}

function itemsOf(store: Record<string, unknown>): WardrobeItem[] {
  if (!Array.isArray(store.items)) store.items = [];
  return store.items as WardrobeItem[];
}

function outfitOf(store: Record<string, unknown>): Outfit {
  if (!store.outfit || typeof store.outfit !== "object") store.outfit = {};
  return store.outfit as Outfit;
}

export function readWardrobe(store: Record<string, unknown> | null) {
  const items = Array.isArray(store?.items) ? (store.items as WardrobeItem[]) : [];
  const ids = new Set(items.map((item) => item.id));
  const raw = (store?.outfit && typeof store.outfit === "object" ? store.outfit : {}) as Outfit;
  const outfit: Outfit = {};
  for (const slot of OUTFIT_SLOTS) if (raw[slot] && ids.has(raw[slot]!)) outfit[slot] = raw[slot];
  return { items: [...items].sort((a, b) => b.createdAt - a.createdAt), outfit };
}

export function addWardrobeItem(store: Record<string, unknown>, input: Record<string, unknown>, now = Date.now()): WardrobeItem {
  const items = itemsOf(store);
  if (items.length >= WARDROBE_LIMITS.items) throw new Error(`衣柜最多放 ${WARDROBE_LIMITS.items} 件。`);
  const look = cleanLook(input);
  const item: WardrobeItem = {
    id: isWardrobeId(input.id) && !items.some((existing) => existing.id === input.id) ? input.id : crypto.randomUUID(),
    ...look,
    name: cleanText(input.name, WARDROBE_LIMITS.name) || shapeLabel(look.category, look.shape),
    note: cleanNote(input.note),
    photo: cleanPhoto(input.photo),
    createdAt: now,
    updatedAt: now,
  };
  items.push(item);
  return item;
}

export function editWardrobeItem(store: Record<string, unknown>, id: string, input: Record<string, unknown>, now = Date.now()): WardrobeItem {
  const items = itemsOf(store);
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("衣柜里没有这件了，刷新看看。");
  const old = items[index];
  const look = cleanLook(input, old);
  const next: WardrobeItem = {
    ...old,
    ...look,
    ...(look.texture ? {} : { texture: undefined }),
    name: input.name === undefined ? old.name : cleanText(input.name, WARDROBE_LIMITS.name) || shapeLabel(look.category, look.shape),
    note: input.note === undefined ? old.note : cleanNote(input.note),
    photo: input.photo === undefined ? old.photo : cleanPhoto(input.photo),
    updatedAt: now,
  };
  if (!next.texture) delete next.texture;
  items[index] = next;
  // A garment that moved to another slot comes off the doll.
  const outfit = outfitOf(store);
  for (const slot of OUTFIT_SLOTS) if (outfit[slot] === id && slot !== slotOf(next.category)) delete outfit[slot];
  return next;
}

export function removeWardrobeItem(store: Record<string, unknown>, id: string): boolean {
  const items = itemsOf(store);
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return false;
  items.splice(index, 1);
  const outfit = outfitOf(store);
  for (const slot of OUTFIT_SLOTS) if (outfit[slot] === id) delete outfit[slot];
  return true;
}

/** Checks an outfit against the wardrobe: each id must exist and sit in its own slot. */
export function cleanOutfit(items: WardrobeItem[], raw: unknown): Outfit {
  const byId = new Map(items.map((item) => [item.id, item]));
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const outfit: Outfit = {};
  for (const slot of OUTFIT_SLOTS) {
    const id = input[slot];
    if (id === undefined || id === null || id === "") continue;
    const item = typeof id === "string" ? byId.get(id) : undefined;
    if (!item) throw new Error("有一件衣服已经不在衣柜里了，刷新看看。");
    if (slotOf(item.category) !== slot) throw new Error(`「${item.name}」不能穿在${SLOT_LABELS[slot]}的位置。`);
    outfit[slot] = item.id;
  }
  return outfit;
}

export function setWardrobeOutfit(store: Record<string, unknown>, raw: unknown): Outfit {
  const outfit = cleanOutfit(itemsOf(store), raw);
  store.outfit = outfit;
  return outfit;
}

/** Put a list of item ids on, one per slot; later ids win. Unknown ids throw. */
export function outfitFromIds(items: WardrobeItem[], ids: unknown[]): Outfit {
  const byId = new Map(items.map((item) => [item.id, item]));
  const outfit: Outfit = {};
  for (const id of ids) {
    const item = typeof id === "string" ? byId.get(id) : undefined;
    if (!item) throw new Error(`衣柜里没有 ${String(id)}，先用 wardrobe_list 看看 id。`);
    outfit[slotOf(item.category)] = item.id;
  }
  return outfit;
}
