"use client";

import { useEffect, useRef, useState } from "react";
import { PixelSprite } from "./PixelSprite";
import { CLAWD_STORAGE_KEY, advanceClawd, clawdState, parseClawd } from "../lib/clawd-pet";
import { apiFetch } from "../lib/client-api";

// clawd strolls along the XP taskbar or chat composer. Poke him and he rolls over;
// if he is asleep in his room he naps here too and only mumbles.

const PALETTE = { C: "#d77757", D: "#7a3520", E: "#2b2b2b", H: "#eba48b" };

const BODY = [
  "..DDDDDDDDDDDDDD..",
  "..DHHHHHHHHHHHHD..",
  "..DCCCECCCCECCCD..",
  "DDDCCCECCCCECCCDDD",
  "DCCCCCCCCCCCCCCCCD",
  "DDDCCCCCCCCCCCCDDD",
  "..DCCCCCCCCCCCCD..",
  "..DDDDDDDDDDDDDD..",
];

const BODY_ASLEEP = BODY.map((row, y) => (y === 2 ? "..DCCCCCCCCCCCCD.." : y === 3 ? "DDDCCDDCCCCDDCCDDD" : row));

const LEGS_A = ["", "", "", "", "", "", "", "", "...D......D", "...D......D"];
const LEGS_B = ["", "", "", "", "", "", "", "", "......D......D", "......D......D"];

const POKE_LINES = ["咕噜咕噜～", "嘿嘿", "再戳一下!", "♥", "晕了晕了", "滚给你看"];
const SLEEP_LINES = ["Zz…别戳啦", "唔…", "Zzz"];

function readAsleep() {
  try {
    const raw = localStorage.getItem(CLAWD_STORAGE_KEY);
    if (!raw) return false;
    const now = Date.now();
    return clawdState(advanceClawd(parseClawd(JSON.parse(raw), now), now)) === "sleeping";
  } catch {
    return false;
  }
}

export function TaskbarClawd() {
  const [asleep, setAsleep] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [say, setSay] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const pokes = useRef(0);

  useEffect(() => {
    let alive = true;
    let ticket = 0;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const mine = ++ticket;
      try {
        const response = await apiFetch("/api/clawd", { cache: "no-store" });
        const data = await response.json();
        if (alive && mine === ticket && response.ok && data.ok) setAsleep(data.pet ? data.pet.asleep : readAsleep());
      } catch { /* Keep the last known sleep state if disconnected. */ }
    };
    void check();
    const id = window.setInterval(check, 5 * 60 * 1000);
    window.addEventListener("clawd-change", check);
    document.addEventListener("visibilitychange", check);
    const list = timers.current;
    return () => {
      window.clearInterval(id);
      alive = false;
      window.removeEventListener("clawd-change", check);
      document.removeEventListener("visibilitychange", check);
      list.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  function later(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  function poke() {
    pokes.current += 1;
    const lines = asleep ? SLEEP_LINES : POKE_LINES;
    setSay(lines[pokes.current % lines.length]);
    later(() => setSay(null), 1600);
    if (asleep || rolling) return;
    setRolling(true);
    later(() => setRolling(false), 950);
  }

  return (
    <button
      type="button"
      className={`xp-clawd${asleep ? " is-asleep" : ""}${rolling ? " is-rolling" : ""}`}
      onClick={poke}
      aria-label={asleep ? "clawd 在睡觉" : "戳一下 clawd"}
    >
      <span className="xp-clawd-body">
        <svg viewBox="0 0 18 10" width="72" height="40" shapeRendering="crispEdges" aria-hidden="true">
          <PixelSprite rows={asleep ? BODY_ASLEEP : BODY} palette={PALETTE} />
          <PixelSprite rows={LEGS_A} palette={PALETTE} className="xp-clawd-legs-a" />
          <PixelSprite rows={LEGS_B} palette={PALETTE} className="xp-clawd-legs-b" />
        </svg>
      </span>
      {asleep && <span className="xp-clawd-z" aria-hidden="true">z</span>}
      {say && <span className="xp-clawd-say" aria-live="polite">{say}</span>}
    </button>
  );
}

export function ChatClawd() {
  return <div className="chat-clawd-track"><TaskbarClawd /></div>;
}
