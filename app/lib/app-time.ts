import { messageTimestamp } from "./chat-timeline";
import type { Message } from "./app-types";

// Helpers
export const APP_TIME_ZONE = "Asia/Shanghai";

export function getTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE });
}

export function getDateLabel(d?: Date, time?: string) {
  const date = d || new Date();
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: APP_TIME_ZONE,
    month: "numeric",
    day: "numeric",
    weekday: "long",
  }).formatToParts(date);
  const m = parts.find((p) => p.type === "month")?.value || "";
  const day = parts.find((p) => p.type === "day")?.value || "";
  const weekday = parts.find((p) => p.type === "weekday")?.value || "";
  return `${m}.${day} ${weekday}${time ? " " + time : ""}`;
}

export function getTodayStr() {
  return new Date().toLocaleDateString("zh-CN", { timeZone: APP_TIME_ZONE });
}

export function getNowContext() {
  const now = new Date();
  const hourText = new Intl.DateTimeFormat("zh-CN", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    hour12: false,
  }).format(now);
  const hour = Number(hourText) % 24;
  const period =
    hour < 6 ? "凌晨" :
    hour < 9 ? "早上" :
    hour < 12 ? "上午" :
    hour < 14 ? "中午" :
    hour < 18 ? "下午" :
    hour < 22 ? "晚上" :
    "深夜";

  return [
    `现在是${now.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: APP_TIME_ZONE })}`,
    `当前时间${now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE })}`,
    "时区:中国标准时间/UTC+8。",
    `当前时段:${period}`,
    "这些时间信息只用于理解上下文，不用每次主动报时。",
  ].join("\n");
}

export function getAppHour() {
  const hourPart = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date()).find((part) => part.type === "hour")?.value || "0";
  return Number(hourPart) % 24;
}

export function parseMessageDateTime(message?: Pick<Message, "date" | "time">) {
  const timestamp = messageTimestamp(message);
  return timestamp ? new Date(timestamp) : null;
}

export function formatChatListTime(date: Date) {
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}.${date.getDate()}`;
  }
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
}

export function formatChatRoomTime(date: Date) {
  const now = new Date();
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE });
  if (date.toDateString() === now.toDateString()) return time;
  return `${date.getMonth() + 1}.${date.getDate()} ${time}`;
}
