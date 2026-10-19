import { changeClawd, initializeClawd, readClawd } from "@/app/lib/clawd-store";
import { talkToClawd } from "@/app/lib/clawd-chat";

const headers = { "Cache-Control": "no-store" };
export const maxDuration = 60;
export async function GET() {
  try { return Response.json({ ok: true, ...readClawd() }, { headers }); }
  catch { return Response.json({ ok: false, error: "小砖的存档暂时打不开，原来的记录没有动。" }, { status: 500, headers }); }
}
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.action !== "string") return Response.json({ ok: false, error: "请求不完整。" }, { status: 400, headers });
  try {
    const result = body.action === "initialize" ? await initializeClawd(body.pet, body.visits)
      : body.action === "talk" ? await talkToClawd(body.text, "her", body.requestId)
      : await changeClawd(body.action, { slot: body.slot, id: body.id }, "her", body.requestId);
    return Response.json({ ok: true, ...result }, { headers });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "小砖暂时没回应。" }, { status: 400, headers });
  }
}
