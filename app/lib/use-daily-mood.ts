"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetchWithTimeout, loadLocalRaw, saveLocal } from "./client-api";
import { mergeMoodDays, moodDate, moodEmoji, nextMoodMidnight, normalizeMoodDays } from "./daily-mood";
import type { DailyMood, MoodDays } from "./daily-mood";

type MoodCache = { days: MoodDays; pending: MoodDays };
const CACHE_KEY = "iooi-daily-mood";

export function useDailyMood(enabled: boolean) {
  const [days, setDays] = useState<MoodDays>({});
  const [today, setToday] = useState(() => moodDate());
  const [legacyState, setLegacyState] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const cache = useRef<MoodCache>({ days: {}, pending: {} });
  const syncing = useRef(false);
  const loaded = useRef(false);

  const publish = useCallback(() => {
    saveLocal(CACHE_KEY, cache.current);
    setDays({ ...cache.current.days });
  }, []);

  const refresh = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    setSaving(true);
    try {
      for (const entry of Object.values(cache.current.pending)) {
        const res = await apiFetchWithTimeout("/api/mood", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "心情同步失败");
        cache.current.days = mergeMoodDays(cache.current.days, data.days);
        if (cache.current.pending[entry.date]?.updatedAt === entry.updatedAt) delete cache.current.pending[entry.date];
        publish();
      }
      const res = await apiFetchWithTimeout("/api/mood", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "心情读取失败");
      cache.current.days = mergeMoodDays(cache.current.days, data.days);
      setLegacyState(typeof data.legacyState === "string" ? data.legacyState : "");
      publish();
      setMessage("");
    } catch (error) {
      setMessage(Object.keys(cache.current.pending).length
        ? "已保存在本机，联网后会再同步。"
        : error instanceof Error ? error.message.replace("summer 请求超时", "心情请求超时") : "暂时读不到心情，请重试。");
    } finally {
      syncing.current = false;
      setSaving(false);
    }
  }, [publish]);

  useEffect(() => {
    if (!enabled) return;
    const frame = window.requestAnimationFrame(() => {
      if (!loaded.current) {
        const local = loadLocalRaw<MoodCache>(CACHE_KEY, { days: {}, pending: {} });
        cache.current = { days: normalizeMoodDays(local?.days), pending: normalizeMoodDays(local?.pending) };
        loaded.current = true;
        publish();
      }
      void refresh();
    });
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("online", syncWhenVisible);
    window.addEventListener("focus", syncWhenVisible);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("online", syncWhenVisible);
      window.removeEventListener("focus", syncWhenVisible);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [enabled, publish, refresh]);

  useEffect(() => {
    if (!enabled) return;
    let timer = 0;
    const tick = () => {
      const now = Date.now();
      setToday(moodDate(now));
      window.clearTimeout(timer);
      timer = window.setTimeout(tick, Math.max(1, nextMoodMidnight(now) - now));
    };
    const frame = window.requestAnimationFrame(tick);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled]);

  const pick = useCallback((value: string) => {
    const now = Date.now();
    const date = moodDate(now);
    const trimmed = value.trim().slice(0, 40);
    const entry: DailyMood = { date, value: trimmed, emoji: moodEmoji(trimmed), updatedAt: now };
    cache.current.days = mergeMoodDays(cache.current.days, { [date]: entry });
    cache.current.pending[date] = entry;
    setToday(date);
    publish();
    void refresh();
  }, [publish, refresh]);

  return { days, today, current: days[today]?.value ? days[today] : null, legacyState, message, saving, pick, refresh };
}
