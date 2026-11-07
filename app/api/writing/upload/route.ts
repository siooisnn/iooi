import { MAX_CHAT_FILE_BYTES } from "@/app/lib/chat-files";
import { uploadWritingFile, WritingUploadError } from "@/app/lib/writing-upload";
import { withWritingLock } from "@/app/lib/writing-lock";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = process.env.IOOI_TOKEN;
  if (!token || request.headers.get("x-iooi-token") !== token) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "没有文件" }, { status: 400 });
    if (file.size > MAX_CHAT_FILE_BYTES) return Response.json({ error: "文件太大，最多 10MB" }, { status: 413 });
    const data = Buffer.from(await file.arrayBuffer());
    const result = await withWritingLock(() => uploadWritingFile(file.name, data));
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof WritingUploadError ? error.message : "文件未能完成保存，请稍后重试" },
      { status: error instanceof WritingUploadError ? error.status : 500 });
  }
}
