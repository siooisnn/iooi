"use client";

import { useState } from "react";
import { DAILY_MOODS, moodMonthCells, shiftMoodMonth } from "../lib/daily-mood";
import type { useDailyMood } from "../lib/use-daily-mood";
import { PageBack } from "./PageBack";
import { MoodGlyph } from "./RetroDesktop";

export function MoodPage({ mood, retro, onBack }: {
  mood: ReturnType<typeof useDailyMood>; retro?: boolean; onBack: () => void;
}) {
  const { days, today, current, legacyState, message, saving, pick, refresh } = mood;
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(today);
  const [custom, setCustom] = useState("");
  const cells = moodMonthCells(month);
  const selected = days[selectedDate];
  const content = (
    <div className="mood-page">
      <section className="mood-today" aria-label="今日心情">
        <div className="mood-today-heading">
          <span className="mood-today-face" aria-hidden="true">{current?.emoji || "🙂"}</span>
          <div><p>{today.replaceAll("-", ".")}</p><h2>{current?.value || "今天是什么心情？"}</h2></div>
          <button type="button" className="mood-today-link" onClick={() => { setMonth(today.slice(0, 7)); setSelectedDate(today); }}>今天</button>
        </div>
        <p className="mood-hint">每天留一个心情。同一天可以改选，午夜后开始新的一天。</p>
        <div className="mood-choices" role="group" aria-label="选择今日心情">
          {DAILY_MOODS.map((choice) => (
            <button type="button" key={choice.value} disabled={saving} aria-pressed={current?.value === choice.value} onClick={() => {
              pick(choice.value); setSelectedDate(today); setMonth(today.slice(0, 7));
            }}>
              <span aria-hidden="true">{choice.emoji}</span><span>{choice.value}</span>
            </button>
          ))}
        </div>
        <form className="mood-custom" onSubmit={(event) => {
          event.preventDefault();
          if (!custom.trim() || saving) return;
          pick(custom); setCustom(""); setSelectedDate(today); setMonth(today.slice(0, 7));
        }}>
          <input aria-label="自定义心情" placeholder="或写一个自己的心情…" maxLength={40} value={custom} onChange={(event) => setCustom(event.target.value)} />
          <button type="submit" disabled={saving || !custom.trim()}>选好了</button>
        </form>
        {legacyState && !Object.keys(days).length && (
          <button type="button" className="mood-legacy" disabled={saving} onClick={() => pick(legacyState)}>之前的状态：{legacyState} · 用作今天的心情</button>
        )}
        <div className="mood-save-state" role="status">
          <span>{saving ? "正在同步…" : message || (current ? "今天的心情已记下。" : "今天还没有选。")}</span>
          {message && <button type="button" disabled={saving} onClick={() => void refresh()}>重试</button>}
          {current && <button type="button" disabled={saving} onClick={() => pick("")}>清除今天</button>}
        </div>
      </section>

      <section className="mood-calendar" aria-label="心情月历">
        <header className="mood-month-heading">
          <button type="button" aria-label="上个月" onClick={() => setMonth(shiftMoodMonth(month, -1))}>‹</button>
          <h2>{Number(month.slice(0, 4))} 年 {Number(month.slice(5))} 月</h2>
          <button type="button" aria-label="下个月" onClick={() => setMonth(shiftMoodMonth(month, 1))}>›</button>
        </header>
        <div className="mood-weekdays" aria-hidden="true">{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="mood-calendar-days">
          {cells.map((date, index) => date ? (
            <button type="button" key={date} className="mood-day" data-today={date === today || undefined} aria-pressed={date === selectedDate}
              aria-label={`${date}${date === today ? " 今天" : ""} ${days[date]?.value || "未记录"}`}
              onClick={() => setSelectedDate(date)}>
              <span className="mood-day-number">{Number(date.slice(8))}</span>
              <span className="mood-day-face" aria-hidden="true">{days[date]?.emoji || "·"}</span>
            </button>
          ) : <span className="mood-day-blank" key={`empty-${index}`} />)}
        </div>
        <p className="mood-calendar-caption" aria-live="polite">{selectedDate.replaceAll("-", ".")} · {selected?.value ? `${selected.emoji} ${selected.value}` : "这一天还没有记录"}</p>
      </section>
    </div>
  );

  if (retro) return (
    <div className="xp-summer-screen mood-screen">
      <section className="xp-summer-window" aria-label="mood">
        <header className="xp-summer-titlebar">
          <span className="mood-title-icon"><MoodGlyph /></span><h1>mood · 每日心情</h1>
          <div className="xp-summer-controls">
            <i className="xp-summer-window-button xp-summer-min" aria-hidden="true" />
            <i className="xp-summer-window-button xp-summer-max" aria-hidden="true" />
            <button type="button" className="xp-summer-window-button xp-summer-close" aria-label="关闭窗口，回到桌面" onClick={onBack}><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg></button>
          </div>
        </header>
        <div className="mood-window-content">{content}</div>
        <footer className="xp-summer-statusbar"><span>mood</span><span>一天一格，慢慢记。</span></footer>
      </section>
    </div>
  );

  return <><section className="diary-body mood-body" aria-label="mood">{content}</section><PageBack onBack={onBack} /></>;
}
