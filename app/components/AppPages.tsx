"use client";

import { useState } from "react";
import { HeartGlyph } from "./RetroDesktop";
import { lifeDay, type LifeEntry, type LifeKind } from "@/app/lib/life-log";

const KIND_LABEL: Record<LifeKind, string> = { care: "找你", comment: "留言", post: "写日志", read: "读书", surf: "冲浪", dayday: "dayday" };

type Filter = "all" | "care" | "blog" | "read" | "surf" | "dayday";
const FILTERS: ReadonlyArray<{ id: Filter; label: string; kinds: readonly LifeKind[] }> = [
  { id: "all", label: "全部", kinds: ["care", "comment", "post", "read", "surf", "dayday"] },
  { id: "care", label: "找你", kinds: ["care"] },
  { id: "blog", label: "博客", kinds: ["comment", "post"] },
  { id: "read", label: "读书", kinds: ["read"] },
  { id: "surf", label: "冲浪", kinds: ["surf"] },
  { id: "dayday", label: "dayday", kinds: ["dayday"] },
];

// Only plain web links are clickable; anything else stays text.
function safeUrl(url: string) {
  return /^https?:\/\/[^\s<>"]+$/i.test(url) ? url : "";
}

/** "2026/10/11 14:30" → ["2026/10/11", "14:30"]. */
function splitTime(time: string) {
  const space = time.indexOf(" ");
  return space < 0 ? [time, ""] : [time.slice(0, space), time.slice(space + 1)];
}

function dayLabel(day: string, now: number) {
  if (day === lifeDay(new Date(now))) return "今天";
  if (day === lifeDay(new Date(now - 86_400_000))) return "昨天";
  const [year, month, date] = day.split("/");
  const thisYear = lifeDay(new Date(now)).split("/")[0];
  return year === thisYear ? `${month}月${date}日` : `${year}年${month}月${date}日`;
}

/**
 * heartbeat: what he did on his own, newest first, as an XP window. Quiet
 * beats are not shown. A find online links to its thread on the forum.
 */
export function HeartbeatView({ log, onBack, onOpenThread }: { log: LifeEntry[]; onBack: () => void; onOpenThread: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [now] = useState(() => Date.now());
  const kinds = FILTERS.find((item) => item.id === filter)?.kinds || FILTERS[0].kinds;
  const shown = log.filter((entry) => kinds.includes(entry.kind));
  const days: Array<{ day: string; entries: LifeEntry[] }> = [];
  for (const entry of shown) {
    const [day] = splitTime(entry.time);
    const last = days[days.length - 1];
    if (last?.day === day) last.entries.push(entry);
    else days.push({ day, entries: [entry] });
  }
  const today = log.filter((entry) => splitTime(entry.time)[0] === lifeDay(new Date(now))).length;

  return <div className="xp-summer-screen rd-screen hb-screen">
    <section className="xp-summer-window" aria-label="heartbeat">
      <header className="xp-summer-titlebar">
        <span className="rd-title-icon"><HeartGlyph /></span><h1>heartbeat</h1>
        <div className="xp-summer-controls">
          <i className="xp-summer-window-button xp-summer-min" aria-hidden="true" />
          <i className="xp-summer-window-button xp-summer-max" aria-hidden="true" />
          <button type="button" className="xp-summer-window-button xp-summer-close" aria-label="关闭窗口，回到桌面" onClick={onBack}>
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg></button>
        </div>
      </header>

      <div className="rd-content hb-content">
        <div className="rd-tabs" role="tablist" aria-label="按类型看">
          {FILTERS.map((item) => {
            const count = item.id === "all" ? log.length : log.filter((entry) => item.kinds.includes(entry.kind)).length;
            return <button type="button" role="tab" key={item.id} aria-selected={filter === item.id}
              onClick={() => setFilter(item.id)}>{item.label}{count ? ` (${count})` : ""}</button>;
          })}
        </div>
        <div className="rd-tab-panel hb-panel" role="tabpanel">
          {!shown.length ? <div className="rd-empty"><HeartGlyph />
            <p>{log.length ? "这一类还没有记录。" : "还没有记录。"}</p>
            <small>他自己做了什么，都会记在这里。</small>
          </div> : days.map(({ day, entries }) => <section key={day} className="hb-day" aria-label={dayLabel(day, now)}>
            <h2 className="hb-day-head"><span>{dayLabel(day, now)}</span><small>{entries.length} 件事</small></h2>
            <ol className="hb-entries">
              {entries.map((entry) => <li key={`${entry.at}-${entry.kind}`} className={`hb-entry hb-kind-${entry.kind}`}>
                <span className="hb-clock">{splitTime(entry.time)[1]}</span>
                <span className="hb-badge">{KIND_LABEL[entry.kind]}</span>
                <div className="hb-main">
                  <p className="hb-text">{entry.text}</p>
                  {entry.links?.length ? <ul className="hb-links">
                    {entry.links.map((link) => <li key={link.url}>
                      {safeUrl(link.url) ? <a href={safeUrl(link.url)} target="_blank" rel="noopener noreferrer nofollow">{link.title}</a> : link.title}
                      {link.why && <span>{link.why}</span>}
                    </li>)}
                  </ul> : null}
                  {entry.note && <p className="hb-note">{entry.note}</p>}
                  {entry.kind === "surf" && entry.ref && <button type="button" className="hb-open" onClick={() => onOpenThread(entry.ref!)}>
                    去论坛看这帖 ›</button>}
                </div>
              </li>)}
            </ol>
          </section>)}
        </div>
      </div>

      <footer className="xp-summer-statusbar">
        <span>{today ? `今天 ${today} 件事` : "今天还没动静"}</span>
        <span>共 {log.length} 条记录</span>
      </footer>
    </section>
  </div>;
}
