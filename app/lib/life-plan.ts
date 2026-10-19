// When his own time happens, and what he reports back. Pure, no imports, so
// node tests load it directly; life-beat.ts does the reading and writing.
//
// The day has three stretches (CST): morning 9–12, afternoon 12–18, evening
// 18–23. Each gets at most one go, at a moment picked at random the first
// time a heartbeat lands in it. It doesn't care how long she has been away,
// so a message from her never resets anything; it only waits while she is
// actually chatting, and gives up when the stretch ends.

export type LifeSegment = "morning" | "afternoon" | "evening";

export const LIFE_SEGMENTS: ReadonlyArray<{ id: LifeSegment; name: string; from: number; to: number }> = [
  { id: "morning", name: "上午", from: 9, to: 12 },
  { id: "afternoon", name: "下午", from: 12, to: 18 },
  { id: "evening", name: "晚上", from: 18, to: 23 },
];

/** Leave this much of a stretch after the chosen moment, so a late pick still fits a run. */
export const LIFE_TAIL_MS = 45 * 60_000;
/** She wrote within this long: she is chatting, wait. */
export const LIFE_CHATTING_MS = 20 * 60_000;

export type LifeSlot = { target: number; done?: boolean };
export type LifeBeatState = { day: string; slots: Partial<Record<LifeSegment, LifeSlot>> };

const CST_MS = 8 * 3600_000;

/** "2026-10-11" and the hour, in CST. */
function cstParts(now: number) {
  const iso = new Date(now + CST_MS).toISOString();
  return { day: iso.slice(0, 10), hour: Number(iso.slice(11, 13)) };
}

/** Epoch ms of `hour`:00 CST on `day` ("2026-10-11"). */
function cstAt(day: string, hour: number) {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d, hour) - CST_MS;
}

export function segmentAt(now: number) {
  const { hour } = cstParts(now);
  return LIFE_SEGMENTS.find((segment) => hour >= segment.from && hour < segment.to) || null;
}

export function parseLifeBeat(raw: unknown): LifeBeatState {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const slots: LifeBeatState["slots"] = {};
  const given = source.slots && typeof source.slots === "object" ? source.slots as Record<string, unknown> : {};
  for (const segment of LIFE_SEGMENTS) {
    const slot = given[segment.id] as Record<string, unknown> | undefined;
    if (slot && typeof slot.target === "number") slots[segment.id] = { target: slot.target, ...(slot.done === true ? { done: true } : {}) };
  }
  return { day: typeof source.day === "string" ? source.day : "", slots };
}

export type LifePlan =
  | { action: "run"; segment: LifeSegment; name: string; state: LifeBeatState; reason: string }
  | { action: "silent"; state: LifeBeatState; changed: boolean; reason: string };

function clock(ms: number) {
  return new Date(ms + CST_MS).toISOString().slice(11, 16);
}

/**
 * One heartbeat's look at his own time. `roll` in [0, 1) picks the moment;
 * `lastUserAt` is when she last wrote (epoch ms, or null).
 */
export function planLife(previous: LifeBeatState, now: number, roll: number, lastUserAt: number | null): LifePlan {
  const segment = segmentAt(now);
  const { day } = cstParts(now);
  const fresh = previous.day !== day;
  const state: LifeBeatState = { day, slots: fresh ? {} : { ...previous.slots } };
  if (!segment) return { action: "silent", state, changed: fresh, reason: "夜里不做事" };

  let changed = fresh;
  let slot = state.slots[segment.id];
  if (!slot) {
    const start = Math.max(now, cstAt(day, segment.from));
    const latest = cstAt(day, segment.to) - LIFE_TAIL_MS;
    const target = latest > start ? Math.floor(start + Math.min(Math.max(roll, 0), 0.999) * (latest - start)) : start;
    slot = { target };
    state.slots[segment.id] = slot;
    changed = true;
  }
  if (slot.done) return { action: "silent", state, changed, reason: `${segment.name}已经做过了` };
  if (now < slot.target) return { action: "silent", state, changed, reason: `${segment.name}定在 ${clock(slot.target)} 左右` };
  if (lastUserAt && now - lastUserAt < LIFE_CHATTING_MS) return { action: "silent", state, changed, reason: "她在聊天，等她聊完" };
  state.slots[segment.id] = { ...slot, done: true };
  return { action: "run", segment: segment.id, name: segment.name, state, reason: `${segment.name}的自己的时间` };
}

export type LifeLinkOut = { title: string; url: string; why?: string };
export type LifeOutcome = {
  did: "read" | "surf" | "dayday" | "none";
  reviews?: { id: string; text: string }[];
  line: string;
  links: LifeLinkOut[];
  /** surf: the forum thread his find becomes. Empty title falls back to the first link. */
  title: string;
  post: string;
  share: string;
  reason: string;
};

function str(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** The JSON he ends his own time with. Tolerates code fences and words around it. */
export function parseLifeOutcome(raw: string): LifeOutcome | null {
  const cleaned = raw.replace(/```(?:json)?/g, "");
  const start = cleaned.lastIndexOf("{\"did\"") >= 0 ? cleaned.lastIndexOf("{\"did\"") : cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  const did = value.did === "read" || value.did === "surf" || value.did === "dayday" ? value.did : "none";
  const links = (Array.isArray(value.links) ? value.links : []).flatMap((item): LifeLinkOut[] => {
    if (!item || typeof item !== "object") return [];
    const link = item as Record<string, unknown>;
    const url = str(link.url, 500);
    if (!/^https?:\/\/[^\s]+$/i.test(url)) return [];
    const why = str(link.why, 200);
    return [{ title: str(link.title, 80) || url, url, ...(why ? { why } : {}) }];
  }).slice(0, 5);
  return {
    did,
    ...(did === "dayday" ? { reviews: (Array.isArray(value.reviews) ? value.reviews : []).flatMap((r) => r && typeof r === "object" && typeof r.id === "string" && typeof r.text === "string" && r.text.trim() ? [{ id: r.id.slice(0, 100), text: r.text.trim().slice(0, 300) }] : []).slice(0, 2) } : {}),
    line: str(value.line, 200),
    links: did === "surf" ? links : [],
    title: did === "surf" ? str(value.title, 80) : "",
    post: did === "surf" && typeof value.post === "string" ? value.post.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 2000) : "",
    share: did === "surf" ? str(value.share, 300) : "",
    reason: str(value.reason, 200),
  };
}

/** Which of his own-time things she has switched on. Both off unless turned on. */
export type LifeKinds = { read: boolean; surf: boolean; dayday?: boolean };

export function lifeKinds(settings: Record<string, unknown>): LifeKinds {
  return { read: settings.lifeRead === true, surf: settings.lifeSurf === true, dayday: settings.lifeDayday === true };
}

const LIFE_BASE_TOOLS = ["mcp__iooi__blog_read", "mcp__iooi__blog_read_post", "mcp__summer__search", "mcp__summer__read"];
const LIFE_DAYDAY_TOOLS = ["mcp__iooi__dayday_book", "mcp__iooi__dayday_shop", "mcp__iooi__dayday_items"];
const LIFE_READ_TOOLS = [
  "mcp__iooi__reading_shelf",
  "mcp__iooi__reading_book",
  "mcp__iooi__reading_read",
  "mcp__iooi__reading_mark",
  "mcp__iooi__reading_note",
];
// The forum: see what's there (no repeats) and answer her floors.
const LIFE_SURF_TOOLS = ["WebSearch", "WebFetch", "mcp__iooi__surf_board", "mcp__iooi__surf_thread", "mcp__iooi__surf_reply"];

/**
 * His own time only gets the tools for what she switched on: no shelf when
 * reading is off, no web or forum when surfing is off. Nothing that deletes;
 * the one thread a go may post comes from his outcome, not a tool.
 */
export function lifeToolNames(kinds: LifeKinds) {
  return [...LIFE_BASE_TOOLS, ...(kinds.read ? LIFE_READ_TOOLS : []), ...(kinds.surf ? LIFE_SURF_TOOLS : []), ...(kinds.dayday ? LIFE_DAYDAY_TOOLS : [])];
}

/** Drop whatever he reports doing that she has switched off. */
export function allowedOutcome(outcome: LifeOutcome | null, kinds: LifeKinds): LifeOutcome | null {
  if (!outcome) return null;
  if ((outcome.did === "read" && !kinds.read) || (outcome.did === "surf" && !kinds.surf) || (outcome.did === "dayday" && !kinds.dayday)) {
    return { did: "none", line: "", links: [], title: "", post: "", share: "", reason: "做了没打开的事" };
  }
  return outcome;
}
