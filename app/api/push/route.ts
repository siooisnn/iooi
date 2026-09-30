import { isStoredPushSubscription, loadVapidPublicKey, upsertSub } from "@/app/lib/push";

export const runtime = "nodejs";

// 前端用服务器当前的公钥订阅，避免密钥轮换后仍用旧 key 订阅导致推送被拒。
export async function GET() {
  return Response.json({ publicKey: loadVapidPublicKey() });
}

export async function POST(request: Request) {
  try {
    const subscription: unknown = await request.json();
    if (!isStoredPushSubscription(subscription)) {
      return Response.json({ ok: false }, { status: 400 });
    }
    upsertSub(subscription);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
