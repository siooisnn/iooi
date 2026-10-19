// dayday 记账: her real money. Shapes, rules and sums shared by the page, the
// /api/dayday route and his tools. No I/O here; dayday-store.ts saves the book.
// Money is always kept in cents. Days are Beijing calendar days (YYYY-MM-DD).

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
  faved: boolean; carted: boolean; susuSays?: string; addedAt: string;
};
export type Order = { id: string; name: string; shelf: string; image?: string; paid: number; at: string; entryId: string };
export type Item = { id: string; name: string; shelf: string; paid?: number; image?: string; gotAt: string; note?: string; fromShop?: boolean };
export type Fixed = { id: string; name: string; amount: number; day: number; paidCycle?: string };
export type Refill = { id: string; name: string; addedAt: string };
export type BankMove = { id: string; at: string; amount: number };
export type MoneyGift = {
  id: string; kind: "redpacket" | "transfer"; from: "her" | "susu";
  amount: number; note: string; at: string; status: "pending" | "received" | "returned";
};
export type Summary = {
  id: string; startKey: string; range: string; income: number; expense: number; saved: number;
  cats: { cat: string; amount: number }[];
};

export type DaydayBook = {
  version: 1;
  /** False until she has told it how much she has right now. */
  configured: boolean;
  payday: number;
  startAmount: number;
  /** Net of the entries already folded into summaries, so the balance survives compaction. */
  folded: number;
  bank: number;
  bankMoves: BankMove[];
  entries: Entry[];
  products: Product[];
  orders: Order[];
  items: Item[];
  fixed: Fixed[];
  refills: Refill[];
  summaries: Summary[];
  shelves: Shelf[];
  receipts: string[];
  gifts: MoneyGift[];
  receiptResults: Record<string, unknown>;
};

/** Old cycles keep their details this many days into the new one, so she can still fix them. */
export const GRACE_DAYS = 3;
export const DAYDAY_LIMITS = { entries: 3000, products: 500, items: 1000, fixed: 30, refills: 50, shelves: 24, receipts: 200 };

export class DaydayError extends Error {}
const fail = (message: string): never => { throw new DaydayError(message); };

/* ━━ Money and days ━━ */

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
export function dayKey(date: Date | string | number = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));
}
export function timeOf(at: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(at));
}
export const shortDay = (key: string) => `${Number(key.slice(5, 7))}.${Number(key.slice(8, 10))}`;
export function dayLabel(key: string) {
  const week = "日一二三四五六"[new Date(`${key}T12:00:00+08:00`).getUTCDay()];
  return `${shortDay(key)} 周${week}`;
}

const DAY_MS = 86_400_000;
const keyMs = (key: string) => Date.parse(`${key}T00:00:00Z`);
export function addDays(key: string, days: number) {
  return new Date(keyMs(key) + days * DAY_MS).toISOString().slice(0, 10);
}
function addMonths(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
function keyOf(year: number, month: number, day: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

export type Cycle = ReturnType<typeof cycleOf>;
/** Her cycle runs from payday to the day before the next payday, in Beijing time. */
export function cycleOf(payday: number, today = dayKey()) {
  const [y, m, d] = today.split("-").map(Number);
  const start = d >= payday ? { year: y, month: m } : addMonths(y, m, -1);
  const next = addMonths(start.year, start.month, 1);
  const startKey = keyOf(start.year, start.month, payday);
  const endKey = keyOf(next.year, next.month, payday);
  const total = Math.round((keyMs(endKey) - keyMs(startKey)) / DAY_MS);
  const passed = Math.round((keyMs(today) - keyMs(startKey)) / DAY_MS) + 1;
  return { startKey, endKey, total, passed, left: total - passed + 1, label: `${shortDay(startKey)} – ${shortDay(addDays(endKey, -1))}` };
}

/** The date a monthly charge falls on inside this cycle. */
export function fixedDueKey(day: number, cycle: { startKey: string; endKey: string }) {
  const [y, m] = cycle.startKey.split("-").map(Number);
  const first = keyOf(y, m, day);
  if (first >= cycle.startKey && first < cycle.endKey) return first;
  const next = addMonths(y, m, 1);
  return keyOf(next.year, next.month, day);
}

/* ━━ The book ━━ */

export function emptyBook(): DaydayBook {
  return {
    version: 1, configured: false, payday: 15, startAmount: 0, folded: 0, bank: 0, bankMoves: [],
    entries: [], products: [], orders: [], items: [], fixed: [], refills: [], summaries: [], shelves: [...BASE_SHELVES], receipts: [], gifts: [], receiptResults: {},
  };
}

/** The saved file, with anything missing filled in. Unknown keys are dropped. */
export function parseBook(raw: unknown): DaydayBook {
  const base = emptyBook();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const list = <T,>(value: unknown) => (Array.isArray(value) ? (value as T[]) : []);
  const num = (value: unknown, fallback: number) => (Number.isFinite(value) ? (value as number) : fallback);
  const shelves = list<Shelf>(r.shelves);
  return {
    version: 1,
    configured: r.configured === true,
    payday: num(r.payday, base.payday),
    startAmount: num(r.startAmount, 0),
    folded: num(r.folded, 0),
    bank: num(r.bank, 0),
    bankMoves: list(r.bankMoves),
    entries: list(r.entries),
    products: list(r.products),
    orders: list(r.orders),
    items: list(r.items),
    fixed: list(r.fixed),
    refills: list(r.refills),
    summaries: list(r.summaries),
    shelves: [...BASE_SHELVES, ...shelves.filter((s) => !BASE_SHELVES.some((b) => b.id === s.id))],
    receipts: list(r.receipts),
    gifts: list(r.gifts),
    receiptResults: r.receiptResults && typeof r.receiptResults === "object" ? r.receiptResults as Record<string, unknown> : {},
  };
}

const sum = (list: { amount: number }[]) => list.reduce((total, row) => total + row.amount, 0);
const inside = (key: string, cycle: { startKey: string; endKey: string }) => key >= cycle.startKey && key < cycle.endKey;

/** Everything the ledger page (and his overview) shows, from the book and today's date. */
export function ledgerView(book: DaydayBook, today = dayKey()) {
  const cycle = cycleOf(book.payday, today);
  const newest = (a: Entry, b: Entry) => b.at.localeCompare(a.at);
  const cycleEntries = book.entries.filter((e) => inside(dayKey(e.at), cycle)).sort(newest);
  // Last cycle's details stay visible for a few days before they fold into its summary.
  const prevCycle = cycleOf(book.payday, addDays(cycle.startKey, -1));
  const prevEntries = book.entries.filter((e) => e.status === "done" && inside(dayKey(e.at), prevCycle)).sort(newest);
  const expenses = book.entries.filter((e) => e.kind === "expense");
  const income = sum(book.entries.filter((e) => e.kind === "income"));
  const giftHeld = sum(book.gifts.filter((g) => g.status === "pending"));
  const remaining = book.startAmount + book.folded + income - sum(expenses) - book.bank - giftHeld;
  const transit = sum(expenses.filter((e) => e.status === "transit"));
  const doneCycle = cycleEntries.filter((e) => e.kind === "expense" && e.status === "done");
  const spent = sum(doneCycle);
  const cycleIncome = sum(cycleEntries.filter((e) => e.kind === "income"));
  const todaySpent = sum(doneCycle.filter((e) => dayKey(e.at) === today));
  const unpaid = book.fixed.filter((f) => f.paidCycle !== cycle.startKey);
  const reserved = sum(unpaid);
  const perDay = Math.max(0, Math.floor((remaining - reserved) / Math.max(1, cycle.left)));
  const due = unpaid.filter((f) => fixedDueKey(f.day, cycle) <= today);
  const byCat = new Map<string, number>();
  for (const e of doneCycle) byCat.set(e.cat, (byCat.get(e.cat) || 0) + e.amount);
  const cats = [...byCat].map(([cat, amount]) => ({ cat, amount })).sort((a, b) => b.amount - a.amount);
  return {
    cycle, cycleEntries, remaining, transit, giftHeld, spent, cycleIncome, todaySpent, reserved, perDay, due, cats,
    prev: prevEntries.length ? { cycle: prevCycle, entries: prevEntries, foldsOn: addDays(cycle.startKey, GRACE_DAYS) } : null,
  };
}
export type LedgerView = ReturnType<typeof ledgerView>;

/**
 * Fold finished entries and piggy-bank moves from old cycles into their summaries.
 * The previous cycle is kept whole until GRACE_DAYS into the current one.
 * Orders still in transit stay as they are until she receives or returns them.
 */
export function settleBook(book: DaydayBook, today = dayKey()) {
  const current = cycleOf(book.payday, today);
  const cutoff = today >= addDays(current.startKey, GRACE_DAYS) ? current.startKey : cycleOf(book.payday, addDays(current.startKey, -1)).startKey;
  const oldEntries = book.entries.filter((e) => e.status === "done" && dayKey(e.at) < cutoff);
  const oldMoves = book.bankMoves.filter((m) => dayKey(m.at) < cutoff);
  if (!oldEntries.length && !oldMoves.length) return false;

  const summaryFor = (key: string) => {
    const cycle = cycleOf(book.payday, key);
    let summary = book.summaries.find((s) => s.startKey === cycle.startKey);
    if (!summary) {
      summary = { id: `s-${cycle.startKey}`, startKey: cycle.startKey, range: cycle.label, income: 0, expense: 0, saved: 0, cats: [] };
      book.summaries.push(summary);
    }
    return summary;
  };
  for (const e of oldEntries) {
    const summary = summaryFor(dayKey(e.at));
    if (e.kind === "income") { summary.income += e.amount; book.folded += e.amount; continue; }
    summary.expense += e.amount;
    book.folded -= e.amount;
    const row = summary.cats.find((c) => c.cat === e.cat);
    if (row) row.amount += e.amount; else summary.cats.push({ cat: e.cat, amount: e.amount });
  }
  for (const m of oldMoves) summaryFor(dayKey(m.at)).saved += m.amount;
  for (const s of book.summaries) s.cats.sort((a, b) => b.amount - a.amount);
  book.summaries.sort((a, b) => b.startKey.localeCompare(a.startKey));
  const gone = new Set(oldEntries.map((e) => e.id));
  book.entries = book.entries.filter((e) => !gone.has(e.id));
  const movedOut = new Set(oldMoves.map((m) => m.id));
  book.bankMoves = book.bankMoves.filter((m) => !movedOut.has(m.id));
  return true;
}

/* ━━ Commands ━━ */

function text(value: unknown, max: number, label: string, required = false) {
  const clean = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (required && !clean) fail(`${label}要填。`);
  if (clean.length > max) fail(`${label}最多 ${max} 个字。`);
  return clean;
}
function cents(value: unknown, label = "金额", allowZero = false) {
  if (!Number.isInteger(value) || (value as number) < (allowZero ? 0 : 1) || (value as number) >= 100_000_000) fail(`${label}不对。`);
  return value as number;
}
function whole(value: unknown, min: number, max: number, label: string) {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) fail(`${label}不对。`);
  return value as number;
}
function moment(value: unknown, now: Date) {
  const ms = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(ms) || ms < Date.UTC(2020, 0, 1) || ms > now.getTime() + 2 * DAY_MS) fail("时间不对。");
  return new Date(ms).toISOString();
}
function image(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^\/uploads\/[A-Za-z0-9._-]{1,120}$/.test(value)) fail("图片地址不对，请重新上传。");
  return value as string;
}
function link(value: unknown) {
  const clean = text(value, 500, "链接");
  if (!clean) return undefined;
  try { const url = new URL(clean); if (url.protocol === "http:" || url.protocol === "https:") return url.href; } catch {}
  return fail("链接要以 http 或 https 开头。");
}
function catFor(kind: Kind, value: unknown) {
  const cats = kind === "expense" ? EXPENSE_CATS : INCOME_CATS;
  if (typeof value !== "string" || !cats.some((c) => c.id === value)) fail("分类不对。");
  return value as string;
}
function shelfIn(book: DaydayBook, value: unknown) {
  if (typeof value !== "string" || !book.shelves.some((s) => s.id === value)) fail("分类不对。");
  return value as string;
}
function find<T extends { id: string }>(list: T[], id: unknown, what: string): T {
  return list.find((row) => row.id === id) || fail(`${what}已经不在了，刷新看看。`);
}
function room(list: unknown[], max: number, what: string) {
  if (list.length >= max) fail(`${what}太多了，先清理一些。`);
}
function newId(prefix: string) {
  return `${prefix}${globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}
const shelfToCat = (shelf: string) => (["top", "bottom", "shoes"].includes(shelf) ? "clothes" : "misc");

export type DaydayContext = { now: Date; bySusu?: boolean };

/** Apply one action to the book in place. Throws DaydayError with a message for her. */
export function applyDayday(book: DaydayBook, action: string, input: Record<string, unknown>, ctx: DaydayContext): unknown {
  const nowIso = ctx.now.toISOString();
  const today = dayKey(ctx.now);
  const entryFields = () => {
    const kind: Kind = input.kind === "income" ? "income" : input.kind === "expense" ? "expense" : fail("收入还是支出？");
    return { kind, cat: catFor(kind, input.cat), amount: cents(input.amount), note: text(input.note, 40, "备注"), at: input.at === undefined ? nowIso : moment(input.at, ctx.now) };
  };
  const addEntry = (fields: Omit<Entry, "id">) => {
    room(book.entries, DAYDAY_LIMITS.entries, "记录");
    const entry: Entry = { id: newId("e"), ...fields, ...(ctx.bySusu ? { bySusu: true } : {}) };
    book.entries.push(entry);
    return entry;
  };

  switch (action) {
    case "money.send": {
      if (!book.configured) fail("先在 dayday 填好起始余额。");
      if (input.kind !== "redpacket" && input.kind !== "transfer") fail("红包还是转账？");
      const amount = cents(input.amount);
      if (amount > ledgerView(book, today).remaining) fail("余额不够啦。");
      room(book.gifts, 3000, "红包转账记录");
      const gift: MoneyGift = { id: newId("g"), kind: input.kind as MoneyGift["kind"], from: ctx.bySusu ? "susu" : "her", amount,
        note: text(input.note, 40, "留言"), at: nowIso, status: "pending" };
      book.gifts.push(gift);
      return gift;
    }
    case "money.receive":
    case "money.return": {
      const gift = find(book.gifts, input.id, "这笔红包或转账");
      if (gift.from === (ctx.bySusu ? "susu" : "her")) fail("要收款方来领取或退回。");
      if (gift.status !== "pending") return gift;
      gift.status = action === "money.receive" ? "received" : "returned";
      return gift;
    }
    case "entry.add":
      return addEntry({ ...entryFields(), status: "done" });
    case "entry.update": {
      const entry = find(book.entries, input.id, "这一笔");
      if (entry.status === "transit") fail("这一笔还在运输中，去商城确认收货或退货。");
      Object.assign(entry, { ...entryFields(), at: input.at === undefined ? entry.at : moment(input.at, ctx.now) });
      return entry;
    }
    case "entry.remove": {
      const entry = find(book.entries, input.id, "这一笔");
      if (entry.status === "transit") fail("这一笔还在运输中，去商城确认收货或退货。");
      book.entries = book.entries.filter((e) => e.id !== entry.id);
      return entry;
    }

    case "fixed.update": {
      const fixed = find(book.fixed, input.id, "这项必支出");
      Object.assign(fixed, { name: text(input.name, 16, "名称", true), amount: cents(input.amount), day: whole(input.day, 1, 31, "日子") });
      return fixed;
    }
    case "fixed.add": {
      room(book.fixed, DAYDAY_LIMITS.fixed, "必支出");
      const fixed: Fixed = { id: newId("f"), name: text(input.name, 16, "名称", true), amount: cents(input.amount), day: whole(input.day, 1, 31, "日子") };
      book.fixed.push(fixed);
      return fixed;
    }
    case "fixed.remove": {
      const fixed = find(book.fixed, input.id, "这项必支出");
      book.fixed = book.fixed.filter((f) => f.id !== fixed.id);
      return fixed;
    }
    case "fixed.pay":
    case "fixed.skip": {
      if (ctx.bySusu) fail("必支出要她点卡片确认，不能自动扣或跳过。");
      const fixed = find(book.fixed, input.id, "这项必支出");
      const cycle = cycleOf(book.payday, today);
      if (input.cycle !== undefined && input.cycle !== cycle.startKey) fail("这是旧周期的提醒，请刷新后再处理。");
      if (fixed.paidCycle === cycle.startKey) fail(`${fixed.name}这期已经处理过了。`);
      fixed.paidCycle = cycle.startKey;
      return action === "fixed.pay" ? addEntry({ kind: "expense", cat: "phone", amount: fixed.amount, note: fixed.name, at: nowIso, status: "done" }) : fixed;
    }

    case "product.add": {
      room(book.products, DAYDAY_LIMITS.products, "商城里的东西");
      const product: Product = {
        id: newId("p"), name: text(input.name, 40, "名称", true), price: cents(input.price, "价格"), shelf: shelfIn(book, input.shelf),
        reason: text(input.reason, 300, "理由"), link: link(input.link), image: image(input.image), faved: false, carted: false, addedAt: nowIso,
      };
      book.products.unshift(product);
      return product;
    }
    case "product.toggle": {
      const product = find(book.products, input.id, "这件");
      if (input.key !== "faved" && input.key !== "carted") fail("不认识这个操作。");
      const key = input.key as "faved" | "carted";
      product[key] = typeof input.on === "boolean" ? input.on : !product[key];
      return product;
    }
    case "product.remove": {
      const product = find(book.products, input.id, "这件");
      book.products = book.products.filter((p) => p.id !== product.id);
      return product;
    }
    case "product.say": {
      if (!ctx.bySusu) fail("「酥酥说」只有酥酥能写。");
      const product = find(book.products, input.id, "这件");
      const said = text(input.text, 300, "酥酥说");
      if (said) product.susuSays = said; else delete product.susuSays;
      return product;
    }

    case "order.place": {
      const lines = Array.isArray(input.lines) ? input.lines as Record<string, unknown>[] : [];
      if (!lines.length || lines.length > 50) fail("购物车是空的。");
      const ids = new Set<unknown>();
      const picked = lines.map((line) => {
        if (ids.has(line?.id)) fail("同一件不能下两次。");
        ids.add(line?.id);
        return { product: find(book.products, line?.id, "购物车里有一件"), paid: cents(line?.paid, "实付") };
      });
      room(book.entries, DAYDAY_LIMITS.entries - picked.length + 1, "记录");
      const orders = picked.map(({ product, paid }) => {
        const orderId = newId("o");
        const entry = addEntry({ kind: "expense", cat: shelfToCat(product.shelf), amount: paid, note: product.name, at: nowIso, status: "transit", orderId });
        return { id: orderId, name: product.name, shelf: product.shelf, ...(product.image ? { image: product.image } : {}), paid, at: nowIso, entryId: entry.id };
      });
      book.products = book.products.filter((p) => !ids.has(p.id));
      book.orders.unshift(...orders);
      return orders;
    }
    case "order.receive": {
      const order = find(book.orders, input.id, "这一单");
      room(book.items, DAYDAY_LIMITS.items, "物品");
      const entry = book.entries.find((e) => e.id === order.entryId);
      if (entry) entry.status = "done";
      book.orders = book.orders.filter((o) => o.id !== order.id);
      const item: Item = { id: newId("i"), name: order.name, shelf: order.shelf, paid: order.paid, gotAt: today, fromShop: true, ...(order.image ? { image: order.image } : {}) };
      book.items.unshift(item);
      return item;
    }
    case "order.return": {
      const order = find(book.orders, input.id, "这一单");
      book.orders = book.orders.filter((o) => o.id !== order.id);
      book.entries = book.entries.filter((e) => e.id !== order.entryId);
      return order;
    }

    case "shelf.add": {
      const label = text(input.label, 6, "分类名", true);
      const same = book.shelves.find((s) => s.label === label);
      if (same) return same;
      room(book.shelves, DAYDAY_LIMITS.shelves, "分类");
      const shelf = { id: newId("c"), label };
      book.shelves.push(shelf);
      return shelf;
    }

    case "item.add": {
      room(book.items, DAYDAY_LIMITS.items, "物品");
      const gotAt = typeof input.gotAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.gotAt) && input.gotAt <= today ? input.gotAt : fail("入手日期不对。");
      const note = text(input.note, 80, "备注");
      const item: Item = {
        id: newId("i"), name: text(input.name, 40, "名称", true), shelf: shelfIn(book, input.shelf), gotAt,
        ...(input.paid === undefined || input.paid === null ? {} : { paid: cents(input.paid, "价格") }),
        ...(note ? { note } : {}), ...(image(input.image) ? { image: image(input.image) } : {}),
      };
      book.items.unshift(item);
      return item;
    }
    case "item.remove": {
      const item = find(book.items, input.id, "这件物品");
      book.items = book.items.filter((i) => i.id !== item.id);
      return item;
    }

    case "refill.update": {
      const refill = find(book.refills, input.id, "这项待补");
      refill.name = text(input.name, 30, "名称", true);
      return refill;
    }
    case "refill.add": {
      const name = text(input.name, 20, "名字", true);
      const same = book.refills.find((r) => r.name === name);
      if (same) return same;
      room(book.refills, DAYDAY_LIMITS.refills, "待补");
      const refill: Refill = { id: newId("r"), name, addedAt: nowIso };
      book.refills.push(refill);
      return refill;
    }
    case "refill.done": {
      const refill = find(book.refills, input.id, "这一项");
      const amount = input.amount === undefined || input.amount === null ? null : cents(input.amount);
      book.refills = book.refills.filter((r) => r.id !== refill.id);
      return amount ? addEntry({ kind: "expense", cat: "daily", amount, note: refill.name, at: nowIso, status: "done" }) : refill;
    }

    case "bank.move": {
      const amount = cents(input.amount);
      const into = input.direction === "in" ? true : input.direction === "out" ? false : fail("存还是取？");
      if (into && amount > ledgerView(book, today).remaining) fail("剩余没有这么多。");
      if (!into && amount > book.bank) fail("存钱罐里没有这么多。");
      book.bank += into ? amount : -amount;
      const move = { id: newId("b"), at: nowIso, amount: into ? amount : -amount };
      book.bankMoves.push(move);
      return move;
    }

    case "settings.set": {
      if (ctx.bySusu) fail("设置只有她能改。");
      book.payday = whole(input.payday, 1, 28, "发生活费的日子");
      book.startAmount = cents(input.startAmount, "起始金额", true);
      book.configured = true;
      return { payday: book.payday, startAmount: book.startAmount };
    }
  }
  return fail("不认识这个操作。");
}
