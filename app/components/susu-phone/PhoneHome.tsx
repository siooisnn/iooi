"use client";

import { HEARTBEAT_LINE, useTogether } from "../HomeView";
import type { Settings } from "../../lib/app-settings";
import type { PhoneSnapshot } from "../../lib/susu-phone";
import { IconLineBlog, IconLineBook, IconLineChat, IconLineGear, IconLineGlobe, IconLinePaper } from "../NavIcons";

/* Local glyphs for the apps that have no desktop counterpart. */
function IconPhone({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.9 3.5c.5 0 1 .3 1.2.8l1.5 3.4c.2.5.1 1.1-.3 1.5L7.8 10.4a11 11 0 0 0 5.8 5.8l1.2-1.5c.4-.4 1-.5 1.5-.3l3.4 1.5c.5.2.8.7.8 1.2v2.3c0 .8-.7 1.5-1.5 1.4C10.5 20.9 3.1 13.5 3 4.9c0-.8.6-1.4 1.4-1.4h2.5Z" />
    </svg>
  );
}
function IconChatBubbles({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.8 12.2h6.4a2 2 0 0 0 2-2V6.4a2 2 0 0 0-2-2H8.8a2 2 0 0 0-2 2v3.8a2 2 0 0 0 2 2Zm-3.3 3.3 2.7-2.1v-.5H5.9a2 2 0 0 1-2-2V7.1" />
    </svg>
  );
}
function IconMusic({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 17.5V6.2c0-.5.4-.9.9-.9l8.3 1.5c.5.1.8.5.8 1v8" />
      <circle cx="6.8" cy="17.5" r="2.4" />
      <circle cx="16.8" cy="15.4" r="2.4" />
    </svg>
  );
}
function IconShopping({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5.6 8.2h12.8l-.9 10.6a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8L5.6 8.2Z" />
      <path d="M9.3 10.4V7.1a2.7 2.7 0 0 1 5.4 0v3.3" />
    </svg>
  );
}

const TILE_COLORS: Record<string, string> = {
  phone: "linear-gradient(155deg, #5fce6b, #2fa250)",
  messages: "linear-gradient(155deg, #7ee06f, #43a94d)",
  browser: "linear-gradient(155deg, #5fb4ee, #2f66d0)",
  settings: "linear-gradient(155deg, #b6becb, #828b9a)",
  chat: "linear-gradient(155deg, #67d293, #269a68)",
  notes: "linear-gradient(155deg, #f3d369, #e0a93e)",
  books: "linear-gradient(155deg, #a287e0, #5d7fdb)",
  blog: "linear-gradient(155deg, #ef9fbe, #d45f93)",
  music: "linear-gradient(155deg, #f08c8c, #d95454)",
  shopping: "linear-gradient(155deg, #f2a95e, #df7a3e)",
};

/* The four always-visible apps; icons only, iOS style. */
const DOCK_APPS = [
  { id: "phone", label: "电话", Icon: IconPhone },
  { id: "messages", label: "短信", Icon: IconLineChat },
  { id: "browser", label: "浏览器", Icon: IconLineGlobe },
  { id: "settings", label: "设置", Icon: IconLineGear },
];

/* The six apps above, four per row with the susu-today widget to their right. */
const GRID_APPS = [
  { id: "chat", label: "聊天", Icon: IconChatBubbles },
  { id: "notes", label: "备忘录", Icon: IconLinePaper },
  { id: "books", label: "图书", Icon: IconLineBook },
  { id: "blog", label: "博客", Icon: IconLineBlog },
  { id: "music", label: "音乐", Icon: IconMusic },
  { id: "shopping", label: "购物", Icon: IconShopping },
];

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
    <div className="sp-widget-slot sp-widget-slot-timer">
      <section className="sp-widget sp-widget-timer" aria-label="As time goes by">
        <header className="sp-widget-timer-title">此后我们的每一秒都是恩赐</header>
        <div className="sp-widget-timer-top">
          <TimerAvatar src={settings.aiAvatar} alt={settings.aiName || "酥酥"} />
          <svg viewBox="0 0 190 40" preserveAspectRatio="none" aria-hidden="true">
            <path d={HEARTBEAT_LINE} vectorEffect="non-scaling-stroke" />
          </svg>
          <TimerAvatar src={settings.userAvatar} alt={settings.userName || "你"} />
        </div>
        <div className="sp-widget-timer-clock" role="timer" aria-label="在一起的时间">
          {clock.map(({ value, unit }) => (
            <span className="sp-widget-timer-part" key={unit}>
              <b>{ready ? String(value).padStart(2, "0") : "—"}</b>
              <small>{unit}</small>
            </span>
          ))}
        </div>
      </section>
      <span className="sp-widget-name">As time goes by</span>
    </div>
  );
}

/* The square widget: today's first two little things; tapping opens the
   full susu-today page. */
function TodayWidget({ phone, onOpen }: { phone: PhoneSnapshot; onOpen: () => void }) {
  const today = phone.today;
  return (
    <div className="sp-widget-slot sp-widget-slot-today">
      <button type="button" className="sp-widget sp-widget-today" onClick={onOpen} aria-label="打开 my day">
        <header><b>my day</b><span>{today.length ? `${today.length} 件小事` : "慢慢过一天"}</span></header>
        {today.length ? <ol>{today.slice(0, 2).map((entry) => (
          <li key={`${entry.at}-${entry.text}`}><time>{entry.clock}</time><span>{entry.text}</span></li>
        ))}</ol> : <p>今天还没有留下记录。<br />读书、逛网页的小事，<br />会慢慢出现在这里。</p>}
      </button>
      <span className="sp-widget-name">my day</span>
    </div>
  );
}

export function PhoneHome({ phone, error, settings, onRefresh, onOpenToday, onOpenSettings }: {
  phone: PhoneSnapshot | null; error: string; settings: Settings;
  onRefresh: () => void; onOpenToday: () => void; onOpenSettings: () => void;
}) {
  return (
    <div className="sp-home">
      <div className="sp-scroll">
        {error && <p className="sp-error" role="alert">{error}<button type="button" onClick={onRefresh}>重试</button></p>}
        {!phone && !error && <p className="sp-loading" role="status">正在打开酥酥的手机…</p>}
        {phone && <div className="sp-home-grid">
          <TimerWidget settings={settings} />
          <TodayWidget phone={phone} onOpen={onOpenToday} />
          {GRID_APPS.map(({ id, label, Icon }) => (
            <span className="sp-app" key={id}>
              <span className="sp-app-tile" style={{ background: TILE_COLORS[id] }}><Icon size={29} /></span>
              <small>{label}</small>
            </span>
          ))}
        </div>}
      </div>
      <nav className="sp-dock" aria-label="手机应用">
        {DOCK_APPS.map(({ id, label, Icon }) => id === "settings" ? (
          <button type="button" className="sp-dock-app" key={id} aria-label="手机设置" onClick={onOpenSettings}>
            <span className="sp-app-tile" style={{ background: TILE_COLORS[id] }}><Icon size={29} /></span>
          </button>
        ) : (
          <span className="sp-dock-app" key={id} title={label} aria-label={label}>
            <span className="sp-app-tile" style={{ background: TILE_COLORS[id] }}><Icon size={29} /></span>
          </span>
        ))}
      </nav>
    </div>
  );
}
