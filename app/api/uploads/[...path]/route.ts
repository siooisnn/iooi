import { readFileSync, existsSync } from "fs";
import { join, resolve, sep } from "path";

const UPLOAD_DIR = resolve(process.cwd(), "uploads");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const filePath = resolve(join(UPLOAD_DIR, ...path));

  if (!filePath.startsWith(UPLOAD_DIR + sep) && filePath !== UPLOAD_DIR) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!existsSync(filePath)) {
    return new Response("Not found", { status: 404 });
  }

  const file = readFileSync(filePath);
  const ext = path[path.length - 1].split(".").pop()?.toLowerCase() || "";

  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
  };

  return new Response(file, {
    headers: {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000",
    },
  });
}
