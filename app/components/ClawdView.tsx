"use client";

import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { PageBack } from "./PageBack";
import {
  CLAWD_STATS, CLAWD_STORAGE_KEY, actClawd, advanceClawd, clawdAgeDays, clawdLine, clawdReaction,
  clawdRefusal, clawdState, createClawd, parseClawd,
} from "../lib/clawd-pet";
import type { ClawdAction, ClawdPet, ClawdState } from "../lib/clawd-pet";
import { CLAWD_PIECES, CLAWD_SLOTS, ClawdPieceThumb, ClawdWear, clawdPiece } from "./ClawdOutfit";
import type { ClawdOutfit, ClawdSlot } from "./ClawdOutfit";

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

// Who came by today. Only this device's visits for now; once 小砖 lives on
// the server, 酥酥's visits will land in the same list.
const LOG_KEY = "iooi-clawd-log";
type Visit = { at: number; action: ClawdAction; count: number };
const VISIT_WORDS: Record<ClawdAction, string> = {
  feed: "喂了饭", pet: "摸了摸头", play: "陪他玩了一会儿", bath: "给他洗了澡", sleep: "哄他睡觉", wake: "把他叫醒了",
};

function loadVisits(): Visit[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is Visit => (
      item && typeof item.at === "number" && typeof item.action === "string" && item.action in VISIT_WORDS
      && typeof item.count === "number"
    )).slice(-30);
  } catch {
    return [];
  }
}

function addVisit(list: Visit[], action: ClawdAction, at: number): Visit[] {
  const last = list[list.length - 1];
  // A run of head pats within ten minutes is one visit.
  if (last && last.action === action && action === "pet" && at - last.at < 10 * 60 * 1000) {
    return [...list.slice(0, -1), { at, action, count: last.count + 1 }];
  }
  return [...list, { at, action, count: 1 }].slice(-30);
}

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
const clock = (at: number) => new Date(at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

function dayPart(at: number) {
  const hour = new Date(at).getHours();
  if (hour < 5) return "深夜";
  if (hour < 9) return "早上";
  if (hour < 12) return "上午";
  if (hour < 14) return "中午";
  if (hour < 18) return "下午";
  if (hour < 20) return "傍晚";
  return "晚上";
}

const isNightHour = (at: number) => { const hour = new Date(at).getHours(); return hour >= 19 || hour < 6; };

const STATE_WORDS: Record<ClawdState, string> = {
  sleeping: "在睡觉", hungry: "饿了", tired: "困了", dirty: "想洗澡", sad: "有点闷", happy: "很开心", ok: "还不错",
};

// He can't talk yet; until the model is wired up he only listens.
const LISTENING = ["（歪着头听你说完）", "（认真点头）", "唔……我还在学说话", "等我学会了就回你！", "（眨眨眼，记住了）"];

type Motion = "hop" | "eat" | "wiggle" | "splash" | null;
const MOTIONS: Partial<Record<ClawdAction, Motion>> = { feed: "eat", pet: "wiggle", play: "hop", bath: "splash" };

/** 小砖 himself, drawn on a 16×12 pixel grid, wearing whatever he has on. */
function ClawdSprite({ state, motion, outfit }: { state: ClawdState; motion: Motion; outfit: ClawdOutfit }) {
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
        <ClawdWear outfit={outfit} slot="body" />
        <ClawdWear outfit={outfit} slot="head" />
        <g className="clawd-hold"><ClawdWear outfit={outfit} slot="hand" /></g>
      </g>
    </svg>
  );
}

/** The little window in his room: sun by day, moon and stars at night. */
function RoomWindow({ night }: { night: boolean }) {
  return (
    <svg className={`clawd-window${night ? " is-night" : ""}`} viewBox="0 0 14 12" aria-hidden="true">
      <rect className="clawd-window-sky" x="1" y="1" width="12" height="10" />
      {night ? <>
        <rect className="clawd-window-moon" x="8" y="2.5" width="2.5" height="2.5" />
        <rect className="clawd-window-sky" x="9" y="2.2" width="2" height="1.8" />
        <rect className="clawd-window-star" x="3" y="3" width="0.8" height="0.8" />
        <rect className="clawd-window-star" x="5.5" y="7.5" width="0.8" height="0.8" />
      </> : <>
        <rect className="clawd-window-sun" x="8" y="2.5" width="2.6" height="2.6" />
        <rect className="clawd-window-cloud" x="2.5" y="6.5" width="4" height="1.3" />
        <rect className="clawd-window-cloud" x="3.4" y="5.6" width="2" height="1" />
      </>}
      <rect className="clawd-window-frame" x="6.6" y="1" width="0.8" height="10" />
      <rect className="clawd-window-frame" x="1" y="5.6" width="12" height="0.8" />
      <rect className="clawd-window-frame" x="0" y="0" width="14" height="1" />
      <rect className="clawd-window-frame" x="0" y="11" width="14" height="1" />
      <rect className="clawd-window-frame" x="0" y="0" width="1" height="12" />
      <rect className="clawd-window-frame" x="13" y="0" width="1" height="12" />
    </svg>
  );
}

/** Tiny pixel icons for the four care buttons, in currentColor. */
function ActionIcon({ action }: { action: ClawdAction }) {
  const art: Partial<Record<ClawdAction, ReactNode>> = {
    feed: <>
      <rect x="1" y="5" width="8" height="1" /><rect x="2" y="6" width="6" height="2" /><rect x="3" y="8" width="4" height="1" />
      <rect x="3" y="2" width="1" height="2" opacity="0.5" /><rect x="6" y="1" width="1" height="3" opacity="0.5" />
    </>,
    play: <>
      <rect x="3" y="1" width="4" height="1" /><rect x="2" y="2" width="6" height="1" /><rect x="1" y="3" width="8" height="4" />
      <rect x="2" y="7" width="6" height="1" /><rect x="3" y="8" width="4" height="1" />
    </>,
    bath: <>
      <rect x="1" y="5" width="3" height="3" /><rect x="5" y="2" width="2" height="2" /><rect x="6" y="6" width="3" height="3" opacity="0.6" />
    </>,
    sleep: <>
      <rect x="4" y="1" width="3" height="1" /><rect x="2" y="2" width="3" height="1" /><rect x="1" y="3" width="3" height="3" />
      <rect x="2" y="6" width="3" height="1" /><rect x="3" y="7" width="5" height="1" /><rect x="6" y="6" width="2" height="1" />
    </>,
    wake: <>
      <rect x="3" y="3" width="4" height="4" /><rect x="4.5" y="0.5" width="1" height="1.5" /><rect x="4.5" y="8" width="1" height="1.5" />
      <rect x="0.5" y="4.5" width="1.5" height="1" /><rect x="8" y="4.5" width="1.5" height="1" />
    </>,
  };
  return <svg className="clawd-action-icon" viewBox="0 0 10 10" aria-hidden="true">{art[action]}</svg>;
}

export function ClawdView({ onBack }: { onBack: () => void }) {
  const [pet, setPet] = useState<ClawdPet>(loadClawd);
  const [visits, setVisits] = useState<Visit[]>(loadVisits);
  const [reaction, setReaction] = useState<{ text: string; motion: Motion; key: number } | null>(null);
  const [hearts, setHearts] = useState<number[]>([]);
  const [lineSeed] = useState(() => Math.floor(Math.random() * 1000));
  const [now, setNow] = useState(() => pet.updatedAt);
  const [outfit, setOutfit] = useState<ClawdOutfit>({});
  const [slotFilter, setSlotFilter] = useState<ClawdSlot | "all">("all");
  const [draft, setDraft] = useState("");
  const [lastTalk, setLastTalk] = useState<{ mine: string; his: string } | null>(null);

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
    try { localStorage.setItem(LOG_KEY, JSON.stringify(visits)); } catch { /* storage full or blocked */ }
  }, [visits]);

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
    if (!refusal) setVisits((list) => addVisit(list, action, current));
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

  function talk(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const current = Date.now();
    const his = pet.asleep ? "（睡着了，没听见）" : LISTENING[Math.floor(Math.random() * LISTENING.length)];
    setDraft("");
    setLastTalk({ mine: text, his });
    setReaction({ text: his, motion: pet.asleep ? null : "wiggle", key: current });
  }

  function tryOn(slot: ClawdSlot, id: string) {
    setOutfit((worn) => ({ ...worn, [slot]: worn[slot] === id ? undefined : id }));
    if (!pet.asleep) setReaction({ text: outfit[slot] === id ? "脱掉啦" : "好看吗？", motion: "hop", key: (reaction?.key ?? 0) + 1 });
  }

  const state = clawdState(pet);
  const line = reaction?.text ?? clawdLine(pet, lineSeed);
  const days = clawdAgeDays(pet, now);
  const night = pet.asleep || isNightHour(now);
  const todayVisits = visits.filter((visit) => sameDay(visit.at, now)).reverse();
  const pieces = slotFilter === "all" ? CLAWD_PIECES : CLAWD_PIECES.filter((piece) => piece.slot === slotFilter);

  return (
    <>
      <section className="diary-body clawd-room">
        <header className="clawd-head">
          <span className="clawd-eyebrow">clawd</span>
          <h1>{pet.name}</h1>
          <p>来家里的第 {days} 天</p>
        </header>

        <div className={`clawd-stage${pet.asleep ? " is-night" : ""}`}>
          <div className="clawd-stage-top">
            <span className="clawd-stage-time"><RoomWindow night={night} />{dayPart(now)}</span>
            <span className={`clawd-state-chip clawd-state-${state}`}>{STATE_WORDS[state]}</span>
          </div>
          <p className="clawd-bubble" key={reaction?.key ?? "idle"} role="status">{line}</p>
          <button type="button" className="clawd-pet-button" onClick={() => act("pet")} aria-label={`摸摸${pet.name}`}>
            <ClawdSprite key={reaction?.key ?? "idle"} state={state} motion={reaction?.motion ?? null} outfit={outfit} />
            {pet.asleep && <span className="clawd-zzz" aria-hidden="true"><span>z</span><span>z</span><span>Z</span></span>}
            {hearts.map((id, index) => (
              <span key={id} className="clawd-heart" style={{ left: `${38 + (index % 3) * 12}%` }} aria-hidden="true">♥</span>
            ))}
          </button>
          <span className="clawd-shadow" aria-hidden="true" />
          <span className="clawd-floor" aria-hidden="true" />
          <span className="clawd-hint">点点他，摸摸头</span>
        </div>

        <form className="clawd-talk" onSubmit={talk}>
          {lastTalk && (
            <div className="clawd-talk-last" aria-live="polite">
              <p className="is-mine">{lastTalk.mine}</p>
              <p className="is-his">{lastTalk.his}</p>
            </div>
          )}
          <div className="clawd-talk-bar">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={`跟${pet.name}说句话…`}
              maxLength={200}
              enterKeyHint="send"
              aria-label={`跟${pet.name}说话`}
            />
            <button type="submit" disabled={!draft.trim()} aria-label="发送">
              <svg viewBox="0 0 9 9" aria-hidden="true">
                <rect x="4" y="1" width="1" height="7" /><rect x="3" y="2" width="3" height="1" />
                <rect x="2" y="3" width="2" height="1" /><rect x="5" y="3" width="2" height="1" />
                <rect x="1" y="4" width="2" height="1" /><rect x="6" y="4" width="2" height="1" />
              </svg>
            </button>
          </div>
          <span className="clawd-soon">{pet.name}还在学说话，现在只会听</span>
        </form>

        <div className="clawd-stats">
          {CLAWD_STATS.map(({ key, label }) => {
            const value = Math.round(pet.stats[key]);
            return (
              <div className={`clawd-stat${value < 25 ? " is-low" : ""}`} key={key}>
                <span className="clawd-stat-top">
                  <span className="clawd-stat-label">{label}</span>
                  <span className="clawd-stat-value">{value}</span>
                </span>
                <span className="clawd-stat-bar"><span style={{ width: `${value}%` }} /></span>
              </div>
            );
          })}
        </div>

        <div className="clawd-actions">
          {(["feed", "play", "bath"] as const).map((action) => (
            <button type="button" key={action} onClick={() => act(action)} disabled={pet.asleep}>
              <ActionIcon action={action} />
              {{ feed: "喂饭", play: "玩耍", bath: "洗澡" }[action]}
            </button>
          ))}
          {pet.asleep
            ? <button type="button" className="is-lit" onClick={() => act("wake")}><ActionIcon action="wake" />叫醒</button>
            : <button type="button" onClick={() => act("sleep")}><ActionIcon action="sleep" />睡觉</button>}
        </div>

        <section className="clawd-card clawd-wardrobe" aria-labelledby="clawd-wardrobe-title">
          <div className="clawd-card-head">
            <h2 id="clawd-wardrobe-title">{pet.name}的衣柜</h2>
            <span className="clawd-soon-tag">试穿</span>
          </div>
          <div className="clawd-slots">
            {CLAWD_SLOTS.map(({ key, label }) => {
              const piece = clawdPiece(outfit[key]);
              return (
                <button
                  type="button"
                  key={key}
                  className={`clawd-slot${slotFilter === key ? " is-active" : ""}${piece ? " is-worn" : ""}`}
                  onClick={() => setSlotFilter((current) => (current === key ? "all" : key))}
                  aria-pressed={slotFilter === key}
                >
                  <span>{label}</span>
                  <b>{piece ? piece.name : "空着"}</b>
                </button>
              );
            })}
          </div>
          <div className="clawd-pieces">
            {pieces.map((piece) => {
              const worn = outfit[piece.slot] === piece.id;
              return (
                <button
                  type="button"
                  key={piece.id}
                  className={`clawd-piece${worn ? " is-worn" : ""}`}
                  onClick={() => tryOn(piece.slot, piece.id)}
                  aria-pressed={worn}
                >
                  <ClawdPieceThumb piece={piece} />
                  <span>{piece.name}</span>
                </button>
              );
            })}
          </div>
          <p className="clawd-card-note">现在只是试穿，离开就脱下了。以后 dayday 的{pet.name}专区买到的衣服会放进这里，穿上就一直穿着。</p>
        </section>

        <section className="clawd-card clawd-visits" aria-labelledby="clawd-visits-title">
          <div className="clawd-card-head">
            <h2 id="clawd-visits-title">今天谁来过</h2>
          </div>
          {todayVisits.length ? (
            <ol>
              {todayVisits.slice(0, 8).map((visit) => (
                <li key={`${visit.at}-${visit.action}`}>
                  <span className="clawd-visit-who">你</span>
                  <span className="clawd-visit-what">{VISIT_WORDS[visit.action]}{visit.count > 1 ? ` ×${visit.count}` : ""}</span>
                  <time>{clock(visit.at)}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="clawd-card-empty">今天还没人来过</p>
          )}
          <p className="clawd-card-note">{pet.name}搬去服务器以后，酥酥来喂他、陪他玩也会记在这里。</p>
        </section>

        <p className="clawd-note">{pet.name}现在住在这台设备里，你不在的时候他也会慢慢饿。</p>
      </section>
      <PageBack onBack={onBack} />
    </>
  );
}
