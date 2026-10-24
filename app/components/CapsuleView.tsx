"use client";

import { useEffect, useState } from "react";
import { apiFetch, loadLocalRaw, saveLocal } from "../lib/client-api";
import { CAPSULE_LIMITS, sortLetters, type CapsuleView as Letter } from "../lib/capsules";
import { XpDialog } from "./XpDialog";

const DRAFT_KEY = "iooi-capsule-draft";
type Draft = { title: string; body: string; openOn: string };
type Tab = "inbox" | "sent" | "write";

/** An envelope with a little heart wax seal. */
export function CapsuleGlyph() {
  return <svg viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="11" width="40" height="28" rx="2.5" fill="#fffaf0" stroke="#8a5c7c" strokeWidth="1.5" />
    <path d="M4.8 13 24 28 43.2 13" fill="#ffe6f1" stroke="#8a5c7c" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M5 38 19 25M43 38 29 25" stroke="#c9a2b8" strokeWidth="1.2" />
    <circle cx="24" cy="28" r="6.6" fill="#e2416f" stroke="#8f1d3d" strokeWidth="1.2" />
    <path d="M24 31.6c-2.2-1.6-3.6-2.9-3.6-4.3 0-1.7 2.2-2.4 3.6-.9 1.4-1.5 3.6-.8 3.6.9 0 1.4-1.4 2.7-3.6 4.3Z" fill="#ffd2df" />
    <ellipse cx="13" cy="15.5" rx="5" ry="1.5" fill="#fff" opacity=".8" />
  </svg>;
}

/** A day "YYYY-MM-DD" moved by n days. */
function shiftDay(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function shiftYear(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y + 1, m - 1, d)).toISOString().slice(0, 10);
}
const stamp = (time: number) => new Date(time).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const prettyDay = (day: string) => { const [y, m, d] = day.split("-"); return `${y}年${Number(m)}月${Number(d)}日`; };

export function CapsuleView({ herName, hisName, onBack }: { herName: string; hisName: string; onBack: () => void }) {
  const [letters, setLetters] = useState<Letter[]>([]);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [tab, setTab] = useState<Tab>("inbox");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<{ letter: Letter; fresh: boolean } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => ({ title: "", body: "", openOn: "", ...loadLocalRaw<Partial<Draft>>(DRAFT_KEY, {}) }));

  useEffect(() => {
    let alive = true;
    let ticket = 0;
    async function reload() {
      const mine = ++ticket;
      try {
        const response = await apiFetch("/api/capsule", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "时光胶囊暂时打不开。");
        if (alive && mine === ticket) { setLetters(data.letters); setToday(data.today); setError(""); }
      } catch (e) { if (alive && mine === ticket) setError(e instanceof Error ? e.message : "时光胶囊暂时打不开。"); }
      finally { if (alive && mine === ticket) setLoading(false); }
    }
    const visible = () => { if (document.visibilityState === "visible") void reload(); };
    void reload();
    // Crossing midnight turns sealed letters into ready ones.
    const timer = window.setInterval(visible, 60_000);
    document.addEventListener("visibilitychange", visible);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, []);

  useEffect(() => { saveLocal(DRAFT_KEY, draft); }, [draft]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function send(body: Record<string, unknown>) {
    const response = await apiFetch("/api/capsule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "这次没成功。");
    return data.letter as Letter;
  }
  function upsert(letter: Letter) {
    setLetters((list) => list.some((l) => l.id === letter.id) ? list.map((l) => l.id === letter.id ? letter : l) : [...list, letter]);
  }

  async function open(letter: Letter) {
    if (letter.state === "opened") { setReading({ letter, fresh: false }); return; }
    if (busy) return;
    setBusy(true); setError("");
    try { const opened = await send({ action: "open", id: letter.id }); upsert(opened); setReading({ letter: opened, fresh: true }); }
    catch (e) { setError(e instanceof Error ? e.message : "这封没拆开。"); }
    finally { setBusy(false); }
  }

  async function seal() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const letter = await send({ action: "seal", ...draft });
      upsert(letter);
      setDraft({ title: "", body: "", openOn: "" });
      setConfirming(false);
      setTab("sent");
      setToast(`封好了。${prettyDay(letter.openOn)}那天${hisName}才能拆，在那之前谁都看不到。`);
    } catch (e) { setConfirming(false); setError(e instanceof Error ? e.message : "这封没封上。"); }
    finally { setBusy(false); }
  }

  const inbox = sortLetters(letters.filter((l) => l.to === "her"));
  const sent = sortLetters(letters.filter((l) => l.from === "her"));
  const ready = inbox.filter((l) => l.state === "ready").length;
  const sealedCount = letters.filter((l) => l.state === "sealed").length;
  const minDay = today ? shiftDay(today, 1) : "";
  const maxDay = today ? shiftDay(today, CAPSULE_LIMITS.maxDays) : "";
  const quick = today ? [
    { label: "明天", day: shiftDay(today, 1) }, { label: "一周后", day: shiftDay(today, 7) },
    { label: "一个月后", day: shiftDay(today, 30) }, { label: "一百天后", day: shiftDay(today, 100) }, { label: "一年后", day: shiftYear(today) },
  ] : [];
  const canSeal = Boolean(draft.body.trim() && draft.openOn && draft.openOn >= minDay && draft.openOn <= maxDay);

  function card(letter: Letter, mine: boolean) {
    const from = letter.from === "her" ? herName : hisName;
    const to = letter.to === "her" ? herName : hisName;
    const status = letter.state === "sealed" ? <><b>还剩 {letter.daysLeft} 天</b><small>{prettyDay(letter.openOn)} 拆封</small></>
      : letter.state === "ready" ? (mine ? <><b>到日子了</b><small>等{to}来拆</small></> : <><b>可以拆了！</b><small>{prettyDay(letter.openOn)} 拆封</small></>)
        : <><b>{mine ? `${to} 拆了` : "已拆"}</b><small>{stamp(letter.openedAt!)}</small></>;
    return <li key={letter.id} className={`cap-letter is-${letter.state}`}>
      <div className="cap-envelope" aria-hidden="true"><i className="cap-flap" /><i className="cap-seal">♥</i></div>
      <div className="cap-meta">
        <h3>{letter.title || <span className="cap-untitled">（信封上没写字）</span>}</h3>
        <p>{mine ? `寄给 ${to}` : `来自 ${from}`} · {stamp(letter.sealedAt)} 封口</p>
      </div>
      <div className="cap-status">{status}</div>
      {letter.state === "opened" ? <button type="button" onClick={() => void open(letter)}>再读一遍</button>
        : letter.state === "ready" && !mine ? <button type="button" className="is-primary" disabled={busy} onClick={() => void open(letter)}>拆信</button>
          : <span className="cap-locked" title="封着，谁都不能偷看" aria-label="封着"><svg viewBox="0 0 12 14" aria-hidden="true"><path d="M3.5 6V4.2a2.5 2.5 0 0 1 5 0V6" fill="none" stroke="currentColor" strokeWidth="1.4" /><rect x="1.5" y="6" width="9" height="7" rx="1.2" fill="currentColor" /></svg></span>}
    </li>;
  }

  return <div className="xp-summer-screen rd-screen dd-screen cap-screen"><section className="xp-summer-window" aria-label="时光胶囊">
    <header className="xp-summer-titlebar"><span className="dd-title-icon"><CapsuleGlyph /></span><h1>时光胶囊</h1><div className="xp-summer-controls"><button type="button" className="xp-summer-window-button xp-summer-close" aria-label="关闭时光胶囊" onClick={onBack}><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg></button></div></header>
    <div className="dd-strip"><b>Time Capsule</b><span>写好信，选一个拆封日，封口。没到日子谁都不能偷看。</span></div>
    {toast && <div className="dd-toast" role="status"><span>{toast}</span><button type="button" aria-label="关闭提示" onClick={() => setToast("")}>×</button></div>}
    <div className="dd-body cap-body">
      <div className="aw-tabs cap-tabs" role="tablist" aria-label="信">
        <button type="button" role="tab" aria-selected={tab === "inbox"} onClick={() => setTab("inbox")}>寄给我的{inbox.length ? ` (${inbox.length})` : ""}{ready ? <em>{ready}</em> : null}</button>
        <button type="button" role="tab" aria-selected={tab === "sent"} onClick={() => setTab("sent")}>我寄出的{sent.length ? ` (${sent.length})` : ""}</button>
        <button type="button" role="tab" aria-selected={tab === "write"} onClick={() => setTab("write")}>✎ 写一封信</button>
      </div>
      {error && <p className="aw-error" role="alert">{error}</p>}
      {loading ? <p className="dd-empty">正在打开时光胶囊…</p>
        : tab === "write" ? <form className="cap-write" onSubmit={(e) => { e.preventDefault(); if (canSeal) setConfirming(true); }}>
          <p className="cap-to">收信人：<b>{hisName}</b></p>
          <label>信封上写<input value={draft.title} maxLength={CAPSULE_LIMITS.title} placeholder="可以不写。封着的时候他也能看到这行字" onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
          <label className="cap-paper-label">信纸<textarea className="cap-paper" value={draft.body} maxLength={CAPSULE_LIMITS.body} rows={10} placeholder={`亲爱的${hisName}：`} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></label>
          <small className="cap-count">{draft.body.length} / {CAPSULE_LIMITS.body}</small>
          <fieldset className="cap-when"><legend>拆封日</legend>
            <input type="date" value={draft.openOn} min={minDay} max={maxDay} aria-label="拆封日期" onChange={(e) => setDraft({ ...draft, openOn: e.target.value })} />
            <span className="cap-quick">{quick.map((q) => <button type="button" key={q.label} aria-pressed={draft.openOn === q.day} onClick={() => setDraft({ ...draft, openOn: q.day })}>{q.label}</button>)}</span>
          </fieldset>
          <div className="cap-actions"><small>草稿会自动留在这台设备上；封口以后就改不了，也看不到了。</small><button type="submit" className="is-primary" disabled={!canSeal || busy}>封口 ♥</button></div>
        </form>
          : (() => {
            const list = tab === "inbox" ? inbox : sent;
            if (!list.length) return <div className="aw-empty"><CapsuleGlyph /><p>{tab === "inbox" ? "还没有寄给你的信。" : "你还没有寄出过信。"}</p><small>{tab === "inbox" ? `${hisName}封进来的信会在这里等着拆封日。` : "写一封，选好日子封进去吧。"}</small>{tab === "sent" && <button type="button" onClick={() => setTab("write")}>去写一封</button>}</div>;
            return <ul className="cap-list">{list.map((l) => card(l, tab === "sent"))}</ul>;
          })()}
    </div>
    <footer className="xp-summer-statusbar"><span>{ready ? `${ready} 封可以拆了` : `${sealedCount} 封还封着`}</span><span>{today ? `今天 ${today}` : ""}</span></footer>
  </section>
    {confirming && <XpDialog title="封口" onClose={() => setConfirming(false)} className="cap-dialog">
      <p>封口以后，这封信改不了，你自己也看不到，要等到 <b>{prettyDay(draft.openOn)}</b> {hisName}拆开以后才能再读。</p>
      <div className="rd-dialog-buttons"><button type="button" className="rd-button" onClick={() => setConfirming(false)}>再改改</button><button type="button" className="rd-button rd-button-default" disabled={busy} onClick={() => void seal()}>{busy ? "正在封…" : "封口"}</button></div>
    </XpDialog>}
    {reading && <XpDialog title={reading.letter.from === "her" ? `寄给${hisName}的信` : `来自${hisName}的信`} onClose={() => setReading(null)} className="cap-dialog cap-read">
      <article className={`cap-sheet${reading.fresh ? " is-fresh" : ""}`}>
        {reading.letter.title && <h3>{reading.letter.title}</h3>}
        <div className="cap-sheet-body">{reading.letter.body}</div>
        <footer>{reading.letter.from === "her" ? herName : hisName} · {stamp(reading.letter.sealedAt)} 封口 · {prettyDay(reading.letter.openOn)} 拆封</footer>
      </article>
      <div className="rd-dialog-buttons"><button type="button" className="rd-button rd-button-default" onClick={() => setReading(null)}>收好</button></div>
    </XpDialog>}
  </div>;
}
