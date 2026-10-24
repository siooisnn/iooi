import { openCapsule, sealCapsule, viewCapsules } from "@/app/lib/capsule-store";
import { capsuleDay } from "@/app/lib/capsules";

// Her window. Sealed bodies never leave the server, whoever wrote them.
const headers = { "Cache-Control": "no-store" };

export function GET() {
  try { return Response.json({ ok: true, today: capsuleDay(), letters: viewCapsules() }, { headers }); }
  catch { return Response.json({ ok: false, error: "时光胶囊暂时打不开，里面的信没有动。" }, { status: 500, headers }); }
}

export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 40_000) throw new Error("这封信太长了。");
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("请求不完整。");
    if (body.action === "seal") return Response.json({ ok: true, letter: await sealCapsule("her", body) }, { headers });
    if (body.action === "open") return Response.json({ ok: true, letter: await openCapsule("her", body.id) }, { headers });
    throw new Error("不认识这个操作。");
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "这次没成功。" }, { status: 400, headers });
  }
}
