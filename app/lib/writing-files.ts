import { constants } from "node:fs";
import { mkdir, open, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { extname, join, relative, sep } from "node:path";
import type { WritingFile } from "./writing-file-types";

export const WRITING_WORKSPACE = "/home/claude-iooi/workspaces/写写";
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_EXPORTS = 10;
const FILE_TYPES: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".rtf": "application/rtf",
};
type WorkspaceFile = { name: string; path: string; digest: string; size: number };
export type WritingSnapshot = Map<string, WorkspaceFile>;

function artifactsDirectory() {
  return join(process.cwd(), "data", "writing-files");
}

async function safeFile(path: string, root: string) {
  const actual = await realpath(path);
  if (!actual.startsWith(`${root}${sep}`)) throw new Error("文件不在写写目录内");
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error("不是普通文件");
    if (info.size > MAX_FILE_SIZE) return { size: info.size, data: null };
    const data = await handle.readFile();
    if (data.length > MAX_FILE_SIZE) return { size: data.length, data: null };
    return { size: data.length, data };
  } finally {
    await handle.close();
  }
}

export async function snapshotWritingFiles(workspace = WRITING_WORKSPACE): Promise<WritingSnapshot> {
  const root = await realpath(workspace);
  const snapshot: WritingSnapshot = new Map();
  let entries = 0;
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++entries > 10_000) throw new Error("写写文件过多，请先整理工作目录");
      if (entry.name.startsWith(".") || ["node_modules", "__pycache__"].includes(entry.name) || entry.isSymbolicLink()) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { await visit(path); continue; }
      if (!entry.isFile() || !FILE_TYPES[extname(entry.name).toLowerCase()]) continue;
      const file = await safeFile(path, root);
      const name = relative(root, path);
      snapshot.set(name, { name, path, size: file.size,
        digest: file.data ? createHash("sha256").update(file.data).digest("hex") : `oversize:${file.size}` });
    }
  }
  await visit(root);
  return snapshot;
}

// Save a private, immutable copy: an older reply always downloads that version,
// even after Claude edits or renames the working document in a later task.
export async function exportWritingFiles(before: WritingSnapshot, workspace = WRITING_WORKSPACE, destination = artifactsDirectory()) {
  const files: WritingFile[] = [];
  const warnings: string[] = [];
  const root = await realpath(workspace);
  const after = await snapshotWritingFiles(root);
  for (const [name, file] of after) {
    if (before.get(name)?.digest === file.digest) continue;
    if (files.length >= MAX_EXPORTS) {
      warnings.push("本轮修改文件较多，下载区最多显示 10 个；其余文件仍保留在写写文件夹。");
      break;
    }
    if (file.size > MAX_FILE_SIZE) {
      warnings.push(`「${name}」超过 25MB，未生成下载附件；原文件仍保留在写写文件夹。`);
      continue;
    }
    try {
      const { data } = await safeFile(file.path, root);
      if (!data) throw new Error("文件过大");
      const id = randomUUID();
      const metadata: WritingFile = { id, name, size: data.length };
      await mkdir(destination, { recursive: true, mode: 0o700 });
      await writeFile(join(destination, `${id}.bin`), data, { mode: 0o600, flag: "wx" });
      await writeFile(join(destination, `${id}.json`), JSON.stringify(metadata), { mode: 0o600, flag: "wx" });
      files.push(metadata);
    } catch {
      warnings.push(`「${name}」的下载附件暂未生成，原文件仍保留在写写文件夹。`);
    }
  }
  return { files, warnings };
}

export async function readWritingDownload(id: string, directory = artifactsDirectory()) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) return null;
  try {
    const file = JSON.parse(await readFile(join(directory, `${id}.json`), "utf8")) as WritingFile;
    if (file.id !== id || typeof file.name !== "string" || !FILE_TYPES[extname(file.name).toLowerCase()]) return null;
    const data = await readFile(join(directory, `${id}.bin`));
    if (data.length > MAX_FILE_SIZE || data.length !== file.size) return null;
    return { file, data, type: FILE_TYPES[extname(file.name).toLowerCase()] };
  } catch { return null; }
}
