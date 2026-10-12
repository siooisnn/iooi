// The phone keeps only its decoration. Its contents are views of the existing
// life log, bookshelf, forum and his blog; never copies of those stores.
import { parseBlogState } from "./blog";
import { readLifeLog } from "./life-log";
import { readShelf, type ShelfBook } from "./reading-books";
import { readBoard, safeSurfUrl } from "./surf-board";

export const PHONE_APPS = ["reading", "surf", "blog", "chat"] as const;
export type PhoneApp = typeof PHONE_APPS[number];
export type PhoneTarget = { app: PhoneApp; id?: string };
export const PHONE_WALLPAPERS = ["night-blue", "moon-mist", "deep-sea"] as const;
export type PhoneWallpaper = typeof PHONE_WALLPAPERS[number];
export const PHONE_WIDGETS = ["today", "collection", "signature"] as const;
export const PHONE_ORNAMENTS = ["cat", "moon", "clouds"] as const;

export type PhoneSettings = {
  wallpaper: PhoneWallpaper;
  /** The four dock positions, from left to right. */
  iconOrder: PhoneApp[];
  widgets: Record<typeof PHONE_WIDGETS[number], boolean>;
  ornaments: Record<typeof PHONE_ORNAMENTS[number], boolean>;
  updatedAt: number;
};
export type PhoneItem = { id: string; title: string; detail: string; percent?: number; target: PhoneTarget };
export type PhoneActivity = {
  at: number; clock: string; text: string; target?: PhoneTarget;
  links: { title: string; url: string }[];
};
export type PhoneSnapshot = {
  day: string; clock: string; settings: PhoneSettings; signature: string;
  today: PhoneActivity[];
  collection: { reading: PhoneItem[]; surf: PhoneItem[]; blog: PhoneItem[] };
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function isOrder(value: unknown): value is PhoneApp[] {
  return Array.isArray(value) && value.length === PHONE_APPS.length
    && new Set(value).size === PHONE_APPS.length && value.every((id) => PHONE_APPS.includes(id));
}
function flags<const T extends readonly string[]>(keys: T, value: unknown): Record<T[number], boolean> {
  const source = record(value);
  return Object.fromEntries(keys.map((key) => [key, typeof source[key] === "boolean" ? source[key] : true])) as Record<T[number], boolean>;
}
export function parsePhoneSettings(raw: unknown): PhoneSettings {
  const source = record(raw);
  return {
    wallpaper: PHONE_WALLPAPERS.includes(source.wallpaper as PhoneWallpaper) ? source.wallpaper as PhoneWallpaper : "night-blue",
    iconOrder: isOrder(source.iconOrder) ? [...source.iconOrder] : [...PHONE_APPS],
    widgets: flags(PHONE_WIDGETS, source.widgets), ornaments: flags(PHONE_ORNAMENTS, source.ornaments),
    updatedAt: typeof source.updatedAt === "number" && Number.isFinite(source.updatedAt) ? source.updatedAt : 0,
  };
}

/** Validate all changes before writing the single phone_settings store. */
export function decoratePhone(current: unknown, input: Record<string, unknown>, now = Date.now()): PhoneSettings {
  const allowed = ["wallpaper", "icon_order", "widgets", "ornaments"];
  if (!Object.keys(input).length) throw new Error("告诉我想换哪张壁纸，或想怎么排图标、挂件。");
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new Error("这里只能改手机的壁纸、图标顺序和挂件。");
  const next = parsePhoneSettings(current);
  if ("wallpaper" in input) {
    if (!PHONE_WALLPAPERS.includes(input.wallpaper as PhoneWallpaper)) throw new Error("壁纸可选 night-blue、moon-mist、deep-sea。");
    next.wallpaper = input.wallpaper as PhoneWallpaper;
  }
  if ("icon_order" in input) {
    if (!isOrder(input.icon_order)) throw new Error("图标顺序要包含 reading、surf、blog、chat 各一次。");
    next.iconOrder = [...input.icon_order];
  }
  for (const field of ["widgets", "ornaments"] as const) {
    if (!(field in input)) continue;
    const patch = record(input[field]);
    const keys: readonly string[] = field === "widgets" ? PHONE_WIDGETS : PHONE_ORNAMENTS;
    if (!input[field] || typeof input[field] !== "object" || Array.isArray(input[field])
      || Object.entries(patch).some(([key, value]) => !keys.includes(key) || typeof value !== "boolean")) {
      throw new Error(`挂件设置不对：${keys.join("、")} 的值要是 true 或 false。`);
    }
    Object.assign(next[field], patch);
  }
  next.updatedAt = now;
  return next;
}

const day = (at: number) => new Date(at).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
const clock = (at: number) => new Date(at).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false });
function bookProgress(book: ShelfBook) {
  if (!book.him) return "酥酥还没开始读";
  const chapter = book.him.chapterId?.match(/^(?:chapter-|c)(\d+)$/)?.[1];
  const paragraph = typeof book.him.paragraphIndex === "number" ? `第 ${book.him.paragraphIndex + 1} 段` : "";
  return [chapter ? `第 ${chapter} 章` : "", paragraph, `${book.him.percent}%`].filter(Boolean).join(" · ");
}

export function buildPhoneSnapshot(
  main: Record<string, unknown> | null, reading: Record<string, unknown> | null,
  surf: Record<string, unknown> | null, settings: unknown, now = new Date(),
): PhoneSnapshot {
  const blog = parseBlogState(main?.blog);
  const books = readShelf(reading);
  const threads = readBoard(surf);
  const today = day(now.getTime());
  const activity = readLifeLog(main)
    .filter((entry) => entry.kind !== "care" && Number.isFinite(entry.lastAt ?? entry.at) && day(entry.lastAt ?? entry.at) === today)
    .sort((a, b) => (a.lastAt ?? a.at) - (b.lastAt ?? b.at)).slice(-30)
    .map((entry): PhoneActivity => {
      const at = entry.lastAt ?? entry.at;
      const target: PhoneTarget | undefined = entry.kind === "read" ? { app: "reading", ...(books.some((book) => book.id === entry.ref) ? { id: entry.ref } : {}) }
        : entry.kind === "surf" ? { app: "surf", ...(threads.some((thread) => thread.id === entry.ref) ? { id: entry.ref } : {}) }
          : entry.kind === "post" || entry.kind === "comment" ? { app: "blog", ...(blog.him.posts.some((post) => post.id === entry.ref) ? { id: entry.ref } : {}) } : undefined;
      return { at, clock: clock(at), text: entry.text, target,
        links: (entry.links || []).flatMap((link) => safeSurfUrl(link.url) ? [{ title: link.title, url: safeSurfUrl(link.url) }] : []).slice(0, 5) };
    });
  return {
    day: today, clock: clock(now.getTime()), settings: parsePhoneSettings(settings), signature: blog.him.motto,
    today: activity,
    collection: {
      reading: [...books].filter((book) => book.shelf === "reading")
        .sort((a, b) => (b.him?.updatedAt ?? b.updatedAt) - (a.him?.updatedAt ?? a.updatedAt)).slice(0, 3)
        .map((book) => ({ id: book.id, title: book.title, detail: bookProgress(book), percent: book.him?.percent ?? 0, target: { app: "reading", id: book.id } })),
      surf: threads.filter((thread) => thread.who === "him").sort((a, b) => b.at - a.at).slice(0, 3)
        .map((thread) => ({ id: thread.id, title: thread.title, detail: `${thread.replies.length} 条回帖`, target: { app: "surf", id: thread.id } })),
      blog: [...blog.him.posts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3)
        .map((post) => ({ id: post.id, title: post.title, detail: `${day(new Date(post.createdAt).getTime())} 的日志`, target: { app: "blog", id: post.id } })),
    },
  };
}
