"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  CLAWD_STATS, CLAWD_STORAGE_KEY, advanceClawd, clawdAgeDays, clawdLine, clawdReaction,
  clawdState, createClawd, parseClawd,
} from "../lib/clawd-pet";
import type { ClawdAction, ClawdPet, ClawdState } from "../lib/clawd-pet";
import { CLAWD_PIECES, CLAWD_SLOTS, ClawdPieceThumb, ClawdWear, clawdPiece } from "./ClawdOutfit";
import type { ClawdOutfit, ClawdSlot } from "./ClawdOutfit";
import { useClawd } from "./use-clawd";

const ROOM_PAGES = [
  { id: "home", label: "小窝" }, { id: "talk", label: "说话" },
  { id: "wardrobe", label: "衣柜" }, { id: "visits", label: "来访" },
] as const;
type RoomPage = typeof ROOM_PAGES[number]["id"];

function RoomIcon({ page }: { page: RoomPage }) {
  return <svg className="clawd-nav-icon" viewBox="0 0 16 16" aria-hidden="true">
    {page === "home" ? <><path d="M1 7 8 1l7 6" fill="#ff9fc4" stroke="#c24a83" /><path d="M3 7h10v8H3z" fill="#fff0f7" stroke="#c24a83" /><path d="M6 10h4v5H6z" fill="#a8d9f7" stroke="#588dbd" /></>
      : page === "talk" ? <><path d="M1 2h14v10H8l-4 3v-3H1z" fill="#e7f4ff" stroke="#588dbd" /><path d="M4 5h8M4 8h5" stroke="#588dbd" /></>
      : page === "wardrobe" ? <><path d="m5 2 3 2 3-2 4 3-2 4-2-1v7H5V8L3 9 1 5z" fill="#ffc0dc" stroke="#c24a83" /><path d="M6 6h4" stroke="#fff" /></>
      : <><rect x="2" y="2" width="12" height="13" rx="1" fill="#fff7d9" stroke="#b9a36d" /><path d="M5 1v3M11 1v3M5 7h6M5 10h6M5 13h4" stroke="#b9a36d" /></>}
  </svg>;
}

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

const VISIT_WORDS: Record<ClawdAction, string> = {
  feed: "喂了饭", pet: "摸了摸头", play: "陪他玩了一会儿", bath: "给他洗了澡", sleep: "哄他睡觉", wake: "把他叫醒了",
};

const sameDay = (a: number, b: number) => new Date(a).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }) === new Date(b).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
const clock = (at: number) => new Date(at).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false });

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
  const shared = useClawd();
  const [localPet] = useState<ClawdPet>(loadClawd);
  const [reaction, setReaction] = useState<{ text: string; motion: Motion; key: number } | null>(null);
  const [hearts, setHearts] = useState<number[]>([]);
  const [lineSeed] = useState(() => Math.floor(Math.random() * 1000));
  const [now, setNow] = useState(() => localPet.updatedAt);
  const [slotFilter, setSlotFilter] = useState<ClawdSlot | "all">("all");
  const [draft, setDraft] = useState("");
  const [page, setPage] = useState<RoomPage>("home");
  const bodyRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const lastTalkId = shared.state?.talks.at(-1)?.id;
  useEffect(() => { if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight; }, [lastTalkId, page]);
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [page]);
  const pet = advanceClawd(shared.state?.pet || localPet, now);
  const outfit: ClawdOutfit = shared.state?.outfit || {};
  const visits = shared.state?.visits || [];

  // Real time keeps passing while the page is open.
  useEffect(() => {
    const tick = () => {
      const current = Date.now();
      setNow(current);
    };
    const timer = window.setInterval(tick, 30_000);
    const visible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, []);

  useEffect(() => {
    if (!reaction) return;
    const timer = window.setTimeout(() => setReaction(null), 2600);
    return () => window.clearTimeout(timer);
  }, [reaction]);

  async function act(action: ClawdAction) {
    const result = await shared.send(action);
    if (!result?.pet) return;
    const current = Date.now();
    const refusal = result.refusal;
    const seed = Math.floor(Math.random() * 1000);
    setNow(current);
    setReaction({
      text: refusal || (action === "pet" && result.pet.asleep ? "（翻了个身）" : clawdReaction(action, seed)),
      motion: refusal ? null : MOTIONS[action] ?? null,
      key: current,
    });
    if (action === "pet" && !refusal) {
      setHearts((items) => [...items.slice(-4), current]);
      window.setTimeout(() => setHearts((items) => items.filter((item) => item !== current)), 1400);
    }
  }

  async function talk(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const result = await shared.send("talk", { text });
    if (!result?.reply) return;
    setDraft((current) => current === text ? "" : current);
    setReaction({ text: result.reply, motion: pet.asleep ? null : "wiggle", key: Date.now() });
  }

  async function tryOn(slot: ClawdSlot, id: string) {
    const result = await shared.send("wear", { slot, id: outfit[slot] === id ? null : id });
    if (!result) return;
    if (!pet.asleep) setReaction({ text: outfit[slot] === id ? "脱掉啦" : "好看吗？", motion: "hop", key: (reaction?.key ?? 0) + 1 });
  }

  const state = clawdState(pet);
  const line = reaction?.text ?? clawdLine(pet, lineSeed);
  const days = clawdAgeDays(pet, now);
  const night = pet.asleep || isNightHour(now);
  const todayVisits = visits.filter((visit) => sameDay(visit.at, now)).reverse();
  const pieces = slotFilter === "all" ? CLAWD_PIECES : CLAWD_PIECES.filter((piece) => piece.slot === slotFilter);

  return (
    <div className="xp-summer-screen rd-screen dd-screen clawd-screen">
      <section className="xp-summer-window" aria-label="小砖的小窝">
        <header className="xp-summer-titlebar">
          <span className="dd-title-icon"><RoomIcon page="home" /></span><h1>{pet.name}的小窝</h1>
          <div className="xp-summer-controls"><button type="button" className="xp-summer-window-button xp-summer-close" aria-label="关闭小砖" onClick={onBack}>
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg>
          </button></div>
        </header>
        <div className="dd-strip"><b>{pet.name}</b><span>来家里的第 {days} 天 · 小姿和酥酥的小孩</span></div>
        <div className="dd-body clawd-room" ref={bodyRef}>
        {page === "home" && <div className={`clawd-stage${pet.asleep ? " is-night" : ""}`}>
          <div className="clawd-stage-top">
            <span className="clawd-stage-time"><RoomWindow night={night} />{dayPart(now)}</span>
            <span className={`clawd-state-chip clawd-state-${state}`}>{STATE_WORDS[state]}</span>
          </div>
          <p className="clawd-bubble" key={reaction?.key ?? "idle"} role="status">{line}</p>
          <button type="button" className="clawd-pet-button" disabled={!shared.ready || shared.busy} onClick={() => void act("pet")} aria-label={`摸摸${pet.name}`}>
            <ClawdSprite key={reaction?.key ?? "idle"} state={state} motion={reaction?.motion ?? null} outfit={outfit} />
            {pet.asleep && <span className="clawd-zzz" aria-hidden="true"><span>z</span><span>z</span><span>Z</span></span>}
            {hearts.map((id, index) => (
              <span key={id} className="clawd-heart" style={{ left: `${38 + (index % 3) * 12}%` }} aria-hidden="true">♥</span>
            ))}
          </button>
          <span className="clawd-shadow" aria-hidden="true" />
          <span className="clawd-floor" aria-hidden="true" />
          <span className="clawd-hint">点点他，摸摸头</span>
        </div>}

        {page === "talk" && <section className="clawd-card clawd-talk-card" aria-label="和小砖说话">
          <div className="clawd-card-head"><h2>和{pet.name}说说话</h2><span className="dd-chip is-blue">{STATE_WORDS[state]}</span></div>
        <form className="clawd-talk" onSubmit={talk}>
          {!shared.state?.talks.length && <div className="clawd-talk-empty"><RoomIcon page="talk" /><p>小姿、酥酥，今天有什么想和我说的呀？</p></div>}
          {!!shared.state?.talks.length && <div className="clawd-talk-history" ref={historyRef} aria-live="polite">{shared.state.talks.slice(-12).map((t) => (
            <div className="clawd-talk-last" key={t.id}>
              <p className="is-mine">{t.by === "susu" ? "酥酥" : "你"}：{t.mine}</p>
              <p className="is-his">{pet.name}：{t.his}</p>
            </div>
          ))}</div>}
          <div className="clawd-talk-bar">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={`跟${pet.name}说句话…`}
              maxLength={500}
              enterKeyHint="send"
              aria-label={`跟${pet.name}说话`}
            />
            <button type="submit" disabled={!draft.trim() || !shared.ready || shared.busy || (!shared.state?.modelReady && !pet.asleep)} aria-label="发送">
              <svg viewBox="0 0 9 9" aria-hidden="true">
                <rect x="4" y="1" width="1" height="7" /><rect x="3" y="2" width="3" height="1" />
                <rect x="2" y="3" width="2" height="1" /><rect x="5" y="3" width="2" height="1" />
                <rect x="1" y="4" width="2" height="1" /><rect x="6" y="4" width="2" height="1" />
              </svg>
            </button>
          </div>
          <span className="clawd-soon" role="status">{shared.busy ? "等小砖一下…" : !shared.ready ? "正在接小砖回家…" : shared.state?.modelReady ? "你和酥酥都可以陪小砖说话" : "小砖的 DeepSeek 还没接好，先陪他玩吧"}</span>
          {shared.error && <p className="clawd-error" role="alert">{shared.error}</p>}
        </form></section>}

        {page === "home" && <>
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
            <button type="button" key={action} onClick={() => void act(action)} disabled={pet.asleep || !shared.ready || shared.busy}>
              <ActionIcon action={action} />
              {{ feed: "喂饭", play: "玩耍", bath: "洗澡" }[action]}
            </button>
          ))}
          {pet.asleep
            ? <button type="button" disabled={!shared.ready || shared.busy} className="is-lit" onClick={() => void act("wake")}><ActionIcon action="wake" />叫醒</button>
            : <button type="button" disabled={!shared.ready || shared.busy} onClick={() => void act("sleep")}><ActionIcon action="sleep" />睡觉</button>}
        </div>
        </>}

        {page === "wardrobe" && <section className="clawd-card clawd-wardrobe" aria-labelledby="clawd-wardrobe-title">
          <div className="clawd-card-head">
            <h2 id="clawd-wardrobe-title">{pet.name}的衣柜</h2>
            <span className="clawd-soon-tag">共用衣柜</span>
          </div>
          <div className="clawd-dress-preview" aria-label="小砖当前穿戴"><ClawdSprite state={state} motion={reaction?.motion ?? null} outfit={outfit} /></div>
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
                  disabled={!shared.ready || shared.busy}
                  onClick={() => void tryOn(piece.slot, piece.id)}
                  aria-pressed={worn}
                >
                  <ClawdPieceThumb piece={piece} />
                  <span>{piece.name}</span>
                </button>
              );
            })}
          </div>
          <p className="clawd-card-note">穿戴会保存下来，你和酥酥都能帮他换。</p>
        </section>}

        {page === "visits" && <section className="clawd-card clawd-visits" aria-labelledby="clawd-visits-title">
          <div className="clawd-card-head">
            <h2 id="clawd-visits-title">今天谁来过</h2>
          </div>
          {todayVisits.length ? (
            <ol>
              {todayVisits.slice(0, 8).map((visit) => (
                <li key={`${visit.at}-${visit.action}`}>
                  <span className="clawd-visit-who">{visit.by === "susu" ? "酥酥" : "你"}</span>
                  <span className="clawd-visit-what">{VISIT_WORDS[visit.action]}{visit.count > 1 ? ` ×${visit.count}` : ""}</span>
                  <time>{clock(visit.at)}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="clawd-card-empty">今天还没人来过</p>
          )}
          <p className="clawd-card-note">你和酥酥照顾小砖的记录都留在这里。</p>
        </section>}

        {page === "home" && <p className="clawd-note">{shared.ready ? `${pet.name}现在住在你们共同的小窝里，你不在的时候他也会慢慢饿。` : "正在连接共同的小窝，本机原来的养成记录会保留。"}</p>}
        {page !== "talk" && shared.error && <p className="clawd-error" role="alert">{shared.error}</p>}
        </div>
        <nav className="dd-nav" aria-label="小砖">
          {ROOM_PAGES.map((item) => <button type="button" key={item.id} aria-current={page === item.id ? "page" : undefined} onClick={() => setPage(item.id)}>
            <RoomIcon page={item.id} /><span>{item.label}</span>
          </button>)}
        </nav>
      </section>
    </div>
  );
}
