import type { ReadingBook } from "./reading-books";

const DATABASE = "iooi-reading";
const STORE = "books";

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("这台设备暂时无法保存书籍，请检查浏览器的存储权限。"));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("书房暂时无法保存，请检查浏览器的存储权限。"));
    request.onblocked = () => reject(new Error("请关闭其他旧版书房页面后重试。"));
  });
}

export async function loadReadingLibrary(): Promise<ReadingBook[]> {
  const db = await openLibrary();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result.filter((book: ReadingBook) =>
        book && typeof book.id === "string" && Array.isArray(book.chapters) && book.chapters.length && book.position
      ));
      request.onerror = () => reject(new Error("没能打开书架，请稍后重试。"));
    });
  } finally { db.close(); }
}

export async function saveReadingBook(book: ReadingBook): Promise<void> {
  const db = await openLibrary();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(book);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error("没能保存到书架，可能是这台设备的存储空间不足。"));
      transaction.onabort = () => reject(new Error("保存中断了，请稍后重试。"));
    });
  } finally { db.close(); }
}
