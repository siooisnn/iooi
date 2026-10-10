export type DailyMood = { date: string; value: string; emoji: string; updatedAt: number };
export type MoodDays = Record<string, DailyMood>;

export const DAILY_MOODS = [
  { value: "happy", emoji: "😊" }, { value: "lucky", emoji: "🍀" },
  { value: "chill", emoji: "😌" }, { value: "busy", emoji: "🏃" },
  { value: "studying", emoji: "📚" }, { value: "thinking", emoji: "🤔" },
  { value: "sleepy", emoji: "😴" }, { value: "exhausted", emoji: "🫠" },
  { value: "low mood", emoji: "😔" }, { value: "broken", emoji: "💔" },
  { value: "missing you", emoji: "🥺" },
];

export function moodDate(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(now));
  return ["year", "month", "day"].map((part) => parts.find((item) => item.type === part)?.value).join("-");
}

export function nextMoodMidnight(now = Date.now()) {
  return Date.parse(`${moodDate(now)}T00:00:00+08:00`) + 86_400_000;
}

export function moodEmoji(value: string) {
  return value ? DAILY_MOODS.find((mood) => mood.value === value)?.emoji || "🙂" : "";
}

export function normalizeMoodDays(raw: unknown): MoodDays {
  const days: MoodDays = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return days;
  for (const [date, entry] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !entry || typeof entry !== "object") continue;
    const parsedDate = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsedDate) || new Date(parsedDate).toISOString().slice(0, 10) !== date) continue;
    const item = entry as Partial<DailyMood>;
    if (typeof item.value !== "string" || typeof item.updatedAt !== "number" || !Number.isFinite(item.updatedAt)) continue;
    const value = item.value.trim().slice(0, 40);
    days[date] = { date, value, emoji: moodEmoji(value), updatedAt: item.updatedAt };
  }
  return days;
}

export function mergeMoodDays(...sources: unknown[]): MoodDays {
  const merged: MoodDays = {};
  for (const source of sources) {
    for (const [date, entry] of Object.entries(normalizeMoodDays(source))) {
      if (!merged[date] || entry.updatedAt >= merged[date].updatedAt) merged[date] = entry;
    }
  }
  return merged;
}

export function moodMonthCells(month: string) {
  const first = new Date(`${month}-01T00:00:00Z`);
  const year = first.getUTCFullYear();
  const monthIndex = first.getUTCMonth();
  const count = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells: Array<string | null> = Array(first.getUTCDay()).fill(null);
  for (let day = 1; day <= count; day++) cells.push(`${month}-${String(day).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function shiftMoodMonth(month: string, delta: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}
