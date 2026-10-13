"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/client-api";
import type { Settings } from "../lib/app-settings";
import type { ChatSession } from "../lib/app-types";
import type { PhoneSnapshot, PhoneTarget } from "../lib/susu-phone";
import { PhoneGlyph } from "./RetroDesktop";
import { PhoneHome } from "./susu-phone/PhoneHome";
import { PhoneLockScreen } from "./susu-phone/PhoneLockScreen";
import { PhoneToday } from "./susu-phone/PhoneToday";
import { PhoneSettings } from "./susu-phone/PhoneSettings";
import { PhoneChat } from "./susu-phone/PhoneChat";

/* The phone on the XP desktop is now a whole little iOS: every open starts
   on the lock screen, unlocking lands on the home page (widgets + icons),
   and the old three cards live on the "susu today" page behind the square
   widget. Apps still jump out to the real windows. */
type PhoneScreen = { kind: "locked" } | { kind: "home" } | { kind: "today" } | { kind: "settings" } | { kind: "chat" };

function shanghaiTime(now: Date) {
  return now.toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function SusuPhoneView({ settings, sessions, updateSettings, onBack, onOpen }: {
  settings: Settings; updateSettings: (patch: Partial<Settings>) => void;
  sessions: ChatSession[];
  onBack: () => void; onOpen: (target: PhoneTarget) => void;
}) {
  const [phone, setPhone] = useState<PhoneSnapshot | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [screen, setScreen] = useState<PhoneScreen>({ kind: "locked" });
  const [now, setNow] = useState(() => new Date());
  const [powerFlash, setPowerFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);
  useEffect(() => {
    let alive = true;
    let loading = false;
    const controller = new AbortController();
    async function load() {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      try {
        const response = await apiFetch("/api/phone", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { ok?: boolean; phone?: PhoneSnapshot; error?: string };
        if (!response.ok || !data.ok || !data.phone) throw new Error(data.error || "手机暂时连不上，稍后再试。");
        if (alive) { setPhone(data.phone); setError(""); }
      } catch (failure) {
        if (alive) setError(failure instanceof Error ? failure.message : "手机暂时连不上，稍后再试。");
      } finally { loading = false; }
    }
    void load();
    const timer = window.setInterval(() => { void load(); }, 30_000);
    const focus = () => { void load(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => { alive = false; controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [refresh]);

  // The status bar (when unlocked) and the lock screen both show the live time.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Locked + press = a little pulse; unlocked + press = lock right away.
  function pressPower() {
    if (screen.kind === "locked") {
      setPowerFlash(true);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setPowerFlash(false), 450);
    } else {
      setScreen({ kind: "locked" });
    }
  }

  const locked = screen.kind === "locked";

  return <div className="xp-summer-screen sp-screen">
    <section className="xp-summer-window" aria-label="susu’s phone">
      <header className="xp-summer-titlebar">
        <span className="rd-title-icon"><PhoneGlyph /></span><h1>susu’s phone</h1>
        <div className="xp-summer-controls">
          <i className="xp-summer-window-button xp-summer-min" aria-hidden="true" />
          <i className="xp-summer-window-button xp-summer-max" aria-hidden="true" />
          <button type="button" className="xp-summer-window-button xp-summer-close" aria-label="关闭手机，回到桌面" onClick={onBack}>
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg></button>
        </div>
      </header>
      <div className="sp-stage">
        <div className="sp-device">
          <button type="button" className={`sp-power${powerFlash ? " is-flash" : ""}`}
            aria-label={locked ? "电源键" : "电源键：锁定手机"} title={locked ? "电源键" : "按电源键上锁"} onClick={pressPower} />
          <div className="sp-display" data-appearance={settings.susuPhoneAppearance === "day" ? "day" : "night"}
            data-wallpaper={phone?.settings.wallpaper || "night-blue"} data-app={screen.kind === "chat" ? "chat" : undefined}>
            {phone?.settings.ornaments.clouds !== false && <div className="sp-clouds" aria-hidden="true"><i /><i /><i /></div>}
            {phone?.settings.ornaments.moon !== false && <span className="sp-moon" aria-hidden="true" />}
            <div className="sp-statusbar"><span>{locked ? "iooi服务" : shanghaiTime(now)}</span><span className="sp-island" aria-hidden="true" />
              <span className="sp-status-icons" aria-hidden="true">
                <svg className="sp-signal" width="16" height="12" viewBox="0 0 16 12"><path d="M2 10.5V9M6 10.5V6.5M10 10.5V4M14 10.5V1.5" /></svg>
                <b>5G</b>
                <svg width="22" height="12" viewBox="0 0 22 12"><rect className="sp-bat-body" x="1" y="1.5" width="15" height="9" rx="2.5" /><path className="sp-bat-tip" d="M18.5 4.5v3" /></svg>
              </span></div>
            {locked && <PhoneLockScreen now={now} onUnlock={() => setScreen({ kind: "home" })} />}
            {!locked && screen.kind === "home" && <PhoneHome phone={phone} error={error} settings={settings}
              onRefresh={() => setRefresh((n) => n + 1)} onOpenToday={() => setScreen({ kind: "today" })}
              onOpenSettings={() => setScreen({ kind: "settings" })} onOpenChat={() => setScreen({ kind: "chat" })} />}
            {!locked && screen.kind === "today" && <PhoneToday phone={phone} error={error} onBack={() => setScreen({ kind: "home" })}
              onRefresh={() => setRefresh((n) => n + 1)} onOpen={onOpen} />}
            {!locked && screen.kind === "settings" && <PhoneSettings appearance={settings.susuPhoneAppearance === "day" ? "day" : "night"}
              onChange={(susuPhoneAppearance) => updateSettings({ susuPhoneAppearance })} onBack={() => setScreen({ kind: "home" })} />}
            {!locked && screen.kind === "chat" && <PhoneChat settings={settings} sessions={sessions} onBack={() => setScreen({ kind: "home" })} />}
            {!locked && <span className="sp-home-indicator" aria-hidden="true" />}
          </div>
        </div>
      </div>
      <footer className="xp-summer-statusbar"><span>酥酥的小手机</span><span>按电源键上锁</span></footer>
    </section>
  </div>;
}
