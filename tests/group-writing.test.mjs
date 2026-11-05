import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, readdir, symlink, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import "./helpers/resolve-typescript.mjs";
const { callWritingTool, notePath } = await import("../app/lib/group-writing-tools.ts");
const { groupOptions, groupTargets } = await import("../app/lib/group-options.ts");
const { groupWritingMcp, groupWritingScope } = await import("../app/lib/group-writing-mcp.ts");
const { withWritingLock } = await import("../app/lib/writing-lock.ts");

test("window participants, @mentions and rotation never call an excluded member", () => {
  const names = { claude: "酥酥", gpt: "郁郁", deepseek: "DeepSeek" };
  assert.equal(groupOptions().gptModel, "openai/gpt-6.1-sol");
  assert.deepEqual(groupOptions({ participants: [] }).participants, []);
  assert.deepEqual(groupTargets("一起讨论", ["claude", "deepseek"], names, "claude"), ["deepseek", "claude"]);
  assert.deepEqual(groupTargets("@DeepSeek 看看", ["claude"], names), []);
  assert.deepEqual(groupTargets("@郁郁 @DeepSeek 看看", ["claude", "gpt", "deepseek"], names), ["gpt", "deepseek"]);
  assert.deepEqual(groupTargets("@claude 看看", ["gpt", "claude"], names), ["claude"]);
});

test("writing records, version checks, safe paths and DOCX edits preserve originals", async () => {
  const cwd = process.cwd();
  const root = await mkdtemp(join(tmpdir(), "iooi-group-writing-"));
  const workspace = join(root, "writing");
  await mkdir(workspace);
  await mkdir(join(root, "app/lib"), { recursive: true });
  await copyFile(resolve("app/lib/group-writing-docx.py"), join(root, "app/lib/group-writing-docx.py"));
  const claude = { sessionId: "group-one", speaker: "claude" };
  const gpt = { sessionId: "group-one", speaker: "gpt" };
  const another = { sessionId: "group-two", speaker: "gpt" };
  process.chdir(root);
  try {
    const call = (name, args, scope = claude) => callWritingTool(name, args, scope, workspace);
    await call("writing_write", { path: notePath(claude), content: "负责提纲" });
    const first = await call("writing_read", { path: notePath(claude) });
    assert.equal((await call("writing_read", { path: notePath(claude) }, gpt)).content, "负责提纲");
    await assert.rejects(call("writing_write", { path: notePath(claude), content: "冒改" }, gpt), /自己的记录/);
    await assert.rejects(call("writing_read", { path: notePath(claude) }, another), /本群/);
    await assert.rejects(call("writing_write", { path: notePath(claude), content: "未读取就覆盖" }), /新版本/);
    const raced = await Promise.allSettled([
      call("writing_write", { path: notePath(claude), content: "新提纲", expected_sha256: first.sha256 }),
      call("writing_write", { path: notePath(claude), content: "旧版本覆盖", expected_sha256: first.sha256 }),
    ]);
    assert.equal(raced.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal((await call("writing_read", { path: notePath(claude) })).content, "新提纲");
    assert.equal((await readdir(join(root, "data/group-writing-backups"))).length, 1);
    for (const path of ["../secret.md", ".venv/secret.md", "讨论记录/../secret.md", "C:/secret.md", "/secret.md"])
      await assert.rejects(call("writing_write", { path, content: "blocked" }));
    await symlink(root, join(workspace, "linked"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(call("writing_write", { path: "linked/leak.md", content: "blocked" }), /符号链接/);
    await call("writing_write", { path: notePath(another), content: "other group" }, another);
    const listing = await call("writing_list", {});
    assert.ok(listing.files.includes(notePath(claude)));
    assert.ok(!listing.files.includes(notePath(another)));

    const template = join(workspace, "template.docx");
    execFileSync(process.platform === "win32" ? "python" : "python3", ["-c", `import zipfile,sys
with zipfile.ZipFile(sys.argv[1],'w') as z:
 z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Old </w:t></w:r><w:r><w:t>title</w:t></w:r></w:p></w:body></w:document>')
 z.writestr('word/styles.xml','style-data')
`, template]);
    const original = await readFile(template);
    const result = await call("writing_docx", { template: "template.docx", target: "draft.docx", replacements: [{ old_text: "Old title", new_text: "New title" }] });
    assert.equal(result.ok, true);
    assert.deepEqual(await readFile(template), original);
    const xml = execFileSync(process.platform === "win32" ? "python" : "python3", ["-c", "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.read('word/styles.xml')==b'style-data'; print(z.read('word/document.xml').decode())", join(workspace, "draft.docx")]).toString();
    assert.match(xml, /New title/);
    assert.match(xml, /xmlns:w14=/);
    assert.match(xml, /mc:Ignorable="w14"/);
    assert.match(xml, /<w:b\s*\//);
    await assert.rejects(call("writing_docx", { template: "template.docx", target: "template.docx", replacements: [] }), /已有新版本/);
  } finally { process.chdir(cwd); await rm(root, { recursive: true, force: true }); }
});

test("writing MCP credentials bind the speaker and group; tampering fails", () => {
  const old = process.env.IOOI_TOKEN;
  process.env.IOOI_TOKEN = "test-only";
  try {
    const config = groupWritingMcp({ sessionId: "group-a", speaker: "deepseek" });
    const auth = config.servers.writing.headers.Authorization;
    assert.deepEqual(groupWritingScope(auth), { sessionId: "group-a", speaker: "deepseek" });
    assert.equal(groupWritingScope(auth + "x"), null);
    assert.ok(config.tools.every((name) => name.startsWith("mcp__writing__")));
  } finally { if (old === undefined) delete process.env.IOOI_TOKEN; else process.env.IOOI_TOKEN = old; }
});

test("writing rounds serialize across group and private work", async () => {
  const events = [];
  let release;
  const first = withWritingLock(async () => { events.push("first"); await new Promise((resolve) => { release = resolve; }); events.push("first-done"); });
  await new Promise((resolve) => setImmediate(resolve));
  const second = withWritingLock(async () => { events.push("second"); });
  assert.deepEqual(events, ["first"]);
  release(); await Promise.all([first, second]);
  assert.deepEqual(events, ["first", "first-done", "second"]);
});
