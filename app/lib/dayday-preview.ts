/** Local interface preview only. These values never represent a server balance or order. */
export const DAYDAY_CATEGORIES = ["全部", "饮食", "衣物", "日用", "书籍", "小砖专属"] as const;
export type DaydayCategory = typeof DAYDAY_CATEGORIES[number];
export type DaydayProduct = {
  id: string; name: string; category: Exclude<DaydayCategory, "全部">;
  price: number; icon: string; color: string; note: string; tag: string;
};
export const DAYDAY_PRODUCTS: DaydayProduct[] = [
  { id: "meal", name: "番茄鸡蛋饭", category: "饮食", price: 18, icon: "🍱", color: "peach", note: "热乎乎的一餐，配一碗今日例汤。", tag: "好好吃饭" },
  { id: "milk", name: "早餐牛奶与吐司", category: "饮食", price: 12, icon: "🥛", color: "blue", note: "慢慢醒来，也记得吃早餐。", tag: "早安套餐" },
  { id: "shirt", name: "柔软的蓝色衬衫", category: "衣物", price: 89, icon: "👕", color: "blue", note: "晴天出门穿的一件日常衬衫。", tag: "本周上新" },
  { id: "tissue", name: "云朵抽纸 · 三包装", category: "日用", price: 15, icon: "🧻", color: "cream", note: "家里常备的小东西，用完记得补货。", tag: "生活必需" },
  { id: "book", name: "留给傍晚的一本书", category: "书籍", price: 36, icon: "📖", color: "pink", note: "等有空的时候，坐下来读几页。", tag: "慢慢读" },
  { id: "brick", name: "小砖的秘密礼物", category: "小砖专属", price: 52, icon: "🎁", color: "pink", note: "为小砖留出的专属货架。", tag: "专属小心意" },
];
export type DaydayDraft = {
  cart: Record<string, number>; wishes: string[];
  routine: { meals: boolean; walks: boolean; times: number; notify: boolean };
};
export function emptyDaydayDraft(): DaydayDraft {
  return { cart: {}, wishes: [], routine: { meals: true, walks: true, times: 7, notify: true } };
}
export const DAYDAY_PREVIEW_KEY = "iooi:dayday:preview:v1";
export function readDaydayDraft(): DaydayDraft {
  try {
    const raw = JSON.parse(localStorage.getItem(DAYDAY_PREVIEW_KEY) || "null");
    const draft = emptyDaydayDraft();
    for (const product of DAYDAY_PRODUCTS) {
      const quantity = raw?.cart?.[product.id];
      if (Number.isInteger(quantity) && quantity > 0) draft.cart[product.id] = Math.min(quantity, 99);
    }
    draft.wishes = DAYDAY_PRODUCTS.filter((p) => Array.isArray(raw?.wishes) && raw.wishes.includes(p.id)).map((p) => p.id);
    for (const key of ["meals", "walks", "notify"] as const) {
      if (typeof raw?.routine?.[key] === "boolean") draft.routine[key] = raw.routine[key];
    }
    if (Number.isInteger(raw?.routine?.times)) draft.routine.times = Math.max(3, Math.min(12, raw.routine.times));
    return draft;
  } catch { return emptyDaydayDraft(); }
}
