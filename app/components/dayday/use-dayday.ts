"use client";

import { useCallback, useMemo, useState } from "react";
import {
  cycleOf, dayKey, fixedDueKey, newId, previewState, yuan,
  type DaydayState, type Entry, type Item, type Kind, type Product,
} from "./dayday-data";

export type Notice = { text: string; undo?: () => void };

const shelfToCat = (shelf: string) => (["top", "bottom", "shoes"].includes(shelf) ? "clothes" : "misc");
const sum = (list: { amount: number }[]) => list.reduce((total, row) => total + row.amount, 0);

/** The preview ledger: real calculations over in-memory data. The server store comes in step two. */
export function useDayday() {
  const [state, setState] = useState<DaydayState>(previewState);
  const [notice, setNotice] = useState<Notice | null>(null);
  const today = dayKey();
  const cycle = useMemo(() => cycleOf(state.payday, today), [state.payday, today]);

  const view = useMemo(() => {
    const inCycle = (e: Entry) => { const key = dayKey(e.at); return key >= cycle.startKey && key < cycle.endKey; };
    const cycleEntries = state.entries.filter(inCycle).sort((a, b) => b.at.localeCompare(a.at));
    const expenses = state.entries.filter((e) => e.kind === "expense");
    const income = sum(state.entries.filter((e) => e.kind === "income"));
    const remaining = state.startAmount + income - sum(expenses) - state.bank;
    const transit = sum(expenses.filter((e) => e.status === "transit"));
    const doneCycle = cycleEntries.filter((e) => e.kind === "expense" && e.status === "done");
    const spent = sum(doneCycle);
    const cycleIncome = sum(cycleEntries.filter((e) => e.kind === "income"));
    const todaySpent = sum(doneCycle.filter((e) => dayKey(e.at) === today));
    const unpaid = state.fixed.filter((f) => f.paidCycle !== cycle.startKey);
    const reserved = sum(unpaid);
    const perDay = Math.max(0, Math.floor((remaining - reserved) / Math.max(1, cycle.left)));
    const due = unpaid.filter((f) => fixedDueKey(f.day, cycle) <= today);
    const byCat = new Map<string, number>();
    for (const e of doneCycle) byCat.set(e.cat, (byCat.get(e.cat) || 0) + e.amount);
    const cats = [...byCat].map(([cat, amount]) => ({ cat, amount })).sort((a, b) => b.amount - a.amount);
    return { cycleEntries, remaining, transit, spent, cycleIncome, todaySpent, reserved, perDay, due, cats };
  }, [state, cycle, today]);

  const say = (text: string, undo?: () => void) => setNotice({ text, undo });
  const dismiss = useCallback(() => setNotice(null), []);
  const patch = (fn: (s: DaydayState) => DaydayState) => setState(fn);

  const actions = {
    dismiss,
    addEntry(input: { kind: Kind; cat: string; amount: number; note: string; at: string }) {
      const entry: Entry = { id: newId("e"), status: "done", ...input };
      patch((s) => ({ ...s, entries: [...s.entries, entry] }));
      say(`记上啦：${input.note || (input.kind === "income" ? "收入" : "支出")}`, () => { patch((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== entry.id) })); setNotice(null); });
    },
    updateEntry(id: string, input: Partial<Entry>) {
      patch((s) => ({ ...s, entries: s.entries.map((e) => (e.id === id ? { ...e, ...input } : e)) }));
      say("改好了。");
    },
    removeEntry(id: string) {
      const removed = state.entries.find((e) => e.id === id);
      patch((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== id) }));
      if (removed) say("删掉了这一笔。", () => { patch((s) => ({ ...s, entries: [...s.entries, removed] })); setNotice(null); });
    },
    confirmFixed(id: string) {
      const fixed = state.fixed.find((f) => f.id === id);
      if (!fixed) return;
      const entry: Entry = { id: newId("e"), kind: "expense", cat: "phone", amount: fixed.amount, note: fixed.name, at: new Date().toISOString(), status: "done" };
      patch((s) => ({ ...s, entries: [...s.entries, entry], fixed: s.fixed.map((f) => (f.id === id ? { ...f, paidCycle: cycle.startKey } : f)) }));
      say(`${fixed.name} 扣好了。`);
    },
    skipFixed(id: string) {
      patch((s) => ({ ...s, fixed: s.fixed.map((f) => (f.id === id ? { ...f, paidCycle: cycle.startKey } : f)) }));
      say("这期先不扣了。");
    },
    addFixed(name: string, amount: number, day: number) {
      patch((s) => ({ ...s, fixed: [...s.fixed, { id: newId("f"), name, amount, day }] }));
    },
    removeFixed(id: string) { patch((s) => ({ ...s, fixed: s.fixed.filter((f) => f.id !== id) })); },

    addProduct(input: Omit<Product, "id" | "faved" | "carted">) {
      patch((s) => ({ ...s, products: [{ id: newId("p"), faved: false, carted: false, ...input }, ...s.products] }));
      say("放进商城啦。");
    },
    toggle(id: string, key: "faved" | "carted") {
      patch((s) => ({ ...s, products: s.products.map((p) => (p.id === id ? { ...p, [key]: !p[key] } : p)) }));
    },
    removeProduct(id: string) { patch((s) => ({ ...s, products: s.products.filter((p) => p.id !== id) })); say("删掉了。"); },
    placeOrder(lines: { id: string; paid: number }[]) {
      const at = new Date().toISOString();
      patch((s) => {
        const picked = lines.map((line) => ({ line, product: s.products.find((p) => p.id === line.id) })).filter((row): row is { line: typeof lines[number]; product: Product } => !!row.product);
        const entries: Entry[] = [];
        const orders = picked.map(({ line, product }) => {
          const entryId = newId("e");
          const orderId = newId("o");
          entries.push({ id: entryId, kind: "expense", cat: shelfToCat(product.shelf), amount: line.paid, note: product.name, at, status: "transit", orderId });
          return { id: orderId, name: product.name, shelf: product.shelf, image: product.image, paid: line.paid, at, entryId };
        });
        const gone = new Set(picked.map((row) => row.product.id));
        return { ...s, entries: [...s.entries, ...entries], orders: [...orders, ...s.orders], products: s.products.filter((p) => !gone.has(p.id)) };
      });
      say("下单了，钱先扣着，在「运输中」等它到。");
    },
    receive(orderId: string) {
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) return;
      const item: Item = { id: newId("i"), name: order.name, shelf: order.shelf, image: order.image, paid: order.paid, gotAt: today, fromShop: true };
      patch((s) => ({ ...s, orders: s.orders.filter((o) => o.id !== orderId), items: [item, ...s.items], entries: s.entries.map((e) => (e.id === order.entryId ? { ...e, status: "done" } : e)) }));
      say(`「${order.name}」收到啦，放进我的物品了。`);
    },
    returnOrder(orderId: string) {
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) return;
      patch((s) => ({ ...s, orders: s.orders.filter((o) => o.id !== orderId), entries: s.entries.filter((e) => e.id !== order.entryId) }));
      say(`退好了，${yuan(order.paid)} 回来了。`);
    },
    addShelf(label: string) {
      const id = `custom-${label}`;
      patch((s) => (s.shelves.some((x) => x.label === label) ? s : { ...s, shelves: [...s.shelves, { id, label }] }));
      return id;
    },

    addItem(input: Omit<Item, "id">) { patch((s) => ({ ...s, items: [{ id: newId("i"), ...input }, ...s.items] })); say("放进我的物品了。"); },
    removeItem(id: string) { patch((s) => ({ ...s, items: s.items.filter((i) => i.id !== id) })); say("从物品里拿掉了。"); },

    addRefill(name: string) { patch((s) => ({ ...s, refills: [...s.refills, { id: newId("r"), name }] })); },
    doneRefill(id: string, amount: number | null) {
      const refill = state.refills.find((r) => r.id === id);
      if (!refill) return;
      const entry: Entry | null = amount ? { id: newId("e"), kind: "expense", cat: "daily", amount, note: refill.name, at: new Date().toISOString(), status: "done" } : null;
      patch((s) => ({ ...s, refills: s.refills.filter((r) => r.id !== id), entries: entry ? [...s.entries, entry] : s.entries }));
      say(entry ? `${refill.name} 补上了，也记了一笔日用。` : `${refill.name} 补上了。`);
    },

    bank(direction: "in" | "out", amount: number) {
      patch((s) => ({ ...s, bank: Math.max(0, s.bank + (direction === "in" ? amount : -amount)) }));
      say(direction === "in" ? "存进去啦，真棒。" : "取出来了。");
    },
    setSettings(payday: number, startAmount: number) { patch((s) => ({ ...s, payday, startAmount })); say("设置好了。"); },
  };

  return { state, cycle, today, view, notice, actions };
}
export type Dayday = ReturnType<typeof useDayday>;
