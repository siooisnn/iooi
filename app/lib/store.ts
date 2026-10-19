import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data");
// Next route bundles can load this module separately; serialize by absolute file
// across those bundles too (the app runs one PM2 process).
const storeLocks = ((globalThis as { __iooiStoreLocks?: Map<string, Promise<void>> }).__iooiStoreLocks ??= new Map());

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function createJsonStore(filename: string, privateFile = false) {
  const dataFile = join(DATA_DIR, filename);
  const tmpFile = join(DATA_DIR, filename.replace(/\.json$/i, ".tmp.json"));

  function read(): Record<string, unknown> | null {
    ensureDir();
    if (!existsSync(dataFile)) return null;
    try {
      const parsed = JSON.parse(readFileSync(dataFile, "utf-8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid store");
      return parsed;
    } catch {
      // The main store holds every chat and log. An unreadable file must not
      // be replaced with a fresh, empty store on the next write.
      if (filename === "store.json") throw new Error("主数据文件无法读取，已停止写入以保护现有数据。");
      return null;
    }
  }

  async function write<T>(fn: (store: Record<string, unknown>) => T): Promise<T> {
    let resolve!: () => void;
    const next = new Promise<void>((r) => { resolve = r; });
    const prev = storeLocks.get(dataFile) || Promise.resolve();
    storeLocks.set(dataFile, next);

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
export const readPhoneSettingsStore = phoneSettingsStore.read;
export const withPhoneSettingsStore = phoneSettingsStore.write;
export const DATA_DIR_PATH = DATA_DIR;
