"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "./client-api";

// The little speaker on Claude's replies: tap to hear a run of bubbles in his
// voice, tap again to stop. Audio comes from /api/tts one bubble at a time,
// fetching the next while the current one plays.

// A 10 ms silent WAV. Playing it inside the tap unlocks the <audio> element on
// iOS so the real clip can start after the network round trip.
const SILENCE = "data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";
const CLIP_CACHE_LIMIT = 30;

export type SpeakerPhase = "loading" | "playing";

let enabledPromise: Promise<boolean> | null = null;
function loadEnabled() {
  enabledPromise ??= apiFetch("/api/tts")
    .then((res) => (res.ok ? res.json() : { enabled: false }))
    .then((data: { enabled?: unknown }) => data.enabled === true)
    .catch(() => {
      enabledPromise = null;
      return false;
    });
  return enabledPromise;
}

// Shared across chat windows so replaying a line costs nothing.
const clips = new Map<string, string>();
function rememberClip(text: string, url: string) {
  clips.delete(text);
  clips.set(text, url);
  while (clips.size > CLIP_CACHE_LIMIT) {
    const [oldText, oldUrl] = clips.entries().next().value as [string, string];
    clips.delete(oldText);
    URL.revokeObjectURL(oldUrl);
  }
}

// One player for the whole app, so two windows never talk over each other.
let player: HTMLAudioElement | null = null;
function getPlayer() {
  player ??= new Audio();
  player.preload = "auto";
  return player;
}

// Must run synchronously inside the tap.
function unlockPlayer() {
  const audio = getPlayer();
  audio.src = SILENCE;
  audio.play().catch(() => {});
  return audio;
}

function silencePlayer() {
  if (!player) return;
  player.pause();
  player.removeAttribute("src");
  player.load();
}

async function fetchClip(text: string): Promise<string> {
  const cached = clips.get(text);
  if (cached) return cached;
  const res = await apiFetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error || `语音请求失败 (${res.status})`);
  }
  const url = URL.createObjectURL(await res.blob());
  rememberClip(text, url);
  return url;
}

export function useSpeaker(active = true) {
  const [enabled, setEnabled] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<SpeakerPhase | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const runRef = useRef(0);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    void loadEnabled().then((value) => { if (alive) setEnabled(value); });
    return () => { alive = false; };
  }, [active]);

  const stop = useCallback(() => {
    runRef.current += 1;
    cancelRef.current?.();
    cancelRef.current = null;
    silencePlayer();
    setActiveKey(null);
    setPhase(null);
  }, []);

  useEffect(() => stop, [stop]);

  const playClip = useCallback((audio: HTMLAudioElement, url: string, run: number) =>
    new Promise<void>((resolve, reject) => {
      const done = (fn: () => void) => () => {
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onError);
        cancelRef.current = null;
        fn();
      };
      const onEnded = done(resolve);
      const onError = done(() => reject(new Error("这段声音放不出来")));
      audio.addEventListener("ended", onEnded);
      audio.addEventListener("error", onError);
      cancelRef.current = done(resolve);
      audio.src = url;
      audio.play().then(() => {
        if (runRef.current === run) setPhase("playing");
      }, (err: unknown) => {
        if (runRef.current !== run) return done(resolve)();
        const blocked = err instanceof Error && err.name === "NotAllowedError";
        done(() => reject(new Error(blocked ? "手机拦住了自动播放，再点一下试试" : "这段声音放不出来")))();
      });
    }), []);

  const toggle = useCallback((key: string, texts: string[]) => {
    if (activeKey === key) {
      stop();
      return;
    }
    stop();
    const lines = texts.filter((text) => text.trim());
    if (!lines.length) return;

    const run = runRef.current;
    const audio = unlockPlayer();

    setActiveKey(key);
    setPhase("loading");
    setError(null);

    void (async () => {
      try {
        let next = fetchClip(lines[0]);
        for (let i = 0; i < lines.length; i += 1) {
          const url = await next;
          if (runRef.current !== run) return;
          if (i + 1 < lines.length) {
            next = fetchClip(lines[i + 1]);
            next.catch(() => {});
          }
          await playClip(audio, url, run);
          if (runRef.current !== run) return;
          if (i + 1 < lines.length) setPhase("loading");
        }
        if (runRef.current === run) stop();
      } catch (err) {
        if (runRef.current !== run) return;
        stop();
        setError({ key, message: err instanceof Error ? err.message : "语音出错了" });
      }
    })();
  }, [activeKey, playClip, stop]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  return { enabled, activeKey, phase, error, toggle, stop };
}
