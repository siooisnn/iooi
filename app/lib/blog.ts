// The blog: an XP-blue, 2007-style home for everything she writes. Posts are
// the old winter fragments (same ids, same dates, kept in `fragments`); this
// file holds what lives next to them on the server under `blog`: the profile,
// the guestbook comments, the playlist and the visitor counter, plus his own
// space (`him`): his signature and the posts he writes. His posts live here,
// not in `fragments`, because only the server writes `blog` and the front
// end's whole-object sync could otherwise overwrite something he just wrote.
// Everything is pure and import-free so the page, the API route and the tests
// share it.

export type BlogAuthor = "her" | "him";

export type BlogComment = {
  id: string;
  postId: string;
  author: BlogAuthor;
  content: string;
  createdAt: string;
};

export type BlogSong = { id: string; url: string; title: string };

export type BlogProfile = {
  title: string;
  motto: string;
  nickname: string;
  avatar: string;
  about: string;
  notice: string;
};

/** A post in his space. Only the server writes these, through "him-post-add". */
export type HisPost = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  mood?: string;
  weather?: string;
};

export type HisSpace = {
  motto: string;
  posts: HisPost[];
};

export type BlogState = {
  profile: BlogProfile;
  songs: BlogSong[];
  comments: BlogComment[];
  visits: number;
  views: Record<string, number>;
  him: HisSpace;
};

/** A post as the page sees it; the stored shape is FragmentEntry plus these optional fields. */
export type BlogPostLike = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  mood?: string;
  weather?: string;
};

export const BLOG_TIME_ZONE = "Asia/Shanghai";

export const DEFAULT_BLOG_PROFILE: BlogProfile = {
  title: "☆小窝の博客☆",
  motto: "世界那么大，我只想写给你看 ♥",
  nickname: "",
  avatar: "",
  about: "",
  notice: "欢迎来踩～ 看完要留言哦 ♥",
};

export const BLOG_MOODS = ["开心", "平静", "甜甜的", "想你", "有点丧", "emo", "困困", "生气"] as const;
export const BLOG_WEATHERS = ["晴", "多云", "阴", "小雨", "大雨", "雪", "大风"] as const;

export const DEFAULT_HIS_MOTTO = "在这里写给你看。";

export const BLOG_LIMITS = {
  title: 40,
  motto: 60,
  nickname: 20,
  about: 200,
  notice: 300,
  postTitle: 60,
  comment: 1000,
  songTitle: 80,
  songs: 40,
  comments: 3000,
  hisMood: 10,
  hisPost: 4000,
  hisPosts: 500,
  /** However he gets there (button, heartbeat, chat, MCP), at most this many posts a day. */
  hisPostsPerDay: 3,
  topic: 100,
} as const;

const UPLOAD_URL = /^\/uploads\/[A-Za-z0-9._-]{1,120}$/;
const ID = /^[A-Za-z0-9._:-]{1,120}$/;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function validDate(value: unknown) {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

export function isUploadUrl(value: unknown): value is string {
  return typeof value === "string" && UPLOAD_URL.test(value);
}

function parseProfile(raw: unknown): BlogProfile {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const pick = (key: keyof BlogProfile, max: number) =>
    typeof source[key] === "string" ? text(source[key], max) : DEFAULT_BLOG_PROFILE[key];
  return {
    title: pick("title", BLOG_LIMITS.title) || DEFAULT_BLOG_PROFILE.title,
    motto: pick("motto", BLOG_LIMITS.motto),
    nickname: pick("nickname", BLOG_LIMITS.nickname),
    avatar: isUploadUrl(source.avatar) ? source.avatar : "",
    about: pick("about", BLOG_LIMITS.about),
    notice: pick("notice", BLOG_LIMITS.notice),
  };
}

function parseHisPost(raw: unknown): HisPost | null {
  const post = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  if (!post || typeof post.id !== "string" || !ID.test(post.id) || !validDate(post.createdAt)) return null;
  const content = text(post.content, BLOG_LIMITS.hisPost);
  if (!content) return null;
  const mood = text(post.mood, BLOG_LIMITS.hisMood);
  const weather = (BLOG_WEATHERS as readonly string[]).includes(post.weather as string) ? post.weather as string : "";
  return {
    id: post.id,
    title: text(post.title, BLOG_LIMITS.postTitle) || "无题",
    content,
    createdAt: post.createdAt as string,
    ...(mood ? { mood } : {}),
    ...(weather ? { weather } : {}),
  };
}

function parseHisSpace(raw: unknown): HisSpace {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const posts = (Array.isArray(source.posts) ? source.posts : []).flatMap((item) => {
    const post = parseHisPost(item);
    return post ? [post] : [];
  });
  return {
    motto: typeof source.motto === "string" ? text(source.motto, BLOG_LIMITS.motto) : DEFAULT_HIS_MOTTO,
    posts: posts.slice(-BLOG_LIMITS.hisPosts),
  };
}

/** Whatever is stored (or nothing) as a well-formed blog. */
export function parseBlogState(raw: unknown): BlogState {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const songs = (Array.isArray(source.songs) ? source.songs : []).flatMap((item): BlogSong[] => {
    const song = item as Record<string, unknown>;
    if (!song || typeof song.id !== "string" || !ID.test(song.id) || !isUploadUrl(song.url)) return [];
    return [{ id: song.id, url: song.url, title: text(song.title, BLOG_LIMITS.songTitle) || "未命名" }];
  });
  const comments = (Array.isArray(source.comments) ? source.comments : []).flatMap((item): BlogComment[] => {
    const comment = item as Record<string, unknown>;
    if (!comment || typeof comment.id !== "string" || !ID.test(comment.id)) return [];
    if (typeof comment.postId !== "string" || !ID.test(comment.postId)) return [];
    const content = text(comment.content, BLOG_LIMITS.comment);
    if (!content || !validDate(comment.createdAt)) return [];
    return [{
      id: comment.id,
      postId: comment.postId,
      author: comment.author === "him" ? "him" : "her",
      content,
      createdAt: comment.createdAt as string,
    }];
  });
  const views: Record<string, number> = {};
  if (source.views && typeof source.views === "object") {
    for (const [key, value] of Object.entries(source.views as Record<string, unknown>)) {
      if (ID.test(key) && count(value) > 0) views[key] = count(value);
    }
  }
  return {
    profile: parseProfile(source.profile),
    songs: songs.slice(0, BLOG_LIMITS.songs),
    comments: comments.slice(-BLOG_LIMITS.comments),
    visits: count(source.visits),
    views,
    him: parseHisSpace(source.him),
  };
}

export type BlogAction =
  | { type: "visit" }
  | { type: "view"; postId: string }
  | { type: "profile"; profile: Partial<BlogProfile> }
  | { type: "song-add"; url: string; title: string }
  | { type: "song-remove"; id: string }
  | { type: "comment"; postId: string; content: string; author: BlogAuthor }
  | { type: "comment-delete"; id: string }
  | { type: "post-delete"; postId: string }
  | { type: "him-post-add"; title: string; content: string; mood?: string; weather?: string; motto?: string }
  | { type: "him-post-delete"; postId: string }
  | { type: "him-motto"; motto: string };

/**
 * One change to the blog. Returns the new state, or an error message when the
 * request is malformed (the state is then left alone).
 */
export function applyBlogAction(
  state: BlogState,
  action: BlogAction,
  { now, id }: { now: Date; id: string },
): BlogState | { error: string } {
  switch (action.type) {
    case "visit":
      return { ...state, visits: state.visits + 1 };
    case "view": {
      if (!ID.test(String(action.postId))) return { error: "文章不存在" };
      return { ...state, views: { ...state.views, [action.postId]: (state.views[action.postId] || 0) + 1 } };
    }
    case "profile": {
      const patch = action.profile && typeof action.profile === "object" ? action.profile : {};
      if (patch.avatar !== undefined && patch.avatar !== "" && !isUploadUrl(patch.avatar)) return { error: "头像地址无效" };
      return { ...state, profile: parseProfile({ ...state.profile, ...patch }) };
    }
    case "song-add": {
      if (!isUploadUrl(action.url)) return { error: "歌曲地址无效" };
      if (state.songs.length >= BLOG_LIMITS.songs) return { error: `歌单最多 ${BLOG_LIMITS.songs} 首` };
      const title = text(action.title, BLOG_LIMITS.songTitle) || "未命名";
      return { ...state, songs: [...state.songs, { id, url: action.url, title }] };
    }
    case "song-remove":
      return { ...state, songs: state.songs.filter((song) => song.id !== action.id) };
    case "comment": {
      if (!ID.test(String(action.postId))) return { error: "文章不存在" };
      const content = text(action.content, BLOG_LIMITS.comment);
      if (!content) return { error: "留言是空的" };
      const comment: BlogComment = {
        id,
        postId: action.postId,
        author: action.author === "him" ? "him" : "her",
        content,
        createdAt: now.toISOString(),
      };
      return { ...state, comments: [...state.comments, comment].slice(-BLOG_LIMITS.comments) };
    }
    case "comment-delete":
      return { ...state, comments: state.comments.filter((comment) => comment.id !== action.id) };
    case "post-delete": {
      const views = { ...state.views };
      delete views[action.postId];
      return { ...state, views, comments: state.comments.filter((comment) => comment.postId !== action.postId) };
    }
    case "him-post-add": {
      const post = parseHisPost({ ...action, id, createdAt: now.toISOString() });
      if (!post) return { error: "他这篇是空的" };
      if (hisPostsToday(state, now) >= BLOG_LIMITS.hisPostsPerDay) {
        return { error: `他今天已经发了 ${BLOG_LIMITS.hisPostsPerDay} 篇，明天再写吧` };
      }
      const motto = typeof action.motto === "string" ? text(action.motto, BLOG_LIMITS.motto) : "";
      return {
        ...state,
        him: { motto: motto || state.him.motto, posts: [...state.him.posts, post].slice(-BLOG_LIMITS.hisPosts) },
      };
    }
    case "him-motto": {
      const motto = text(action.motto, BLOG_LIMITS.motto);
      if (!motto) return { error: "签名是空的" };
      return { ...state, him: { ...state.him, motto } };
    }
    case "him-post-delete": {
      const views = { ...state.views };
      delete views[action.postId];
      return {
        ...state,
        views,
        comments: state.comments.filter((comment) => comment.postId !== action.postId),
        him: { ...state.him, posts: state.him.posts.filter((post) => post.id !== action.postId) },
      };
    }
    default:
      return { error: "不认识的操作" };
  }
}

// ── His writing ──

export type HisDraft = { title: string; content: string; mood?: string; weather?: string; motto?: string };

/**
 * What the model sends back when he writes a post: one JSON object, maybe
 * wrapped in a code fence or a stray sentence. Null when there is no post in it.
 */
export function parseHisDraft(raw: string): HisDraft | null {
  const cleaned = raw.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const content = text(data.content, BLOG_LIMITS.hisPost);
  if (!content) return null;
  const mood = text(data.mood, BLOG_LIMITS.hisMood);
  const weather = (BLOG_WEATHERS as readonly string[]).includes(data.weather as string) ? data.weather as string : "";
  const motto = text(data.motto, BLOG_LIMITS.motto);
  return {
    title: text(data.title, BLOG_LIMITS.postTitle) || "无题",
    content,
    ...(mood ? { mood } : {}),
    ...(weather ? { weather } : {}),
    ...(motto ? { motto } : {}),
  };
}

/** How many posts he has put up on the day (her time zone) that `now` falls on. */
export function hisPostsToday(state: BlogState, now: Date) {
  const today = blogDayKey(now.toISOString());
  return state.him.posts.filter((post) => blogDayKey(post.createdAt) === today).length;
}

/** The newest post in his space, if he has written any. */
export function latestHisPost(state: BlogState) {
  return sortPosts(state.him.posts)[0] as HisPost | undefined;
}

/**
 * What he sends back when nobody asked him to write: a post, or a decision
 * to leave it today ({"skip": true}). Null when it is neither.
 */
export function parseHisDecision(raw: string): { draft: HisDraft } | { skip: string } | null {
  const draft = parseHisDraft(raw);
  if (draft) return { draft };
  const cleaned = raw.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const data = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    if (data && data.skip === true) return { skip: text(data.reason, 120) || "今天没什么想写的" };
  } catch {}
  return null;
}

// ── His own visits (the heartbeat) ──
// Every half hour the heartbeat may let him drop by on his own: first to
// answer her (a new post of hers he hasn't been to, or a comment of hers left
// hanging), otherwise, every week or two, to write something himself. All of
// it is decided here, purely, so the tests can walk through it.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const BLOG_BEAT = {
  /** Her posts and comments older than this are left alone. */
  freshDays: 3,
  /** He comes to a new post of hers 1–4 hours after she last touched it… */
  postDelayHours: [1, 4],
  /** …and answers a comment of hers 0.5–3 hours later, like a person would. */
  replyDelayHours: [0.5, 3],
  /** A visit that fails twice is given up on. */
  maxTries: 2,
  commentsPerDay: 8,
  /** No post of his own within a week of the last one. */
  minPostGapDays: 7,
  /** After two weeks he always at least thinks about writing. */
  sureGapDays: 14,
  /** Between those, each day has this chance of him thinking about it. */
  dailyChance: 0.4,
  /** He thinks about writing at most once in this many hours. */
  considerEveryHours: 20,
} as const;

/** 0 ≤ n < 1, fixed per id: the same post always gets the same delay. */
export function idFraction(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function delayMs(id: string, [low, high]: readonly [number, number]) {
  return (low + (high - low) * idFraction(id)) * HOUR;
}

function stamp(iso: string) {
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export type HerPostRef = { id: string; createdAt: string; updatedAt?: string };

export type BlogVisit = {
  postId: string;
  /** True when it is his own post (he is answering her comment there). */
  own: boolean;
  /** What he is answering: her post id, or her latest comment id. */
  key: string;
};

/**
 * The visit he owes her right now, if any: the one that has been waiting the
 * longest. `tried` counts failed attempts by visit key.
 */
export function pickBlogVisit(
  state: BlogState,
  herPosts: HerPostRef[],
  now: Date,
  tried: Record<string, number> = {},
): BlogVisit | null {
  const nowMs = now.getTime();
  const fresh = (ms: number) => ms > 0 && nowMs - ms <= BLOG_BEAT.freshDays * DAY;
  const threads = new Map<string, BlogComment[]>();
  for (const comment of state.comments) {
    const list = threads.get(comment.postId) || [];
    list.push(comment);
    threads.set(comment.postId, list);
  }
  const due: Array<BlogVisit & { readyAt: number }> = [];
  const consider = (postId: string, own: boolean) => {
    const thread = (threads.get(postId) || []).slice().sort((a, b) => stamp(a.createdAt) - stamp(b.createdAt));
    const last = thread[thread.length - 1];
    // Her comment is the last word: he answers it.
    if (last && last.author === "her" && fresh(stamp(last.createdAt))) {
      due.push({ postId, own, key: last.id, readyAt: stamp(last.createdAt) + delayMs(last.id, BLOG_BEAT.replyDelayHours) });
    }
  };
  for (const post of herPosts) {
    const thread = threads.get(post.id) || [];
    const touched = Math.max(stamp(post.createdAt), stamp(post.updatedAt || ""));
    if (!thread.some((comment) => comment.author === "him")) {
      // A new post of hers he hasn't been to. Waiting from her last edit
      // means he never lands on something she is still writing.
      if (fresh(stamp(post.createdAt))) {
        due.push({ postId: post.id, own: false, key: post.id, readyAt: touched + delayMs(post.id, BLOG_BEAT.postDelayHours) });
        continue;
      }
    }
    consider(post.id, false);
  }
  for (const post of state.him.posts) consider(post.id, true);
  const ready = due
    .filter((visit) => visit.readyAt <= nowMs && (tried[visit.key] || 0) < BLOG_BEAT.maxTries)
    .sort((a, b) => a.readyAt - b.readyAt);
  if (!ready.length) return null;
  const { postId, own, key } = ready[0];
  return { postId, own, key };
}

/**
 * Whether he sits down to think about a post of his own today. `roll` is a
 * random 0–1; a day he decides against still counts as considered.
 */
export function shouldConsiderWriting(
  { lastPostAt, lastConsideredAt, now, roll }: { lastPostAt: string | null; lastConsideredAt: number; now: Date; roll: number },
): { consider: boolean; counts: boolean; reason: string } {
  const nowMs = now.getTime();
  if (lastConsideredAt && nowMs - lastConsideredAt < BLOG_BEAT.considerEveryHours * HOUR) {
    return { consider: false, counts: false, reason: "今天已经想过要不要写了" };
  }
  const gapDays = lastPostAt ? (nowMs - stamp(lastPostAt)) / DAY : Infinity;
  if (gapDays < BLOG_BEAT.minPostGapDays) {
    return { consider: false, counts: false, reason: `离上一篇不到 ${BLOG_BEAT.minPostGapDays} 天` };
  }
  if (gapDays < BLOG_BEAT.sureGapDays && roll >= BLOG_BEAT.dailyChance) {
    return { consider: false, counts: true, reason: "今天没想起来写" };
  }
  return { consider: true, counts: true, reason: "想想要不要写一篇" };
}

// ── Posts ──

/** Her title, or the first line of the post for old winter fragments. */
export function postTitle(post: BlogPostLike) {
  const own = (post.title || "").trim();
  if (own) return own;
  const firstLine = post.content.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
  if (!firstLine) return "无题";
  const chars = Array.from(firstLine);
  return chars.length > 16 ? `${chars.slice(0, 16).join("")}…` : firstLine;
}

export function postExcerpt(post: BlogPostLike, max = 120) {
  const body = post.content.replace(/\s+/g, " ").trim();
  const chars = Array.from(body);
  return chars.length > max ? `${chars.slice(0, max).join("")}……` : body;
}

/** Newest first by the day it was written; editing never moves a post. */
export function sortPosts<T extends { createdAt: string }>(posts: T[]) {
  return [...posts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: BLOG_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** "2026-10-09" in her time zone. */
export function blogDayKey(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : dayFormat.format(date);
}

export function blogMonthKey(iso: string) {
  return blogDayKey(iso).slice(0, 7);
}

export function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return `${year}年${Number(month)}月`;
}

/** Months that have posts, newest first, with how many. */
export function blogArchive(posts: BlogPostLike[]) {
  const counts = new Map<string, number>();
  for (const post of posts) {
    const key = blogMonthKey(post.createdAt);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, total]) => ({ key, label: monthLabel(key), count: total }));
}

/** Weeks of a month (Sunday first), padded with nulls, as old blog calendars were. */
export function calendarWeeks(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<number | null> = [...Array(first).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks: Array<Array<number | null>> = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

export function shiftMonth(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The old six-digit counter: 127 → "000127". */
export function visitorDigits(visits: number) {
  return String(Math.max(0, Math.floor(visits))).padStart(6, "0").slice(-9);
}

/** "未命名.mp3" → "未命名" for the playlist. */
export function songTitleFromFile(name: string) {
  return name.replace(/\.[A-Za-z0-9]{1,5}$/, "").trim().slice(0, BLOG_LIMITS.songTitle) || "未命名";
}
