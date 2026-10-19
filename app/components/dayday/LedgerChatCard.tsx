"use client";

import { useEffect, useRef, useState } from "react";
import { XpDialog } from "../XpDialog";
import { apiFetch } from "@/app/lib/client-api";
import { categoryOf, ledgerView, dayKey, dayLabel, timeOf, parseYuan, yuan, type DaydayBook, type Entry } from "@/app/lib/dayday-ledger";
import { daydayCommentForCard, type LedgerCard } from "@/app/lib/dayday-markers";

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
  const comment = daydayCommentForCard(card, book?.receiptResults[card.id]);
  async function act(action: string, input: Record<string, unknown>, label: string) {
    if (busy) return;
    setBusy(true); setError("");
    try { await sendChatLedger(action, input, crypto.randomUUID()); setDone(action === "entry.update" ? "" : label); setEditing(false); }
    catch (e) { setError(e instanceof Error ? e.message : "没存上。"); }
    finally { setBusy(false); }
  }
  function edit(e: Entry) { setAmount(String(e.amount / 100)); setNote(e.note); setEditing(true); }
  // Historical reminder cards stay in storage, but no longer interrupt the chat.
  if (card.kind === "fixed") return null;
  if (!card.ok) return <div className="msg-dayday-row"><div className="msg-dayday-error" role="status">{card.text}</div></div>;
  // Keep the saved comment, even if the product is later edited or removed.
  if (comment) return <div className="msg-dayday-row"><article className="msg-dayday-card is-product-comment" aria-label="酥酥的商品评论">
    <header className="msg-dayday-head"><span aria-hidden="true">♧</span><b>酥酥说</b><span className="msg-dayday-stamp">dayday</span></header>
    <div className="msg-dayday-body">
      <p className="msg-dayday-product-name">{comment.name}</p>
      <p className="msg-dayday-comment">{comment.text || "这条评论已收起。"}</p>
    </div>
    <footer className="msg-dayday-foot"><span>{comment.text ? "已留在商品下" : "已收起商品评论"}</span><small>酥酥说</small></footer>
  </article></div>;
  if (card.kind === "money") {
    const red = gift ? gift.kind === "redpacket" : card.text.includes("红包");
    const outgoing = gift ? gift.from === "her" : card.text.startsWith("你");
    const title = `${outgoing ? "你给酥酥的" : "酥酥的"}${red ? "红包" : "转账"}`;
    const status = !gift ? book ? "记录已收起" : "正在读取…" : gift.status === "pending" ? outgoing ? "等待酥酥收取" : "等待你收取"
      : gift.status === "received" ? outgoing ? "酥酥已收取" : "已收取" : "已退回 · 暂扣已释放";
    const showAmount = gift && (outgoing || !red || gift.status === "received");
    return <div className="msg-dayday-row"><article className={`msg-dayday-card ${red ? "is-redpacket" : "is-transfer"}${gift?.status === "returned" ? " is-closed" : ""}`} aria-label={title}>
      <header className="msg-dayday-head"><DaydayMoneyIcon kind={red ? "redpacket" : "transfer"} /><b>{title}</b></header>
      <div className="msg-dayday-body">
        {gift?.note && <p className="msg-dayday-note">{gift.note}</p>}
        {showAmount && <strong className="msg-dayday-amount"><small>¥</small>{yuan(gift.amount).replace("¥", "")}</strong>}
        {gift?.status === "pending" && !outgoing && <div className="msg-dayday-actions">
          <button disabled={busy} onClick={() => void act("money.receive", { id: gift.id }, "领取啦")}>{busy ? "处理中…" : red ? "拆开并收取" : "收取"}</button>
          <button disabled={busy} onClick={() => void act("money.return", { id: gift.id }, "已退回")}>退回</button>
        </div>}
        {error && <div className="msg-dayday-error" role="alert">{error}</div>}
      </div>
      <footer className="msg-dayday-foot"><span role="status">{done || status}</span><small>{gift?.status === "pending" ? "共同余额暂扣" : "dayday"}</small></footer>
    </article></div>;
  }
  return <div className="msg-dayday-row"><article className="msg-dayday-card is-receipt" aria-label="dayday记账小票">
    <header className="msg-dayday-head"><span aria-hidden="true">▤</span><b>dayday 记账小票</b><span className="msg-dayday-stamp">酥酥记</span></header>
    <div className="msg-dayday-body">
    {entry ? <>
      <p className="msg-dayday-receipt-name">{entry.note || categoryOf(entry.cat).label}</p>
      <strong className={`msg-dayday-amount${entry.kind === "income" ? " is-income" : ""}`}><small>{entry.kind === "income" ? "+" : "−"} ¥</small>{yuan(entry.amount).replace("¥", "")}</strong>
      <dl className="msg-dayday-receipt-lines"><div><dt>分类</dt><dd>{categoryOf(entry.cat).label}</dd></div><div><dt>时间</dt><dd>{dayLabel(dayKey(entry.at))} {timeOf(entry.at)}</dd></div></dl>
    </> : <p className="msg-dayday-receipt-name">{card.text}</p>}
    {!book && card.kind !== "notice" && <p>正在核对账本…</p>}
    {!done && book && card.kind === "entry" && !entry && <p>这一笔已撤销或收起成总结</p>}
    {editing && entry && <form className="msg-dayday-edit" onSubmit={(e) => {
      e.preventDefault(); const cents = parseYuan(amount); if (!cents) { setError("金额要大于0，最多两位小数。"); return; }
      void act("entry.update", { ...entry, amount: cents, note }, "改好了");
    }}>
      <label>金额<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label>备注<input maxLength={40} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <button disabled={busy}>保存</button><button type="button" onClick={() => setEditing(false)}>取消</button>
    </form>}
    {!editing && !done && <div className="msg-dayday-actions">
      {card.kind === "entry" && entry?.status === "done" && <><button disabled={busy} onClick={() => void act("entry.remove", { id: entry.id }, "已撤销")}>撤销</button><button disabled={busy} onClick={() => edit(entry)}>修改</button></>}
    </div>}
    {error && <div className="msg-dayday-error" role="alert">{error}</div>}
    </div><footer className="msg-dayday-foot"><span role="status">{done || (entry ? "已记到账本" : "dayday")}</span><small>dayday</small></footer>
  </article></div>;
}

export function ChatMoneyDialog({ book, sessionId, onClose, onSent }: { book: DaydayBook | null; sessionId: string; onClose: () => void; onSent: (card: LedgerCard) => void }) {
  const [kind, setKind] = useState<"redpacket" | "transfer">("redpacket");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const lock = useRef(false);
  async function send() {
    if (lock.current || !book?.configured) return;
    const cents = parseYuan(amount);
    if (!cents) { setError("金额要大于0，最多两位小数。"); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const d = await sendChatLedger("money.send", { kind, amount: cents, note, sessionId }, requestId);
      const gift = d.result;
      if (!gift?.id) throw new Error("请查看账本确认发送结果。");
      onSent({ id: `gift_${gift.id}`, kind: "money", ok: true, targetId: gift.id, text: `你发给酥酥的${gift.kind === "redpacket" ? "红包" : "转账"} · ${yuan(gift.amount)}${gift.note ? ` · ${gift.note}` : ""}` });
    } catch (e) { setError(e instanceof Error ? e.message : "没发出去。"); }
    finally { lock.current = false; setBusy(false); }
  }
  const red = kind === "redpacket";
  return <div className="rd-screen dd-screen"><XpDialog title="给酥酥发一份心意" onClose={() => { if (!busy) onClose(); }} className="dd-dialog dd-send-dialog">
    <form className={`dd-form dd-send ${red ? "is-redpacket" : "is-transfer"}`} onSubmit={(e) => { e.preventDefault(); void send(); }}><fieldset disabled={busy}>
      <div className="dd-send-kinds" role="radiogroup" aria-label="方式">
        {(["redpacket", "transfer"] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={kind === value} className={kind === value ? "is-on" : ""} onClick={() => setKind(value)}><DaydayMoneyIcon kind={value} /><span>{value === "redpacket" ? "红包" : "转账"}</span></button>)}
      </div>
      <label>金额<span className="dd-send-amount"><i aria-hidden="true">¥</i><input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></span></label>
      <p className="dd-send-balance">dayday 可用余额 <b>{book ? yuan(ledgerView(book).remaining) : "读取中…"}</b></p>
      <label>{red ? "祝福" : "转账备注"}<input maxLength={40} value={note} onChange={(e) => setNote(e.target.value)} placeholder={red ? "恭喜发财，大吉大利" : "想和酥酥说什么"} /></label>
      <button type="submit" className="dd-send-submit" disabled={!book?.configured || busy}>{busy ? "发送中…" : !book?.configured ? "请先设置 dayday 余额" : red ? "塞进红包" : "转给酥酥"}</button>
      <p className="dd-send-hint">从共同余额暂扣，领取或退回后释放回同一余额，不计收入支出。</p>
      {error && <p className="dd-send-error" role="alert">{error}</p>}
    </fieldset></form>
  </XpDialog></div>;
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
