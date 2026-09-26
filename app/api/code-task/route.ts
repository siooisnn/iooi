import { getCodeTaskState } from "@/app/lib/code-task-state";

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
  return Response.json({ task: getCodeTaskState(sessionId) }, {
    headers: { "Cache-Control": "no-store" },
  });
}
