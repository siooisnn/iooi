"use client";

import { HEARTBEAT_LINE, useTogether } from "../HomeView";
import type { Settings } from "../../lib/app-settings";
import { PHONE_APPS, type PhoneApp, type PhoneSnapshot, type PhoneTarget } from "../../lib/susu-phone";
import { IconLineBlog, IconLineBook, IconLineChat, IconLineGlobe } from "../NavIcons";

const APP_LABELS: Record<PhoneApp, string> = { reading: "书架", surf: "论坛", blog: "博客", chat: "MSN" };
const APP_ICONS = { reading: IconLineBook, surf: IconLineGlobe, blog: IconLineBlog, chat: IconLineChat };

function TimerAvatar({ src, alt }: { src: string; alt: string }) {
  if (!src) return <span className="sp-timer-avatar" aria-label={alt}>{alt.slice(0, 1)}</span>;
  return <img className="sp-timer-avatar" src={src} alt={alt} />;
}

/* The rectangular medium widget: the retired 2026 home's "As time goes by" —
   the two of them, a heartbeat line, and every second since they met. */
function TimerWidget({ settings }: { settings: Settings }) {
  const { days, hours, minutes, seconds, ready } = useTogether(settings.startDate);
  const clock = [
    { value: days, unit: "天" },
    { value: hours, unit: "时" },
    { value: minutes, unit: "分" },
    { value: seconds, unit: "秒" },
  ];
  return (
    <div className="sp-widget sp-widget-timer">
      <div className="sp-widget-timer-top">
        <TimerAvatar src={settings.aiAvatar} alt={settings.aiName || "酥酥"} />
        <svg viewBox="0 0 190 40" preserveAspectRatio="none" aria-hidden="true">
          <path d={HEARTBEAT_LINE} vectorEffect="non-scaling-stroke" />
        </svg>
        <TimerAvatar src={settings.userAvatar} alt={settings.userName || "你"} />
      </div>
      <p className="sp-widget-timer-promise">此后我们的每一秒都是恩赐</p>
      <div className="sp-widget-timer-clock" role="timer" aria-label="在一起的时间">
        {clock.map(({ value, unit }) => (
          <span className="sp-widget-timer-part" key={unit}>
            <b>{ready ? String(value).padStart(2, "0") : "—"}</b>
            <small>{unit}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

/* The square small widget: today's first two little things; tapping opens
   the full susu-today page. */
function TodayWidget({ phone, onOpen }: { phone: PhoneSnapshot; onOpen: () => void }) {
  const today = phone.today;
  return (
    <button type="button" className="sp-widget sp-widget-today" onClick={onOpen} aria-label="打开酥酥今天">
      <header><b>酥酥今天</b><span>{today.length ? `${today.length} 件小事` : "慢慢过一天"}</span></header>
      {today.length ? <ol>{today.slice(0, 2).map((entry) => (
        <li key={`${entry.at}-${entry.text}`}><time>{entry.clock}</time><span>{entry.text}</span></li>
      ))}</ol> : <p>今天还没有留下记录。<br />读书、逛网页的小事，会慢慢出现在这里。</p>}
    </button>
  );
}

export function PhoneHome({ phone, error, settings, onRefresh, onOpenToday, onOpen }: {
  phone: PhoneSnapshot | null; error: string; settings: Settings;
  onRefresh: () => void; onOpenToday: () => void; onOpen: (target: PhoneTarget) => void;
}) {
  const order = phone?.settings.iconOrder ?? [...PHONE_APPS];
  return (
    <div className="sp-home">
      <div className="sp-scroll">
        {error && <p className="sp-error" role="alert">{error}<button type="button" onClick={onRefresh}>重试</button></p>}
        {!phone && !error && <p className="sp-loading" role="status">正在打开酥酥的手机…</p>}
        {phone && <div className="sp-widgets">
          <TimerWidget settings={settings} />
          <TodayWidget phone={phone} onOpen={onOpenToday} />
        </div>}
        <div className="sp-apps">
          {order.map((app) => {
            const Icon = APP_ICONS[app];
            return (
              <button type="button" key={app} onClick={() => onOpen({ app })}>
                <span className="sp-app-tile" data-app={app}><Icon size={26} /></span>
                <small>{APP_LABELS[app]}</small>
              </button>
            );
          })}
        </div>
      </div>
      <nav className="sp-dock" aria-label="手机应用">
        {order.map((app) => {
          const Icon = APP_ICONS[app];
          return <button type="button" key={app} onClick={() => onOpen({ app })}><span><Icon size={24} /></span><small>{APP_LABELS[app]}</small></button>;
        })}
      </nav>
    </div>
  );
}
