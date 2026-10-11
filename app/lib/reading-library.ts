// The old on-device bookshelf (IndexedDB). Books now live on the server; this
// only reads what was left on her phone so the page can move it over once.
import type { ReadingChapter } from "./reading-books";

const DATABASE = "iooi-reading";
const STORE = "books";
export const LEGACY_MOVED_KEY = "iooi-reading-moved";

export type LegacyBook = {
  id: string;
  title: string;
  chapters: ReadingChapter[];
  position: { chapterId: string; paragraphIndex: number };
  createdAt: number;
  lastReadAt: number;
  isDemo?: boolean;
};

export async function loadLegacyBooks(): Promise<LegacyBook[]> {
  if (typeof indexedDB === "undefined") return [];
  // Don't create the old database just to find it empty.
  if (typeof indexedDB.databases === "function") {
    const names = await indexedDB.databases().catch(() => null);
    if (names && !names.some((item) => item.name === DATABASE)) return [];
  }
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("没能打开手机上的旧书架。"));
    request.onblocked = () => reject(new Error("请关闭其他旧版书房页面后重试。"));
  });
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result.filter((book: LegacyBook) =>
        book && typeof book.id === "string" && !book.isDemo && Array.isArray(book.chapters) && book.chapters.length && book.position));
      request.onerror = () => reject(new Error("没能读出手机上的旧书架。"));
    });
  } finally { db.close(); }
}
