"use client";

import { useEffect, useRef, useState } from "react";
import { getDayday, postDayday } from "../lib/dayday-client";
import { daydayTransferMessage } from "../lib/dayday-chat";
import { money, type DaydaySnapshot } from "../lib/dayday";
import type { Message } from "../lib/app-types";
import { XpDialog } from "./XpDialog";

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
  return <div className="rd-screen dd-screen"><XpDialog title="给酥酥发一份心意" onClose={() => { if (!busy) onClose(); }} className="dd-dialog"><form className="dd-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}><fieldset disabled={busy}>
    <p className="dd-muted">你的可用虚拟额度：{state ? `¥${money(state.human.available)}` : "读取中…"}</p>
    <label>方式<select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="redpacket">红包</option><option value="transfer">转账</option></select></label>
    <label>金额（元）<input type="number" required min="0.01" max="9999999.99" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
    <label>{kind === "redpacket" ? "祝福" : "转账备注"}<input maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="想和酥酥说什么" /></label>
    <p className="dd-muted">先冻结金额，酥酥收取后才到账；退回或24小时未收取会解冻。</p>
    <button type="submit" className="dd-primary" disabled={!state?.enabled || busy}>{busy ? "发送中…" : !state?.enabled ? "dayday 尚未开启" : "发给酥酥"}</button>
    {error && <p role="alert">{error}</p>}
  </fieldset></form></XpDialog></div>;
}
