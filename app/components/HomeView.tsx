"use client";

import { useState, useEffect } from "react";
import { MoonLetter } from "./MoonLetter";
import type { Settings } from "../lib/app-settings";

export function HomeView({ settings }: { settings: Settings }) {
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

  const start = new Date(settings.startDate).getTime();
  const diff = now === null || !Number.isFinite(start) ? 0 : Math.max(0, now - start);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  // 纪念日花瓣:上弦节4.19 / iooi生日6.5
  const currentDate = now === null ? null : new Date(now);
  const mmdd = currentDate ? `${currentDate.getMonth() + 1}.${currentDate.getDate()}` : "";
  const isAnniversary = mmdd === "4.19" || mmdd === "6.5";

  const petals = isAnniversary && (
    <div className="petals" aria-hidden>
      {Array.from({ length: 12 }).map((_, i) => (
        <span key={i} className="petal" style={{ left: `${(i * 83) % 100}%`, animationDelay: `${(i * 0.7) % 5}s`, animationDuration: `${6 + (i % 4)}s` }}>🌸</span>
      ))}
    </div>
  );
  const ready = now !== null && Number.isFinite(start);

  // The moon home has no title: the page runs straight to the top.
  return (
    <>
      <section className="home-body moon-home">
        {petals}

          <MoonLetter days={days} hours={hours} minutes={minutes} seconds={seconds} ready={ready} />
      </section>
    </>
  );
}
