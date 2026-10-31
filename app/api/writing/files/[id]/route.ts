import { basename } from "node:path";
import { readWritingDownload } from "@/app/lib/writing-files";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = process.env.IOOI_TOKEN;
  if (!token || request.headers.get("x-iooi-token") !== token) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const result = await readWritingDownload(id);
  if (!result) return Response.json({ error: "文件不存在或无法读取" }, { status: 404 });
  const name = basename(result.file.name).replace(/\p{Cc}/gu, "");
  const encodedName = encodeURIComponent(name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(new Uint8Array(result.data), { headers: {
    "Content-Type": result.type,
    "Content-Length": String(result.data.length),
    "Content-Disposition": `attachment; filename="document"; filename*=UTF-8''${encodedName}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
