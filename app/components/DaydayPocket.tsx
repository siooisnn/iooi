"use client";

import { useState, type ReactNode } from "react";
import { daydayRefundable, money, type DaydaySnapshot } from "../lib/dayday";

type Mutate = (action: string, input: Record<string, unknown>, message?: string) => Promise<boolean>;
type Item = DaydaySnapshot["inventory"][number];
const PAGE = 20;
const date = (at: number) => new Date(at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });

/**
 * A card that starts folded, for lists that only grow. The heading stays
 * visible with its count; an `action` button in the heading does not toggle it.
 */
export function DaydayFold({ title, meta, action, children }: { title: string; meta?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return <details className="dd-paper dd-fold">
    <summary><span className="dd-fold-caret" aria-hidden="true" /><h3>{title}</h3>{meta !== undefined && <span className="dd-fold-meta">{meta}</span>}{action}</summary>
    <div className="dd-fold-body">{children}</div>
  </details>;
}

/** Chips that filter a folded list; counts keep the closed card informative. */
export function DaydayChips<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; name: string; count?: number }[]; onChange: (id: T) => void; label: string }) {
  return <div className="dd-categories dd-fold-chips" role="group" aria-label={label}>{options.map((o) => <button type="button" key={o.id} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.name}{o.count !== undefined ? ` ${o.count}` : ""}</button>)}</div>;
}

function More({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  return shown < total ? <button type="button" className="dd-link dd-fold-more" onClick={onMore}>再看 {Math.min(PAGE, total - shown)} 条（还有 {total - shown}）</button> : null;
}

/** Clothes, books and other keepsakes: same product merged, newest first. */
function Goods({ items }: { items: Item[] }) {
  const [shown, setShown] = useState(PAGE);
  const merged = new Map<string, { name: string; category: string; quantity: number; gifted: boolean; at: number }>();
  for (const item of items) {
    const prev = merged.get(item.productId);
    merged.set(item.productId, { name: item.name, category: item.category, quantity: (prev?.quantity || 0) + item.quantity, gifted: Boolean(prev?.gifted || item.giftedByHuman), at: Math.max(prev?.at || 0, item.startsAt) });
  }
  const list = [...merged.entries()].sort((a, b) => b[1].at - a[1].at);
  return <DaydayFold title="他的用品" meta={`${list.length} 样`}>
    {list.length ? <>{list.slice(0, shown).map(([id, g]) => <div className="dd-inventory" key={id}><b>{g.name} ×{g.quantity}{g.gifted ? " · 有你送的" : ""}</b><small>{g.category} · 最近一次入库 {date(g.at)}</small></div>)}<More shown={shown} total={list.length} onMore={() => setShown(shown + PAGE)} /></>
      : <p className="dd-empty">衣物、书籍这些买回来会收在这里。饮食当次吃掉，日用品看下面的余量。</p>}
  </DaydayFold>;
}

function DailyRow({ item, now }: { item: Item; now: number }) {
  return <div className="dd-inventory"><b>{item.name} ×{item.quantity}{item.giftedByHuman ? " · 你送的" : ""}</b>{item.endsAt
    ? <><progress max="1" value={item.remaining} aria-label={`${item.name}剩余比例`} /><small>{item.remaining === 0 ? "已用完" : item.startsAt > now ? `接着上一份，${date(item.startsAt)} 开始使用` : `预计还可用 ${item.remainingDays} 天`} · 到 {date(item.endsAt)}</small></>
    : <small>已入库 · 没设消耗时长，不自动消耗</small>}</div>;
}

/** Daily goods: what is in use or queued first; finished ones folded at the bottom. */
function Daily({ items, now }: { items: Item[]; now: number }) {
  const [shown, setShown] = useState(PAGE);
  const used = items.filter((i) => i.endsAt && i.remaining === 0).reverse();
  const live = items.filter((i) => !(i.endsAt && i.remaining === 0)).sort((a, b) => (a.endsAt ?? Infinity) - (b.endsAt ?? Infinity));
  return <DaydayFold title="日用品余量" meta={`在用 ${live.length} 项`}>
    {live.length ? live.map((item) => <DailyRow key={`${item.orderId}-${item.productId}`} item={item} now={now} />) : <p className="dd-empty">日用品买回来后，会在这里按时长慢慢用掉。</p>}
    {used.length > 0 && <details className="dd-collapse dd-fold-sub"><summary>已用完 {used.length} 项</summary>{used.slice(0, shown).map((item) => <DailyRow key={`${item.orderId}-${item.productId}`} item={item} now={now} />)}<More shown={shown} total={used.length} onMore={() => setShown(shown + PAGE)} /></details>}
  </DaydayFold>;
}

type OrderFilter = "all" | "paid" | "refunded";
function Orders({ state, busy, mutate }: { state: DaydaySnapshot; busy: boolean; mutate: Mutate }) {
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [shown, setShown] = useState(PAGE);
  const paid = state.orders.filter((o) => o.status === "paid").length;
  const list = filter === "all" ? state.orders : state.orders.filter((o) => o.status === filter);
  return <DaydayFold title="订单与退款" meta={`共 ${state.orders.length} 单`}>
    <DaydayChips label="订单分类" value={filter} onChange={(id) => { setFilter(id); setShown(PAGE); }}
      options={[{ id: "all", name: "全部", count: state.orders.length }, { id: "paid", name: "交易成功", count: paid }, { id: "refunded", name: "已退款", count: state.orders.length - paid }]} />
    {!list.length && <p className="dd-empty">{state.orders.length ? "这一类还没有订单。" : "还没有订单。"}</p>}
    {list.slice(0, shown).map((order) => <div className="dd-order" key={order.id}>
      <div className="dd-heading"><b>¥{money(order.total)}{order.payer === "human" ? " · 你送的礼物" : ""}</b><span>{order.status === "refunded" ? "已退款" : "交易成功"} · {date(order.createdAt)}</span></div>
      <p>{order.lines.map((p) => `${p.name} ×${p.quantity}`).join("、")}</p><small>订单 {order.id}</small>{order.reason && <p className="dd-muted">{order.reason}</p>}
      {daydayRefundable(order, state.serverTime, true) && <button type="button" className="dd-link" disabled={busy} onClick={() => { if (window.confirm(`退回这整单 ¥${money(order.total)}？物品也会退回。`)) void mutate("refund", { orderId: order.id }, "整单已退款，余额与库存已恢复。"); }}>整单退款</button>}
    </div>)}
    <More shown={Math.min(shown, list.length)} total={list.length} onMore={() => setShown(shown + PAGE)} />
  </DaydayFold>;
}

/** The "他的" page lists: keepsakes, daily goods and orders, each folded. */
export function DaydayPocket({ state, busy, mutate }: { state: DaydaySnapshot; busy: boolean; mutate: Mutate }) {
  const goods = state.inventory.filter((i) => i.category !== "饮食" && i.category !== "日用" && !i.endsAt);
  const daily = state.inventory.filter((i) => i.category === "日用" || i.endsAt);
  return <>
    <Goods items={goods} />
    <Daily items={daily} now={state.serverTime} />
    <Orders state={state} busy={busy} mutate={mutate} />
  </>;
}
