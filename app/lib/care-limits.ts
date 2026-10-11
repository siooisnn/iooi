// Messages he sends into the chat unasked: the heartbeat looking for her, and
// a find from his own time he wants to show her right away. Both count
// against the same daily limit and the same gap, so she never gets flooded.

import { latestUserSession, messageTimestamp } from "@/app/lib/chat-timeline";
import { addLifeEntry, ensureLifeLog } from "@/app/lib/life-log";

export const DAILY_CARE_LIMIT = 10;
export const CARE_INTERVAL_HOURS = 1;
export const USER_AWAY_HOURS = 1;

type Msg = { role: string; content: string; time?: string; date?: string; source?: string };
type CareSession = { id: string; kind?: string; messages: Msg[] };
type HeartbeatLog = { time: string; action: string; reason: string };

export function cstHour() {
  return (new Date().getUTCHours() + 8) % 24;
}

export function cstTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" });
}

export function cstToday() {
  return new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

export function hoursAgo(ts: number | null): number {
  if (!ts) return 9999;
  return (Date.now() - ts) / 3600000;
}

export function dailyCareCount(careState: Record<string, unknown>, today: string): number {
  const saved = careState.todayDate === today && typeof careState.todayCount === "number"
    && Number.isFinite(careState.todayCount) ? Math.max(0, Math.floor(careState.todayCount)) : 0;
  // 兼容旧版本未更新计数的日期，已有心跳日志中的主动消息也计入上限。
  const logs = (careState.log as HeartbeatLog[]) || [];
  return Math.max(saved, logs.filter((entry) => entry.action === "care" && entry.time.startsWith(`${today} `)).length);
}

/** When she last wrote anything, in any chat but memos and the group. */
export function lastUserMessageAt(sessions: CareSession[]): number | null {
  let last: number | null = null;
  for (const session of sessions.filter((item) => item.kind !== "memo" && item.kind !== "group")) {
    for (const message of session.messages || []) {
      if (message.role !== "user") continue;
      const ts = messageTimestamp(message) || null;
      if (ts && (!last || ts > last)) last = ts;
    }
  }
  return last;
}

/**
 * Call inside withStore. Re-checks every limit under the write lock (the
 * decision took a while) and, if all clear, puts the message in her latest
 * chat and logs it. `expectSessionId`: stand down if she moved to another chat.
 */
export function deliverCare(
  store: Record<string, unknown>,
  { message, reason, expectSessionId, note }: { message: string; reason: string; expectSessionId?: string; note?: string },
): { ok: true; lifeAt: number } | { ok: false; reason: string } {
  ensureLifeLog(store);
  const cs: Record<string, unknown> = (store.careState as Record<string, unknown>) || {};
  store.careState = cs;
  const sendDay = cstToday();
  const count = dailyCareCount(cs, sendDay);
  const settings = (store.settings || {}) as Record<string, unknown>;
  if (settings.proactiveCare !== true || cstHour() < 7 || count >= DAILY_CARE_LIMIT
    || hoursAgo((cs.lastCareAt as number) || null) < CARE_INTERVAL_HOURS) {
    return { ok: false, reason: "发送前检查：主动关心已关闭、处于静默时段或已达到频率限制" };
  }
  const sessions = (store.sessions || []) as CareSession[];
  const target = latestUserSession(sessions);
  const latestUserTs = Math.max(0, ...(target?.messages || []).filter((m) => m.role === "user").map(messageTimestamp));
  if (!target || (expectSessionId !== undefined && target.id !== expectSessionId) || hoursAgo(latestUserTs) < USER_AWAY_HOURS) {
    return { ok: false, reason: "最近聊天窗口已变化、她刚来过或没有可接收主动关心的会话" };
  }
  target.messages.push({ role: "assistant", content: message, time: cstTime(), date: sendDay, source: "heartbeat" });
  cs.todayDate = sendDay;
  cs.todayCount = count + 1;
  cs.lastCareAt = Date.now();
  cs.lastCareContent = message;
  const lifeAt = addLifeEntry(store, { kind: "care", text: message, note: note ? `${note} · ${reason}` : reason }).at;
  return { ok: true, lifeAt };
}
