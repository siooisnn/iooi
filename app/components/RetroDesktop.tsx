"use client";

import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { MoonEarthMini } from "./MoonLetter";
import { HEARTBEAT_LINE, Petals, useTogether } from "./HomeView";
import type { HomeApp } from "./HomeView";
import { CLAUDE_DEFAULT_NAME } from "../lib/app-settings";
import type { Settings } from "../lib/app-settings";

/* The desktop as a 2007 Windows XP screen: a Bliss-ish hill, chunky glossy
   icons, an "As time goes by.exe" window, the moon as a sidebar gadget and a
   blue taskbar with the green start button. Only looks differ; every icon
   opens the same app as the gray glass desktop. */

const BOOT_MS = 2400;
const SHUTDOWN_MS = 1300;

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// ── Icons: drawn in the glossy, outlined XP style ──

function useIds() {
  const id = useId().replace(/:/g, "");
  return { ref: (name: string) => `${id}-${name}`, paint: (name: string) => `url(#${id}-${name})` };
}

/** chat: the two MSN buddies, blue behind green. */
function ChatGlyph() {
  const { ref, paint } = useIds();
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id={ref("b")} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#8ec5ff" /><stop offset="1" stopColor="#1f5fd1" /></linearGradient>
        <linearGradient id={ref("g")} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#b6f07a" /><stop offset="1" stopColor="#2f9a1f" /></linearGradient>
      </defs>
      <g stroke="#173a73" strokeWidth="1.4">
        <path d="M21 40c0-10 4.5-15 11.5-15S44 30 44 40z" fill={paint("b")} />
        <circle cx="32.5" cy="15" r="7.5" fill={paint("b")} />
      </g>
      <g stroke="#1d5a12" strokeWidth="1.4">
        <path d="M4 45c0-11.5 5-17.5 13.5-17.5S31 33.5 31 45z" fill={paint("g")} />
        <circle cx="17.5" cy="18" r="8.5" fill={paint("g")} />
      </g>
      <ellipse cx="15" cy="14.5" rx="3.6" ry="2.2" fill="#fff" opacity=".7" />
      <ellipse cx="30.5" cy="11.8" rx="3" ry="1.8" fill="#fff" opacity=".7" />
    </svg>
  );
}

/** heartbeat: a glossy red heart with a white trace through it. */
function HeartGlyph() {
  const { ref, paint } = useIds();
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <radialGradient id={ref("h")} cx="35%" cy="30%" r="75%"><stop stopColor="#ff9db4" /><stop offset=".55" stopColor="#ef2b4f" /><stop offset="1" stopColor="#a30d2b" /></radialGradient>
      </defs>
      <path d="M24 43C10 33 3.5 26 3.5 16.5 3.5 9.8 8.7 5 15 5c4 0 7 2.4 9 6 2-3.6 5-6 9-6 6.3 0 11.5 4.8 11.5 11.5C44.5 26 38 33 24 43Z" fill={paint("h")} stroke="#7a0a20" strokeWidth="1.4" />
      <ellipse cx="13.5" cy="12.5" rx="5" ry="3" fill="#fff" opacity=".55" transform="rotate(-25 13.5 12.5)" />
      <path d="M7 23h8l3-7 4.5 14 4-11 2 4h12" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** blog: a spiral notepad with a pink heart doodled on it. */
function BlogGlyph() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect x="8" y="7" width="31" height="37" rx="2" fill="#fffdf2" stroke="#5a6f96" strokeWidth="1.4" />
      <rect x="8" y="7" width="31" height="7" fill="#3b7be0" stroke="#1f4f9e" strokeWidth="1.4" />
      <g fill="#fff" stroke="#5a6f96" strokeWidth="1">{[13, 20, 27, 34].map((x) => <circle key={x} cx={x} cy="7" r="2" />)}</g>
      <path d="M13 20h20M13 25.5h20M13 31h12" stroke="#9fb8e0" strokeWidth="1.6" />
      <path d="M31.5 40.5c-3.6-2.6-6-4.8-6-7.2 0-2.8 3.6-3.9 6-1.4 2.4-2.5 6-1.4 6 1.4 0 2.4-2.4 4.6-6 7.2Z" fill="#ff5fa8" stroke="#c2185b" strokeWidth="1" />
    </svg>
  );
}

/** reading: an open book on a red cover. */
function BookGlyph() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M2.5 14v29c7-2.6 14.5-2.6 21.5 0 7-2.6 14.5-2.6 21.5 0V14z" fill="#c0392b" stroke="#6e1b12" strokeWidth="1.4" />
      <path d="M5 11c6.5-2.4 13-2 19 1.5V40c-6-3.4-12.5-3.8-19-1.5z" fill="#fff" stroke="#7c6a4c" strokeWidth="1.2" />
      <path d="M43 11c-6.5-2.4-13-2-19 1.5V40c6-3.4 12.5-3.8 19-1.5z" fill="#f6f1e2" stroke="#7c6a4c" strokeWidth="1.2" />
      <path d="M9 17c3.6-1 7.3-.8 11 .7M9 22c3.6-1 7.3-.8 11 .7M9 27c3.6-1 7.3-.8 11 .7M28 17.7c3.7-1.5 7.4-1.7 11-.7M28 22.7c3.7-1.5 7.4-1.7 11-.7" stroke="#a9b6cc" strokeWidth="1.3" fill="none" />
    </svg>
  );
}

/** clawd: the terracotta crab-ish friend, in big square pixels. */
function ClawdGlyph() {
  return (
    <svg viewBox="0 0 24 24" shapeRendering="crispEdges" aria-hidden="true">
      <g fill="#d77757" stroke="#7a3520" strokeWidth=".6">
        <rect x="5" y="6" width="14" height="9" />
        <rect x="2" y="9.5" width="3" height="2.5" />
        <rect x="19" y="9.5" width="3" height="2.5" />
        {[6.5, 9.5, 13, 16].map((x) => <rect key={x} x={x} y="15" width="1.6" height="4" />)}
      </g>
      <rect x="8.6" y="8.4" width="1.8" height="2.8" fill="#2b2b2b" />
      <rect x="13.6" y="8.4" width="1.8" height="2.8" fill="#2b2b2b" />
      <rect x="5.6" y="6.6" width="12.8" height="1.2" fill="#fff" opacity=".35" />
    </svg>
  );
}

/** Back to 2026: a little iPhone showing the gray glass desktop. */
function PhoneGlyph() {
  const { ref, paint } = useIds();
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id={ref("s")} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f2f2f2" /><stop offset="1" stopColor="#bdbdbd" /></linearGradient>
      </defs>
      <rect x="13" y="3" width="22" height="42" rx="5.5" fill="#2a2a2e" stroke="#000" strokeWidth="1.2" />
      <rect x="15" y="6" width="18" height="36" rx="3.5" fill={paint("s")} />
      <g fill="#fff" stroke="#9a9a9a" strokeWidth=".6">
        {[[17, 13], [22.3, 13], [27.6, 13], [17, 19], [22.3, 19], [27.6, 19]].map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="3.6" height="3.6" rx="1" />)}
      </g>
      <rect x="16.5" y="35.5" width="15" height="4.5" rx="2.2" fill="#fff" opacity=".8" />
      <rect x="21" y="7.2" width="6" height="1.6" rx=".8" fill="#2a2a2e" />
    </svg>
  );
}

/** Control Panel for settings. */
function GearGlyph() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect x="4" y="8" width="40" height="32" rx="3" fill="#dfe9f7" stroke="#38639f" strokeWidth="1.4" />
      <rect x="4" y="8" width="40" height="7" rx="3" fill="#3b7be0" />
      <circle cx="17" cy="28" r="6.5" fill="#f5c542" stroke="#9a6d07" strokeWidth="1.3" />
      <circle cx="17" cy="28" r="2.4" fill="#fff" stroke="#9a6d07" strokeWidth="1" />
      <path d="M29 22h10M29 28h10M29 34h7" stroke="#38639f" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** A summer diary: a little leather book with a bookmark. */
function DiaryGlyph({ tint }: { tint: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect x="9" y="5" width="30" height="38" rx="2.5" fill={tint} stroke="#333" strokeWidth="1.4" />
      <rect x="9" y="5" width="5" height="38" fill="#000" opacity=".2" />
      <rect x="18" y="12" width="16" height="7" rx="1" fill="#fff" opacity=".85" />
      <path d="M31 43v5l2.5-2 2.5 2v-5" fill="#ff5fa8" />
    </svg>
  );
}

function StartFlag() {
  return (
    <svg className="xp-desk-flag" viewBox="0 0 20 18" aria-hidden="true">
      <path d="M1 3.2c2.6-1.3 5.2-1.3 8 .2v6.2C6.3 8.1 3.6 8.1 1 9.4z" fill="#f65314" />
      <path d="M10.2 3.9c2.8 1.5 5.6 1.5 8.4 0v6.2c-2.8 1.5-5.6 1.5-8.4 0z" fill="#7cbb00" />
      <path d="M1 10.6c2.6-1.3 5.3-1.3 8 .2V17c-2.7-1.5-5.4-1.5-8-.2z" fill="#00a1f1" />
      <path d="M10.2 11.3c2.8 1.5 5.6 1.5 8.4 0v6.2c-2.8 1.5-5.6 1.5-8.4 0z" fill="#ffbb00" />
    </svg>
  );
}

function DeskIcon({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="xp-desk-icon" onClick={onClick}>
      <span className="xp-desk-icon-art">{children}</span>
      <span className="xp-desk-icon-label">{label}</span>
    </button>
  );
}

function MenuItem({ icon, label, note, onClick }: { icon: ReactNode; label: string; note?: string; onClick: () => void }) {
  return (
    <button type="button" className="xp-desk-menu-item" onClick={onClick}>
      <span className="xp-desk-menu-art">{icon}</span>
      <span className="xp-desk-menu-text"><b>{label}</b>{note && <small>{note}</small>}</span>
    </button>
  );
}

function Portrait({ src }: { src: string }) {
  return <span className="xp-desk-portrait">{src ? <img src={src} alt="" /> : <span />}</span>;
}

export function RetroDesktop({ settings, onOpen, onExit, boot, onBooted }: {
  settings: Settings;
  onOpen: (app: HomeApp) => void;
  onExit: () => void;
  boot: boolean;
  onBooted: () => void;
}) {
  const { days, hours, minutes, seconds, ready, isAnniversary, now } = useTogether(settings.startDate);
  const [startOpen, setStartOpen] = useState(false);
  const [balloon, setBalloon] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const claudeName = settings.aiName || CLAUDE_DEFAULT_NAME;
  const gptName = settings.gptName || "GPT";
  const herName = settings.userName || "宝宝";

  // The boot screen only plays right after she switches retro on.
  useEffect(() => {
    if (!boot) return;
    const timer = window.setTimeout(() => {
      onBooted();
      setBalloon(true);
    }, reducedMotion() ? 200 : BOOT_MS);
    return () => window.clearTimeout(timer);
  }, [boot, onBooted]);

  // The tray balloon tucks itself away after a few seconds.
  useEffect(() => {
    if (!balloon) return;
    const timer = window.setTimeout(() => setBalloon(false), 6000);
    return () => window.clearTimeout(timer);
  }, [balloon]);

  function open(app: HomeApp) {
    setStartOpen(false);
    onOpen(app);
  }

  function shutDown() {
    setStartOpen(false);
    setLeaving(true);
    window.setTimeout(onExit, reducedMotion() ? 200 : SHUTDOWN_MS);
  }

  const clockTime = now === null ? "" : new Date(now).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const counter = [{ value: days, unit: "天" }, { value: hours, unit: "时" }, { value: minutes, unit: "分" }, { value: seconds, unit: "秒" }];

  return (
    <section
      className={`xp-desktop${settings.homeBackground ? " xp-desktop-photo" : ""}`}
      style={settings.homeBackground ? { backgroundImage: `url("${settings.homeBackground}")` } : undefined}
    >
      {isAnniversary && <Petals />}

      <div className="xp-desk-area">
        <section className="xp-window xp-desk-together">
          <header className="xp-titlebar">
            <span className="xp-title-icon" aria-hidden="true">♥</span>
            <span className="xp-title-text">As time goes by.exe</span>
            <span className="xp-controls" aria-hidden="true">
              <i className="xp-btn xp-min" />
              <i className="xp-btn xp-max" />
              <i className="xp-btn xp-close" />
            </span>
          </header>
          <div className="xp-body">
            <div className="xp-desk-couple">
              <Portrait src={settings.aiAvatar} />
              <span className="xp-desk-monitor">
                <svg viewBox="0 0 190 40" preserveAspectRatio="none" aria-hidden="true">
                  <path d={HEARTBEAT_LINE} vectorEffect="non-scaling-stroke" />
                </svg>
              </span>
              <Portrait src={settings.userAvatar} />
            </div>
            <p className="xp-desk-promise">此后我们的每一秒都是恩赐</p>
            <div className="xp-desk-counter" role="timer" aria-label="在一起的时间">
              {counter.map(({ value, unit }) => (
                <span key={unit}>
                  <b>{ready ? String(value).padStart(2, "0") : "—"}</b>
                  <small>{unit}</small>
                </span>
              ))}
            </div>
          </div>
        </section>

        <div className="xp-desk-row">
          <div className="xp-desk-icons">
            <DeskIcon label="chat" onClick={() => open("chat")}><ChatGlyph /></DeskIcon>
            <DeskIcon label="heartbeat" onClick={() => open("heartbeat")}><HeartGlyph /></DeskIcon>
            <DeskIcon label="blog" onClick={() => open("blog")}><BlogGlyph /></DeskIcon>
            <DeskIcon label="reading" onClick={() => open("reading")}><BookGlyph /></DeskIcon>
            <DeskIcon label="clawd" onClick={() => open("clawd")}><ClawdGlyph /></DeskIcon>
            <DeskIcon label="回到 2026" onClick={shutDown}><PhoneGlyph /></DeskIcon>
          </div>

          <button type="button" className="xp-desk-gadget" onClick={() => open("moon")} aria-label="Moonbound love">
            <span className="xp-desk-gadget-glass"><MoonEarthMini /></span>
            <span className="xp-desk-icon-label">Moonbound love</span>
          </button>
        </div>
      </div>

      {startOpen && (
        <>
          <button type="button" className="xp-desk-scrim" aria-label="收起开始菜单" onClick={() => setStartOpen(false)} />
          <nav className="xp-desk-menu" aria-label="开始菜单">
            <header className="xp-desk-menu-user">
              <Portrait src={settings.userAvatar} />
              <b>{herName}</b>
            </header>
            <div className="xp-desk-menu-columns">
              <div className="xp-desk-menu-left">
                <MenuItem icon={<ChatGlyph />} label="chat" note="和他说说话" onClick={() => open("chat")} />
                <MenuItem icon={<BlogGlyph />} label="blog" note="我的小博客" onClick={() => open("blog")} />
                <MenuItem icon={<BookGlyph />} label="reading" onClick={() => open("reading")} />
                <MenuItem icon={<HeartGlyph />} label="heartbeat" onClick={() => open("heartbeat")} />
              </div>
              <div className="xp-desk-menu-right">
                <MenuItem icon={<GearGlyph />} label="控制面板" onClick={() => open("settings")} />
                <MenuItem icon={<DiaryGlyph tint="#d77757" />} label={`${claudeName}的 summer`} onClick={() => open("summer-claude")} />
                <MenuItem icon={<DiaryGlyph tint="#5b8fd9" />} label={`${gptName}的 summer`} onClick={() => open("summer-gpt")} />
                <MenuItem icon={<ClawdGlyph />} label="clawd" onClick={() => open("clawd")} />
              </div>
            </div>
            <footer className="xp-desk-menu-foot">
              <button type="button" onClick={shutDown}><span className="xp-desk-power" aria-hidden="true">⏻</span>回到 2026</button>
            </footer>
          </nav>
        </>
      )}

      {balloon && (
        <button type="button" className="xp-desk-balloon" onClick={() => setBalloon(false)}>
          <b><span aria-hidden="true">♥</span> 欢迎回到 2007</b>
          <span>{ready ? `我们已经在一起 ${days} 天啦。` : "我们在一起的每一天都算数。"}</span>
        </button>
      )}

      <footer className="xp-desk-taskbar">
        <button type="button" className={`xp-desk-start${startOpen ? " is-open" : ""}`} onClick={() => setStartOpen((value) => !value)}>
          <StartFlag /><span>start</span>
        </button>
        <span className="xp-desk-task"><span aria-hidden="true">♥</span>As time goes by</span>
        <span className="xp-desk-tray">
          <button type="button" className="xp-desk-tray-heart" onClick={() => setBalloon((value) => !value)} aria-label="在一起多久">♥</button>
          <span>{clockTime}</span>
        </span>
      </footer>

      {boot && (
        <div className="xp-desk-boot" role="status" aria-label="正在开机">
          <p className="xp-desk-boot-logo"><StartFlag /><span>iooi<sup>xp</sup></span></p>
          <span className="xp-desk-boot-bar" aria-hidden="true"><i /><i /><i /></span>
          <small>{claudeName} ♥ {herName}</small>
        </div>
      )}

      {leaving && (
        <div className="xp-desk-bye" role="status">
          <p>正在保存你的设置…</p>
          <small>下次见，2007 ♥</small>
        </div>
      )}
    </section>
  );
}
