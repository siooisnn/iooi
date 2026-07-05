import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data");
const DATA_FILE = join(DATA_DIR, "store.json");
const TMP_FILE = join(DATA_DIR, "store.tmp.json");

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

let writeLock: Promise<void> = Promise.resolve();

export function readStore(): Record<string, unknown> | null {
  ensureDir();
  if (!existsSync(DATA_FILE)) return null;
  try {
    return JSON.parse(readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return null;
  }
}

export async function withStore<T>(
  fn: (store: Record<string, unknown>) => T
): Promise<T> {
  let resolve!: () => void;
  const next = new Promise<void>((r) => { resolve = r; });
  const prev = writeLock;
  writeLock = next;

  try {
    await prev;
    ensureDir();
    const store = readStore() || {};
    const result = fn(store);
    writeFileSync(TMP_FILE, JSON.stringify(store, null, 2), "utf-8");
    renameSync(TMP_FILE, DATA_FILE);
    return result;
  } finally {
    resolve();
  }
}
