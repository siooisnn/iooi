import { listArtworks, updateArtwork } from "@/app/lib/artwork-store";

const headers = { "Cache-Control": "no-store" };
export function GET() {
  try { return Response.json({ ok: true, items: listArtworks() }, { headers }); }
  catch { return Response.json({ ok: false, error: "作品盒暂时打不开，原作品没有动。" }, { status: 500, headers }); }
}
export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 450_000) throw new Error("这件作品太大了。");
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("请求不完整。");
    const result = await updateArtwork(body.action, body);
    return Response.json({ ok: true, result }, { headers });
  } catch (e) { return Response.json({ ok: false, error: e instanceof Error ? e.message : "这次没存上。" }, { status: 400, headers }); }
}
