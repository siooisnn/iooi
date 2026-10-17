import { executeDayday, readDayday } from "@/app/lib/dayday-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Heartbeat settles allowances. Reading the management UI has no financial side effects.
  try { return Response.json({ ok: true, state: readDayday() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ ok: false, error: "dayday 账本暂时无法读取，请保留数据并检查服务。" }, { status: 500 }); }
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || typeof body.action !== "string" || body.action === "tick") return Response.json({ ok: false, error: "请求不完整。" }, { status: 400 });
    const result = await executeDayday(body.action, body, true);
    return Response.json(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ ok: false, error: "dayday 保存失败，请刷新确认后重试。" }, { status: 500 }); }
}
