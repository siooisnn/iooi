"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
};

function getToken() {
  try {
    return localStorage.getItem("iooi-token") || "";
  } catch {
    return "";
  }
}

function remaining(window: UsageWindow | null) {
  return window ? Math.max(0, Math.round(100 - window.utilization)) : null;
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

export function ClaudeUsageBadge() {
  const [usage, setUsage] = useState<ClaudeUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async (force = false) => {
    try {
      const response = await fetch(`/api/claude/usage${force ? "?refresh=1" : ""}`, {
        headers: { "x-iooi-token": getToken() },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error("usage unavailable");
      setUsage(data.usage as ClaudeUsage);
    } catch {
      setUsage(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 60_000);
    const onFocus = () => void refresh();
    const onUsageUpdated = () => window.setTimeout(() => void refresh(true), 300);
    window.addEventListener("focus", onFocus);
    window.addEventListener("claude-usage-updated", onUsageUpdated);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("claude-usage-updated", onUsageUpdated);
    };
  }, [refresh]);

  const fiveHourRemaining = remaining(usage?.five_hour || null);
  const weeklyRemaining = remaining(usage?.seven_day || null);
  const tone = useMemo(() => {
    const lowest = Math.min(fiveHourRemaining ?? 100, weeklyRemaining ?? 100);
    if (!usage) return "unknown";
    if (lowest <= 15) return "low";
    if (lowest <= 35) return "medium";
    return "good";
  }, [fiveHourRemaining, weeklyRemaining, usage]);

  return (
    <div className="claude-usage-wrap">
      <button
        type="button"
        className={`claude-usage-pill claude-usage-${tone}${open ? " claude-usage-pill-active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="查看 Claude 订阅额度"
      >
        {loading ? "额度…" : usage
          ? `5h余${fiveHourRemaining ?? "--"}% · 周余${weeklyRemaining ?? "--"}%`
          : "额度 --"}
      </button>
      {open && (
        <div className="claude-usage-popover">
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
              <p>来自订阅账号的用量；每分钟及聊天后自动刷新。</p>
            </>
          ) : (
            <p>额度暂时读不到，不影响继续聊天。</p>
          )}
          <button type="button" className="claude-usage-refresh" onClick={() => void refresh(true)}>
            刷新
          </button>
        </div>
      )}
    </div>
  );
}
