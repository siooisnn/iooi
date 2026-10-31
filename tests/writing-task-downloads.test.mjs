import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const key = Symbol.for("iooi.writing-download-test");
const fixture = { store: {}, jobs: [], workspace: "", run: null };
globalThis[key] = fixture;
const setup = 'const f = globalThis[Symbol.for("iooi.writing-download-test")];';
const actualFilesURL = new URL("../app/lib/writing-files.ts", import.meta.url).href;
const mocks = new Map([
  ["@/app/lib/store", `${setup} export const readStore = () => f.store; export const withStore = async fn => fn(f.store); export const withGroupStore = async fn => fn({});`],
  ["@/app/lib/claude-code", "export const isClaudeCodeEnabled = () => true; export const normalizeClaudeCodeModel = value => value; export const runClaudeCodeChat = () => { throw new Error('unexpected ordinary chat'); };"],
  ["@/app/lib/claude-code-task", `${setup}
    export const isCodeProject = project => project === 'writing';
    export const isCodeTaskRunning = () => false;
    export const runClaudeCodeTask = async input => {
      try { await input.onBeforeTask?.(); return await f.run(input); }
      finally { await input.onAfterTask?.(); }
    };`],
  ["@/app/lib/writing-files", `${setup} const actual = await import(${JSON.stringify(actualFilesURL)});
    export const snapshotWritingFiles = () => actual.snapshotWritingFiles(f.workspace);
    export const exportWritingFiles = before => actual.exportWritingFiles(before, f.workspace);`],
  ["@/app/lib/code-task-state", "export const startCodeTask = async () => {}; export const updateCodeTask = async () => {};"],
  ["@/app/lib/work-context", "export const workContextHistory = () => [];"],
  ["@/app/lib/code-release", "export const startCodeRelease = () => { throw new Error('unexpected release'); };"],
  ["next/server", `${setup} export const after = fn => f.jobs.push(fn());`],
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mocks.has(specifier)) return { url: `data:text/javascript,${encodeURIComponent(mocks.get(specifier))}`, shortCircuit: true };
    if (specifier.startsWith("@/")) return { url: new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, shortCircuit: true };
    if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts") && !specifier.endsWith(".ts")) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { POST } = await import("../app/api/chat/route.ts");
const { readChatResponse } = await import("../app/lib/chat-stream.ts");
const { readWritingDownload } = await import("../app/lib/writing-files.ts");

test("writing replies persist download cards, including partial files after failure or browser disconnect", async () => {
  const originalDirectory = process.cwd();
  const originalToken = process.env.IOOI_TOKEN;
  const originalEnabled = process.env.IOOI_CODE_ENABLED;
  const root = await mkdtemp(join(tmpdir(), "iooi-writing-task-"));
  fixture.workspace = join(root, "work");
  try {
    await mkdir(fixture.workspace);
    await writeFile(join(fixture.workspace, "template.txt"), "original template");
    process.chdir(root);
    process.env.IOOI_TOKEN = "writing-route-test-only";
    process.env.IOOI_CODE_ENABLED = "true";
    async function request(roundId) {
      return POST(new Request("http://localhost/api/chat", {
        method: "POST", headers: { "x-iooi-token": process.env.IOOI_TOKEN },
        body: JSON.stringify({ sessionId: "writing-test", messages: [], codeMode: { project: "writing" },
          userMsg: { role: "user", content: "请写草稿", roundId }, modelId: "claude-sonnet-5" }),
      }));
    }
    fixture.run = async () => {
      await writeFile(join(fixture.workspace, "开题草稿.md"), "first draft");
      return "草稿写好了。\n\n请看看。";
    };
    const data = await readChatResponse(await request("first"), () => {});
    await Promise.all(fixture.jobs);
    assert.equal(data.status, 200);
    assert.equal(data.writingFiles.length, 1);
    const first = fixture.store.sessions[0].messages.find(message => message.role === "assistant" && message.roundId === "first");
    assert.deepEqual(first.writingFiles, data.writingFiles);
    assert.equal(first.source, "code_task_writing");
    assert.equal((await readWritingDownload(first.writingFiles[0].id)).data.toString(), "first draft");

    fixture.run = async () => {
      await writeFile(join(fixture.workspace, "未完成草稿.md"), "partial draft");
      throw new Error("simulated interruption");
    };
    const failed = await readChatResponse(await request("partial"), () => {});
    await Promise.all(fixture.jobs);
    assert.equal(failed.status, 502);
    assert.equal(failed.writingFiles.length, 1);
    const partial = fixture.store.sessions[0].messages.find(message => message.role === "assistant" && message.roundId === "partial");
    assert.deepEqual(partial.writingFiles, failed.writingFiles);
    assert.match(partial.content, /未完成/);

    fixture.run = async () => {
      await writeFile(join(fixture.workspace, "开题草稿.md"), "revised after disconnect");
      return "已修改。";
    };
    const response = await request("disconnected");
    await response.body.cancel();
    await Promise.all(fixture.jobs);
    const recovered = fixture.store.sessions[0].messages.find(message => message.role === "assistant" && message.roundId === "disconnected");
    assert.equal(recovered.writingFiles.length, 1);
    assert.equal((await readWritingDownload(recovered.writingFiles[0].id)).data.toString(), "revised after disconnect");
    assert.equal((await readWritingDownload(first.writingFiles[0].id)).data.toString(), "first draft");
    assert.equal(fixture.store.sessions[0].messages.filter(message => message.writingFiles?.length).length, 3);
  } finally {
    process.chdir(originalDirectory);
    if (originalToken === undefined) delete process.env.IOOI_TOKEN; else process.env.IOOI_TOKEN = originalToken;
    if (originalEnabled === undefined) delete process.env.IOOI_CODE_ENABLED; else process.env.IOOI_CODE_ENABLED = originalEnabled;
    await rm(root, { recursive: true, force: true });
    delete globalThis[key];
  }
});
