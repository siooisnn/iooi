import { randomUUID } from "node:crypto";
import { chown, link, realpath, stat, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { extractChatFile, MAX_CHAT_FILE_BYTES } from "./chat-files";
import { saveWritingDownload, WRITING_WORKSPACE } from "./writing-files";

export class WritingUploadError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

// Publish only complete files, and never replace an existing source or template.
export async function uploadWritingFile(name: string, data: Buffer, workspace = WRITING_WORKSPACE, destination?: string) {
  const extension = extname(name).toLowerCase();
  if (!name || name.startsWith(".") || /[\\/:<>"|?*\p{Cc}]/u.test(name) || /[. ]$/.test(name)
    || Buffer.byteLength(name) > 220) throw new WritingUploadError("文件名无效，请使用不含路径的文件名（最多 220 字节）", 400);
  if (![".pdf", ".docx", ".txt", ".md", ".csv"].includes(extension)) {
    throw new WritingUploadError("写写支持 PDF、DOCX、TXT、MD、CSV；旧 DOC 请另存为 DOCX", 415);
  }
  if (!data.length || data.length > MAX_CHAT_FILE_BYTES) throw new WritingUploadError("文件不能为空，单个文件最多 10MB", 413);
  let text: string;
  try { text = await extractChatFile(data, extension.slice(1)); }
  catch (error) { throw new WritingUploadError(error instanceof Error ? error.message : "文件无法读取", 422); }
  const root = await realpath(workspace);
  const owner = await stat(root);
  const temp = join(root, `.upload-${randomUUID()}.tmp`);
  try {
    await writeFile(temp, data, { mode: 0o600, flag: "wx" });
    if (process.platform !== "win32") await chown(temp, owner.uid, owner.gid);
    const stem = name.slice(0, -extension.length);
    for (let n = 1; n <= 100; n++) {
      const savedName = n === 1 ? name : `${stem}（${n}）${extension}`;
      try { await link(temp, join(root, savedName)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") continue; throw error; }
      // A private immutable download remains usable after later workspace edits.
      const file = await saveWritingDownload(savedName, data, destination);
      return { file, ...(text.includes("【文件过长") || text.includes("【后续页面未读取】")
        ? { warning: "原文件已完整保存；单次读取的文字有长度限制，可按需分段处理。" } : {}) };
    }
    throw new WritingUploadError("同名文件过多，请换个文件名", 409);
  } finally { await unlink(temp).catch(() => {}); }
}
