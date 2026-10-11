// Our little forum, the surf app: a 2007 BBS for two inside an IE window.
// He posts what he found online (links and why he stopped there); she replies
// floor by floor, and can post her own finds too. Pure, no imports, so the
// page and node tests load it directly; surf-store.ts does the file I/O.

export type SurfWho = "her" | "him";
export type SurfLink = { title: string; url: string; why?: string };
export type SurfReply = { id: string; at: number; who: SurfWho; content: string };
export type SurfThread = {
  id: string;
  at: number;
  who: SurfWho;
  title: string;
  content: string;
  links: SurfLink[];
  replies: SurfReply[];
  /** His posts: "life" from his own time, "elsewhere" from claude.ai / work mode. */
  source?: "life" | "elsewhere";
  /** Epoch ms of the newest floor, for ordering. */
  lastAt: number;
};

export const SURF_LIMITS = {
  title: 80,
  content: 2000,
  reply: 1000,
  linkTitle: 80,
  linkWhy: 200,
  url: 500,
  links: 5,
  threads: 500,
  replies: 300,
} as const;

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "";
}

function line(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Only plain web links: anything else is dropped. */
export function safeSurfUrl(value: unknown) {
  const url = line(value, SURF_LIMITS.url);
  if (!/^https?:\/\/[^\s<>"]+$/i.test(url)) return "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : "";
  } catch {
    return "";
  }
}

/** "www.example.com" for showing next to a link. */
export function surfHost(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function cleanSurfLinks(value: unknown): SurfLink[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const links: SurfLink[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const url = safeSurfUrl(raw.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const why = line(raw.why, SURF_LIMITS.linkWhy);
    links.push({ title: line(raw.title, SURF_LIMITS.linkTitle) || surfHost(url) || url, url, ...(why ? { why } : {}) });
    if (links.length >= SURF_LIMITS.links) break;
  }
  return links;
}

export function isSurfId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(value);
}

function isWho(value: unknown): value is SurfWho {
  return value === "her" || value === "him";
}

function readReply(value: unknown): SurfReply | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!isSurfId(raw.id) || typeof raw.at !== "number" || !isWho(raw.who) || typeof raw.content !== "string") return null;
  return { id: raw.id, at: raw.at, who: raw.who, content: raw.content };
}

function readThread(value: unknown): SurfThread | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!isSurfId(raw.id) || typeof raw.at !== "number" || !isWho(raw.who) || typeof raw.title !== "string") return null;
  const replies = (Array.isArray(raw.replies) ? raw.replies : []).map(readReply).filter((reply): reply is SurfReply => !!reply);
  return {
    id: raw.id,
    at: raw.at,
    who: raw.who,
    title: raw.title,
    content: typeof raw.content === "string" ? raw.content : "",
    links: cleanSurfLinks(raw.links),
    replies,
    ...(raw.source === "life" || raw.source === "elsewhere" ? { source: raw.source } : {}),
    lastAt: typeof raw.lastAt === "number" ? raw.lastAt : Math.max(raw.at, ...replies.map((reply) => reply.at)),
  };
}

/** Newest activity first. */
export function readBoard(store: Record<string, unknown> | null | undefined): SurfThread[] {
  const threads = Array.isArray(store?.threads) ? store.threads : [];
  return threads.map(readThread).filter((thread): thread is SurfThread => !!thread).sort((a, b) => b.lastAt - a.lastAt);
}

export function findThread(store: Record<string, unknown> | null | undefined, id: string) {
  return readBoard(store).find((thread) => thread.id === id) || null;
}

export type NewThread = { who: SurfWho; title?: unknown; content?: unknown; links?: unknown; source?: "life" | "elsewhere"; id?: string };

/** Call inside withSurfStore. */
export function addThread(store: Record<string, unknown>, input: NewThread, now = Date.now()): SurfThread {
  const links = cleanSurfLinks(input.links);
  const content = clean(input.content, SURF_LIMITS.content);
  const title = line(input.title, SURF_LIMITS.title) || links[0]?.title || line(content, 30);
  if (!title) throw new Error("帖子要有个标题。");
  if (!content && !links.length) throw new Error("写点什么，或者贴个链接。");
  const thread: SurfThread = {
    id: input.id && isSurfId(input.id) ? input.id : crypto.randomUUID(),
    at: now,
    who: input.who,
    title,
    content,
    links,
    replies: [],
    ...(input.who === "him" && input.source ? { source: input.source } : {}),
    lastAt: now,
  };
  store.threads = [thread, ...readBoard(store)].slice(0, SURF_LIMITS.threads);
  return thread;
}

/** Call inside withSurfStore. */
export function replyThread(store: Record<string, unknown>, threadId: string, who: SurfWho, content: unknown, now = Date.now()): { thread: SurfThread; reply: SurfReply } {
  const threads = readBoard(store);
  const thread = threads.find((item) => item.id === threadId);
  if (!thread) throw new Error("这个帖子不在了。");
  const text = clean(content, SURF_LIMITS.reply);
  if (!text) throw new Error("回帖不能是空的。");
  if (thread.replies.length >= SURF_LIMITS.replies) throw new Error("这个帖子的楼盖满了，开个新帖吧。");
  const reply: SurfReply = { id: crypto.randomUUID(), at: now, who, content: text };
  thread.replies.push(reply);
  thread.lastAt = now;
  store.threads = threads;
  return { thread, reply };
}

/** Removes a whole thread, or one reply when replyId is given. `who` limits it to that person's own floors; omit for her page, which may tidy anything. */
export function removeFromBoard(store: Record<string, unknown>, threadId: string, replyId?: string, who?: SurfWho): boolean {
  const threads = readBoard(store);
  const thread = threads.find((item) => item.id === threadId);
  if (!thread) return false;
  if (!replyId) {
    if (who && thread.who !== who) return false;
    store.threads = threads.filter((item) => item !== thread);
    return true;
  }
  const reply = thread.replies.find((item) => item.id === replyId);
  if (!reply || (who && reply.who !== who)) return false;
  thread.replies = thread.replies.filter((item) => item !== reply);
  thread.lastAt = Math.max(thread.at, ...thread.replies.map((item) => item.at));
  store.threads = threads;
  return true;
}

/** Threads where she spoke last on a thread he started or replied in: waiting for him. */
export function waitingForHim(threads: SurfThread[]) {
  return threads.filter((thread) => {
    const last = thread.replies[thread.replies.length - 1];
    if (!last || last.who !== "her") return thread.who === "her" && !thread.replies.length;
    return true;
  });
}

/** Every link on the board, newest first, with the thread it came from: the favourites. */
export function boardLinks(threads: SurfThread[], who?: SurfWho) {
  return threads
    .filter((thread) => !who || thread.who === who)
    .sort((a, b) => b.at - a.at)
    .flatMap((thread) => thread.links.map((link) => ({ ...link, threadId: thread.id, at: thread.at })));
}
