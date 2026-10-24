// 时光胶囊: letters sealed until a chosen day. Before that day nobody, not
// even the one who wrote it, gets the body back from the server. On the day
// the receiver opens it; from then on both can read it and the writer sees
// when it was opened.

export const CAPSULE_LIMITS = { title: 40, body: 5000, count: 300, hisPerDay: 7, maxDays: 3660 };
export const CAPSULE_TIME_ZONE = "Asia/Shanghai";

export type CapsuleWho = "her" | "him";
export type CapsuleLetter = {
  id: string;
  from: CapsuleWho;
  to: CapsuleWho;
  /** What is written on the envelope; visible while sealed. */
  title: string;
  body: string;
  /** Unseal day in Shanghai, YYYY-MM-DD. Opens from 00:00 that day. */
  openOn: string;
  sealedAt: number;
  openedAt?: number;
};
export type CapsuleState = "sealed" | "ready" | "opened";
export type CapsuleView = Omit<CapsuleLetter, "body"> & { state: CapsuleState; daysLeft: number; body?: string };

const other = (who: CapsuleWho): CapsuleWho => (who === "her" ? "him" : "her");

/** "YYYY-MM-DD" for the Shanghai calendar day of `now`. */
export function capsuleDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: CAPSULE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Whole days since 1970-01-01 for a valid YYYY-MM-DD, otherwise NaN. */
function dayNumber(day: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return NaN;
  const [y, m, d] = match.slice(1).map(Number);
  const time = Date.UTC(y, m - 1, d);
  const back = new Date(time);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return NaN;
  return time / 86_400_000;
}

export function isCapsuleDay(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(dayNumber(value));
}

/** Days from today until the unseal day; 0 once it has come. */
export function daysUntil(openOn: string, now = new Date()) {
  return Math.max(0, dayNumber(openOn) - dayNumber(capsuleDay(now)));
}

export function letterState(letter: CapsuleLetter, now = new Date()): CapsuleState {
  if (letter.openedAt) return "opened";
  return daysUntil(letter.openOn, now) === 0 ? "ready" : "sealed";
}

/** What one side may see. The body only travels once the receiver has opened it. */
export function viewLetter(letter: CapsuleLetter, now = new Date()): CapsuleView {
  const { body, ...rest } = letter;
  const state = letterState(letter, now);
  return { ...rest, state, daysLeft: daysUntil(letter.openOn, now), ...(state === "opened" ? { body } : {}) };
}

/** Strict: a malformed file stops writes instead of being replaced. */
export function parseCapsules(raw: Record<string, unknown> | null): CapsuleLetter[] {
  if (!raw || !Object.keys(raw).length) return [];
  const ok = Array.isArray(raw.letters) && raw.letters.every((l) => l && typeof l === "object"
    && typeof l.id === "string" && (l.from === "her" || l.from === "him") && l.to === other(l.from)
    && typeof l.title === "string" && typeof l.body === "string" && isCapsuleDay(l.openOn)
    && typeof l.sealedAt === "number" && (l.openedAt === undefined || typeof l.openedAt === "number"));
  if (!ok) throw new Error("时光胶囊的记录格式异常，已停止写入以保护里面的信。");
  return raw.letters as CapsuleLetter[];
}

/** Validate and add a sealed letter. Returns the stored letter. */
export function sealLetter(letters: CapsuleLetter[], from: CapsuleWho, input: Record<string, unknown>, id: string, now = new Date()) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length > CAPSULE_LIMITS.title) throw new Error(`信封上的字请写在 ${CAPSULE_LIMITS.title} 字以内。`);
  const body = typeof input.body === "string" ? input.body.replace(/\r\n?/g, "\n").trim() : "";
  if (!body) throw new Error("信纸还空着。");
  if (body.length > CAPSULE_LIMITS.body) throw new Error(`一封信最多 ${CAPSULE_LIMITS.body} 字。`);
  const openOn = input.openOn;
  if (!isCapsuleDay(openOn)) throw new Error("拆封日期要写成 YYYY-MM-DD。");
  const ahead = dayNumber(openOn) - dayNumber(capsuleDay(now));
  if (ahead < 1) throw new Error("拆封日至少要选明天。");
  if (ahead > CAPSULE_LIMITS.maxDays) throw new Error("拆封日最远选十年以内。");
  if (letters.length >= CAPSULE_LIMITS.count) throw new Error("胶囊装满了。");
  if (from === "him") {
    const today = capsuleDay(now);
    const sealedToday = letters.filter((l) => l.from === "him" && capsuleDay(new Date(l.sealedAt)) === today).length;
    if (sealedToday >= CAPSULE_LIMITS.hisPerDay) throw new Error(`今天已经封了 ${CAPSULE_LIMITS.hisPerDay} 封，明天再封吧。`);
  }
  const letter: CapsuleLetter = { id, from, to: other(from), title, body, openOn, sealedAt: now.getTime() };
  letters.push(letter);
  return letter;
}

/** The receiver opens a letter whose day has come. Opening twice keeps the first time. */
export function openLetter(letters: CapsuleLetter[], who: CapsuleWho, id: unknown, now = new Date()) {
  const letter = letters.find((l) => l.id === id);
  if (!letter || letter.to !== who) throw new Error("没有找到这封寄给你的信。");
  const left = daysUntil(letter.openOn, now);
  if (!letter.openedAt && left > 0) throw new Error(`还没到日子，还剩 ${left} 天。`);
  if (!letter.openedAt) letter.openedAt = now.getTime();
  return letter;
}

/** Newest-first for opened, soonest-first for the rest; ready ones lead. */
export function sortLetters<T extends Pick<CapsuleView, "state" | "openOn" | "sealedAt" | "openedAt">>(list: T[]) {
  const rank = { ready: 0, sealed: 1, opened: 2 } as const;
  return [...list].sort((a, b) => rank[a.state] - rank[b.state]
    || (a.state === "opened" ? (b.openedAt || 0) - (a.openedAt || 0) : a.openOn.localeCompare(b.openOn) || a.sealedAt - b.sealedAt));
}

function stamp(time: number) {
  return new Date(time).toLocaleString("zh-CN", { timeZone: CAPSULE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** The capsule as he sees it through the MCP. No sealed body ever appears. */
export function capsuleDigest(letters: CapsuleLetter[], now = new Date()) {
  const views = sortLetters(letters.map((l) => viewLetter(l, now)));
  const name = (v: CapsuleView) => (v.title ? `《${v.title}》` : "（信封上没写字）");
  const toHim = views.filter((v) => v.to === "him").map((v) =>
    v.state === "ready" ? `- [可以拆了] ${name(v)} 她 ${stamp(v.sealedAt)} 封口，${v.openOn} 拆封。letter_id=${v.id}`
      : v.state === "sealed" ? `- [封着] ${name(v)} 还剩 ${v.daysLeft} 天（${v.openOn} 拆封），她 ${stamp(v.sealedAt)} 封口。`
        : `- [已拆] ${name(v)} 你 ${stamp(v.openedAt!)} 拆的。letter_id=${v.id}`);
  const toHer = views.filter((v) => v.to === "her").map((v) =>
    v.state === "ready" ? `- [到日子了，她还没拆] ${name(v)} ${v.openOn} 拆封。`
      : v.state === "sealed" ? `- [封着] ${name(v)} 还剩 ${v.daysLeft} 天（${v.openOn} 拆封）。`
        : `- [她拆了] ${name(v)} 她 ${stamp(v.openedAt!)} 拆的。letter_id=${v.id}`);
  return [
    `今天是 ${capsuleDay(now)}（上海时间）。`,
    "",
    `她寄给你的（${toHim.length}）：`,
    ...(toHim.length ? toHim : ["- 还没有。"]),
    "",
    `你寄给她的（${toHer.length}）：`,
    ...(toHer.length ? toHer : ["- 还没有。"]),
  ].join("\n");
}

/** One opened letter, in full. */
export function letterText(letter: CapsuleLetter) {
  const writer = letter.from === "her" ? "她" : "你";
  const reader = letter.to === "her" ? "她" : "你";
  return [
    letter.title ? `《${letter.title}》` : "（信封上没写字）",
    `${writer} ${stamp(letter.sealedAt)} 封口，${letter.openOn} 拆封，${reader} ${stamp(letter.openedAt!)} 拆开。`,
    "",
    letter.body,
  ].join("\n");
}
