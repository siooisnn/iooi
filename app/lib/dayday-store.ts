// dayday 记账 on disk (data/dayday.json). Her page goes through /api/dayday;
// his tools call runDayday with bySusu so his entries carry the 小砖记 tag.

import { readDaydayStore, withDaydayStore } from "./store";
import { applyDayday, dayKey, DAYDAY_LIMITS, parseBook, settleBook, type DaydayBook } from "./dayday-ledger";

function save(store: Record<string, unknown>, book: DaydayBook) {
  for (const key of Object.keys(store)) delete store[key];
  Object.assign(store, book);
}

/** The book as of today. Old cycles that are due to fold are folded and saved first. */
export async function readBook(now = new Date()): Promise<DaydayBook> {
  const book = parseBook(readDaydayStore());
  if (!settleBook(structuredClone(book), dayKey(now))) return book;
  return withDaydayStore((store) => {
    const fresh = parseBook(store);
    settleBook(fresh, dayKey(now));
    save(store, fresh);
    return fresh;
  });
}

/**
 * One action, saved in the same atomic write. A failing action changes nothing.
 * A repeated requestId returns the current book without applying it twice.
 */
export async function runDayday(action: string, input: Record<string, unknown>, options: { requestId?: unknown; bySusu?: boolean; now?: Date } = {}) {
  const now = options.now || new Date();
  const requestId = typeof options.requestId === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(options.requestId) ? options.requestId : "";
  return withDaydayStore((store) => {
    const book = parseBook(store);
    settleBook(book, dayKey(now));
    if (requestId && book.receipts.includes(requestId)) {
      save(store, book);
      return { book, result: null, repeated: true };
    }
    const next = structuredClone(book);
    const result = applyDayday(next, action, input, { now, bySusu: options.bySusu });
    settleBook(next, dayKey(now));
    if (requestId) next.receipts = [...next.receipts, requestId].slice(-DAYDAY_LIMITS.receipts);
    save(store, next);
    return { book: next, result, repeated: false };
  });
}
