"use client";

import { useState } from "react";
import { XpDialog } from "../XpDialog";
import { categoryOf, fixedDueKey, parseYuan, yuan, type Refill } from "./dayday-data";
import { CatSticker, Group } from "./DaydayParts";
import { Piggy } from "./DaydayArt";
import type { Dayday } from "./use-dayday";

const shortDay = (key: string) => `${Number(key.slice(5, 7))}.${Number(key.slice(8, 10))}`;

export function NotebookPage({ dd }: { dd: Dayday }) {
  const { state, cycle, view, actions } = dd;
  const [bank, setBank] = useState<"in" | "out" | null>(null);
  const [refill, setRefill] = useState<Refill | null>(null);
  const [settings, setSettings] = useState(false);
  const [refillName, setRefillName] = useState("");
  const [fixedForm, setFixedForm] = useState({ name: "", amount: "", day: "1" });
  const fixedCents = parseYuan(fixedForm.amount);
  const monthly = state.fixed.reduce((sum, f) => sum + f.amount, 0);

  return <>
    <section className="dd-piggy-card">
      <Piggy />
      <div>
        <small>dayday 存钱罐</small>
        <strong>{yuan(state.bank)}</strong>
        <p>存进去的钱不算花掉，只是先不让它出现在「剩余」里。</p>
        <span className="dd-piggy-buttons">
          <button type="button" className="dd-btn is-pink" onClick={() => setBank("in")}>存进去</button>
          <button type="button" className="dd-btn" disabled={!state.bank} onClick={() => setBank("out")}>取出来</button>
        </span>
      </div>
    </section>

    <Group title="最近待补" extra={<span className="dd-group-note">快用完的先写下来</span>}>
      {state.refills.length === 0 ? <p className="dd-empty">家里都还够用。</p>
        : <ul className="dd-checklist">{state.refills.map((r) => <li key={r.id}>
          <button type="button" aria-label={`${r.name}买到了`} onClick={() => setRefill(r)}><span aria-hidden="true" /></button>{r.name}
        </li>)}</ul>}
      <form className="dd-inline-form" onSubmit={(e) => { e.preventDefault(); if (refillName.trim()) { actions.addRefill(refillName.trim()); setRefillName(""); } }}>
        <input value={refillName} maxLength={20} placeholder="比如：洗衣液" onChange={(e) => setRefillName(e.target.value)} aria-label="待补的东西" />
        <button type="submit" className="dd-btn" disabled={!refillName.trim()}>加上</button>
      </form>
    </Group>

    <Group title="每月必支出" extra={<span className="dd-group-note">每月共 {yuan(monthly)}</span>}>
      {state.fixed.length === 0 ? <p className="dd-empty">还没有固定要扣的钱。</p> : <ul className="dd-fixed">
        {[...state.fixed].sort((a, b) => fixedDueKey(a.day, cycle).localeCompare(fixedDueKey(b.day, cycle))).map((f) => {
          const paid = f.paidCycle === cycle.startKey;
          const due = fixedDueKey(f.day, cycle);
          return <li key={f.id}>
            <CatSticker cat="phone" />
            <span className="dd-row-text"><b>{f.name}</b><small>每月 {f.day} 号 · 这期 {shortDay(due)}</small></span>
            <span className="dd-fixed-amount">{yuan(f.amount)}<em className={`dd-chip ${paid ? "is-green" : due <= dd.today ? "is-pink" : ""}`}>{paid ? "这期扣过了" : due <= dd.today ? "等你确认" : "还没到"}</em></span>
            <button type="button" className="dd-x" aria-label={`删掉${f.name}`} onClick={() => { if (window.confirm(`不再每月扣「${f.name}」了？`)) actions.removeFixed(f.id); }}>×</button>
          </li>;
        })}
      </ul>}
      <form className="dd-inline-form is-fixed" onSubmit={(e) => {
        e.preventDefault();
        if (!fixedForm.name.trim() || !fixedCents) return;
        actions.addFixed(fixedForm.name.trim(), fixedCents, Number(fixedForm.day));
        setFixedForm({ name: "", amount: "", day: "1" });
      }}>
        <input value={fixedForm.name} maxLength={16} placeholder="名称" aria-label="名称" onChange={(e) => setFixedForm({ ...fixedForm, name: e.target.value })} />
        <input value={fixedForm.amount} inputMode="decimal" placeholder="¥" aria-label="金额" onChange={(e) => setFixedForm({ ...fixedForm, amount: e.target.value })} />
        <select value={fixedForm.day} aria-label="每月几号" onChange={(e) => setFixedForm({ ...fixedForm, day: e.target.value })}>
          {Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1} 号</option>)}
        </select>
        <button type="submit" className="dd-btn" disabled={!fixedForm.name.trim() || !fixedCents}>加上</button>
      </form>
      <p className="dd-hint">到日子了账本首页会冒出来，你点「确认扣」才记上。</p>
    </Group>

    <Group title="周期总结" extra={<span className="dd-group-note">明细会清掉，总结一直留着</span>}>
      <div className="dd-summary is-now">
        <h4>{cycle.label}<em className="dd-chip is-pink">进行中</em></h4>
        <p>已花 {yuan(view.spent)} · 收入 {yuan(view.cycleIncome)} · 还剩 {cycle.left} 天</p>
      </div>
      {state.summaries.map((s) => {
        const total = s.cats.reduce((sum, c) => sum + c.amount, 0);
        return <div className="dd-summary" key={s.id}>
          <h4>{s.range}</h4>
          <div className="dd-summary-nums">
            <span><small>收入</small><b className="is-in">{yuan(s.income)}</b></span>
            <span><small>支出</small><b>{yuan(s.expense)}</b></span>
            <span><small>攒下</small><b className="is-pink">{yuan(s.saved)}</b></span>
          </div>
          <span className="dd-catbar" aria-hidden="true">{s.cats.map((c) => <i key={c.cat} style={{ flexGrow: c.amount, background: categoryOf(c.cat).tint }} />)}</span>
          <ul className="dd-legend is-compact">{s.cats.map((c) => <li key={c.cat}><CatSticker cat={c.cat} />{categoryOf(c.cat).label}<small>{Math.round((c.amount / total) * 100)}%</small></li>)}</ul>
        </div>;
      })}
    </Group>

    <button type="button" className="dd-settings-link" onClick={() => setSettings(true)}>⚙ 发生活费的日子 · 起始金额</button>

    {bank && <BankDialog dd={dd} direction={bank} onClose={() => setBank(null)} />}
    {refill && <RefillDialog dd={dd} refill={refill} onClose={() => setRefill(null)} />}
    {settings && <SettingsDialog dd={dd} onClose={() => setSettings(false)} />}
  </>;
}

function BankDialog({ dd, direction, onClose }: { dd: Dayday; direction: "in" | "out"; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const cents = parseYuan(amount);
  const limit = direction === "in" ? Math.max(0, dd.view.remaining) : dd.state.bank;
  const ok = cents !== null && cents <= limit;
  return <XpDialog title={direction === "in" ? "存进存钱罐" : "从存钱罐取出"} onClose={onClose} className="dd-dialog">
    <label className="dd-money-field"><span>¥</span><input inputMode="decimal" autoFocus placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="金额" /></label>
    <p className="dd-hint">{direction === "in" ? `现在剩余 ${yuan(dd.view.remaining)}，最多存这么多。` : `罐子里有 ${yuan(dd.state.bank)}。`}</p>
    <div className="dd-dialog-buttons"><span /><button type="button" className="dd-btn" onClick={onClose}>取消</button>
      <button type="button" className="dd-btn is-pink" disabled={!ok} onClick={() => { dd.actions.bank(direction, cents as number); onClose(); }}>{direction === "in" ? "存进去" : "取出来"}</button></div>
  </XpDialog>;
}

function RefillDialog({ dd, refill, onClose }: { dd: Dayday; refill: Refill; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const cents = amount.trim() ? parseYuan(amount) : null;
  return <XpDialog title={`${refill.name} 买到啦`} onClose={onClose} className="dd-dialog">
    <p className="dd-hint">顺手记一笔日用吗？不记就直接划掉。</p>
    <label className="dd-money-field"><span>¥</span><input inputMode="decimal" autoFocus placeholder="花了多少" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="金额" /></label>
    <div className="dd-dialog-buttons"><span />
      <button type="button" className="dd-btn" onClick={() => { dd.actions.doneRefill(refill.id, null); onClose(); }}>只划掉</button>
      <button type="button" className="dd-btn is-pink" disabled={!cents} onClick={() => { dd.actions.doneRefill(refill.id, cents); onClose(); }}>划掉并记一笔</button></div>
  </XpDialog>;
}

function SettingsDialog({ dd, onClose }: { dd: Dayday; onClose: () => void }) {
  const [payday, setPayday] = useState(String(dd.state.payday));
  const [start, setStart] = useState((dd.state.startAmount / 100).toString());
  const cents = parseYuan(start);
  return <XpDialog title="dayday 设置" onClose={onClose} className="dd-dialog">
    <div className="dd-form">
      <label><span>发生活费</span><select value={payday} onChange={(e) => setPayday(e.target.value)}>
        {Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>每月 {i + 1} 号</option>)}</select></label>
      <label><span>起始金额</span><input inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} /></label>
    </div>
    <p className="dd-hint">一个周期从这天 0 点到下个月这天 0 点，按北京时间算。起始金额是开始用 dayday 那一刻手里的钱。</p>
    <div className="dd-dialog-buttons"><span /><button type="button" className="dd-btn" onClick={onClose}>取消</button>
      <button type="button" className="dd-btn is-pink" disabled={!cents} onClick={() => { dd.actions.setSettings(Number(payday), cents as number); onClose(); }}>保存</button></div>
  </XpDialog>;
}
