// Our bookshelf: shared types and pure helpers. No imports, so the page, the
// server and node tests can all load it.

export type ReadingChapter = { id: string; title: string; paragraphs: string[] };

/** 在读 / 想读 / 读完了 */
export type ReadingShelf = "reading" | "want" | "done";
/** Whose progress or wish: her, or him (the AI). */
export type ReadingWho = "her" | "him";

/** Where one of us is in a book. Books without text only keep a percent. */
export type ReadingMark = {
  percent: number;
  chapterId?: string;
  paragraphIndex?: number;
  updatedAt: number;
};

/** His notes in the margin. She reads them; she doesn't have to write any. */
export type ReadingNote = {
  id: string;
  chapterId: string;
  paragraphIndex: number;
  quote: string;
  content: string;
  at: number;
};

export type ShelfBook = {
  id: string;
  title: string;
  author: string;
  shelf: ReadingShelf;
  /** Who put it on 想读. */
  wantedBy?: ReadingWho;
  /** A line about why: "她说想看" / "听说很好哭". */
  blurb: string;
  /** Whether a TXT is attached and can be opened in the reader. */
  hasText: boolean;
  chapterCount: number;
  her: ReadingMark | null;
  him: ReadingMark | null;
  notes: ReadingNote[];
  createdAt: number;
  updatedAt: number;
};

export const READING_SHELVES: readonly ReadingShelf[] = ["reading", "want", "done"];
export const SHELF_LABEL: Record<ReadingShelf, string> = { reading: "在读", want: "想读", done: "读完了" };
export const MAX_READING_BYTES = 10 * 1024 * 1024;
export const MAX_SHELF_BOOKS = 300;

const CHAPTER_HEADING = /^(?:第[零〇一二三四五六七八九十百千万两\d]+[章回卷节部篇].*|chapter\s+\S+.*|序章|序言|前言|楔子|后记|尾声|引子)$/i;

export function parseReadingText(bytes: Uint8Array): ReadingChapter[] {
  if (bytes.byteLength > MAX_READING_BYTES) throw new Error("这本书太大了，TXT 暂时最多支持 10MB。");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try { text = new TextDecoder("gb18030", { fatal: true }).decode(bytes); }
    catch { throw new Error("没能读出文字，请将文件另存为 UTF-8 格式的 TXT。"); }
  }
  text = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (text.includes("\0")) throw new Error("这个文件不像 TXT 正文，请检查后重新导入。");
  const chapters: ReadingChapter[] = [];
  let title = "正文";
  let paragraphs: string[] = [];
  function finish() {
    if (!paragraphs.length) return;
    // Bound each rendered chapter even when a TXT has no chapter headings.
    for (let offset = 0; offset < paragraphs.length; offset += 240) {
      chapters.push({
        id: `chapter-${chapters.length + 1}`,
        title: offset === 0 ? title : `${title} · 续 ${Math.floor(offset / 240)}`,
        paragraphs: paragraphs.slice(offset, offset + 240),
      });
    }
    paragraphs = [];
  }
  for (const line of text.split("\n")) {
    const content = line.trim();
    if (!content) continue;
    if (content.length <= 60 && CHAPTER_HEADING.test(content)) {
      finish();
      title = content;
    } else {
      paragraphs.push(content);
    }
  }
  finish();
  if (!chapters.length) throw new Error("这份文件里还没有可以阅读的正文。");
  return chapters;
}

/** Checks chapters that came from outside (an old on-device book). */
export function validChapters(value: unknown): ReadingChapter[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 20_000) return null;
  const chapters: ReadingChapter[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const { id, title, paragraphs } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id || typeof title !== "string" || !Array.isArray(paragraphs) || !paragraphs.length) return null;
    if (!paragraphs.every((paragraph) => typeof paragraph === "string")) return null;
    chapters.push({ id: id.slice(0, 40), title: title.slice(0, 120), paragraphs: paragraphs as string[] });
  }
  return chapters;
}

/** 0–100 for a spot in the text; the last paragraph counts as finished. */
export function percentAt(chapters: ReadingChapter[], chapterId: string, paragraphIndex: number): number {
  const total = chapters.reduce((sum, chapter) => sum + chapter.paragraphs.length, 0);
  const chapterIndex = chapters.findIndex((chapter) => chapter.id === chapterId);
  if (chapterIndex < 0 || total <= 0) return 0;
  const before = chapters.slice(0, chapterIndex).reduce((sum, chapter) => sum + chapter.paragraphs.length, 0);
  const paragraph = Math.max(0, Math.min(Math.floor(paragraphIndex) || 0, chapters[chapterIndex].paragraphs.length - 1));
  return total <= 1 ? 100 : Math.round((before + paragraph) / (total - 1) * 100);
}

export function clampPercent(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : null;
}

/**
 * One line comparing the two marks, for nagging each other.
 * The page talks to her as 你; `hisName` is his name.
 */
export function paceLine(book: Pick<ShelfBook, "her" | "him" | "shelf">, hisName: string): string {
  const her = book.her?.percent ?? 0;
  const him = book.him?.percent ?? 0;
  if (book.shelf === "want") return "还没开始读";
  if (her >= 100 && him >= 100) return "我们都读完了";
  if (!book.her && !book.him) return "我们都还没翻开";
  const gap = Math.abs(her - him);
  if (gap < 3) return "我们差不多读到一个地方";
  return her > him ? `你领先${hisName} ${gap}%，催他快点读` : `${hisName}领先你 ${gap}%，等你追上来`;
}

/** Order inside a shelf: whatever either of us touched last comes first. */
export function lastTouched(book: ShelfBook): number {
  return Math.max(book.updatedAt, book.her?.updatedAt || 0, book.him?.updatedAt || 0);
}

// ── Shelf operations on a store object (`{ books: [...] }`), used inside
// withReadingStore. The text itself lives elsewhere; these only see chapters
// when a caller passes them in.

const SHELF_SET = new Set<string>(READING_SHELVES);
const BOOK_ID = /^[A-Za-z0-9-]{1,64}$/;

export function isBookId(value: unknown): value is string {
  return typeof value === "string" && BOOK_ID.test(value);
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanMark(value: unknown): ReadingMark | null {
  if (!value || typeof value !== "object") return null;
  const mark = value as Record<string, unknown>;
  const percent = clampPercent(mark.percent);
  if (percent === null || typeof mark.updatedAt !== "number") return null;
  return {
    percent,
    ...(typeof mark.chapterId === "string" ? { chapterId: mark.chapterId } : {}),
    ...(typeof mark.paragraphIndex === "number" ? { paragraphIndex: Math.max(0, Math.floor(mark.paragraphIndex)) } : {}),
    updatedAt: mark.updatedAt,
  };
}

function cleanBook(value: unknown): ShelfBook | null {
  if (!value || typeof value !== "object") return null;
  const book = value as Record<string, unknown>;
  if (!isBookId(book.id) || typeof book.title !== "string" || !SHELF_SET.has(book.shelf as string)) return null;
  return {
    id: book.id,
    title: book.title,
    author: typeof book.author === "string" ? book.author : "",
    shelf: book.shelf as ReadingShelf,
    ...(book.wantedBy === "her" || book.wantedBy === "him" ? { wantedBy: book.wantedBy } : {}),
    blurb: typeof book.blurb === "string" ? book.blurb : "",
    hasText: book.hasText === true,
    chapterCount: typeof book.chapterCount === "number" ? book.chapterCount : 0,
    her: cleanMark(book.her),
    him: cleanMark(book.him),
    notes: Array.isArray(book.notes) ? book.notes.filter((note): note is ReadingNote =>
      !!note && typeof note.id === "string" && typeof note.content === "string" && typeof note.chapterId === "string") : [],
    createdAt: typeof book.createdAt === "number" ? book.createdAt : 0,
    updatedAt: typeof book.updatedAt === "number" ? book.updatedAt : 0,
  };
}

/** Every book, most recently touched first. */
export function readShelf(store: Record<string, unknown> | null | undefined): ShelfBook[] {
  const books = Array.isArray(store?.books) ? store.books : [];
  return books.map(cleanBook).filter((book): book is ShelfBook => !!book)
    .sort((a, b) => lastTouched(b) - lastTouched(a));
}

function findBook(store: Record<string, unknown>, id: string) {
  const books = readShelf(store);
  store.books = books;
  const book = books.find((item) => item.id === id);
  if (!book) throw new Error("书架上没有这本书了，刷新看看。");
  return { books, book };
}

export type NewBook = {
  id?: string;
  title: unknown;
  author?: unknown;
  shelf?: unknown;
  blurb?: unknown;
  wantedBy?: unknown;
  chapters?: ReadingChapter[] | null;
  createdAt?: number;
};

export function addShelfBook(store: Record<string, unknown>, input: NewBook, now = Date.now()): ShelfBook {
  const books = readShelf(store);
  if (books.length >= MAX_SHELF_BOOKS) throw new Error(`书架最多放 ${MAX_SHELF_BOOKS} 本，先删掉几本吧。`);
  const title = cleanText(input.title, 120);
  if (!title) throw new Error("写一个书名吧。");
  const id = input.id && isBookId(input.id) ? input.id : crypto.randomUUID();
  if (books.some((book) => book.id === id)) throw new Error("这本书已经在书架上了。");
  const shelf = SHELF_SET.has(input.shelf as string) ? input.shelf as ReadingShelf : input.chapters ? "reading" : "want";
  const book: ShelfBook = {
    id, title,
    author: cleanText(input.author, 80),
    shelf,
    ...(shelf === "want" && (input.wantedBy === "her" || input.wantedBy === "him") ? { wantedBy: input.wantedBy } : {}),
    blurb: cleanText(input.blurb, 200),
    hasText: !!input.chapters?.length,
    chapterCount: input.chapters?.length || 0,
    her: null, him: null, notes: [],
    createdAt: input.createdAt || now, updatedAt: now,
  };
  store.books = [book, ...books];
  return book;
}

export type BookEdit = { title?: unknown; author?: unknown; shelf?: unknown; blurb?: unknown; wantedBy?: unknown };

export function editShelfBook(store: Record<string, unknown>, id: string, edit: BookEdit, now = Date.now()): ShelfBook {
  const { book } = findBook(store, id);
  if (edit.title !== undefined) {
    const title = cleanText(edit.title, 120);
    if (!title) throw new Error("书名不能是空的。");
    book.title = title;
  }
  if (edit.author !== undefined) book.author = cleanText(edit.author, 80);
  if (edit.blurb !== undefined) book.blurb = cleanText(edit.blurb, 200);
  if (edit.shelf !== undefined) {
    if (!SHELF_SET.has(edit.shelf as string)) throw new Error("没有这一格书架。");
    book.shelf = edit.shelf as ReadingShelf;
  }
  if (edit.wantedBy !== undefined) {
    if (edit.wantedBy === "her" || edit.wantedBy === "him") book.wantedBy = edit.wantedBy;
    else delete book.wantedBy;
  }
  book.updatedAt = now;
  return book;
}

/** Text arrived for a book that was only a title (or replaces the old text). */
export function attachShelfText(store: Record<string, unknown>, id: string, chapters: ReadingChapter[], now = Date.now()): ShelfBook {
  const { book } = findBook(store, id);
  const changed = book.hasText;
  book.hasText = true;
  book.chapterCount = chapters.length;
  // Old paragraph spots don't mean anything in a new text; keep the percent only.
  for (const who of ["her", "him"] as const) {
    const mark = book[who];
    if (mark && (changed || mark.chapterId)) book[who] = { percent: mark.percent, updatedAt: mark.updatedAt };
  }
  if (changed) book.notes = [];
  book.updatedAt = now;
  return book;
}

export type MarkInput = { chapterId?: unknown; paragraphIndex?: unknown; percent?: unknown };

/**
 * Moves one of us to a spot. With text, a chapter + paragraph (percent is
 * worked out); without, a plain percent. Starting a 想读 book moves it to 在读.
 */
export function markShelfBook(
  store: Record<string, unknown>, id: string, who: ReadingWho, input: MarkInput,
  chapters: ReadingChapter[] | null, now = Date.now(),
): ShelfBook {
  const { book } = findBook(store, id);
  let mark: ReadingMark;
  if (chapters && typeof input.chapterId === "string") {
    const chapter = chapters.find((item) => item.id === input.chapterId);
    if (!chapter) throw new Error("书里没有这一章。");
    const raw = typeof input.paragraphIndex === "number" ? input.paragraphIndex : 0;
    const paragraphIndex = Math.max(0, Math.min(Math.floor(raw) || 0, chapter.paragraphs.length - 1));
    mark = { percent: percentAt(chapters, chapter.id, paragraphIndex), chapterId: chapter.id, paragraphIndex, updatedAt: now };
  } else {
    const percent = clampPercent(input.percent);
    if (percent === null) throw new Error("进度要是 0 到 100 的数字。");
    mark = { percent, updatedAt: now };
  }
  book[who] = mark;
  if (book.shelf === "want" && (mark.percent > 0 || mark.chapterId)) book.shelf = "reading";
  return book;
}

export function removeShelfBook(store: Record<string, unknown>, id: string): boolean {
  const books = readShelf(store);
  const next = books.filter((book) => book.id !== id);
  store.books = next;
  return next.length !== books.length;
}

// ── His notes in the margin. One note per paragraph: writing on a paragraph
// that already has one rewrites it, since the reader shows one 批 per spot.

export const NOTE_LIMITS = { content: 500, quote: 60, perDay: 12, perBook: 1000 } as const;

/** The CST calendar day of an epoch ms, "2026-10-11". */
export function readingDay(ms: number): string {
  return new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
}

/** Notes he wrote today across the whole shelf (rewrites count once more). */
export function notesToday(books: ShelfBook[], now = Date.now()): number {
  const today = readingDay(now);
  return books.reduce((sum, book) => sum + book.notes.filter((note) => readingDay(note.at) === today).length, 0);
}

function quoteOf(paragraph: string) {
  const flat = paragraph.replace(/\s+/g, " ").trim();
  return flat.length > NOTE_LIMITS.quote ? `${flat.slice(0, NOTE_LIMITS.quote)}…` : flat;
}

export type NoteInput = { chapterId: string; paragraphIndex: number; content: unknown };

export function noteShelfBook(
  store: Record<string, unknown>, id: string, input: NoteInput,
  chapters: ReadingChapter[], now = Date.now(),
): { book: ShelfBook; note: ReadingNote; rewritten: boolean } {
  const { books, book } = findBook(store, id);
  const chapter = chapters.find((item) => item.id === input.chapterId);
  if (!chapter) throw new Error("书里没有这一章。");
  const paragraphIndex = Math.floor(input.paragraphIndex);
  if (!Number.isFinite(paragraphIndex) || paragraphIndex < 0 || paragraphIndex >= chapter.paragraphs.length) {
    throw new Error(`这一章只有 ${chapter.paragraphs.length} 段。`);
  }
  const content = typeof input.content === "string" ? input.content.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : "";
  if (!content) throw new Error("批注是空的。");
  if (content.length > NOTE_LIMITS.content) throw new Error(`批注最多 ${NOTE_LIMITS.content} 个字。`);
  if (notesToday(books, now) >= NOTE_LIMITS.perDay) throw new Error(`今天已经写了 ${NOTE_LIMITS.perDay} 条批注，明天再写吧。`);
  const existing = book.notes.find((note) => note.chapterId === chapter.id && note.paragraphIndex === paragraphIndex);
  if (!existing && book.notes.length >= NOTE_LIMITS.perBook) throw new Error("这本书的批注太多了。");
  const note: ReadingNote = {
    id: existing?.id || crypto.randomUUID(),
    chapterId: chapter.id, paragraphIndex,
    quote: quoteOf(chapter.paragraphs[paragraphIndex]),
    content, at: now,
  };
  book.notes = [note, ...book.notes.filter((item) => item !== existing)];
  return { book, note, rewritten: !!existing };
}

export function unnoteShelfBook(store: Record<string, unknown>, id: string, noteId: string): boolean {
  const { book } = findBook(store, id);
  const before = book.notes.length;
  book.notes = book.notes.filter((note) => note.id !== noteId);
  return book.notes.length !== before;
}
