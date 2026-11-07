import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./helpers/resolve-typescript.mjs";

const { uploadWritingFile } = await import("../app/lib/writing-upload.ts");
const { readWritingDownload } = await import("../app/lib/writing-files.ts");
const { callWritingTool } = await import("../app/lib/group-writing-tools.ts");
const { writingUploadMessage } = await import("../app/lib/writing-attachments.ts");

test("uploaded PDF/DOCX are readable by shared writing tools and have private immutable downloads", async () => {
  const root = await mkdtemp(join(tmpdir(), "iooi-writing-upload-"));
  const work = join(root, "work"), artifacts = join(root, "artifacts");
  await mkdir(work);
  try {
    const files = [];
    for (const ext of ["pdf", "docx"]) {
      const data = await readFile(new URL(`./fixtures/chat-files/sample.${ext}`, import.meta.url));
      const { file } = await uploadWritingFile(`参考资料.${ext}`, data, work, artifacts);
      files.push(file);
      assert.deepEqual(await readFile(join(work, file.name)), data);
      const scope = { sessionId: "writing-upload", speaker: "gpt" };
      assert.ok((await callWritingTool("writing_list", {}, scope, work)).files.includes(file.name));
      const read = await callWritingTool("writing_read", { path: file.name }, scope, work);
      assert.ok(read.content.length > 0);
      assert.match(read.sha256, /^[a-f0-9]{64}$/);
      await writeFile(join(work, file.name), "later workspace edit");
      assert.deepEqual((await readWritingDownload(file.id, artifacts)).data, data);
    }
    const message = writingUploadMessage("请读这两份资料", files);
    assert.ok(files.every((f) => message.includes(f.name)));
    assert.match(message, /已存入写写工作区/);
    assert.equal(writingUploadMessage("普通消息", []), "普通消息");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("concurrent same-name uploads and existing templates are preserved without partial visible files", async () => {
  const root = await mkdtemp(join(tmpdir(), "iooi-writing-collision-"));
  const work = join(root, "work"), artifacts = join(root, "artifacts");
  await mkdir(work);
  try {
    await writeFile(join(work, "原始模板.txt"), "original");
    const results = await Promise.all(["first", "second"].map((content) => uploadWritingFile("原始模板.txt", Buffer.from(content), work, artifacts)));
    assert.equal(await readFile(join(work, "原始模板.txt"), "utf8"), "original");
    assert.equal(new Set(results.map((r) => r.file.name)).size, 2);
    assert.deepEqual(new Set(await readdir(work)), new Set(["原始模板.txt", "原始模板（2）.txt", "原始模板（3）.txt"]));
    for (const { file } of results) assert.deepEqual(await readFile(join(work, file.name)), (await readWritingDownload(file.id, artifacts)).data);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("paths, hidden files, invalid formats and oversized uploads cannot create workspace files", async () => {
  const root = await mkdtemp(join(tmpdir(), "iooi-writing-upload-guard-"));
  const work = join(root, "work"), artifacts = join(root, "artifacts");
  await mkdir(work);
  try {
    for (const name of ["../escape.txt", "nested/file.txt", "nested\\file.txt", ".secret.txt", "bad\nname.txt", "script.exe", "old.doc"]) {
      await assert.rejects(uploadWritingFile(name, Buffer.from("content"), work, artifacts));
    }
    await assert.rejects(uploadWritingFile("bad.pdf", Buffer.from("not a PDF"), work, artifacts), { status: 422 });
    await assert.rejects(uploadWritingFile("big.txt", Buffer.alloc(10 * 1024 * 1024 + 1), work, artifacts), { status: 413 });
    assert.deepEqual(await readdir(work), []);
    const outside = join(root, "outside");
    await mkdir(outside);
    await symlink(outside, join(work, "linked.txt"), process.platform === "win32" ? "junction" : "dir");
    const { file } = await uploadWritingFile("linked.txt", Buffer.from("safe copy"), work, artifacts);
    assert.equal(file.name, "linked（2）.txt");
    assert.deepEqual(await readdir(outside), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("writing upload endpoint requires a configured header credential before parsing multipart data", async () => {
  const previous = process.env.IOOI_TOKEN;
  const { POST } = await import("../app/api/writing/upload/route.ts");
  try {
    process.env.IOOI_TOKEN = "writing-upload-test-token";
    assert.equal((await POST(new Request("http://localhost/api/writing/upload", { method: "POST" }))).status, 401);
    const form = new FormData();
    const response = await POST(new Request("http://localhost/api/writing/upload", { method: "POST", headers: { "x-iooi-token": process.env.IOOI_TOKEN }, body: form }));
    assert.equal(response.status, 400);
    delete process.env.IOOI_TOKEN;
    assert.equal((await POST(new Request("http://localhost/api/writing/upload", { method: "POST" }))).status, 401);
  } finally { if (previous === undefined) delete process.env.IOOI_TOKEN; else process.env.IOOI_TOKEN = previous; }
});
