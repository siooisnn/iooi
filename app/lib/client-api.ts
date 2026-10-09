
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}


// ── Storage ──
export function loadLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch { return fallback; }
}

export function loadLocalRaw<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

export function saveLocal(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── 小窝门锁:所有API请求自动带钥匙 ──
export function getToken() {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem("iooi-token") || ""; } catch { return ""; }
}
export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    headers: { ...(init.headers || {}), "x-iooi-token": getToken() },
  });
}

export async function apiFetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15_000
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await apiFetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("summer 请求超时，请重试");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Claude 与 GPT 使用完全分开的同步端点和防抖队列。
export function createServerSync(endpoint: string) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Record<string, unknown> = {};
  return {
    sync(data: Record<string, unknown>) {
      pending = { ...pending, ...data };
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const payload = pending;
        pending = {};
        timer = null;
        try {
          await apiFetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        } catch {}
      }, 500);
    },
    async fetch() {
      try {
        const res = await apiFetch(endpoint);
        if (res.status === 401) return "unauthorized" as const;
        if (res.ok) return await res.json();
      } catch {}
      return null;
    },
  };
}

export const claudeServerSync = createServerSync("/api/sync");
export const gptServerSync = createServerSync("/api/gpt/sync");
export const groupServerSync = createServerSync("/api/group/sync");
export const syncToServer = claudeServerSync.sync;
export const fetchFromServer = claudeServerSync.fetch;
export const syncGptToServer = gptServerSync.sync;
export const fetchGptFromServer = gptServerSync.fetch;
export const syncGroupToServer = groupServerSync.sync;
export const fetchGroupFromServer = groupServerSync.fetch;
