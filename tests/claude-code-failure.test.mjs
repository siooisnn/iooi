import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { registerHooks } from "node:module";
import "./helpers/resolve-typescript.mjs";
const { summarizeClaudeFailure } = await import("../app/lib/claude-reply-diagnostics.ts");

const fixture = { records: [], replies: [], children: [], run: () => {}, summarizeClaudeFailure };
globalThis[Symbol.for("iooi.claude-process-test")] = fixture;
fixture.spawn = () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.stdin.on("finish", () => setImmediate(() => fixture.run(child)));
  child.kill = () => true;
  fixture.children.push(child);
  return child;
};
const prefix = 'const f = globalThis[Symbol.for("iooi.claude-process-test")];';
const mocks = new Map([
  ["child_process", `${prefix} export const spawn = (...args) => f.spawn(...args);`],
  ["fs/promises", "export const writeFile = async () => {}; export const chown = async () => {}; export const unlink = async () => {};"],
  ["./claude-reply-diagnostics", `${prefix}
    export const recordClaudeFailure = (stdout, stderr, model, failure) => f.records.push(f.summarizeClaudeFailure(stdout, stderr, failure));
    export const recordClaudeReply = (...args) => f.replies.push(args);`],
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith("/app/lib/claude-code.ts") && mocks.has(specifier)) {
      return { url: `data:text/javascript,${encodeURIComponent(mocks.get(specifier))}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { runClaudeCodeChat } = await import("../app/lib/claude-code.ts");
const input = { systemPrompt: "PRIVATE_PROMPT", messages: [{ role: "user", content: "hello" }], modelId: "claude-opus-5-5" };
const close = (child, code) => { child.exitCode = code; child.emit("close", code, null); };

test("real Claude runner records each failure once, preserves streaming and never retries", async (t) => {
  async function scenario(run, phase, overrides = {}) {
    fixture.records = []; fixture.replies = []; fixture.children = []; fixture.run = run;
    await assert.rejects(runClaudeCodeChat({ ...input, ...overrides }));
    assert.equal(fixture.children.length, 1, "never auto-retries");
    assert.equal(fixture.records.length, 1);
    assert.equal(fixture.records[0].phase, phase);
    assert.equal(fixture.replies.length, 0, "failed result is not logged as reply text");
  }
  await t.test("nonzero exit with API error", async () => {
    await scenario((child) => { child.stderr.write("API Error: 403 permission_error PRIVATE"); close(child, 1); }, "exit");
    assert.deepEqual(fixture.records[0].httpStatuses, [403]);
  });
  await t.test("result error despite successful process exit", async () => {
    await scenario((child) => { child.stdout.write(JSON.stringify({ type: "result", is_error: true, errors: ["API Error: 429 rate_limit_error"] })); close(child, 0); }, "result");
    assert.deepEqual(fixture.records[0].httpStatuses, [429]);
  });
  await t.test("malformed response", async () => {
    await scenario((child) => { child.stdout.write("not json"); close(child, 0); }, "parse");
  });
  await t.test("spawn failure and later close do not double record", async () => {
    await scenario((child) => { child.emit("error", new Error("spawn ENOENT")); close(child, 1); }, "spawn");
  });
  await t.test("explicit abort", async () => {
    const controller = new AbortController();
    await scenario(() => controller.abort(), "abort", { signal: controller.signal });
  });
  await t.test("timeout", async () => {
    const old = process.env.CLAUDE_CODE_TIMEOUT_MS;
    process.env.CLAUDE_CODE_TIMEOUT_MS = "20";
    try { await scenario(() => {}, "timeout"); }
    finally { if (old === undefined) delete process.env.CLAUDE_CODE_TIMEOUT_MS; else process.env.CLAUDE_CODE_TIMEOUT_MS = old; }
  });
  await t.test("successful streaming is immediate and unchanged", async () => {
    fixture.records = []; fixture.replies = [];
    const chunks = [];
    fixture.run = (child) => {
      child.stdout.write(JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "hello" } } }) + "\n");
      assert.deepEqual(chunks, ["hello"], "text arrives before result/exit");
      child.stdout.write(JSON.stringify({ type: "result", is_error: false, result: "hello" }) + "\n");
      close(child, 0);
    };
    const result = await runClaudeCodeChat({ ...input, onTextDelta: (text) => chunks.push(text) });
    assert.equal(result.reply, "hello");
    assert.equal(fixture.records.length, 0);
    assert.equal(fixture.replies.length, 1);
  });
});
