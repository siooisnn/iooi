"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UsageWindow = {
  utilization: number;
  resets_at: string | null;
};

type ClaudeUsage = {
  five_hour: UsageWindow | null;
  seven_day: UsageWindow | null;
  seven_day_opus: UsageWindow | null;
  seven_day_sonnet: UsageWindow | null;
  updated_at: string;
  stale?: boolean;
};

function getToken() {
  try {
    return localStorage.getItem("iooi-token") || "";
  } catch {
    return "";
  }
}

function remaining(window: UsageWindow | null | undefined) {
  return window && Number.isFinite(window.utilization)
    ? Math.min(100, Math.max(0, Math.round(100 - window.utilization))) : null;
}

function resetLabel(value: string | null) {
  if (!value) return "重置时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "重置时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function useClaudeUsage(enabled = true) {
  const [usage, setUsage] = useState<ClaudeUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const requestVersion = useRef({ version: 0 });

  const refresh = useCallback(async (force = false) => {
    const version = ++requestVersion.current.version;
    try {
      const response = await fetch(`/api/claude/usage${force ? "?refresh=1" : ""}`, {
        headers: { "x-iooi-token": getToken() },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error("usage unavailable");
      if (version === requestVersion.current.version) setUsage(data.usage as ClaudeUsage);
    } catch {
      if (version === requestVersion.current.version) setUsage(null);
    } finally {
      if (version === requestVersion.current.version) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const requestCounter = requestVersion.current;
    const initial = window.setTimeout(() => void refresh(true), 0);
    const interval = window.setInterval(() => void refresh(), 60_000);
    let updateTimer: number | undefined;
    const onFocus = () => {
      window.clearTimeout(updateTimer);
      updateTimer = window.setTimeout(() => void refresh(true), 100);
    };
    const onVisible = () => { if (document.visibilityState === "visible") onFocus(); };
    const onUsageUpdated = () => {
      window.clearTimeout(updateTimer);
      updateTimer = window.setTimeout(() => void refresh(true), 300);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("claude-usage-updated", onUsageUpdated);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.clearTimeout(updateTimer);
      requestCounter.version++;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("claude-usage-updated", onUsageUpdated);
    };
  }, [refresh, enabled]);

  return { usage, loading, refresh };
}

type UsageState = ReturnType<typeof useClaudeUsage>;

export function ClaudeUsageCircle({ usage, loading }: UsageState) {
  const fiveHourRemaining = remaining(usage?.five_hour) ?? "--";
  const weeklyRemaining = remaining(usage?.seven_day) ?? "--";
  const label = `${fiveHourRemaining}/${weeklyRemaining}`;
  return (
    <div className={`composer-usage-circle${usage?.stale ? " composer-usage-stale" : ""}`}
      aria-label={loading ? "正在读取剩余额度" : `五小时剩余 ${fiveHourRemaining}%，本周剩余 ${weeklyRemaining}%${usage?.stale ? "，上次读取结果" : ""}`}
      title="剩余百分比：五小时 / 本周；详细额度在右上角设置">
      {loading ? "…" : label}
    </div>
  );
}

export function ClaudeUsageDetails({ usage, refresh }: UsageState) {
  const fiveHourRemaining = remaining(usage?.five_hour || null);
  const weeklyRemaining = remaining(usage?.seven_day || null);
  return (
    <section className="claude-usage-details chat-config-section">
      <div className="claude-usage-title">Claude 订阅额度</div>
      {usage ? (
        <>
          <div className="claude-usage-row">
            <span>5 小时</span>
            <b>剩余 {fiveHourRemaining ?? "--"}%</b>
            <small>{resetLabel(usage.five_hour?.resets_at || null)} 重置</small>
          </div>
          <div className="claude-usage-row">
            <span>本周</span>
            <b>剩余 {weeklyRemaining ?? "--"}%</b>
            <small>{resetLabel(usage.seven_day?.resets_at || null)} 重置</small>
          </div>
          {usage.seven_day_opus && (
            <div className="claude-usage-row">
              <span>Opus 本周</span>
              <b>剩余 {remaining(usage.seven_day_opus)}%</b>
              <small>{resetLabel(usage.seven_day_opus.resets_at)} 重置</small>
            </div>
          )}
          {usage.seven_day_sonnet && (
            <div className="claude-usage-row">
              <span>Sonnet 本周</span>
              <b>剩余 {remaining(usage.seven_day_sonnet)}%</b>
              <small>{resetLabel(usage.seven_day_sonnet.resets_at)} 重置</small>
            </div>
          )}
          <p>{usage.stale
            ? "当前刷新失败，暂时显示上一次成功读取的额度。"
            : "来自订阅账号的用量；每分钟及聊天后自动刷新。"}</p>
        </>
      ) : (
        <p>额度暂时读不到，不影响继续聊天。</p>
      )}
      <button type="button" className="claude-usage-refresh" onClick={() => void refresh(true)}>
        刷新
      </button>
    </section>
  );
}
