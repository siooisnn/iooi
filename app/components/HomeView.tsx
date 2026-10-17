"use client";

import { useState, useEffect } from "react";
import { MoonLetter } from "./MoonLetter";
import type { Settings } from "../lib/app-settings";

/* The 2026 glass home is retired: the XP desktop is the only home. This
   file keeps the shared home pieces — the together timer, petals and the
   full moon letter. */

/** Every page the desktop can open. */
export type HomeApp = "moon" | "chat" | "heartbeat" | "blog" | "reading" | "surf" | "dayday" | "clawd" | "mood" | "settings" | "summer-claude" | "summer-gpt" | "susu-phone";

/** Time together since settings.startDate, ticking every second once mounted. */
export function useTogether(startDate: string) {
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

  return { days, hours, minutes, seconds, ready, isAnniversary, now };
}

export function Petals() {
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
export const HEARTBEAT_LINE = "M0 20 H70 Q73.5 20 75 16.5 Q76.5 13 78 20 H84 L88 6 L93 34 L97 13 L100 20 H107 Q111 11 115 20 H190";

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
