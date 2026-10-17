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
  const red = transfer?.kind === "redpacket";
  const outgoing = transfer ? isHumanTransfer(transfer) : false;
  const labels = { pending: outgoing ? "等待酥酥收取" : "等待你收取", accepted: outgoing ? "酥酥已收取" : "已收取", returned: "已退回 · 未扣款", expired: "已到期退回 · 未扣款" };
  const title = outgoing ? red ? "你给酥酥的红包" : "你给酥酥的转账" : red ? "酥酥的红包" : "酥酥的转账";
  return <div className={`msg-dayday-row${outgoing ? " is-outgoing" : ""}`}><article className={`msg-dayday-card ${red ? "is-redpacket" : "is-transfer"}`} aria-label={title}>
    <div className="msg-dayday-top"><span aria-hidden="true">{red ? "🧧" : "↗"}</span><div><b>{transfer ? title : "正在读取…"}</b><p>{transfer?.message}</p></div></div>
    {transfer && (outgoing || !red || transfer.status === "accepted") && <strong className="msg-dayday-amount">¥ {money(transfer.amount)}</strong>}
    <p className="msg-dayday-state" role="status">{transfer ? labels[transfer.status] : "以 dayday 账本为准"}</p>
    {transfer?.status === "pending" && <>{!outgoing && <div className="msg-dayday-actions"><button type="button" disabled={busy} onClick={() => { void settle("accepted"); }}>{busy ? "处理中…" : red ? "拆开并收取" : "收取"}</button><button type="button" disabled={busy} onClick={() => { void settle("returned"); }}>退回</button></div>}<small>24小时未收取自动退回</small></>}
    {error && <div className="msg-dayday-error" role="alert">{error}<button type="button" disabled={busy} onClick={() => { void refresh().then((value) => { if (value) { setTransfer(value); setError(""); } }).catch((e) => setError(e.message)); }}>刷新状态</button></div>}
  </article></div>;
}
