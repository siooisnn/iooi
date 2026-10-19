import { addSticker, changeSticker, readStickers } from "@/app/lib/sticker-store";
import { STICKER_BYTES } from "@/app/lib/stickers";

const headers = { "Cache-Control": "no-store" };
export function GET() {
  try { return Response.json({ ok: true, stickers: readStickers() }, { headers }); }
  catch { return Response.json({ ok: false, error: "表情库暂时打不开，请稍后再试。" }, { status: 500, headers }); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size > STICKER_BYTES) throw new Error("请选择5MB以内的表情图片。");
      const name = form.get("name") || file.name.replace(/\.[^.]+$/, "").slice(0, 32) || "表情";
      const sticker = await addSticker(new Uint8Array(await file.arrayBuffer()), String(name));
      return Response.json({ ok: true, sticker, stickers: readStickers() }, { headers });
    }
    const body = await request.json();
    await changeSticker(body.action, body.id, body.name);
    return Response.json({ ok: true, stickers: readStickers() }, { headers });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "表情包没存上，请稍后再试。" }, { status: 400, headers });
  }
}
