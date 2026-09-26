import { persistCodeReleaseResult, readCodeReleaseState } from "@/app/lib/code-release";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = process.env.IOOI_TOKEN;
  if (!token || request.headers.get("x-iooi-token") !== token) {
    return Response.json({ error: "未授权" }, { status: 401 });
  }
  const sessionId = new URL(request.url).searchParams.get("sessionId") || "";
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(sessionId)) {
    return Response.json({ error: "会话无效" }, { status: 400 });
  }
  const task = readCodeReleaseState(sessionId);
  if (task) await persistCodeReleaseResult(sessionId, task);
  return Response.json({ task }, { headers: { "Cache-Control": "no-store" } });
}
