import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const UPLOAD_DIR = join(process.cwd(), "uploads");
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
};

export async function POST(request: Request) {
  try {
    if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return Response.json({ error: "没有文件" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return Response.json({ error: "文件太大，最多10MB" }, { status: 413 });
    }

    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return Response.json(
        { error: "不支持的文件类型，支持：图片、PDF、TXT、MD、CSV" },
        { status: 415 }
      );
    }

    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filepath = join(UPLOAD_DIR, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(filepath, buffer);

    return Response.json({
      url: `/uploads/${filename}`,
      name: file.name,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    return Response.json({ error: "上传失败" }, { status: 500 });
  }
}
