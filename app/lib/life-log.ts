// What he actually did on his own: messages he sent her, comments he left,
// posts he wrote. Quiet beats ("decided not to say anything") never land here;
// they stay in the short debug logs (careState.log, blogBeat.log).
// Kept in `store.lifeLog`, a server-only key the page reads but never syncs back.
// No imports, so the page and node tests can load it directly.

export type LifeKind = "care" | "comment" | "post";

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
};

export const LIFE_LOG_LIMIT = 300;
const KINDS: readonly LifeKind[] = ["care", "comment", "post"];

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
    if (!KINDS.includes(item.action as LifeKind)) continue;
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
  entry: { kind: LifeKind; text: string; note?: string },
  now = new Date(),
): LifeEntry {
  const saved: LifeEntry = {
    at: now.getTime(),
    time: lifeTime(now),
    kind: entry.kind,
    text: entry.text.trim(),
    ...(entry.note?.trim() ? { note: entry.note.trim() } : {}),
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
