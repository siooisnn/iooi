import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Exercise the actual POST handler, with no disk writes, model calls or network access.
const fixtureKey = Symbol.for("iooi.summer-chat-test");
const fixture = { store: {}, groupStore: {}, inputs: [], jobs: [], reply: "我在，继续聊。" };
globalThis[fixtureKey] = fixture;
const fixtureCode = 'const f = globalThis[Symbol.for("iooi.summer-chat-test")];';
const mocks = new Map([
  ["@/app/lib/store", `${fixtureCode}
    export const readStore = async () => f.store;
    export const withStore = async (fn) => fn(f.store);
    export const withGroupStore = async (fn) => fn(f.groupStore);`],
  ["@/app/lib/claude-code", `${fixtureCode}
    export const isClaudeCodeEnabled = () => true;
    export const normalizeClaudeCodeModel = (model) => model;
    export const runClaudeCodeChat = async (input) => {
      f.inputs.push(input);
      input.onTextDelta?.(f.reply);
      return { reply: f.reply, model: input.modelId, durationMs: 1, queueWaitMs: 0,
        webSearchUsed: false, usage: { input_tokens: 10, output_tokens: 5,
          cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
    };`],
  ["@/app/lib/claude-code-task", "export const isCodeProject = () => false; export const isCodeTaskRunning = () => false; export const runClaudeCodeTask = () => { throw new Error('Unexpected code task'); };"],
  ["@/app/lib/code-task-state", "export const startCodeTask = () => {}; export const updateCodeTask = () => {};"],
  ["@/app/lib/work-context", "export const workContextHistory = () => [];"],
  ["@/app/lib/code-release", "export const startCodeRelease = () => { throw new Error('Unexpected release'); };"],
  ["next/server", `${fixtureCode} export const after = (fn) => f.jobs.push(fn());`],
]);

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mocks.has(specifier)) {
      return { url: `data:text/javascript,${encodeURIComponent(mocks.get(specifier))}`, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      return { url: new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, shortCircuit: true };
    }
    if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts") && !specifier.endsWith(".ts")) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { POST } = await import("../app/api/chat/route.ts");

test("Summer failures do not block Claude replies or lose the round", async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  let failure;
  let failSearch = false;
  globalThis.fetch = async (url, init) => {
    const path = new URL(url).pathname;
    requests.push({ path, body: init?.body });
    assert.ok(init?.signal, "Summer calls remain bounded by an abort signal");
    if (failure === "http") return Response.json({ error: "unauthorized" }, { status: 401 });
    if (failure) throw failure;
    if (path === "/api/wake") return Response.json({ stable: "已读取的长期记忆", dynamic: "最近的记忆" });
    if (path === "/api/state") return Response.json({ layers: {}, xiazhi: [], xiaoshu_tail: [] });
    if (path === "/mcp") {
      if (failSearch) throw new TypeError("fetch failed");
      return Response.json({ result: { content: [{ type: "text", text: '{"ok":true}' }] } });
    }
    throw new Error(`Unexpected Summer endpoint: ${path}`);
  };
  function reset() {
    fixture.store = { sessions: [] };
    fixture.groupStore = { sessions: [] };
    fixture.inputs = [];
    fixture.jobs = [];
    fixture.reply = "我在，继续聊。";
    requests.length = 0;
    failure = undefined;
    failSearch = false;
  }
  async function chat(extra = {}) {
    const content = extra.content || "今天有点累";
    const response = await POST(new Request("http://iooi.test/api/chat", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modelId: "claude-sonnet-5", sessionId: "private-test",
        messages: [{ role: "user", content }], userMsg: { role: "user", content, roundId: "round-1" }, ...extra }),
    }));
    let data;
    if (extra.stream) {
      const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
      data = events.find((event) => event.type === "done");
      assert.ok(data, "stream ends with a successful final reply");
      await Promise.all(fixture.jobs);
    } else data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(fixture.inputs.length, 1, "the model is reached after a Summer failure");
    assert.equal(data.reply, "我在，继续聊。");
    return data;
  }
  try {
    for (const [name, error] of [
      ["DNS failure", new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } })],
      ["timeout", new DOMException("Summer timed out", "AbortError")],
      ["Summer authentication failure", "http"],
    ]) {
      await t.test(name, async () => {
        reset(); failure = error;
        const data = await chat();
        assert.equal(data.cache.summer_used, false);
        assert.match(data.cache.summer_calls[0].label, /本轮未读取记忆/);
        assert.match(fixture.inputs[0].messages.at(-1).content, /不要编造长期记忆/);
        const messages = fixture.store.sessions[0].messages;
        assert.ok(messages.some((msg) => msg.source === "summer_call" && /聊天继续/.test(msg.content)));
        assert.ok(messages.some((msg) => msg.role === "assistant" && msg.content === data.reply));
      });
    }
    await t.test("streamed private reply keeps outage notice even with quiet wake", async () => {
      reset(); failure = new TypeError("fetch failed");
      const data = await chat({ stream: true, quietSummerWake: true });
      assert.equal(data.cache.summer_used, false);
      assert.match(data.cache.summer_calls[0].label, /本轮未读取记忆/);
    });
    await t.test("group reply and notice are persisted", async () => {
      reset(); failure = new TypeError("fetch failed");
      const data = await chat({ skipPersist: true, groupSessionId: "group-test", groupSpeakerName: "酥酥" });
      const messages = fixture.groupStore.sessions[0].messages;
      assert.ok(messages.some((msg) => msg.source === "summer_call" && /本轮未读取记忆/.test(msg.content)));
      assert.ok(messages.some((msg) => msg.role === "assistant" && msg.content === data.reply));
    });
    await t.test("healthy Summer still injects memory", async () => {
      reset();
      const data = await chat();
      assert.equal(data.cache.summer_used, true);
      assert.match(fixture.inputs[0].systemPrompt, /已读取的长期记忆/);
      assert.ok(!data.cache.summer_calls.some((call) => /暂时/.test(call.label)));
    });
    await t.test("failed search preserves successful wake and distinguishes unavailable from no results", async () => {
      reset(); failSearch = true;
      const data = await chat({ content: "搜一下以前说过的事情" });
      assert.equal(data.cache.summer_used, true);
      assert.match(fixture.inputs[0].systemPrompt, /已读取的长期记忆/);
      assert.match(fixture.inputs[0].messages.at(-1).content, /不要把检索失败说成没有相关记录/);
      assert.match(data.cache.summer_calls.at(-1).label, /已保留本轮读取的记忆/);
    });
    await t.test("offline explicit write stays pending without attempted edits", async () => {
      reset(); failure = new TypeError("fetch failed");
      fixture.reply += '\n[summer_remember layer=xiazhi title="今天" weight=5]今天有点累[/summer_remember]';
      const data = await chat({ content: "把今天有点累写进 Summer" });
      assert.equal(data.cache.summer_writes, 0);
      assert.equal(data.cache.summer_write_proposals[0].status, "pending");
      assert.ok(!requests.some((req) => req.path === "/mcp"));
      assert.match(fixture.inputs[0].messages.at(-1).content, /尚未写入/);
    });
    await t.test("healthy explicit write continues to commit", async () => {
      reset();
      fixture.reply += '\n[summer_remember layer=xiazhi title="今天" weight=5]今天有点累[/summer_remember]';
      const data = await chat({ content: "把今天有点累写进 Summer" });
      assert.equal(data.cache.summer_writes, 1);
      assert.equal(data.cache.summer_write_proposals[0].status, "committed");
      assert.ok(requests.some((req) => req.path === "/mcp" && JSON.parse(req.body).params.name === "edit"));
    });
  } finally {
    globalThis.fetch = originalFetch;
    hooks.deregister();
    delete globalThis[fixtureKey];
  }
});
