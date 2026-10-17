"use client";

import { isHumanTransfer, money, type DaydaySnapshot } from "../lib/dayday";

export function DaydayHumanAccount({ state }: { state: DaydaySnapshot }) {
  const labels = { pending: "等待收取", accepted: "已收取", returned: "已退回", expired: "到期退回" };
  const date = (at: number) => new Date(at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  return <section className="dd-paper dd-human-account"><div className="dd-heading"><h3>我的虚拟额度</h3><span>你的账户 · 与酥酥分开记账</span></div>
    <strong className="dd-number">¥{money(state.human.available)}</strong><p className="dd-muted">可用额度 · 冻结 ¥{money(state.human.held)} · 总余额 ¥{money(state.human.wallet)}</p>
    <p className="dd-muted">初始 ¥500，只发放一次。收取酥酥的红包或转账会到账；给他发钱或买礼物从这里支付，不会动用他的零花钱。</p>
    <details className="dd-collapse"><summary>红包与转账</summary>{state.transfers.length ? state.transfers.slice(0, 30).map((t) => <div className="dd-setting" key={t.id}><span><b>{isHumanTransfer(t) ? "你给酥酥" : "酥酥给你"} · {t.kind === "redpacket" ? "红包" : "转账"}</b><small>{t.message} · {labels[t.status]}<br />{date(t.createdAt)}</small></span><b>{!isHumanTransfer(t) && t.kind === "redpacket" && t.status === "pending" ? "待拆" : `¥${money(t.amount)}`}</b></div>) : <p className="dd-muted">还没有红包或转账。聊天中可发出，也可在收到的卡片上收取或退回。</p>}</details>
    <details className="dd-collapse"><summary>我的收支记录</summary>{state.human.ledger.slice(0, 60).map((entry) => <div className="dd-setting" key={entry.id}><span>{entry.text}<small>{date(entry.at)}</small></span><b>{entry.delta === 0 ? "—" : `${entry.delta > 0 ? "+" : "−"}¥${money(Math.abs(entry.delta))}`}</b></div>)}</details>
  </section>;
}
