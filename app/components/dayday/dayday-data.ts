// dayday 记账: shapes, categories, money and cycle helpers, and the preview data.
// Step one is front end only, so everything here lives in memory and resets on reload.

export type Kind = "expense" | "income";
export type Category = { id: string; label: string; mark: string; tint: string };

export const EXPENSE_CATS: Category[] = [
  { id: "food", label: "饮食", mark: "饭", tint: "#ffb37a" },
  { id: "daily", label: "日用", mark: "日", tint: "#7ccfd6" },
  { id: "clothes", label: "服饰", mark: "衣", tint: "#ff8fc0" },
  { id: "misc", label: "乱七八糟", mark: "杂", tint: "#c9a2f0" },
  { id: "transport", label: "交通", mark: "车", tint: "#7fb2f0" },
  { id: "phone", label: "话费订阅", mark: "订", tint: "#8fd18a" },
  { id: "fun", label: "娱乐", mark: "玩", tint: "#ffd36b" },
  { id: "medical", label: "医疗", mark: "药", tint: "#f49a9a" },
  { id: "study", label: "学习", mark: "书", tint: "#9fb4e0" },
  { id: "gift", label: "人情礼物", mark: "礼", tint: "#f5a3d6" },
  { id: "other", label: "其他", mark: "他", tint: "#b8b8c8" },
];

export const INCOME_CATS: Category[] = [
  { id: "allowance", label: "生活费", mark: "薪", tint: "#ff8fc0" },
  { id: "parttime", label: "兼职", mark: "兼", tint: "#7fb2f0" },
  { id: "redpacket", label: "红包", mark: "包", tint: "#f47a7a" },
  { id: "refund", label: "退款", mark: "退", tint: "#8fd18a" },
  { id: "other-in", label: "其他", mark: "他", tint: "#b8b8c8" },
];

const ALL_CATS = [...EXPENSE_CATS, ...INCOME_CATS];
export function categoryOf(id: string): Category {
  return ALL_CATS.find((c) => c.id === id) || EXPENSE_CATS[EXPENSE_CATS.length - 1];
}

/** Shop and 我的物品 share these; she can add her own. */
export const BASE_SHELVES = [
  { id: "misc", label: "乱七八糟" },
  { id: "top", label: "上衣" },
  { id: "bottom", label: "下衣" },
  { id: "shoes", label: "鞋袜" },
];
export type Shelf = { id: string; label: string };

export type Entry = {
  id: string; kind: Kind; cat: string; amount: number; note: string; at: string;
  bySusu?: boolean; status: "done" | "transit"; orderId?: string;
};
export type Product = {
  id: string; name: string; price: number; shelf: string; reason: string; link?: string; image?: string;
  faved: boolean; carted: boolean; susuSays?: string;
};
export type Order = { id: string; name: string; shelf: string; image?: string; paid: number; at: string; entryId: string };
export type Item = { id: string; name: string; shelf: string; paid?: number; image?: string; gotAt: string; note?: string; fromShop?: boolean };
export type Fixed = { id: string; name: string; amount: number; day: number; paidCycle?: string };
export type Refill = { id: string; name: string };
export type Summary = { id: string; range: string; income: number; expense: number; saved: number; cats: { cat: string; amount: number }[] };

/** Money is always kept in cents. */
export function yuan(cents: number, sign = false) {
  const text = (Math.abs(cents) / 100).toFixed(2).replace(/\.00$/, "");
  return `${cents < 0 ? "-" : sign ? "+" : ""}¥${text}`;
}
export function parseYuan(input: string): number | null {
  const clean = input.trim().replace(/^¥/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const cents = Math.round(Number(clean) * 100);
  return cents > 0 && cents < 100_000_000 ? cents : null;
}

/** Beijing calendar date as YYYY-MM-DD. */
export function dayKey(date: Date | string = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));
}
export function timeOf(at: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(at));
}
const shortDay = (key: string) => `${Number(key.slice(5, 7))}.${Number(key.slice(8, 10))}`;
export function dayLabel(key: string) {
  const week = "日一二三四五六"[new Date(`${key}T12:00:00+08:00`).getUTCDay()];
  return `${shortDay(key)} 周${week}`;
}

function addMonths(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
function keyOf(year: number, month: number, day: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

/** Her cycle runs from payday to the day before the next payday, in Beijing time. */
export function cycleOf(payday: number, today = dayKey()) {
  const [y, m, d] = today.split("-").map(Number);
  const start = d >= payday ? { year: y, month: m } : addMonths(y, m, -1);
  const next = addMonths(start.year, start.month, 1);
  const startKey = keyOf(start.year, start.month, payday);
  const endKey = keyOf(next.year, next.month, payday);
  const dayMs = 86_400_000;
  const toMs = (key: string) => Date.parse(`${key}T00:00:00Z`);
  const total = Math.round((toMs(endKey) - toMs(startKey)) / dayMs);
  const passed = Math.round((toMs(today) - toMs(startKey)) / dayMs) + 1;
  const lastKey = dayKey(new Date(toMs(endKey) - dayMs));
  return { startKey, endKey, total, passed, left: total - passed + 1, label: `${shortDay(startKey)} – ${shortDay(lastKey)}` };
}

/** The date a monthly charge falls on inside this cycle. */
export function fixedDueKey(day: number, cycle: { startKey: string; endKey: string }) {
  const [y, m] = cycle.startKey.split("-").map(Number);
  const first = keyOf(y, m, day);
  if (first >= cycle.startKey && first < cycle.endKey) return first;
  const next = addMonths(y, m, 1);
  return keyOf(next.year, next.month, day);
}

let seq = 0;
export function newId(prefix: string) {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

/* ━━ Preview data ━━ */
function at(daysAgo: number, time: string) {
  const key = dayKey(new Date(Date.now() - daysAgo * 86_400_000));
  return new Date(`${key}T${time}:00+08:00`).toISOString();
}

export function previewState() {
  const entries: Entry[] = [
    { id: "e1", kind: "expense", cat: "food", amount: 1800, note: "午饭 黄焖鸡", at: at(0, "12:20"), bySusu: true, status: "done" },
    { id: "e2", kind: "expense", cat: "food", amount: 1200, note: "奶茶 少糖", at: at(0, "15:40"), bySusu: true, status: "done" },
    { id: "e3", kind: "expense", cat: "transport", amount: 400, note: "地铁", at: at(0, "09:05"), status: "done" },
    { id: "e4", kind: "expense", cat: "clothes", amount: 12900, note: "奶白麻花毛衣", at: at(1, "22:14"), status: "transit", orderId: "o1" },
    { id: "e5", kind: "expense", cat: "daily", amount: 3990, note: "洗面奶", at: at(1, "19:30"), status: "done" },
    { id: "e6", kind: "income", cat: "parttime", amount: 12000, note: "家教一次", at: at(2, "20:00"), status: "done" },
    { id: "e7", kind: "expense", cat: "phone", amount: 3000, note: "话费", at: at(3, "10:00"), status: "done" },
    { id: "e8", kind: "expense", cat: "food", amount: 2650, note: "和室友吃麻辣烫", at: at(3, "18:40"), bySusu: true, status: "done" },
    { id: "e9", kind: "expense", cat: "misc", amount: 990, note: "小熊发夹", at: at(4, "16:10"), status: "done" },
  ];
  const products: Product[] = [
    { id: "p1", name: "复古格纹针织开衫", price: 15900, shelf: "top", reason: "秋天穿刚好，颜色好温柔，但我好像有一件灰色的了…", faved: true, carted: true, susuSays: "你物品里那件灰开衫是长款，这件短款配高腰裙会更精神。要是想要，等这周花得稳一点再下单。" },
    { id: "p2", name: "灯芯绒阔腿裤 杏色", price: 9800, shelf: "bottom", reason: "想要一条不是牛仔的裤子", faved: true, carted: false },
    { id: "p3", name: "小兔子中筒袜 三双", price: 2290, shelf: "shoes", reason: "太可爱了！！", faved: false, carted: true },
    { id: "p4", name: "像素小猫钥匙扣", price: 1500, shelf: "misc", reason: "挂书包上", faved: false, carted: false },
    { id: "p5", name: "蝴蝶结玛丽珍鞋", price: 19900, shelf: "shoes", reason: "看了三天了，还是喜欢", faved: true, carted: false },
    { id: "p6", name: "蓝白条纹衬衫", price: 8900, shelf: "top", reason: "", faved: false, carted: false },
  ];
  const orders: Order[] = [{ id: "o1", name: "奶白麻花毛衣", shelf: "top", paid: 12900, at: at(1, "22:14"), entryId: "e4" }];
  const items: Item[] = [
    { id: "i1", name: "灰色长款开衫", shelf: "top", paid: 13900, gotAt: dayKey(new Date(Date.now() - 40 * 86_400_000)), note: "去年秋天买的" },
    { id: "i2", name: "直筒牛仔裤", shelf: "bottom", gotAt: dayKey(new Date(Date.now() - 200 * 86_400_000)) },
    { id: "i3", name: "白色帆布鞋", shelf: "shoes", paid: 8900, gotAt: dayKey(new Date(Date.now() - 90 * 86_400_000)) },
    { id: "i4", name: "小熊发夹", shelf: "misc", paid: 990, gotAt: dayKey(new Date(Date.now() - 4 * 86_400_000)), fromShop: true },
  ];
  const fixed: Fixed[] = [
    { id: "f1", name: "话费", amount: 3000, day: 16, paidCycle: cycleOf(15).startKey },
    { id: "f2", name: "音乐会员", amount: 1500, day: Number(dayKey().slice(8, 10)) },
    { id: "f3", name: "视频会员", amount: 2500, day: 25 },
    { id: "f4", name: "云盘", amount: 600, day: 5 },
  ];
  const refills: Refill[] = [{ id: "r1", name: "卫生纸" }, { id: "r2", name: "湿厕纸" }, { id: "r3", name: "洗发水" }];
  const summaries: Summary[] = [
    { id: "s1", range: "9.15 – 10.14", income: 210000, expense: 168400, saved: 20000, cats: [
      { cat: "food", amount: 72000 }, { cat: "clothes", amount: 38900 }, { cat: "daily", amount: 18600 }, { cat: "misc", amount: 14500 }, { cat: "phone", amount: 7000 }, { cat: "transport", amount: 9400 }, { cat: "fun", amount: 8000 },
    ] },
    { id: "s2", range: "8.15 – 9.14", income: 200000, expense: 189200, saved: 5000, cats: [
      { cat: "food", amount: 69800 }, { cat: "clothes", amount: 61200 }, { cat: "daily", amount: 21000 }, { cat: "misc", amount: 16200 }, { cat: "phone", amount: 7000 }, { cat: "study", amount: 14000 },
    ] },
  ];
  return { payday: 15, startAmount: 200000, bank: 30000, entries, products, orders, items, fixed, refills, summaries, shelves: [...BASE_SHELVES] as Shelf[] };
}
export type DaydayState = ReturnType<typeof previewState>;
