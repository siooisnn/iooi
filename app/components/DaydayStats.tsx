"use client";

import { useState } from "react";
import { money, type DaydayMonthStats } from "../lib/dayday";
import { DaydayChips, DaydayFold } from "./DaydayPocket";

const LABELS: Record<string, string> = { 饮食: "饮食支出", 日用: "日用品支出", 衣物: "衣物支出", 书籍: "书籍支出", 小砖专属: "小砖支出" };
const label = (category: string) => LABELS[category] || `${category}支出`;
const monthName = (key: string, newest: string) => {
  const [year, month] = key.split("-");
  return year === newest.slice(0, 4) ? `${Number(month)}月` : `${year}年${Number(month)}月`;
};

function Row({ name, amount, share, note }: { name: string; amount: number; share?: number; note?: string }) {
  return <div className="dd-inventory dd-stat">
    <span className="dd-stat-head"><b>{name}</b><b>{amount < 0 ? "−" : ""}¥{money(Math.abs(amount))}</b></span>
    {share !== undefined && <progress max="1" value={Math.max(0, share)} aria-label={`${name}占比`} />}
    {(note || share !== undefined) && <small>{[share !== undefined ? `占 ${Math.round(Math.max(0, share) * 100)}%` : "", note].filter(Boolean).join(" · ")}</small>}
  </div>;
}

/** Where his money went and came from, one month at a time. */
export function DaydayStats({ months }: { months: DaydayMonthStats[] }) {
  const [picked, setPicked] = useState("");
  const current = months.find((m) => m.month === picked) || months[0];
  if (!current) return <DaydayFold title="收支分类" meta="还没有记录"><p className="dd-empty">花了钱、收到钱以后，这里会按种类分开算。</p></DaydayFold>;
  const spendTotal = current.spending.reduce((sum, s) => sum + s.amount, 0) + current.transfers.amount;
  const income = current.income;
  const incomeTotal = income.allowance + income.initialGrant + income.fromHer;
  const share = (amount: number) => spendTotal > 0 ? amount / spendTotal : 0;
  return <DaydayFold title="收支分类" meta={`${monthName(current.month, months[0].month)} 支出 ¥${money(spendTotal)}`}>
    {months.length > 1 && <DaydayChips label="选择月份" value={current.month} onChange={setPicked} options={months.slice(0, 12).map((m) => ({ id: m.month, name: monthName(m.month, months[0].month) }))} />}
    <h4 className="dd-stat-title">支出 <span>¥{money(spendTotal)}</span></h4>
    {!current.spending.length && !current.transfers.count ? <p className="dd-empty">这个月还没有花钱。</p> : <>
      {current.spending.map((s) => <Row key={s.category} name={label(s.category)} amount={s.amount} share={share(s.amount)} />)}
      {current.transfers.count > 0 && <Row name="转账红包支出" amount={current.transfers.amount} share={share(current.transfers.amount)} note={`你收下了 ${current.transfers.count} 笔`} />}
    </>}
    <h4 className="dd-stat-title">收入来源 <span>¥{money(incomeTotal)}</span></h4>
    {!incomeTotal ? <p className="dd-empty">这个月还没有收入。</p> : <>
      {income.allowance > 0 && <Row name="月度额度" amount={income.allowance} />}
      {income.initialGrant > 0 && <Row name="首次额度" amount={income.initialGrant} />}
      {income.fromHer > 0 && <Row name="你给的红包转账" amount={income.fromHer} note={`他收下了 ${income.fromHerCount} 笔`} />}
    </>}
    {current.gifts.count > 0 && <p className="dd-muted">另外你用自己的额度买来送他 {current.gifts.count} 单，共 ¥{money(current.gifts.amount)}，不算他的收支。</p>}
    <p className="dd-muted">购物按下单时的商品分类算，退款从对应分类里扣回；银行存取不算收支。</p>
  </DaydayFold>;
}
