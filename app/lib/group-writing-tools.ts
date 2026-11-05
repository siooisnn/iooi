import { createHash, randomUUID } from "node:crypto";
import { chown, lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extractChatFile } from "./chat-files";
import { WRITING_WORKSPACE } from "./writing-files";
import type { GroupSpeaker } from "./group-options";

export type WritingScope = { sessionId: string; speaker: GroupSpeaker };
export const notePath = (scope: WritingScope) => `讨论记录/${createHash("sha256").update(scope.sessionId).digest("hex").slice(0, 16)}/${scope.speaker}.md`;
const hash = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const schema = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []) => ({ name, description, inputSchema: { type: "object", properties, required, additionalProperties: false } });
export const WRITING_TOOLS = [
  schema("writing_list", "列出写写工作区可读材料和本群讨论记录，不修改文件。", {}),
  schema("writing_read", "读取 TXT/MD/CSV/PDF/DOCX，返回正文和 sha256。旧 DOC 请使用对应 DOCX。", { path: { type: "string" } }, ["path"]),
  schema("writing_write", "保存 MD/TXT/CSV 草稿或更新自己的讨论记录。更新已有文件必须传上次读取的 sha256；自动保留旧版本。不能修改其他成员记录。", { path: { type: "string" }, content: { type: "string" }, expected_sha256: { type: "string" } }, ["path", "content"]),
  schema("writing_docx", "从现有 DOCX 模板生成新的 DOCX 副本，精确替换文字并保留排版。每个 old_text 必须唯一。只新建 target，不覆盖模板。", { template: { type: "string" }, target: { type: "string" }, replacements: { type: "array", maxItems: 100, items: { type: "object", properties: { old_text: { type: "string" }, new_text: { type: "string" } }, required: ["old_text", "new_text"], additionalProperties: false } } }, ["template", "target", "replacements"]),
];

async function filePath(name: string, scope: WritingScope, root: string, writing = false) {
  if (!name || /[\\:\0]/.test(name) || name.split("/").some((part) => !part || part.startsWith(".") || ["node_modules", "__pycache__"].includes(part))) throw new Error("文件路径无效");
  const full = resolve(root, name);
  if (!full.startsWith(`${root}${sep}`)) throw new Error("文件不在写写工作区内");
  const parts = name.split("/");
  if (parts[0] === "讨论记录") {
    if (writing ? name !== notePath(scope) : !name.startsWith(`${dirname(notePath(scope)).replaceAll("\\", "/")}/`)) throw new Error("只能修改自己的记录，读取本群记录");
  }
  let cursor = root;
  for (const part of parts) {
    cursor = join(cursor, part);
    const info = await lstat(cursor).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; return null; });
    if (info?.isSymbolicLink()) throw new Error("不允许访问符号链接");
  }
  return full;
}

const fileLocks = ((globalThis as { __iooiWritingFiles?: Map<string, Promise<void>> }).__iooiWritingFiles ??= new Map());
export async function callWritingTool(name: string, args: Record<string, unknown>, scope: WritingScope, workspace = WRITING_WORKSPACE) {
  if (name !== "writing_write" && name !== "writing_docx") return runWritingTool(name, args, scope, workspace);
  const key = `${workspace}:${String(args.target || args.path || "")}`;
  const previous = fileLocks.get(key) || Promise.resolve();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  fileLocks.set(key, pending);
  await previous;
  try { return await runWritingTool(name, args, scope, workspace); }
  finally { release(); if (fileLocks.get(key) === pending) fileLocks.delete(key); }
}
async function runWritingTool(name: string, args: Record<string, unknown>, scope: WritingScope, workspace: string) {
  const root = await realpath(workspace);
  if (name === "writing_list") {
    const files: string[] = [];
    let visited = 0;
    async function visit(dir: string) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (++visited > 10_000) throw new Error("文件过多，请整理后再试");
        if (entry.name.startsWith(".") || ["node_modules", "__pycache__"].includes(entry.name) || entry.isSymbolicLink()) continue;
        const path = join(dir, entry.name);
        const rel = relative(root, path).replaceAll("\\", "/");
        if (rel.startsWith("讨论记录/") && !`${dirname(notePath(scope)).replaceAll("\\", "/")}/`.startsWith(`${rel}/`) && !rel.startsWith(`${dirname(notePath(scope)).replaceAll("\\", "/")}/`)) continue;
        if (entry.isDirectory()) await visit(path);
        else if (/\.(md|txt|csv|docx|pdf|doc)$/i.test(entry.name)) files.push(rel);
      }
    }
    await visit(root);
    return { files, own_record: notePath(scope) };
  }
  if (name === "writing_read") {
    const path = await filePath(String(args.path || ""), scope, root);
    const info = await lstat(path);
    if (!info.isFile() || info.size > 10 * 1024 * 1024) throw new Error("文件不可读或超过 10MB");
    const data = await readFile(path);
    return { path: args.path, sha256: hash(data), content: await extractChatFile(data, extname(path).slice(1).toLowerCase()) };
  }
  if (name === "writing_write" || name === "writing_docx") {
    const target = String(name === "writing_docx" ? args.target || "" : args.path || "");
    if (!(name === "writing_docx" ? /\.docx$/i : /\.(md|txt|csv)$/i).test(target)) throw new Error("文件类型不支持写入");
    const path = await filePath(target, scope, root, true);
    const info = await lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; return null; });
    if (info && (!info.isFile() || info.size > 2 * 1024 * 1024)) throw new Error("文件不可修改或过大");
    const old = info ? await readFile(path) : null;
    if (old && (name === "writing_docx" || args.expected_sha256 !== hash(old))) throw new Error("文件已有新版本，请重新读取；DOCX 请使用新的输出文件名");
    if (!old && args.expected_sha256) throw new Error("文件状态已改变，请重新读取");
    let data: Buffer;
    if (name === "writing_docx") {
      const template = await filePath(String(args.template || ""), scope, root);
      if (!/\.docx$/i.test(template)) throw new Error("模板必须是 DOCX");
      const result = await promisify(execFile)(process.platform === "win32" ? "python" : "python3", [join(process.cwd(), "app/lib/group-writing-docx.py"), template, JSON.stringify(args.replacements)], { encoding: "buffer", maxBuffer: 25 * 1024 * 1024, timeout: 30_000 });
      data = result.stdout;
    } else {
      if (typeof args.content !== "string" || !args.content.trim()) throw new Error("内容不能为空");
      data = Buffer.from(args.content);
    }
    if (data.length > 2 * 1024 * 1024) throw new Error("输出文件过大");
    if (old) {
      const backups = join(process.cwd(), "data/group-writing-backups");
      await mkdir(backups, { recursive: true, mode: 0o700 });
      await writeFile(join(backups, `${randomUUID()}.json`), JSON.stringify({ path: target, content: old.toString("base64"), sha256: hash(old) }), { flag: "wx", mode: 0o600 });
    }
    const owner = await lstat(root);
    let parent = root;
    for (const part of relative(root, dirname(path)).split(sep).filter(Boolean)) {
      parent = join(parent, part);
      const created = await mkdir(parent, { mode: 0o700 }).then(() => true).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; return false; });
      if (created && process.platform !== "win32") await chown(parent, owner.uid, owner.gid);
    }
    await filePath(target, scope, root, true);
    const temp = join(dirname(path), `.writing-${randomUUID()}.tmp`);
    await writeFile(temp, data, { flag: "wx", mode: 0o600 });
    if (process.platform !== "win32") await chown(temp, owner.uid, owner.gid);
    await rename(temp, path);
    return { ok: true, path: target, sha256: hash(data), bytes: data.length };
  }
  throw new Error("未开放的写写工具");
}

export async function writingRecord(scope: WritingScope, workspace = WRITING_WORKSPACE) {
  try { return (await callWritingTool("writing_read", { path: notePath(scope) }, scope, workspace)) as { content: string; sha256: string }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
