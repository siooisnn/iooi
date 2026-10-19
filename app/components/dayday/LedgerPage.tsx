"use client";

import { useState } from "react";
import { XpDialog } from "../XpDialog";
import {
  EXPENSE_CATS, INCOME_CATS, categoryOf, dayKey, dayLabel, parseYuan, shortDay, timeOf, yuan,
  type Entry, type Kind,
} from "@/app/lib/dayday-ledger";
import { CatSticker, Group } from "./DaydayParts";
import { PixelHeart } from "./DaydayArt";
import type { Dayday } from "./use-dayday";

/** The cycle progress bar: one block per day, pink up to today. */
function CycleBar({ total, passed }: { total: number; passed: number }) {
  return <span className="dd-cycle-bar" role="img" aria-label={`第 ${passed} 天，共 ${total} 天`}>
    {Array.from({ length: total }, (_, i) => <i key={i} data-on={i < passed || undefined} data-today={i === passed - 1 || undefined} />)}
  </span>;
}

export function LedgerPage({ dd, onWrite, onIncome, onEdit, onSetup }: { dd: Dayday; onWrite: () => void; onIncome: () => void; onEdit: (entry: Entry) => void; onSetup: () => void }) {
  const { view, cycle, actions } = dd;
  const catTotal = view.cats.reduce((total, row) => total + row.amount, 0);
  return <>
    <section className="dd-hero">
      <div className="dd-hero-top">
        <span className="dd-tape">本周期 {cycle.label}</span>
        <span className="dd-hero-day">第 {cycle.passed} 天 · 还剩 {cycle.left} 天</span>
      </div>
      <div className="dd-lcd">
        <small>本周期剩余</small>
        <strong>{yuan(view.remaining)}</strong>
        {view.transit > 0 && <em>{yuan(view.transit)} 冻结在运输中 · 退货会回来</em>}
        {view.giftHeld > 0 && <em>{yuan(view.giftHeld)} 暂扣在红包和转账中 · 领取或退回会回来</em>}
      </div>
      <CycleBar total={cycle.total} passed={cycle.passed} />
    </section>

    <div className="dd-stats">
      <div><small>本周期已花</small><b>{yuan(view.spent)}</b></div>
      <div><small>今日支出</small><b>{yuan(view.todaySpent)}</b></div>
      <div className="is-pink"><small>每天还能花</small><b>{yuan(view.perDay)}</b>
        {view.reserved > 0 && <i>已留出必支出 {yuan(view.reserved)}</i>}</div>
    </div>

    {view.due.map((fixed) => <div className="dd-balloon" key={fixed.id} role="status">
      <PixelHeart />
      <p><b>{fixed.name} {yuan(fixed.amount)}</b> 今天该扣啦</p>
      <button type="button" className="dd-btn" onClick={() => actions.skipFixed(fixed.id)}>这期不扣</button>
      <button type="button" className="dd-btn is-pink" onClick={() => actions.confirmFixed(fixed.id)}>确认扣</button>
    </div>)}

    {!dd.state.configured && <div className="dd-balloon" role="status">
      <PixelHeart />
      <p><b>先告诉我你现在手里有多少钱</b>，剩余从这个数开始算。</p>
      <button type="button" className="dd-btn is-pink" onClick={onSetup}>去填</button>
    </div>}

    {dd.state.gifts.some((g) => g.status === "pending") && <Group title="待领取的红包与转账">
      {dd.state.gifts.filter((g) => g.status === "pending").map((g) => <div className="dd-balloon" key={g.id}>
        <p><b>{g.from === "susu" ? "酥酥发来的" : "你发给酥酥的"}{g.kind === "redpacket" ? "红包" : "转账"} {yuan(g.amount)}</b>{g.note && <span> · {g.note}</span>}</p>
        {g.from === "susu" ? <><button type="button" className="dd-btn" onClick={() => void actions.returnMoney(g.id)}>退回</button><button type="button" className="dd-btn is-pink" onClick={() => void actions.receiveMoney(g.id)}>领取</button></> : <small>等酥酥领取</small>}
      </div>)}
    </Group>}
    <div className="dd-ledger-write-actions"><button type="button" className="dd-write" onClick={onWrite}><span>−</span>记支出</button><button type="button" className="dd-write is-income" onClick={onIncome}><span>＋</span>入账</button></div>

    {view.cats.length > 0 && <Group title="这期钱去哪了" extra={<span className="dd-group-note">收入 {yuan(view.cycleIncome)}</span>}>
      <span className="dd-catbar" aria-hidden="true">
        {view.cats.map((row) => <i key={row.cat} style={{ flexGrow: row.amount, background: categoryOf(row.cat).tint }} />)}
      </span>
      <ul className="dd-legend">
        {view.cats.map((row) => <li key={row.cat}><CatSticker cat={row.cat} />{categoryOf(row.cat).label}
          <b>{yuan(row.amount)}</b><small>{Math.round((row.amount / catTotal) * 100)}%</small></li>)}
      </ul>
    </Group>}

    <Group title="本周期明细" extra={<span className="dd-group-note">点一笔可以改</span>}>
      <DayList dd={dd} entries={view.cycleEntries} empty="这个周期还没有记账。" onEdit={onEdit} />
    </Group>

    {view.prev && <Group title={`上周期明细 ${view.prev.cycle.label}`} extra={<span className="dd-group-note">{shortDay(view.prev.foldsOn)} 收起成总结</span>}>
      <DayList dd={dd} entries={view.prev.entries} empty="" onEdit={onEdit} />
    </Group>}
  </>;
}

/** Entries grouped by day, newest first, each day with its own spending. */
function DayList({ dd, entries, empty, onEdit }: { dd: Dayday; entries: Entry[]; empty: string; onEdit: (entry: Entry) => void }) {
  const days = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = dayKey(entry.at);
    days.set(key, [...(days.get(key) || []), entry]);
  }
  if (days.size === 0) return empty ? <p className="dd-empty">{empty}</p> : null;
  return <>
    {[...days].map(([key, list]) => {
      const out = list.filter((e) => e.kind === "expense" && e.status === "done").reduce((total, e) => total + e.amount, 0);
      return <div className="dd-day" key={key}>
        <h4>{key === dd.today ? "今天" : dayLabel(key)}<span>支出 {yuan(out)}</span></h4>
        {list.map((entry) => <button type="button" className="dd-entry" key={entry.id} onClick={() => onEdit(entry)}>
          <CatSticker cat={entry.cat} />
          <span className="dd-entry-text">
            <b>{entry.note || categoryOf(entry.cat).label}</b>
            <small>{categoryOf(entry.cat).label} · {timeOf(entry.at)}
              {entry.bySusu && <em className="dd-chip is-blue">酥酥记</em>}
              {entry.status === "transit" && <em className="dd-chip is-yellow">运输中</em>}</small>
          </span>
          <span className={`dd-amount${entry.kind === "income" ? " is-in" : ""}`}>{entry.kind === "income" ? yuan(entry.amount, true) : `-${yuan(entry.amount)}`}</span>
        </button>)}
      </div>;
    })}
  </>;
}

function localInput(iso: string) {
  const key = dayKey(iso);
  return `${key}T${timeOf(iso)}`;
}

/** 记一笔 / 改一笔. */
export function EntryDialog({ dd, entry, initialKind = "expense", onClose }: { dd: Dayday; entry?: Entry; initialKind?: Kind; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>(entry?.kind || initialKind);
  const [amount, setAmount] = useState(entry ? (entry.amount / 100).toString() : "");
  const [cat, setCat] = useState(entry?.cat || (initialKind === "income" ? "allowance" : "food"));
  const [note, setNote] = useState(entry?.note || "");
  const [when, setWhen] = useState(localInput(entry?.at || new Date().toISOString()));
  const [error, setError] = useState("");
  const cats = kind === "expense" ? EXPENSE_CATS : INCOME_CATS;
  const locked = entry?.status === "transit";

  function switchKind(next: Kind) {
    setKind(next);
    setCat((next === "expense" ? EXPENSE_CATS : INCOME_CATS)[0].id);
  }
  function save() {
    const cents = parseYuan(amount);
    if (!cents) { setError("金额写一个大于 0 的数，最多两位小数。"); return; }
    const at = new Date(`${when}:00+08:00`);
    if (Number.isNaN(at.getTime())) { setError("时间不太对。"); return; }
    const input = { kind, cat, amount: cents, note: note.trim(), at: at.toISOString() };
    if (entry) void dd.actions.updateEntry(entry.id, input); else void dd.actions.addEntry(input);
    onClose();
  }

  return <XpDialog title={entry ? "改一笔" : kind === "income" ? "入账" : "记支出"} onClose={onClose} className="dd-dialog">
    {locked && <p className="dd-hint">这一笔是还在路上的订单，去商城「运输中」确认收货或退货。</p>}
    <div className="dd-seg" role="group" aria-label="收支">
      <button type="button" aria-pressed={kind === "expense"} disabled={locked} onClick={() => switchKind("expense")}>支出</button>
      <button type="button" aria-pressed={kind === "income"} disabled={locked} onClick={() => switchKind("income")}>收入</button>
    </div>
    <label className="dd-money-field"><span>¥</span>
      <input inputMode="decimal" placeholder="0" value={amount} disabled={locked} autoFocus={!entry}
        onChange={(e) => { setAmount(e.target.value); setError(""); }} aria-label="金额" />
    </label>
    <div className="dd-cat-grid" role="radiogroup" aria-label="分类">
      {cats.map((c) => <button type="button" role="radio" key={c.id} aria-checked={cat === c.id} disabled={locked} onClick={() => setCat(c.id)}>
        <CatSticker cat={c.id} /><span>{c.label}</span>
      </button>)}
    </div>
    <div className="dd-form">
      <label><span>备注</span><input value={note} disabled={locked} maxLength={40} placeholder="比如：午饭 黄焖鸡" onChange={(e) => setNote(e.target.value)} /></label>
      <label><span>时间</span><input type="datetime-local" disabled={locked} value={when} onChange={(e) => setWhen(e.target.value)} /></label>
    </div>
    {error && <p className="dd-error" role="alert">{error}</p>}
    <div className="dd-dialog-buttons">
      {entry && !locked && <button type="button" className="dd-btn is-danger" onClick={() => { dd.actions.removeEntry(entry.id); onClose(); }}>删掉</button>}
      <span />
      <button type="button" className="dd-btn" onClick={onClose}>取消</button>
      {!locked && <button type="button" className="dd-btn is-pink" onClick={save}>{entry ? "改好了" : "记上"}</button>}
    </div>
  </XpDialog>;
}
