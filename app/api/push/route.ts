import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data");
const SUBS_FILE = join(DATA_DIR, "subscriptions.json");

function loadSubs(): unknown[] {
  if (!existsSync(SUBS_FILE)) return [];
  try { return JSON.parse(readFileSync(SUBS_FILE, "utf-8")); } catch { return []; }
}

function saveSubs(subs: unknown[]) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2), "utf-8");
}

export async function POST(request: Request) {
  try {
    const subscription = await request.json();
    const subs = loadSubs();
    
    // Check if already subscribed (by endpoint)
    const exists = subs.some((s: any) => s.endpoint === subscription.endpoint);
    if (!exists) {
      subs.push(subscription);
      saveSubs(subs);
    }
    
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
