import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data");
const SUBS_FILE = join(DATA_DIR, "subscriptions.json");

type StoredPushSubscription = PushSubscriptionJSON & { endpoint: string };

function isStoredPushSubscription(value: unknown): value is StoredPushSubscription {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as Record<string, unknown>).endpoint === "string";
}

function loadSubs(): StoredPushSubscription[] {
  if (!existsSync(SUBS_FILE)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(SUBS_FILE, "utf-8"));
    return Array.isArray(parsed) ? parsed.filter(isStoredPushSubscription) : [];
  } catch {
    return [];
  }
}

function saveSubs(subs: StoredPushSubscription[]) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2), "utf-8");
}

export async function POST(request: Request) {
  try {
    const subscription: unknown = await request.json();
    if (!isStoredPushSubscription(subscription)) {
      return Response.json({ ok: false }, { status: 400 });
    }
    const subs = loadSubs();
    
    // Check if already subscribed (by endpoint)
    const exists = subs.some((stored) => stored.endpoint === subscription.endpoint);
    if (!exists) {
      subs.push(subscription);
      saveSubs(subs);
    }
    
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
