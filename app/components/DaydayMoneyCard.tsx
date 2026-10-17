"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/client-api";
import { postDayday } from "../lib/dayday-client";
import { isHumanTransfer, money, type DaydayTransfer } from "../lib/dayday";
import type { DaydayCard } from "../lib/dayday-chat";

export function DaydayMoneyCard({ card }: { card: DaydayCard }) {
  const [transfer, setTransfer] = useState<DaydayTransfer | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const refresh = useCallback(async () => {
    if (!card.id) return;
    const response = await apiFetch(`/api/dayday?transfer=${encodeURIComponent(card.id)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "暂时无法读取红包或转账。");
    return data.transfer as DaydayTransfer;
  }, [card.id]);
  useEffect(() => {
    let alive = true;
    const update = () => { void refresh().then((value) => { if (alive && value) { setTransfer(value); setError(""); } }).catch((e) => { if (alive) setError(e.message); }); };
    update(); window.addEventListener("focus", update); window.addEventListener("dayday:changed", update);
    return () => { alive = false; window.removeEventListener("focus", update); window.removeEventListener("dayday:changed", update); };
  }, [refresh]);
  useEffect(() => {
    if (!transfer || transfer.status !== "pending") return;
    const timer = window.setTimeout(() => { void refresh().then((value) => { if (value) setTransfer(value); }).catch(() => setError("状态暂未刷新，操作时会再次核对。")); }, Math.max(0, transfer.expiresAt - Date.now()) + 100);
    return () => window.clearTimeout(timer);
  }, [transfer, refresh]);
  async function settle(decision: "accepted" | "returned") {
    if (!card.id || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const state = await postDayday("settle_transfer", { transferId: card.id, decision });
      const latest = state.transfers.find((t) => t.id === card.id) || await refresh();
      if (latest) setTransfer(latest);
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败，请刷新状态再试。"); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!card.ok || !card.id) return <div className="msg-dayday-row"><div className="msg-dayday-error" role="status">{card.text}</div></div>;
  const red = transfer ? transfer.kind === "redpacket" : !card.text.includes("转账");
  const outgoing = transfer ? isHumanTransfer(transfer) : false;
  const labels = { pending: outgoing ? "等待酥酥收取" : "等待你收取", accepted: outgoing ? "酥酥已收取" : "已收取", returned: "已退回 · 未扣款", expired: "已到期退回 · 未扣款" };
  const title = outgoing ? red ? "你给酥酥的红包" : "你给酥酥的转账" : red ? "酥酥的红包" : "酥酥的转账";
  const showAmount = transfer && (outgoing || !red || transfer.status === "accepted");
  return <div className="msg-dayday-row"><article className={`msg-dayday-card ${red ? "is-redpacket" : "is-transfer"}${transfer && transfer.status !== "pending" && transfer.status !== "accepted" ? " is-closed" : ""}`} aria-label={title}>
    <header className="msg-dayday-head"><DaydayMoneyIcon kind={red ? "redpacket" : "transfer"} /><b>{transfer ? title : "正在读取…"}</b></header>
    <div className="msg-dayday-body">
      {transfer?.message && <p className="msg-dayday-note">{transfer.message}</p>}
      {showAmount && <strong className="msg-dayday-amount"><small>¥</small>{money(transfer.amount)}</strong>}
      {transfer?.status === "pending" && !outgoing && <div className="msg-dayday-actions"><button type="button" disabled={busy} onClick={() => { void settle("accepted"); }}>{busy ? "处理中…" : red ? "拆开并收取" : "收取"}</button><button type="button" disabled={busy} onClick={() => { void settle("returned"); }}>退回</button></div>}
      {error && <div className="msg-dayday-error" role="alert">{error}<button type="button" disabled={busy} onClick={() => { void refresh().then((value) => { if (value) { setTransfer(value); setError(""); } }).catch((e) => setError(e.message)); }}>刷新状态</button></div>}
    </div>
    <footer className="msg-dayday-foot"><span role="status">{transfer ? labels[transfer.status] : "以 dayday 账本为准"}</span>{transfer?.status === "pending" ? <small>24小时未收自动退回</small> : <small>dayday</small>}</footer>
  </article></div>;
}

/** Small XP-style coloured glyphs shared by the card header and the chat toolbar. */
export function DaydayMoneyIcon({ kind }: { kind: "redpacket" | "transfer" }) {
  if (kind === "transfer") return <svg className="msg-dayday-icon" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6.6" fill="#e9f1fc" stroke="#2f5fae" />
    <path d="M4.6 6.4h6.2l-1.8-1.8M11.4 9.6H5.2l1.8 1.8" fill="none" stroke="#2f5fae" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
  return <svg className="msg-dayday-icon" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="2.5" y="1.5" width="11" height="13" rx="1.2" fill="#d93a2b" stroke="#9c1f16" />
    <path d="M2.8 5.2c2.6 2 7.8 2 10.4 0" fill="none" stroke="#9c1f16" />
    <circle cx="8" cy="7.2" r="1.9" fill="#f7c948" stroke="#b07a10" strokeWidth=".7" />
  </svg>;
}
