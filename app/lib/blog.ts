// The blog: an XP-blue, 2007-style home for everything she writes. Posts are
// the old winter fragments (same ids, same dates, kept in `fragments`); this
// file holds what lives next to them on the server under `blog`: the profile,
// the guestbook comments, the playlist and the visitor counter. Everything is
// pure and import-free so the page, the API route and the tests share it.

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

export type BlogState = {
  profile: BlogProfile;
  songs: BlogSong[];
  comments: BlogComment[];
  visits: number;
  views: Record<string, number>;
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
  | { type: "post-delete"; postId: string };

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
    default:
      return { error: "不认识的操作" };
  }
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
export function sortPosts<T extends BlogPostLike>(posts: T[]) {
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
