// What he actually did on his own: messages he sent her, comments he left,
// posts he wrote, pages he read, places he wandered online. Quiet beats ("decided not to say anything") never land here;
// they stay in the short debug logs (careState.log, blogBeat.log).
// Kept in `store.lifeLog`, a server-only key the page reads but never syncs back.
// No imports, so the page and node tests can load it directly.

export type LifeKind = "care" | "comment" | "post" | "read" | "surf";

/** A page he kept while wandering online. */
export type LifeLink = { title: string; url: string; why?: string };

export type LifeEntry = {
  /** Epoch ms, for ordering and for finding the entry again. */
  at: number;
  /** CST "2026/10/11 14:30", as shown. */
  time: string;
  kind: LifeKind;
  /** What he did, in a line she can read. */
  text: string;
  /** Why, or how it went (push result). Optional. */
  note?: string;
  /** read: the book id, so one sitting stays one line. */
  ref?: string;
  /** read: where he got to, e.g. "第 2 章第 5 段（35%）". */
  progress?: string;
  /** read: notes he wrote in this sitting. */
  notes?: number;
  /** read: "life" on his own time, "elsewhere" from another window (claude.ai, work mode). */
  source?: "life" | "elsewhere";
  /** read: epoch ms of the latest mark or note in this sitting. */
  lastAt?: number;
  /** surf: pages he kept. */
  links?: LifeLink[];
};

export const LIFE_LOG_LIMIT = 300;
const KINDS: readonly LifeKind[] = ["care", "comment", "post", "read", "surf"];
// Old logs only ever had these three.
const LEGACY_KINDS: readonly LifeKind[] = ["care", "comment", "post"];

export function lifeTime(now = new Date()) {
  const day = now.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
  const clock = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" });
  return `${day} ${clock}`;
}

function isEntry(value: unknown): value is LifeEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.at === "number" && typeof entry.time === "string" && typeof entry.text === "string"
    && KINDS.includes(entry.kind as LifeKind);
}

type OldLog = { time?: unknown; action?: unknown; reason?: unknown };

/** "2026/10/11 14:30" in CST → epoch ms; 0 when it doesn't parse. */
function stampOf(time: string) {
  const match = time.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4] - 8, +match[5]);
}

/**
 * Entries written before lifeLog existed: the "care", "comment" and "post"
 * lines from the old mixed logs, which only kept the reason.
 */
function legacyEntries(store: Record<string, unknown>): LifeEntry[] {
  const careLog = ((store.careState as Record<string, unknown> | undefined)?.log || []) as OldLog[];
  const beatLog = ((store.blogBeat as Record<string, unknown> | undefined)?.log || []) as OldLog[];
  const entries: LifeEntry[] = [];
  for (const item of [...(Array.isArray(careLog) ? careLog : []), ...(Array.isArray(beatLog) ? beatLog : [])]) {
    if (!item || typeof item.time !== "string" || typeof item.reason !== "string") continue;
    if (!LEGACY_KINDS.includes(item.action as LifeKind)) continue;
    entries.push({ at: stampOf(item.time), time: item.time, kind: item.action as LifeKind, text: item.reason });
  }
  return entries.sort((a, b) => b.at - a.at);
}

/** Newest first. Before the first new entry, falls back to the old logs' actions. */
export function readLifeLog(store: Record<string, unknown> | null | undefined): LifeEntry[] {
  if (!store) return [];
  if (Array.isArray(store.lifeLog)) return store.lifeLog.filter(isEntry);
  return legacyEntries(store);
}

/**
 * Call inside withStore before trimming the old logs, so their past actions
 * are copied over before quiet beats push them out.
 */
export function ensureLifeLog(store: Record<string, unknown>) {
  if (!Array.isArray(store.lifeLog)) store.lifeLog = legacyEntries(store).slice(0, LIFE_LOG_LIMIT);
}

/** Call inside withStore. Returns the stored entry. */
export function addLifeEntry(
  store: Record<string, unknown>,
  entry: { kind: LifeKind; text: string; note?: string; links?: LifeLink[] },
  now = new Date(),
): LifeEntry {
  const saved: LifeEntry = {
    at: now.getTime(),
    time: lifeTime(now),
    kind: entry.kind,
    text: entry.text.trim(),
    ...(entry.note?.trim() ? { note: entry.note.trim() } : {}),
    ...(entry.links?.length ? { links: entry.links } : {}),
  };
  store.lifeLog = [saved, ...readLifeLog(store)].slice(0, LIFE_LOG_LIMIT);
  return saved;
}

/** Adds to an entry's note later, e.g. the push result once it is known. */
export function noteLifeEntry(store: Record<string, unknown>, at: number, kind: LifeKind, extra: string) {
  const entries = readLifeLog(store);
  const entry = entries.find((item) => item.at === at && item.kind === kind);
  if (!entry || !extra.trim()) return;
  entry.note = entry.note ? `${entry.note} · ${extra.trim()}` : extra.trim();
  store.lifeLog = entries;
}

/** Marks and notes within this long of each other, on one book, are one sitting. */
export const READING_SITTING_MS = 40 * 60_000;

function readingText(title: string, progress?: string, notes = 0) {
  return `读《${title}》${progress ? `，读到${progress}` : ""}${notes ? `，写了 ${notes} 条批注` : ""}`;
}

/**
 * Call inside withStore whenever he moves his bookmark or writes a note.
 * A sitting is one line: later marks update where he got to, notes add up.
 * Returns the entry and whether it is new.
 */
export function recordReading(
  store: Record<string, unknown>,
  input: { bookId: string; title: string; progress?: string; note?: boolean; source: "life" | "elsewhere" },
  now = new Date(),
): { entry: LifeEntry; created: boolean } {
  ensureLifeLog(store);
  const entries = readLifeLog(store);
  const open = entries.find((item) => item.kind === "read" && item.ref === input.bookId && item.source === input.source
    && now.getTime() - (item.lastAt ?? item.at) <= READING_SITTING_MS);
  if (open) {
    if (input.progress) open.progress = input.progress;
    if (input.note) open.notes = (open.notes || 0) + 1;
    open.text = readingText(input.title, open.progress, open.notes);
    open.lastAt = now.getTime();
    store.lifeLog = entries;
    return { entry: open, created: false };
  }
  const notes = input.note ? 1 : 0;
  const saved: LifeEntry = {
    at: now.getTime(),
    time: lifeTime(now),
    kind: "read",
    text: readingText(input.title, input.progress, notes),
    ref: input.bookId,
    source: input.source,
    lastAt: now.getTime(),
    ...(input.progress ? { progress: input.progress } : {}),
    ...(notes ? { notes } : {}),
    ...(input.source === "elsewhere" ? { note: "在别的窗口里读的" } : {}),
  };
  store.lifeLog = [saved, ...entries].slice(0, LIFE_LOG_LIMIT);
  return { entry: saved, created: true };
}

/** "2026/10/11" in CST, the day part of LifeEntry.time. */
export function lifeDay(now = new Date()) {
  return now.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

/**
 * Today's things he did, oldest first, as "14:20 读《…》…" lines for the chat
 * and the heartbeat. Messages he sent her are left out: those are in the chat.
 */
export function todayLifeLines(store: Record<string, unknown> | null | undefined, now = new Date(), limit = 8): string[] {
  const day = lifeDay(now);
  return readLifeLog(store)
    .filter((entry) => entry.kind !== "care" && entry.time.startsWith(`${day} `))
    .slice(0, limit)
    .reverse()
    .map((entry) => {
      const clock = entry.time.slice(day.length + 1);
      const kept = entry.links?.length ? `（存了：${entry.links.map((link) => link.title).join("、")}）` : "";
      const where = entry.source === "elsewhere" ? "（在别的窗口）" : "";
      return `${clock} ${entry.text.replace(/\s+/g, " ").slice(0, 160)}${kept}${where}`;
    });
}
