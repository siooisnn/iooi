// The bookshelf as text for him (the MCP tools). Chapters and paragraphs are
// numbered from 1 here; the store keeps chapter ids and 0-based paragraphs.
// "你" is him, "她" is her. Only type imports, so node tests can load it.
import type { ReadingChapter, ReadingMark, ReadingShelf, ShelfBook } from "./reading-books";

const SHELF_NAME: Record<ReadingShelf, string> = { reading: "在读", want: "想读", done: "读完了" };
const ORDER: readonly ReadingShelf[] = ["reading", "want", "done"];

export const PASSAGE_CHARS = { min: 1000, standard: 6000, max: 12000 } as const;

function day(ms: number) {
  return new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
}

function spot(mark: ReadingMark | null, chapters: ReadingChapter[] | null) {
  if (!mark) return "还没开始";
  const index = chapters && mark.chapterId ? chapters.findIndex((chapter) => chapter.id === mark.chapterId) : -1;
  const where = index >= 0 ? `（第 ${index + 1} 章第 ${(mark.paragraphIndex ?? 0) + 1} 段）` : "";
  return `${mark.percent}%${where}，${day(mark.updatedAt)}`;
}

function wanted(book: ShelfBook) {
  if (book.shelf !== "want" || !book.wantedBy) return "";
  return book.wantedBy === "her" ? " · 她想读" : " · 你想读";
}

/** reading_shelf: every book, grouped like the page. */
export function shelfDigest(books: ShelfBook[]): string {
  if (!books.length) return "书架还是空的。";
  const lines: string[] = [];
  for (const shelf of ORDER) {
    const group = books.filter((book) => book.shelf === shelf);
    if (!group.length) continue;
    lines.push(`## ${SHELF_NAME[shelf]}（${group.length}）`);
    for (const book of group) {
      lines.push(`- 《${book.title}》${book.author ? ` ${book.author}` : ""} id=${book.id}${wanted(book)}`);
      lines.push(`  ${book.hasText ? `有正文，${book.chapterCount} 章` : "没有正文"} · 她 ${book.her ? `${book.her.percent}%` : "没开始"} · 你 ${book.him ? `${book.him.percent}%` : "没开始"}${book.notes.length ? ` · 你的批注 ${book.notes.length} 条` : ""}`);
      if (book.blurb) lines.push(`  ${book.blurb}`);
    }
  }
  return lines.join("\n");
}

/** reading_book: one book's page: both spots, the contents, his notes. */
export function bookDigest(book: ShelfBook, chapters: ReadingChapter[] | null, tocLimit = 400): string {
  const lines = [
    `《${book.title}》${book.author ? ` ${book.author}` : ""} id=${book.id}`,
    `书架：${SHELF_NAME[book.shelf]}${wanted(book)}${book.blurb ? ` · ${book.blurb}` : ""}`,
    `她读到：${spot(book.her, chapters)}`,
    `你读到：${spot(book.him, chapters)}`,
  ];
  if (!chapters) {
    lines.push("", "这本书还没有正文（她还没导入 TXT 或 EPUB），只能用 reading_mark 记百分比，没法读也没法批注。");
  } else {
    lines.push("", `目录（共 ${chapters.length} 章）：`);
    for (const [index, chapter] of chapters.slice(0, tocLimit).entries()) {
      const marks = [
        book.her?.chapterId === chapter.id ? "她在这" : "",
        book.him?.chapterId === chapter.id ? "你在这" : "",
      ].filter(Boolean).join("、");
      lines.push(`${index + 1}. ${chapter.title}（${chapter.paragraphs.length} 段）${marks ? ` ← ${marks}` : ""}`);
    }
    if (chapters.length > tocLimit) lines.push(`……后面还有 ${chapters.length - tocLimit} 章`);
  }
  const notes = [...book.notes].sort((a, b) => b.at - a.at);
  lines.push("", notes.length ? `你的批注（${notes.length} 条，新的在前）：` : "你还没在这本书里写过批注。");
  for (const note of notes.slice(0, 30)) {
    const index = chapters ? chapters.findIndex((chapter) => chapter.id === note.chapterId) : -1;
    const where = index >= 0 ? `第 ${index + 1} 章第 ${note.paragraphIndex + 1} 段` : "原文已换";
    lines.push(`- [${where}] note_id=${note.id} ${day(note.at)}「${note.quote}」→ ${note.content}`);
  }
  if (notes.length > 30) lines.push(`……还有 ${notes.length - 30} 条更早的`);
  return lines.join("\n");
}

export type PassageRequest = { chapter?: unknown; paragraph?: unknown; maxChars?: unknown };

function wholeNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.floor(number) : null;
}

/**
 * reading_read: a run of paragraphs. With no chapter it picks up where he
 * left off (his own spot, shown again for context), or at the very start.
 */
export function passageText(book: ShelfBook, chapters: ReadingChapter[], request: PassageRequest = {}): string {
  let chapterIndex: number;
  let start: number;
  const askedChapter = wholeNumber(request.chapter);
  if (askedChapter !== null) {
    if (askedChapter < 1 || askedChapter > chapters.length) throw new Error(`这本书只有 ${chapters.length} 章。`);
    chapterIndex = askedChapter - 1;
    start = Math.max(0, (wholeNumber(request.paragraph) ?? 1) - 1);
    if (start >= chapters[chapterIndex].paragraphs.length) throw new Error(`第 ${askedChapter} 章只有 ${chapters[chapterIndex].paragraphs.length} 段。`);
  } else {
    const found = book.him?.chapterId ? chapters.findIndex((chapter) => chapter.id === book.him?.chapterId) : -1;
    chapterIndex = Math.max(0, found);
    start = found >= 0 ? Math.min(book.him?.paragraphIndex ?? 0, chapters[chapterIndex].paragraphs.length - 1) : 0;
  }
  const budget = Math.max(PASSAGE_CHARS.min, Math.min(PASSAGE_CHARS.max, wholeNumber(request.maxChars) ?? PASSAGE_CHARS.standard));
  const chapter = chapters[chapterIndex];
  const lines = [`《${book.title}》第 ${chapterIndex + 1}/${chapters.length} 章「${chapter.title}」`, ""];
  let used = 0;
  let end = start;
  while (end < chapter.paragraphs.length) {
    const paragraph = chapter.paragraphs[end];
    if (end > start && used + paragraph.length > budget) break;
    const flags = [
      book.her?.chapterId === chapter.id && book.her.paragraphIndex === end ? "她读到这里" : "",
      book.him?.chapterId === chapter.id && book.him.paragraphIndex === end ? "你上次读到这里" : "",
    ].filter(Boolean);
    lines.push(`[${end + 1}]${flags.length ? `（${flags.join("，")}）` : ""} ${paragraph}`);
    const note = book.notes.find((item) => item.chapterId === chapter.id && item.paragraphIndex === end);
    if (note) lines.push(`    ↳ 你的批注 note_id=${note.id}：${note.content}`);
    used += paragraph.length;
    end += 1;
  }
  lines.push("");
  const last = end; // 1-based number of the last paragraph shown
  if (end < chapter.paragraphs.length) {
    lines.push(`这次读到第 ${chapterIndex + 1} 章第 ${last} 段（本章共 ${chapter.paragraphs.length} 段）。接着读：chapter=${chapterIndex + 1}, paragraph=${end + 1}。`);
  } else if (chapterIndex + 1 < chapters.length) {
    lines.push(`这一章读完了（共 ${chapter.paragraphs.length} 段）。下一章：chapter=${chapterIndex + 2}「${chapters[chapterIndex + 1].title}」。`);
  } else {
    lines.push("全书到这里读完了。");
  }
  lines.push(`停下来时用 reading_mark 记下你读到哪（比如 chapter=${chapterIndex + 1}, paragraph=${last}）。`);
  return lines.join("\n");
}
