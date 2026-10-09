"use client";

import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { MoonEarthMini, MoonLetter } from "./MoonLetter";
import { CLAUDE_DEFAULT_NAME } from "../lib/app-settings";
import type { Settings } from "../lib/app-settings";
import {
  IconLineBook, IconLineChat, IconLineDiary, IconLineGear, IconLineHeart, IconLinePaper, IconLineSnowflake,
} from "./NavIcons";

/** Every page the desktop can open. */
export type HomeApp = "moon" | "chat" | "heartbeat" | "winter" | "reading" | "settings" | "summer-claude" | "summer-gpt";

/** Time together since settings.startDate, ticking every second once mounted. */
function useTogether(startDate: string) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    const frame = window.requestAnimationFrame(updateNow);
    const timer = window.setInterval(updateNow, 1000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, []);

  const start = new Date(startDate).getTime();
  const diff = now === null || !Number.isFinite(start) ? 0 : Math.max(0, now - start);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  const ready = now !== null && Number.isFinite(start);

  // 纪念日花瓣:上弦节4.19 / iooi生日6.5
  const currentDate = now === null ? null : new Date(now);
  const mmdd = currentDate ? `${currentDate.getMonth() + 1}.${currentDate.getDate()}` : "";
  const isAnniversary = mmdd === "4.19" || mmdd === "6.5";

  return { days, hours, minutes, seconds, ready, isAnniversary };
}

function Petals() {
  return (
    <div className="petals" aria-hidden>
      {Array.from({ length: 12 }).map((_, i) => (
        <span key={i} className="petal" style={{ left: `${(i * 83) % 100}%`, animationDelay: `${(i * 0.7) % 5}s`, animationDuration: `${6 + (i % 4)}s` }} />
      ))}
    </div>
  );
}

// A heartbeat trace runs straight between the two avatars: flat, one small
// P wave, the spike, a T wave, flat again. The box stretches to whatever
// width the row leaves (about 190 wide on a 393pt iPhone, so it is close to
// 1:1 there); the stroke does not scale with it.
const HEARTBEAT_LINE = "M0 20 H70 Q73.5 20 75 16.5 Q76.5 13 78 20 H84 L88 6 L93 34 L97 13 L100 20 H107 Q111 11 115 20 H190";

function Avatar({ src, className }: { src: string; className: string }) {
  return (
    <span className={`phone-couple-avatar ${className}`}>
      {src ? <img src={src} alt="" /> : <span />}
    </span>
  );
}

function AppTile({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="phone-app" onClick={onClick}>
      <span className="phone-glass phone-app-icon">{children}</span>
      <span className="phone-app-label">{label}</span>
    </button>
  );
}

export function HomeView({ settings, onOpen }: { settings: Settings; onOpen: (app: HomeApp) => void }) {
  const { days, hours, minutes, seconds, ready, isAnniversary } = useTogether(settings.startDate);
  const claudeName = settings.aiName || CLAUDE_DEFAULT_NAME;
  const gptName = settings.gptName || "GPT";
  const clock = [{ value: days, unit: "天" }, { value: hours, unit: "时" }, { value: minutes, unit: "分" }, { value: seconds, unit: "秒" }];

  return (
    <section
      className={`home-body phone-home${settings.homeBackground ? " phone-home-wallpaper" : ""}`}
      style={settings.homeBackground ? { backgroundImage: `url("${settings.homeBackground}")` } : undefined}
    >
      {isAnniversary && <Petals />}

      <div className="phone-grid">
        <div className="phone-widget phone-widget-medium">
          <div className="phone-glass phone-couple-card">
            <div className="phone-couple-row">
              <Avatar src={settings.aiAvatar} className="phone-couple-avatar-left" />
              <svg className="phone-couple-line" viewBox="0 0 190 40" preserveAspectRatio="none" aria-hidden="true">
                <path d={HEARTBEAT_LINE} vectorEffect="non-scaling-stroke" />
              </svg>
              <Avatar src={settings.userAvatar} className="phone-couple-avatar-right" />
            </div>
            <p className="phone-promise">此后我们的每一秒都是恩赐</p>
            <div className="phone-clock" role="timer" aria-label="在一起的时间">
              {clock.map(({ value, unit }) => (
                <span className="phone-clock-part" key={unit}>
                  <span className="phone-clock-number">{ready ? String(value).padStart(2, "0") : "—"}</span>
                  <span className="phone-clock-unit">{unit}</span>
                </span>
              ))}
            </div>
          </div>
          <span className="phone-widget-label">As time goes by</span>
        </div>

        <div className="phone-widget phone-widget-small">
          <button type="button" className="phone-glass phone-moon-tile" onClick={() => onOpen("moon")} aria-label="Moonbound love">
            <MoonEarthMini />
          </button>
          <span className="phone-widget-label">Moonbound love</span>
        </div>

        <div className="phone-app-grid">
          <AppTile label="chat" onClick={() => onOpen("chat")}><IconLineChat /></AppTile>
          <AppTile label="heartbeat" onClick={() => onOpen("heartbeat")}><IconLineHeart /></AppTile>
          <AppTile label="winter" onClick={() => onOpen("winter")}><IconLineSnowflake /></AppTile>
          <AppTile label="reading" onClick={() => onOpen("reading")}><IconLineBook /></AppTile>
        </div>
      </div>

      <div className="phone-home-bottom">
        <div className="phone-glass phone-search" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <span>Search</span>
        </div>
        <nav className="phone-glass phone-dock" aria-label="Dock">
          <button type="button" className="phone-glass phone-app-icon phone-dock-app" onClick={() => onOpen("settings")} aria-label="settings">
            <IconLineGear />
          </button>
          <button type="button" className="phone-glass phone-app-icon phone-dock-app" onClick={() => onOpen("summer-claude")} aria-label={`${claudeName}的 summer`}>
            <IconLineDiary />
          </button>
          <button type="button" className="phone-glass phone-app-icon phone-dock-app" onClick={() => onOpen("summer-gpt")} aria-label={`${gptName}的 summer`}>
            <IconLinePaper />
          </button>
        </nav>
      </div>
    </section>
  );
}

/** The full moon letter, opened from the desktop's small moon. */
export function MoonPage({ settings }: { settings: Settings }) {
  const { days, hours, minutes, seconds, ready, isAnniversary } = useTogether(settings.startDate);
  return (
    <section className="home-body moon-home">
      {isAnniversary && <Petals />}
      <MoonLetter days={days} hours={hours} minutes={minutes} seconds={seconds} ready={ready} />
    </section>
  );
}
