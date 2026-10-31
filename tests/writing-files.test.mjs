import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, truncate } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./helpers/resolve-typescript.mjs";

const { snapshotWritingFiles, exportWritingFiles, readWritingDownload } = await import("../app/lib/writing-files.ts");

test("download exports only changed documents and preserves each reply's immutable version", async () => {
  const root = await mkdtemp(join(tmpdir(), "iooi-writing-files-"));
  const workspace = join(root, "work");
  const artifacts = join(root, "private");
  try {
    await mkdir(workspace);
    await writeFile(join(workspace, "原始模板.txt"), "keep original");
    const before = await snapshotWritingFiles(workspace);
    await mkdir(join(workspace, "草稿"));
    const name = join("草稿", "开题报告.docx");
    const original = await readFile(new URL("./fixtures/chat-files/sample.docx", import.meta.url));
    await writeFile(join(workspace, name), original);
    await mkdir(join(workspace, ".venv"));
    await writeFile(join(workspace, ".venv", "not-for-download.txt"), "hidden");
    await writeFile(join(workspace, "not-a-deliverable.env"), "private");
    const result = await exportWritingFiles(before, workspace, artifacts);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].name, name);
    assert.deepEqual(result.warnings, []);
    const file = result.files[0];
    assert.deepEqual((await readWritingDownload(file.id, artifacts)).data, original);
    const next = await snapshotWritingFiles(workspace);
    await writeFile(join(workspace, name), "next version");
    const revised = await exportWritingFiles(next, workspace, artifacts);
    assert.equal(revised.files.length, 1);
    assert.notEqual(revised.files[0].id, file.id);
    assert.deepEqual((await readWritingDownload(file.id, artifacts)).data, original);
    assert.equal((await readWritingDownload(revised.files[0].id, artifacts)).data.toString(), "next version");
    assert.equal(await readFile(join(workspace, "原始模板.txt"), "utf8"), "keep original");
    assert.equal(await readWritingDownload("../../secret", artifacts), null);
    assert.equal((await exportWritingFiles(await snapshotWritingFiles(workspace), workspace, artifacts)).files.length, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("external directory links and oversized documents are not exported", async () => {
  const root = await mkdtemp(join(tmpdir(), "iooi-writing-limits-"));
  try {
    const workspace = join(root, "work");
    const outside = join(root, "outside");
    await mkdir(workspace);
    await mkdir(outside);
    await writeFile(join(outside, "private.txt"), "must not leave outside");
    const before = await snapshotWritingFiles(workspace);
    await symlink(outside, join(workspace, "outside-link"), process.platform === "win32" ? "junction" : "dir");
    await writeFile(join(workspace, "large.pdf"), "");
    await truncate(join(workspace, "large.pdf"), 26 * 1024 * 1024);
    const result = await exportWritingFiles(before, workspace, join(root, "private"));
    assert.deepEqual(result.files, []);
    assert.match(result.warnings.join(""), /25MB/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("download route requires the iooi header credential and sends a private attachment with its Chinese filename", async () => {
  const previousDirectory = process.cwd();
  const previousToken = process.env.IOOI_TOKEN;
  const root = await mkdtemp(join(tmpdir(), "iooi-writing-route-"));
  try {
    const workspace = join(root, "work");
    await mkdir(workspace);
    const before = await snapshotWritingFiles(workspace);
    const name = "开题报告（修改版）.docx";
    const original = await readFile(new URL("./fixtures/chat-files/sample.docx", import.meta.url));
    await writeFile(join(workspace, name), original);
    process.chdir(root);
    const { files } = await exportWritingFiles(before, workspace);
    const { GET } = await import("../app/api/writing/files/[id]/route.ts");
    const params = { params: Promise.resolve({ id: files[0].id }) };
    process.env.IOOI_TOKEN = "writing-test-only-token";
    assert.equal((await GET(new Request("http://localhost/download"), params)).status, 401);
    assert.equal((await GET(new Request("http://localhost/download?t=writing-test-only-token"), params)).status, 401);
    const request = new Request("http://localhost/download", { headers: { "x-iooi-token": process.env.IOOI_TOKEN } });
    const response = await GET(request, params);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.match(response.headers.get("content-type"), /wordprocessingml/);
    assert.equal(decodeURIComponent(response.headers.get("content-disposition").split("UTF-8''")[1]), name);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), original);
    assert.equal((await GET(request, { params: Promise.resolve({ id: "..%2fsecret" }) })).status, 404);
    delete process.env.IOOI_TOKEN;
    assert.equal((await GET(request, params)).status, 401);
  } finally {
    process.chdir(previousDirectory);
    if (previousToken === undefined) delete process.env.IOOI_TOKEN;
    else process.env.IOOI_TOKEN = previousToken;
    await rm(root, { recursive: true, force: true });
  }
});
