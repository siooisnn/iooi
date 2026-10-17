"use client";

import { useEffect, useRef, useState } from "react";
import { getDayday, postDayday } from "../lib/dayday-client";
import { daydayTransferMessage } from "../lib/dayday-chat";
import { money, type DaydaySnapshot } from "../lib/dayday";
import type { Message } from "../lib/app-types";
import { XpDialog } from "./XpDialog";
import { DaydayMoneyIcon } from "./DaydayMoneyCard";

export function DaydaySendDialog({ sessionId, onClose, onSent }: { sessionId: string; onClose: () => void; onSent: (message: Message) => void }) {
  const [state, setState] = useState<DaydaySnapshot | null>(null);
  const [kind, setKind] = useState<"redpacket" | "transfer">("redpacket");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false), roundId = useRef(crypto.randomUUID());
  useEffect(() => { let alive = true; void getDayday().then((value) => { if (alive) setState(value); }).catch((e) => { if (alive) setError(e.message); }); return () => { alive = false; }; }, []);
  async function submit() {
    if (lock.current || !state?.enabled) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await postDayday("human_send", { sessionId, kind, amount, message, roundId: roundId.current });
      const transfer = result.transfers.find((t) => t.roundId === roundId.current && t.direction === "human_to_susu");
      if (!transfer) throw new Error("卡片已提交，请刷新聊天确认后再发。");
      onSent(daydayTransferMessage(transfer));
    } catch (e) { setError(e instanceof Error ? e.message : "发送失败。"); }
    finally { lock.current = false; setBusy(false); }
  }
  const red = kind === "redpacket";
  return <div className="rd-screen dd-screen"><XpDialog title="给酥酥发一份心意" onClose={() => { if (!busy) onClose(); }} className="dd-dialog dd-send-dialog"><form className={`dd-form dd-send ${red ? "is-redpacket" : "is-transfer"}`} onSubmit={(e) => { e.preventDefault(); void submit(); }}><fieldset disabled={busy}>
    <div className="dd-send-kinds" role="radiogroup" aria-label="方式">
      {(["redpacket", "transfer"] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={kind === value} className={kind === value ? "is-on" : ""} onClick={() => setKind(value)}><DaydayMoneyIcon kind={value} /><span>{value === "redpacket" ? "红包" : "转账"}</span></button>)}
    </div>
    <label>金额<span className="dd-send-amount"><i aria-hidden="true">¥</i><input type="number" inputMode="decimal" required min="0.01" max="9999999.99" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></span></label>
    <p className="dd-send-balance">可用虚拟额度 <b>{state ? `¥${money(state.human.available)}` : "读取中…"}</b></p>
    <label>{red ? "祝福" : "转账备注"}<input maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={red ? "恭喜发财，大吉大利" : "想和酥酥说什么"} /></label>
    <button type="submit" className="dd-send-submit" disabled={!state?.enabled || busy}>{busy ? "发送中…" : !state?.enabled ? "dayday 尚未开启" : red ? "塞进红包" : "转给酥酥"}</button>
    <p className="dd-send-hint">先冻结金额，酥酥收取后才到账；退回或24小时未收取会解冻。</p>
    {error && <p className="dd-send-error" role="alert">{error}</p>}
  </fieldset></form></XpDialog></div>;
}
