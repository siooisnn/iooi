"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/app/lib/client-api";
import { dayKey, ledgerView, yuan, type DaydayBook, type Entry, type Item, type Kind, type Order, type Product, type Refill, type Shelf } from "@/app/lib/dayday-ledger";

export type Notice = { text: string; undo?: () => void; error?: boolean };

function requestId() {
  try { return crypto.randomUUID(); } catch { return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; }
}

async function fetchBook(): Promise<DaydayBook> {
  const response = await apiFetch("/api/dayday", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "dayday 打不开。");
  return data.book;
}

/** Her book from /api/dayday. Every action saves on the server and returns the whole book. */
export function useDayday() {
  const [book, setBook] = useState<DaydayBook | null>(null);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  // Only the newest response may replace the book; a slower older one would roll it back.
  const ticket = useRef(0);
  const today = dayKey();

  const reload = useCallback(() => {
    const mine = ++ticket.current;
    return fetchBook().then(
      (next) => { if (mine === ticket.current) { setBook(next); setLoadError(""); } },
      (error: Error) => { if (mine === ticket.current) setLoadError(error.message); },
    );
  }, []);
  useEffect(() => {
    const mine = ++ticket.current;
    fetchBook().then(
      (next) => { if (mine === ticket.current) setBook(next); },
      (error: Error) => { if (mine === ticket.current) setLoadError(error.message); },
    );
  }, []);

  const dismiss = useCallback(() => setNotice(null), []);

  const dd = useMemo(() => {
    if (!book) return null;
    const view = ledgerView(book, today);
    const say = (text: string, undo?: () => void) => setNotice({ text, undo });

    async function send<T = unknown>(action: string, input: Record<string, unknown> = {}): Promise<T | undefined> {
      const mine = ++ticket.current;
      try {
        const response = await apiFetch("/api/dayday", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, action, requestId: requestId() }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(data.error || "没存上，再试一次。");
        if (mine === ticket.current) setBook(data.book);
        return data.result as T;
      } catch (error) {
        setNotice({ text: error instanceof Error ? error.message : "没存上，再试一次。", error: true });
        void reload();
        return undefined;
      }
    }
    const entryInput = (e: Pick<Entry, "kind" | "cat" | "amount" | "note" | "at">) => ({ kind: e.kind, cat: e.cat, amount: e.amount, note: e.note, at: e.at });

    const actions = {
      async addEntry(input: { kind: Kind; cat: string; amount: number; note: string; at: string }) {
        const entry = await send<Entry>("entry.add", input);
        if (entry) say(`记上啦：${input.note || (input.kind === "income" ? "收入" : "支出")}`, () => { setNotice(null); void send("entry.remove", { id: entry.id }); });
      },
      async updateEntry(id: string, input: { kind: Kind; cat: string; amount: number; note: string; at: string }) {
        if (await send("entry.update", { id, ...input })) say("改好了。");
      },
      async removeEntry(id: string) {
        const removed = await send<Entry>("entry.remove", { id });
        if (removed) say("删掉了这一笔。", () => { setNotice(null); void send("entry.add", entryInput(removed)); });
      },
      async confirmFixed(id: string) {
        const name = book.fixed.find((f) => f.id === id)?.name || "";
        if (await send("fixed.pay", { id })) say(`${name} 扣好了。`);
      },
      async skipFixed(id: string) { if (await send("fixed.skip", { id })) say("这期先不扣了。"); },
      async addFixed(name: string, amount: number, day: number) { return !!(await send("fixed.add", { name, amount, day })); },
      async removeFixed(id: string) { await send("fixed.remove", { id }); },

      async addProduct(input: { name: string; price: number; shelf: string; reason: string; link?: string; image?: string }) {
        const product = await send<Product>("product.add", input);
        if (product) say("放进商城啦。");
        return !!product;
      },
      async toggle(id: string, key: "faved" | "carted") {
        const product = book.products.find((p) => p.id === id);
        // Flip on screen first so the heart answers the tap; the server reply settles it.
        if (product) setBook((b) => b && { ...b, products: b.products.map((p) => (p.id === id ? { ...p, [key]: !p[key] } : p)) });
        await send("product.toggle", { id, key, on: product ? !product[key] : undefined });
      },
      async removeProduct(id: string) { if (await send("product.remove", { id })) say("删掉了。"); },
      async placeOrder(lines: { id: string; paid: number }[]) {
        const orders = await send<Order[]>("order.place", { lines });
        if (orders) say("下单了，钱先扣着，在「运输中」等它到。");
        return !!orders;
      },
      async receive(orderId: string) {
        const item = await send<Item>("order.receive", { id: orderId });
        if (item) say(`「${item.name}」收到啦，放进我的物品了。`);
      },
      async returnOrder(orderId: string) {
        const order = await send<Order>("order.return", { id: orderId });
        if (order) say(`退好了，${yuan(order.paid)} 回来了。`);
      },
      async addShelf(label: string) { return (await send<Shelf>("shelf.add", { label }))?.id; },

      async addItem(input: { name: string; shelf: string; paid?: number; image?: string; gotAt: string; note?: string }) {
        const item = await send<Item>("item.add", input);
        if (item) say("放进我的物品了。");
        return !!item;
      },
      async removeItem(id: string) { if (await send("item.remove", { id })) say("从物品里拿掉了。"); },

      async addRefill(name: string) { return !!(await send<Refill>("refill.add", { name })); },
      async doneRefill(id: string, amount: number | null) {
        const name = book.refills.find((r) => r.id === id)?.name || "";
        if (await send("refill.done", { id, amount })) say(amount ? `${name} 补上了，也记了一笔日用。` : `${name} 补上了。`);
      },

      async bank(direction: "in" | "out", amount: number) {
        if (await send("bank.move", { direction, amount })) say(direction === "in" ? "存进去啦，真棒。" : "取出来了。");
      },
      async setSettings(payday: number, startAmount: number) {
        if (await send("settings.set", { payday, startAmount })) say("设置好了。");
      },
    };
    return { state: book, cycle: view.cycle, today, view, actions };
  }, [book, today, reload]);

  return { dd, loadError, reload, notice, dismiss };
}
export type Dayday = NonNullable<ReturnType<typeof useDayday>["dd"]>;
