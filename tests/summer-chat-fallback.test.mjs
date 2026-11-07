import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Exercise the actual POST handler, with no disk writes, model calls or network access.
const fixtureKey = Symbol.for("iooi.summer-chat-test");
const fixture = { store: {}, groupStore: {}, inputs: [], jobs: [], steps: [], reply: "我在，继续聊。" };
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
      for (const character of f.reply) input.onTextDelta?.(character);
      input.onSteps?.(f.steps);
      if (f.failAfterSteps) throw new Error("generation interrupted after a tool call");
      return { reply: f.reply, steps: f.steps, model: input.modelId, durationMs: 1, queueWaitMs: 0,
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
  let safeTools = true;
  globalThis.fetch = async (url, init) => {
    const path = new URL(url).pathname;
    requests.push({ path, body: init?.body });
    assert.ok(init?.signal, "Summer calls remain bounded by an abort signal");
    if (failure === "http") return Response.json({ error: "unauthorized" }, { status: 401 });
    if (failure) throw failure;
    if (path === "/api/wake") return Response.json({ stable: "已读取的长期记忆", dynamic: "最近的记忆" });
    if (path === "/api/state") return Response.json({ layers: {}, xiazhi: [], xiaoshu_tail: [] });
    if (path === "/mcp") {
      if (JSON.parse(init.body).method === "tools/list") return Response.json({ result: { tools: safeTools ? [
        { name: "edit", inputSchema: { properties: { old_content: { type: "string" } } } },
      ] : [] } });
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
    fixture.steps = [];
    fixture.failAfterSteps = false;
    fixture.reply = "我在，继续聊。";
    requests.length = 0;
    failure = undefined;
    failSearch = false;
    safeTools = true;
  }
  async function chat(extra = {}, expectedReply = "我在，继续聊。") {
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
      assert.ok(!events.filter((event) => event.type === "delta").map((event) => event.text).join("").includes("iooi_nudge"));
      await Promise.all(fixture.jobs);
    } else data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(fixture.inputs.length, 1, "the model is reached after a Summer failure");
    assert.equal(data.reply, expectedReply);
    return data;
  }
  try {
    await t.test("Claude chooses to nudge with its reply, persisted without metadata", async () => {
      reset(); fixture.reply = "抖回来啦。[iooi_nudge]";
      const data = await chat({ stream: true, retroNudge: true,
        userMsg: { role: "user", content: "你发送了一个闪屏振动。", source: "chat_nudge", roundId: "nudge-1" } }, "抖回来啦。");
      assert.equal(data.nudge, true);
      assert.match(fixture.inputs[0].systemPrompt, /自行决定是否也抖/);
      const messages = fixture.store.sessions[0].messages;
      assert.equal(messages.filter((message) => message.role === "assistant" && message.source === "chat_nudge").length, 1);
      assert.ok(messages.every((message) => !message.content.includes("iooi_nudge")));
      assert.equal(messages.at(-1).roundId, "nudge-1");
    });
    await t.test("Claude can respond with text alone", async () => {
      reset();
      const data = await chat({ retroNudge: true, userMsg: { role: "user", content: "你发送了一个闪屏振动。", source: "chat_nudge", roundId: "nudge-2" } });
      assert.equal(data.nudge, false);
      assert.equal(fixture.store.sessions[0].messages.filter((message) => message.role === "assistant" && message.source === "chat_nudge").length, 0);
    });
    await t.test("ordinary and group replies cannot trigger nudges", async () => {
      for (const extra of [{}, { retroNudge: true }, { skipPersist: true, groupSessionId: "group-test", retroNudge: true,
        userMsg: { role: "user", content: "你发送了一个闪屏振动。", source: "chat_nudge" } }]) {
        reset(); fixture.reply = "我在。[iooi_nudge]";
        const data = await chat({ stream: true, ...extra }, "我在。");
        assert.equal(data.nudge, false);
        assert.doesNotMatch(fixture.inputs[0].systemPrompt, /自行决定是否也抖/);
        const messages = (extra.skipPersist ? fixture.groupStore : fixture.store).sessions[0].messages;
        assert.ok(!messages.some((message) => message.role === "assistant" && message.source === "chat_nudge"));
      }
    });
    await t.test("a nudge-only reply still saves its action and user event", async () => {
      reset(); fixture.reply = "[iooi_nudge]";
      const data = await chat({ retroNudge: true, userMsg: { role: "user", content: "你发送了一个闪屏振动。", source: "chat_nudge", roundId: "nudge-3" } }, "");
      assert.equal(data.nudge, true);
      assert.equal(fixture.store.sessions[0].messages.at(-1).source, "chat_nudge");
    });
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
    await t.test("group chat never reads Summer, even during a Summer outage", async () => {
      reset(); failure = new TypeError("fetch failed");
      const data = await chat({ skipPersist: true, groupSessionId: "group-test", groupSpeakerName: "酥酥" });
      const messages = fixture.groupStore.sessions[0].messages;
      assert.ok(!messages.some((msg) => msg.source === "summer_call"));
      assert.deepEqual(requests, []);
      assert.deepEqual(fixture.inputs[0].isolatedMcp, { servers: {}, tools: [] });
      assert.ok(messages.some((msg) => msg.role === "assistant" && msg.content === data.reply));
    });
    await t.test("healthy Summer still injects memory", async () => {
      reset();
      const data = await chat();
      assert.equal(data.cache.summer_used, true);
      assert.match(fixture.inputs[0].systemPrompt, /已读取的长期记忆/);
      assert.ok(!data.cache.summer_calls.some((call) => /暂时/.test(call.label)));
    });
    await t.test("search wording never triggers a backend Summer search", async () => {
      for (const content of [
        "搜一下以前说过的事情",
        "你网上搜一下我之前说的那家店",
        "帮我搜搜 train ticket",
        "搜一下 summer 里 10月3日 的小暑",
      ]) {
        reset(); failSearch = true;
        const data = await chat({ content });
        assert.equal(data.cache.summer_used, true);
        assert.match(fixture.inputs[0].systemPrompt, /已读取的长期记忆/);
        assert.ok(!requests.some((req) => req.path === "/mcp" && JSON.parse(req.body).method === "tools/call"), `no backend Summer tool call for: ${content}`);
        assert.ok(!data.cache.summer_calls.some((call) => /检索 summer|查小暑/.test(call.label)));
        assert.ok(!data.cache.summer_calls.some((call) => /暂时/.test(call.label)));
      }
    });
    await t.test("offline private write makes no pending proposal or edit", async () => {
      reset(); failure = new TypeError("fetch failed");
      fixture.reply += '\n[summer_remember layer=xiazhi title="今天" weight=5]今天有点累[/summer_remember]';
      const data = await chat({ content: "把今天有点累写进 Summer" });
      assert.equal(data.cache.summer_writes, 0);
      assert.deepEqual(data.cache.summer_write_proposals, []);
      assert.equal(fixture.inputs[0].summerTools, false);
      assert.ok(!requests.some((req) => req.path === "/mcp" && JSON.parse(req.body).method === "tools/call"));
    });
    await t.test("healthy private chat uses native tools and ignores legacy write markers", async () => {
      reset();
      fixture.reply += '\n[summer_remember layer=xiazhi title="今天" weight=5]今天有点累[/summer_remember]';
      const data = await chat({ content: "把今天有点累写进 Summer" });
      assert.equal(fixture.inputs[0].summerTools, true);
      assert.match(fixture.inputs[0].systemPrompt, /不需要她逐条确认/);
      assert.equal(data.cache.summer_writes, 0);
      assert.deepEqual(data.cache.summer_write_proposals, []);
      assert.ok(!requests.some((req) => req.path === "/mcp" && JSON.parse(req.body).method === "tools/call"));
    });
    await t.test("old Summer server keeps writes closed without a confirmation flow", async () => {
      reset(); safeTools = false;
      const data = await chat();
      assert.equal(fixture.inputs[0].summerTools, false);
      assert.match(fixture.inputs[0].systemPrompt, /只能查询/);
      assert.deepEqual(data.cache.summer_write_proposals, []);
    });
    await t.test("native mutation results survive streaming and history persistence", async () => {
      reset();
      fixture.steps = [{ kind: "tool", active: "在写入 Summer 小暑", done: "已写入 Summer 小暑", group: "summer_write", t: 10, ms: 5, status: "success",
        summerWrite: { action: "add", layer: "xiaoshu", title: "今天", content: "完成开题报告" } }];
      const data = await chat({ stream: true });
      assert.deepEqual(data.steps, fixture.steps);
      assert.deepEqual(fixture.store.sessions[0].messages.find((msg) => msg.role === "assistant" && msg.content === data.reply).steps, fixture.steps);
    });
    await t.test("group chat does not gain native write tools", async () => {
      reset();
      await chat({ skipPersist: true, groupSessionId: "group-test" });
      assert.equal(fixture.inputs[0].summerTools, false);
      assert.equal(fixture.inputs[0].chatTools, false);
      assert.ok(!requests.some((req) => req.path === "/mcp"));
    });
    await t.test("a later generation failure preserves successful and uncertain memory operations", async () => {
      reset(); fixture.failAfterSteps = true;
      fixture.steps = [
        { kind: "tool", active: "在写入 Summer 小暑", done: "已写入 Summer 小暑", group: "summer_write", t: 10, ms: 5, status: "success",
          summerWrite: { action: "add", layer: "xiaoshu", content: "已成功写入的内容" } },
        { kind: "tool", active: "在修改 Summer 立夏", done: "已修改 Summer 立夏", group: "summer_write", t: 20,
          summerWrite: { action: "update", layer: "lixia", oldContent: "旧片段", content: "替换片段" } },
      ];
      const response = await POST(new Request("http://iooi.test/api/chat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelId: "claude-sonnet-5", sessionId: "private-test", messages: [{ role: "user", content: "记下今天" }], userMsg: { role: "user", content: "记下今天", roundId: "partial-write" } }),
      }));
      const data = await response.json();
      assert.equal(response.status, 502);
      assert.deepEqual(data.steps.map((step) => step.status), ["success", "unknown"]);
      assert.deepEqual(data.steps.map((step) => step.summerWrite), fixture.steps.map((step) => step.summerWrite));
      assert.match(data.reply, /不要重复写入/);
      const saved = fixture.store.sessions[0].messages.find((msg) => msg.content === data.reply);
      assert.deepEqual(saved.steps, data.steps);
    });
  } finally {
    globalThis.fetch = originalFetch;
    hooks.deregister();
    delete globalThis[fixtureKey];
  }
});
