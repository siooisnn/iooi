import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data");

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function createJsonStore(filename: string) {
  const dataFile = join(DATA_DIR, filename);
  const tmpFile = join(DATA_DIR, filename.replace(/\.json$/i, ".tmp.json"));
  let writeLock: Promise<void> = Promise.resolve();

  function read(): Record<string, unknown> | null {
    ensureDir();
    if (!existsSync(dataFile)) return null;
    try {
      return JSON.parse(readFileSync(dataFile, "utf-8"));
    } catch {
      return null;
    }
  }

  async function write<T>(fn: (store: Record<string, unknown>) => T): Promise<T> {
    let resolve!: () => void;
    const next = new Promise<void>((r) => { resolve = r; });
    const prev = writeLock;
    writeLock = next;

    try {
      await prev;
      ensureDir();
      const store = read() || {};
      const result = fn(store);
      writeFileSync(tmpFile, JSON.stringify(store, null, 2), "utf-8");
      renameSync(tmpFile, dataFile);
      return result;
    } finally {
      resolve();
    }
  }

  return { read, write };
}

const mainStore = createJsonStore("store.json");
const gptStore = createJsonStore("gpt-store.json");
const groupStore = createJsonStore("group-store.json");

export const readStore = mainStore.read;
export const withStore = mainStore.write;
export const readGptStore = gptStore.read;
export const withGptStore = gptStore.write;
export const readGroupStore = groupStore.read;
export const withGroupStore = groupStore.write;
