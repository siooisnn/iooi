import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { inspectAudioUpload } from "@/app/lib/audio-upload";

const UPLOAD_DIR = join(process.cwd(), "uploads");
const MAX_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  // Songs for the blog's music player.
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

// Some pickers omit the MIME; use the extension to select the audio checks.
const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "aac", "wav"]);

function fileExtension(file: File) {
  const byType = ALLOWED_TYPES[file.type];
  if (byType) return byType;
  const byName = file.name.split(".").pop()?.toLowerCase() || "";
  return !file.type || file.type === "application/octet-stream"
    ? AUDIO_EXTENSIONS.has(byName) ? byName : undefined
    : undefined;
}

export async function POST(request: Request) {
  try {
    if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!(file instanceof File)) {
      return Response.json({ error: "没有文件" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return Response.json({ error: "文件太大，最多10MB" }, { status: 413 });
    }

    let ext = fileExtension(file);
    if (!ext) {
      return Response.json(
        { error: "不支持的文件类型，支持：图片、PDF、TXT、MD、CSV、MP3、M4A、AAC、WAV" },
        { status: 415 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let type = file.type;
    if (AUDIO_EXTENSIONS.has(ext)) {
      const audio = inspectAudioUpload(buffer);
      if ("error" in audio) return Response.json(audio, { status: 415 });
      ext = audio.extension;
      type = audio.type;
    }

    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filepath = join(UPLOAD_DIR, filename);

    writeFileSync(filepath, buffer);

    return Response.json({
      url: `/uploads/${filename}`,
      name: file.name,
      size: file.size,
      type,
    });
  } catch {
    return Response.json({ error: "上传失败" }, { status: 500 });
  }
}
