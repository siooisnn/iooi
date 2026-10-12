import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data");

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function createJsonStore(filename: string, privateFile = false) {
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
      writeFileSync(tmpFile, JSON.stringify(store, null, 2), { encoding: "utf-8", ...(privateFile ? { mode: 0o600 } : {}) });
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
const contextStore = createJsonStore("context-snapshots.json", true);
const mcpAuthStore = createJsonStore("mcp-oauth.json", true);
// The bookshelf without the book text; each text is its own file (reading-shelf.ts).
const readingStore = createJsonStore("reading.json");
// Our little forum (the surf app): his finds online, her replies.
const surfStore = createJsonStore("surf.json");
// Her wardrobe: original photos, notes and the selected outfit.
const wardrobeStore = createJsonStore("wardrobe.json");
// Susu's phone stores decoration only. Notes and albums are reserved for later;
// no second bookshelf, forum, blog, signature or heartbeat log lives here.
const phoneSettingsStore = createJsonStore("phone_settings.json");

export const readStore = mainStore.read;
export const withStore = mainStore.write;
export const readGptStore = gptStore.read;
export const withGptStore = gptStore.write;
export const readGroupStore = groupStore.read;
export const withGroupStore = groupStore.write;
export const readContextStore = contextStore.read;
export const withContextStore = contextStore.write;
export const readMcpAuthStore = mcpAuthStore.read;
export const withMcpAuthStore = mcpAuthStore.write;
export const readReadingStore = readingStore.read;
export const withReadingStore = readingStore.write;
export const readSurfStore = surfStore.read;
export const withSurfStore = surfStore.write;
export const readWardrobeStore = wardrobeStore.read;
export const withWardrobeStore = wardrobeStore.write;
export const readPhoneSettingsStore = phoneSettingsStore.read;
export const withPhoneSettingsStore = phoneSettingsStore.write;
export const DATA_DIR_PATH = DATA_DIR;
