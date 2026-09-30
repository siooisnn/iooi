import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import webpush from "web-push";

const DATA_DIR = join(process.cwd(), "data");
const VAPID_FILE = join(DATA_DIR, "vapid.json");
const SUBS_FILE = join(DATA_DIR, "subscriptions.json");

export type StoredPushSubscription = PushSubscriptionJSON & { endpoint: string };
export type PushPayload = { title: string; body: string };
export type PushResult = { total: number; sent: number; removed: number; failed: number; error?: string };

export function isStoredPushSubscription(value: unknown): value is StoredPushSubscription {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as Record<string, unknown>).endpoint === "string";
}

export function loadSubs(): StoredPushSubscription[] {
  if (!existsSync(SUBS_FILE)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(SUBS_FILE, "utf-8"));
    return Array.isArray(parsed) ? parsed.filter(isStoredPushSubscription) : [];
  } catch {
    return [];
  }
}

export function saveSubs(subs: StoredPushSubscription[]) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2), "utf-8");
}

/** 同一个端点重复订阅时替换为最新的 keys；返回是否有变化。 */
export function upsertSub(subscription: StoredPushSubscription): boolean {
  const subs = loadSubs();
  const index = subs.findIndex((stored) => stored.endpoint === subscription.endpoint);
  if (index >= 0 && JSON.stringify(subs[index]) === JSON.stringify(subscription)) return false;
  if (index >= 0) subs[index] = subscription;
  else subs.push(subscription);
  saveSubs(subs);
  return true;
}

export function loadVapidPublicKey(): string | null {
  const vapid = loadVapid();
  return vapid?.publicKey || null;
}

function loadVapid(): { publicKey: string; privateKey: string } | null {
  if (!existsSync(VAPID_FILE)) return null;
  try {
    const parsed = JSON.parse(readFileSync(VAPID_FILE, "utf-8"));
    if (typeof parsed?.publicKey === "string" && typeof parsed?.privateKey === "string") return parsed;
  } catch {}
  return null;
}

// 404/410 表示推送服务已经作废了这个订阅（iOS 重装、清缓存、长时间未打开等），留着只会每次都失败。
function isGoneStatus(status: unknown) {
  return status === 404 || status === 410;
}

export async function sendPushToAll(payload: PushPayload): Promise<PushResult> {
  const vapid = loadVapid();
  if (!vapid) return { total: 0, sent: 0, removed: 0, failed: 0, error: "缺少推送密钥" };
  const subs = loadSubs();
  if (subs.length === 0) return { total: 0, sent: 0, removed: 0, failed: 0, error: "没有已订阅的设备" };

  webpush.setVapidDetails("mailto:iooi@sioois.cc", vapid.publicKey, vapid.privateKey);
  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.map((sub) => webpush.sendNotification(sub, body, { TTL: 6 * 3600, urgency: "high" }))
  );

  const gone = new Set<string>();
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      sent += 1;
      return;
    }
    const status = (result.reason as { statusCode?: number } | undefined)?.statusCode;
    if (isGoneStatus(status)) {
      gone.add(subs[i].endpoint);
    } else {
      failed += 1;
      errors.push(status ? `HTTP ${status}` : "网络错误");
    }
  });

  if (gone.size > 0) {
    // 重新读取，避免覆盖发送期间新加的订阅。
    saveSubs(loadSubs().filter((sub) => !gone.has(sub.endpoint)));
  }

  return {
    total: subs.length,
    sent,
    removed: gone.size,
    failed,
    ...(errors.length ? { error: [...new Set(errors)].join("、") } : {}),
  };
}

export function describePushResult(result: PushResult): string {
  if (result.total === 0) return `推送未发出：${result.error || "没有设备"}`;
  const parts = [`推送 ${result.sent}/${result.total}`];
  if (result.removed) parts.push(`清理失效订阅 ${result.removed}`);
  if (result.failed) parts.push(`失败 ${result.failed}${result.error ? `（${result.error}）` : ""}`);
  if (result.sent === 0 && result.removed === result.total) parts.push("请在设置里重新开启通知");
  return parts.join("，");
}
