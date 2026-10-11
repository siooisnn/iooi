// Server side of our bookshelf. The list (titles, both of our marks, his
// notes) lives in data/reading.json; each book's text is its own file,
// data/reading-text-<id>.json, so moving a bookmark never rewrites a novel.
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { DATA_DIR_PATH, readReadingStore, withReadingStore } from "./store";
import {
  addShelfBook, attachShelfText, editShelfBook, isBookId, markShelfBook, noteShelfBook, readShelf, removeShelfBook, unnoteShelfBook,
  type BookEdit, type MarkInput, type NewBook, type NoteInput, type ReadingChapter, type ReadingWho, type ShelfBook,
} from "./reading-books";

function textFile(id: string) {
  if (!isBookId(id)) throw new Error("书的编号不对。");
  return join(DATA_DIR_PATH, `reading-text-${id}.json`);
}

export function loadBookText(id: string): ReadingChapter[] | null {
  const file = textFile(id);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8"));
    return Array.isArray(parsed?.chapters) ? parsed.chapters : null;
  } catch { return null; }
}

function saveBookText(id: string, chapters: ReadingChapter[]) {
  const file = textFile(id);
  const tmp = `${file}.tmp`;
  readReadingStore(); // makes sure data/ exists
  writeFileSync(tmp, JSON.stringify({ chapters }), "utf-8");
  renameSync(tmp, file);
}

function dropBookText(id: string) {
  const file = textFile(id);
  if (existsSync(file)) unlinkSync(file);
}

export function listShelf(): ShelfBook[] {
  return readShelf(readReadingStore());
}

export function getShelfBook(id: string): ShelfBook | null {
  return listShelf().find((book) => book.id === id) || null;
}

/** A new book, with or without text. The text is written before the book shows up. */
export async function addBook(input: NewBook): Promise<ShelfBook> {
  const id = input.id && isBookId(input.id) ? input.id : crypto.randomUUID();
  if (input.chapters?.length) saveBookText(id, input.chapters);
  try {
    return await withReadingStore((store) => addShelfBook(store, { ...input, id }));
  } catch (error) {
    if (input.chapters?.length && !listShelf().some((book) => book.id === id)) dropBookText(id);
    throw error;
  }
}

export async function attachText(id: string, chapters: ReadingChapter[]): Promise<ShelfBook> {
  if (!getShelfBook(id)) throw new Error("书架上没有这本书了，刷新看看。");
  saveBookText(id, chapters);
  return withReadingStore((store) => attachShelfText(store, id, chapters));
}

export function editBook(id: string, edit: BookEdit): Promise<ShelfBook> {
  return withReadingStore((store) => editShelfBook(store, id, edit));
}

export function markBook(id: string, who: ReadingWho, input: MarkInput): Promise<ShelfBook> {
  const chapters = typeof input.chapterId === "string" ? loadBookText(id) : null;
  if (typeof input.chapterId === "string" && !chapters) throw new Error("这本书的正文找不到了。");
  return withReadingStore((store) => markShelfBook(store, id, who, input, chapters));
}

/** His note on one paragraph. */
export function noteBook(id: string, input: NoteInput) {
  const chapters = loadBookText(id);
  if (!chapters) throw new Error("这本书还没有正文，没法写批注。");
  return withReadingStore((store) => noteShelfBook(store, id, input, chapters));
}

export function unnoteBook(id: string, noteId: string): Promise<boolean> {
  return withReadingStore((store) => unnoteShelfBook(store, id, noteId));
}

export async function deleteBook(id: string): Promise<boolean> {
  const removed = await withReadingStore((store) => removeShelfBook(store, id));
  dropBookText(id);
  return removed;
}
