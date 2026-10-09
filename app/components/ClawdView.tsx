"use client";

import { useEffect, useState } from "react";
import { PageBack } from "./PageBack";
import {
  CLAWD_STATS, CLAWD_STORAGE_KEY, actClawd, advanceClawd, clawdAgeDays, clawdLine, clawdReaction,
  clawdRefusal, clawdState, createClawd, parseClawd,
} from "../lib/clawd-pet";
import type { ClawdAction, ClawdPet, ClawdState } from "../lib/clawd-pet";

// The page only mounts after the app has, so localStorage is there.
function loadClawd(): ClawdPet {
  const now = Date.now();
  try {
    const raw = localStorage.getItem(CLAWD_STORAGE_KEY);
    return advanceClawd(raw ? parseClawd(JSON.parse(raw), now) : createClawd(now), now);
  } catch {
    return createClawd(now);
  }
}

type Motion = "hop" | "eat" | "wiggle" | "splash" | null;
const MOTIONS: Partial<Record<ClawdAction, Motion>> = { feed: "eat", pet: "wiggle", play: "hop", bath: "splash" };

/** clawd himself, drawn on a 16×12 pixel grid. */
function ClawdSprite({ state, motion }: { state: ClawdState; motion: Motion }) {
  const asleep = state === "sleeping";
  const glad = motion === "wiggle" || motion === "hop" || (state === "happy" && !motion);
  return (
    <svg className={`clawd-sprite clawd-${state}${motion ? ` clawd-${motion}` : ""}`} viewBox="0 0 16 12" aria-hidden="true">
      <g className="clawd-legs">
        <rect x="4" y="8" width="1" height="2" />
        <rect x="6" y="8" width="1" height="2" />
        <rect x="9" y="8" width="1" height="2" />
        <rect x="11" y="8" width="1" height="2" />
      </g>
      <g className="clawd-body">
        <rect x="3" y="2" width="10" height="6.2" />
        <rect className="clawd-arm clawd-arm-left" x="1" y="4" width="2" height="2" />
        <rect className="clawd-arm clawd-arm-right" x="13" y="4" width="2" height="2" />
        {asleep ? (
          <g className="clawd-eyes-closed">
            <rect x="4.6" y="4.4" width="1.8" height="0.45" />
            <rect x="9.6" y="4.4" width="1.8" height="0.45" />
          </g>
        ) : glad ? (
          <g className="clawd-eyes-glad">
            <polyline points="4.7,4.9 5.5,3.9 6.3,4.9" />
            <polyline points="9.7,4.9 10.5,3.9 11.3,4.9" />
          </g>
        ) : (
          <g className="clawd-eyes">
            {state === "sad" || state === "tired" || state === "hungry" ? <>
              <rect x="5" y="3.9" width="1" height="1.2" />
              <rect x="10" y="3.9" width="1" height="1.2" />
            </> : <>
              <rect x="5" y="3" width="1" height="2" />
              <rect x="10" y="3" width="1" height="2" />
            </>}
          </g>
        )}
      </g>
    </svg>
  );
}

export function ClawdView({ onBack }: { onBack: () => void }) {
  const [pet, setPet] = useState<ClawdPet>(loadClawd);
  const [reaction, setReaction] = useState<{ text: string; motion: Motion; key: number } | null>(null);
  const [hearts, setHearts] = useState<number[]>([]);
  const [lineSeed] = useState(() => Math.floor(Math.random() * 1000));
  const [now, setNow] = useState(() => pet.updatedAt);

  // Real time keeps passing while the page is open.
  useEffect(() => {
    const tick = () => {
      const current = Date.now();
      setNow(current);
      setPet((value) => advanceClawd(value, current));
    };
    const timer = window.setInterval(tick, 30_000);
    const visible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(CLAWD_STORAGE_KEY, JSON.stringify(pet)); } catch { /* storage full or blocked */ }
  }, [pet]);

  useEffect(() => {
    if (!reaction) return;
    const timer = window.setTimeout(() => setReaction(null), 2600);
    return () => window.clearTimeout(timer);
  }, [reaction]);

  function act(action: ClawdAction) {
    const current = Date.now();
    const caughtUp = advanceClawd(pet, current);
    const refusal = clawdRefusal(caughtUp, action);
    const seed = Math.floor(Math.random() * 1000);
    setNow(current);
    setPet(refusal ? caughtUp : actClawd(caughtUp, action, current));
    setReaction({
      text: refusal || (action === "pet" && caughtUp.asleep ? "（翻了个身）" : clawdReaction(action, seed)),
      motion: refusal ? null : MOTIONS[action] ?? null,
      key: current,
    });
    if (action === "pet" && !refusal) {
      setHearts((items) => [...items.slice(-4), current]);
      window.setTimeout(() => setHearts((items) => items.filter((item) => item !== current)), 1400);
    }
  }

  const state = clawdState(pet);
  const line = reaction?.text ?? clawdLine(pet, lineSeed);
  const days = clawdAgeDays(pet, now);

  return (
    <>
      <section className="diary-body clawd-room">
        <header className="clawd-head">
          <span className="clawd-eyebrow">clawd</span>
          <h1>{pet.name}</h1>
          <p>来家里的第 {days} 天</p>
        </header>

        <div className={`clawd-stage${pet.asleep ? " is-night" : ""}`}>
          <p className="clawd-bubble" key={reaction?.key ?? "idle"} role="status">{line}</p>
          <button type="button" className="clawd-pet-button" onClick={() => act("pet")} aria-label={`摸摸${pet.name}`}>
            <ClawdSprite key={reaction?.key ?? "idle"} state={state} motion={reaction?.motion ?? null} />
            {pet.asleep && <span className="clawd-zzz" aria-hidden="true"><span>z</span><span>z</span><span>Z</span></span>}
            {hearts.map((id, index) => (
              <span key={id} className="clawd-heart" style={{ left: `${38 + (index % 3) * 12}%` }} aria-hidden="true">♥</span>
            ))}
          </button>
          <span className="clawd-shadow" aria-hidden="true" />
          <span className="clawd-hint">点点他，摸摸头</span>
        </div>

        <div className="clawd-card clawd-stats">
          {CLAWD_STATS.map(({ key, label }) => {
            const value = Math.round(pet.stats[key]);
            return (
              <div className={`clawd-stat${value < 25 ? " is-low" : ""}`} key={key}>
                <span className="clawd-stat-label">{label}</span>
                <span className="clawd-stat-bar"><span style={{ width: `${value}%` }} /></span>
                <span className="clawd-stat-value">{value}</span>
              </div>
            );
          })}
        </div>

        <div className="clawd-actions">
          <button type="button" onClick={() => act("feed")} disabled={pet.asleep}>喂饭</button>
          <button type="button" onClick={() => act("play")} disabled={pet.asleep}>玩耍</button>
          <button type="button" onClick={() => act("bath")} disabled={pet.asleep}>洗澡</button>
          {pet.asleep
            ? <button type="button" onClick={() => act("wake")}>叫醒</button>
            : <button type="button" onClick={() => act("sleep")}>睡觉</button>}
        </div>

        <p className="clawd-note">clawd 住在这台设备里，你不在的时候他也会慢慢饿。</p>
      </section>
      <PageBack onBack={onBack} />
    </>
  );
}
