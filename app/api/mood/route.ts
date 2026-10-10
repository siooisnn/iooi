import { readStore, withStore } from "@/app/lib/store";
import { mergeMoodDays, moodDate, moodEmoji, normalizeMoodDays } from "@/app/lib/daily-mood";

export async function GET() {
  const store = readStore() || {};
  const days = normalizeMoodDays(store.dailyMoodDays);
  const settings = store.settings as { todayState?: unknown } | undefined;
  const legacyState = !Object.keys(days).length && typeof settings?.todayState === "string"
    ? settings.todayState.trim().slice(0, 40) : "";
  return Response.json({ ok: true, days, legacyState });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const now = Date.now();
  if (!body || typeof body.value !== "string" || typeof body.updatedAt !== "number"
    || !Number.isFinite(body.updatedAt) || !Number.isFinite(new Date(body.updatedAt).getTime()) || body.updatedAt > now + 300_000
    || body.date !== moodDate(body.updatedAt) || body.date > moodDate(now)) {
    return Response.json({ ok: false, error: "心情日期无效，请重新选择" }, { status: 400 });
  }
  const value = body.value.trim().slice(0, 40);
  const entry = { date: body.date, value, emoji: moodEmoji(value), updatedAt: body.updatedAt };
  try {
    const days = await withStore((store) => {
      const merged = mergeMoodDays(store.dailyMoodDays, { [entry.date]: entry });
      store.dailyMoodDays = merged;
      return merged;
    });
    return Response.json({ ok: true, days });
  } catch {
    return Response.json({ ok: false, error: "心情保存失败，请重试" }, { status: 500 });
  }
}
