import { readStore } from "@/app/lib/store";
import { describePushResult, sendPushToAll } from "@/app/lib/push";

export const runtime = "nodejs";

export async function POST() {
  const settings = ((readStore()?.settings || {}) as Record<string, unknown>);
  const title = (settings.aiName as string) || "王酥酥";
  const result = await sendPushToAll({ title, body: "测试通知：能看到这条就说明推送是通的" });
  return Response.json({ ...result, summary: describePushResult(result) });
}
