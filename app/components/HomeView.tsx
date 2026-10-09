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

// One thin line leaves her avatar, loops into a heart in the middle and runs
// on to 酥酥's. Drawn in a fixed 300×170 box so it meets both 64px avatars.
const HEART_LINE = "M60 86 C 58 130, 120 156, 150 148 C 160 140, 174 130, 174 117 C 174 107, 166 101, 159 101 C 154 101, 151 104, 150 108 C 149 104, 146 101, 141 101 C 134 101, 126 107, 126 117 C 126 130, 140 140, 150 148 C 165 156, 242 130, 240 86";

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
      <span className="phone-app-icon">{children}</span>
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
    <section className="home-body phone-home">
      {isAnniversary && <Petals />}

      <div className="phone-couple-card">
        <div className="phone-couple-art">
          <svg className="phone-couple-line" viewBox="0 0 300 170" aria-hidden="true">
            <path d={HEART_LINE} pathLength={1} />
          </svg>
          <Avatar src={settings.userAvatar} className="phone-couple-avatar-left" />
          <Avatar src={settings.aiAvatar} className="phone-couple-avatar-right" />
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

      <div className="phone-row">
        <button type="button" className="phone-moon-tile" onClick={() => onOpen("moon")} aria-label="I love you to the moon and back">
          <MoonEarthMini />
        </button>
        <div className="phone-app-grid">
          <AppTile label="chat" onClick={() => onOpen("chat")}><IconLineChat /></AppTile>
          <AppTile label="heartbeat" onClick={() => onOpen("heartbeat")}><IconLineHeart /></AppTile>
          <AppTile label="winter" onClick={() => onOpen("winter")}><IconLineSnowflake /></AppTile>
          <AppTile label="reading" onClick={() => onOpen("reading")}><IconLineBook /></AppTile>
        </div>
      </div>

      <nav className="phone-dock" aria-label="Dock">
        <button type="button" className="phone-dock-app" onClick={() => onOpen("settings")} aria-label="settings">
          <IconLineGear size={28} />
        </button>
        <button type="button" className="phone-dock-app" onClick={() => onOpen("summer-claude")} aria-label={`${claudeName}的 summer`}>
          <IconLineDiary size={28} />
        </button>
        <button type="button" className="phone-dock-app" onClick={() => onOpen("summer-gpt")} aria-label={`${gptName}的 summer`}>
          <IconLinePaper size={28} />
        </button>
      </nav>
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
