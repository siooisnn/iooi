"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/app/lib/client-api";
import { categoryOf, ledgerView, parseYuan, yuan, type DaydayBook, type Entry } from "@/app/lib/dayday-ledger";
import type { LedgerCard } from "@/app/lib/dayday-markers";

// One shared book per chat, rather than one request per historical card.
export function useChatLedger(enabled: boolean) {
  const [book, setBook] = useState<DaydayBook | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let ticket = 0;
    const reload = () => { const mine = ++ticket; void apiFetch("/api/dayday", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (alive && mine === ticket && d.ok) setBook(d.book); }).catch(() => {}); };
    const visible = () => { if (document.visibilityState === "visible") reload(); };
    reload();
    window.addEventListener("dayday-change", reload);
    document.addEventListener("visibilitychange", visible);
    return () => { alive = false; window.removeEventListener("dayday-change", reload); document.removeEventListener("visibilitychange", visible); };
  }, [enabled]);
  return book;
}

export async function sendChatLedger(action: string, input: Record<string, unknown>, requestId: string) {
  const response = await apiFetch("/api/dayday", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, action, requestId }) });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "没存上，再试一次。");
  window.dispatchEvent(new Event("dayday-change"));
  return data;
}

export function LedgerChatCard({ card, book }: { card: LedgerCard; book: DaydayBook | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const entry = book?.entries.find((e) => e.id === card.targetId);
  const gift = book?.gifts.find((g) => g.id === card.targetId);
  const due = book && card.kind === "fixed" ? ledgerView(book).due.find((f) => f.id === card.targetId && ledgerView(book).cycle.startKey === card.cycle) : null;
  async function act(action: string, input: Record<string, unknown>, label: string) {
    if (busy) return;
    setBusy(true); setError("");
    try { await sendChatLedger(action, input, crypto.randomUUID()); setDone(action === "entry.update" ? "" : label); setEditing(false); }
    catch (e) { setError(e instanceof Error ? e.message : "没存上。"); }
    finally { setBusy(false); }
  }
  function edit(e: Entry) { setAmount(String(e.amount / 100)); setNote(e.note); setEditing(true); }
  const status = gift ? gift.status === "pending" ? "待领取 · 金额暂扣" : gift.status === "received" ? "已领取 · 已回到共同余额" : "已退回 · 已回到共同余额" : "";
  return <div className={`ledger-chat-card${card.kind === "money" ? " is-money" : ""}`} role="group" aria-label="dayday卡片">
    <small>dayday · {card.kind === "fixed" ? "必支出" : card.kind === "money" ? "红包与转账" : "酥酥记"}</small>
    <strong>{card.kind === "entry" && entry ? `已记 · ${entry.note || "收支"} ${yuan(entry.amount)} · ${categoryOf(entry.cat).label}` : card.text}</strong>
    {status && <p>{status}</p>}
    {!book && card.ok && card.kind !== "notice" && <p>正在核对账本…</p>}
    {done && <p role="status">{done}</p>}
    {!done && book && card.kind === "entry" && !entry && <p>这一笔已撤销或收起成总结</p>}
    {!done && book && card.kind === "fixed" && !due && <p>本期已处理，或提醒已过期</p>}
    {editing && entry && <form onSubmit={(e) => {
      e.preventDefault(); const cents = parseYuan(amount); if (!cents) { setError("金额要大于0，最多两位小数。"); return; }
      void act("entry.update", { ...entry, amount: cents, note }, "改好了");
    }}>
      <label>金额<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label>备注<input maxLength={40} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <button disabled={busy}>保存</button><button type="button" onClick={() => setEditing(false)}>取消</button>
    </form>}
    {!editing && !done && <div className="ledger-chat-actions">
      {card.kind === "entry" && entry?.status === "done" && <><button disabled={busy} onClick={() => void act("entry.remove", { id: entry.id }, "已撤销")}>撤销</button><button disabled={busy} onClick={() => edit(entry)}>修改</button></>}
      {due && <><button disabled={busy} onClick={() => void act("fixed.pay", { id: due.id, cycle: card.cycle }, "已确认扣款")}>确认扣</button><button disabled={busy} onClick={() => void act("fixed.skip", { id: due.id, cycle: card.cycle }, "这期不扣")}>这期不扣</button></>}
      {gift?.status === "pending" && gift.from === "susu" && <><button disabled={busy} onClick={() => void act("money.receive", { id: gift.id }, "领取啦")}>领取</button><button disabled={busy} onClick={() => void act("money.return", { id: gift.id }, "已退回")}>退回</button></>}
    </div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function ChatMoneyComposer({ disabled, onSent, sessionId }: { disabled: boolean; onSent: (card: LedgerCard) => void; sessionId: string }) {
  const [kind, setKind] = useState<"redpacket" | "transfer" | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");
  async function send() {
    const cents = parseYuan(amount);
    if (!cents || !kind) { setError("金额要大于0，最多两位小数。"); return; }
    setBusy(true); setError("");
    try {
      const d = await sendChatLedger("money.send", { kind, amount: cents, note, sessionId }, requestId);
      const gift = d.result;
      if (!gift?.id) throw new Error("请查看账本确认发送结果。");
      onSent({ id: `gift_${gift.id}`, kind: "money", ok: true, targetId: gift.id, text: `你发给酥酥的${gift.kind === "redpacket" ? "红包" : "转账"} · ${yuan(gift.amount)}${gift.note ? ` · ${gift.note}` : ""}` });
      setKind(null); setAmount(""); setNote("");
    } catch (e) { setError(e instanceof Error ? e.message : "没发出去。"); }
    finally { setBusy(false); }
  }
  return <div className="ledger-money-composer">
    <button type="button" disabled={disabled || busy} onClick={() => { setKind("redpacket"); setError(""); setRequestId(crypto.randomUUID()); }}>红包</button>
    <button type="button" disabled={disabled || busy} onClick={() => { setKind("transfer"); setError(""); setRequestId(crypto.randomUUID()); }}>转账</button>
    {kind && <form onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <b>{kind === "redpacket" ? "发红包" : "转账"}给酥酥</b><small>共同余额暂扣，领取或退回后回到余额</small>
      <label>金额<input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label>留言<input maxLength={40} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy || disabled}>发送</button><button type="button" disabled={busy} onClick={() => setKind(null)}>取消</button>
    </form>}
  </div>;
}
