import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/resolve-typescript.mjs";

const { cleanReplySteps, createReplySteps, describeTool, stepLabel, summarizeSteps, summerWriteTitle } = await import("../app/lib/reply-steps.ts");

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms) => { now += ms; } };
}

const toolUse = (id, name, input = {}) => ({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } });
const toolResult = (id) => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: "secret output" }] } });

test("Summer write receipts retain submitted content and distinguish success, failure and interruption", () => {
  const steps = createReplySteps({ mode: "chat" });
  steps.event(toolUse("ok", "mcp__summer__edit", { action: "add", layer: "xiaoshu", title: "午后", content: "private memory" }));
  steps.event(toolResult("ok"));
  steps.event(toolUse("fail", "mcp__summer__edit", { action: "update", layer: "lixia" }));
  steps.event({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "fail", is_error: true, content: "private error" }] } });
  steps.event(toolUse("rpc", "mcp__summer__daily_review", { date: "2026-11-05" }));
  steps.event({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "rpc", content: [{ type: "text", text: '{"error":{"message":"private"}}' }] }] } });
  steps.event(toolUse("pending", "mcp__summer__edit", { action: "delete", layer: "rain" }));
  const done = steps.finish();
  assert.deepEqual(done.map(stepLabel), [
    "已写入 Summer 小暑：午后", "修改 Summer 立夏 · 失败", "写入 Summer 小暑回顾：2026-11-05 · 失败", "删除 Summer rain · 结果未确认",
  ]);
  assert.deepEqual(done.map((step) => step.status), ["success", "failed", "failed", "unknown"]);
  assert.equal(done[0].summerWrite.content, "private memory");
  assert.ok(!JSON.stringify(done).includes("private error"));
  assert.ok(!JSON.stringify(done).includes('"message":"private"'));
  const summary = summarizeSteps(done.slice(1), "chat");
  assert.doesNotMatch(summary, /更新了 Summer/);
  assert.match(summary, /失败/);
  assert.match(summary, /结果未确认/);
});

test("Summer receipts keep each same-title change, including before/after fragments and metadata-only updates", () => {
  const steps = createReplySteps({ mode: "chat" });
  for (const [id, content] of [["one", "first addition"], ["two", "second addition"]]) {
    steps.event(toolUse(id, "mcp__summer__edit", { action: "add", layer: "lixia", title: "同一标题", content, api_key: "must not copy" }));
    steps.event(toolResult(id));
  }
  steps.event(toolUse("change", "mcp__summer__edit", { action: "update", layer: "xiaoman", old_content: "old fragment", content: "new fragment" }));
  steps.event(toolResult("change"));
  steps.event(toolUse("meta", "mcp__summer__edit", { action: "update", layer: "rain", item_id: "rain-123", status: "done", weight: 8, tags: ["论文"] }));
  steps.event(toolResult("meta"));
  steps.event(toolUse("review", "mcp__summer__daily_review", { date: "2026-11-08", content: "today's review" }));
  steps.event(toolResult("review"));
  const done = steps.finish();
  assert.equal(done.length, 5);
  assert.deepEqual(done.slice(0, 2).map((s) => s.summerWrite.content), ["first addition", "second addition"]);
  assert.deepEqual(done[2].summerWrite, { action: "update", layer: "xiaoman", content: "new fragment", oldContent: "old fragment" });
  assert.equal(done[3].summerWrite.itemId, "rain-123");
  assert.deepEqual(done[3].summerWrite.fields, ["权重：8", "状态：done", "标签：论文"]);
  assert.deepEqual(done[4].summerWrite, { action: "daily_review", layer: "xiaoshu", content: "today's review", fields: ["日期：2026-11-08"] });
  assert.match(summerWriteTitle(done[0]), /已完成.*新增 Summer 立夏/);
  assert.ok(!JSON.stringify(done).includes("must not copy"));
  assert.ok(!JSON.stringify(done).includes("secret output"));
  assert.deepEqual(cleanReplySteps(JSON.parse(JSON.stringify(done))), done);
});

test("receipt boundaries exclude read results, thinking, other tools, and work mode", () => {
  const steps = createReplySteps({ mode: "chat" });
  steps.event(toolUse("read", "mcp__summer__read", { content: "read-only secret" }));
  steps.event(toolResult("read"));
  steps.event({ type: "assistant", message: { content: [{ type: "thinking", thinking: "hidden thinking" }] } });
  steps.event(toolUse("other", "mcp__iooi__blog_read", { content: "other tool secret" }));
  steps.event(toolResult("other"));
  assert.ok(steps.finish().every((s) => !s.summerWrite));
  const work = createReplySteps({ mode: "work" });
  work.event(toolUse("write", "mcp__summer__edit", { action: "add", layer: "xiaoshu", content: "work secret" }));
  work.event(toolResult("write"));
  assert.ok(!JSON.stringify(work.finish()).includes("work secret"));
});

test("long write receipts are bounded, malformed stored fields are dropped, and unknown results stay unconfirmed", () => {
  const steps = createReplySteps({ mode: "chat" });
  steps.event(toolUse("long", "mcp__summer__edit", { action: "update", layer: "lixia", old_content: "old", content: "字".repeat(20_010) }));
  assert.match(summerWriteTitle(steps.steps()[0]), /正在提交/);
  const done = steps.finish();
  assert.equal(done[0].summerWrite.content.length, 20_000);
  assert.equal(done[0].summerWrite.truncated, true);
  assert.match(summerWriteTitle(done[0]), /结果未确认/);
  const forged = { ...done[0], summerWrite: { action: "update", layer: "lixia", content: { bad: true }, fields: [null, { bad: true }, "权重：5"], token: "must not render" } };
  const cleaned = cleanReplySteps([forged])[0];
  assert.equal(cleaned.summerWrite.content, undefined);
  assert.deepEqual(cleaned.summerWrite.fields, ["权重：5"]);
  assert.ok(!JSON.stringify(cleaned).includes("must not render"));
});

test("chat steps: thinking, a Summer read and a web search, then the answer", () => {
  const time = clock();
  const seen = [];
  const steps = createReplySteps({ mode: "chat", now: time.now, onChange: (list) => seen.push(list) });
  steps.start();
  assert.equal(stepLabel(seen.at(-1)[0]), "在想…");

  time.advance(4_000);
  steps.event(toolUse("a", "mcp__summer__read", { layers: ["xiaoshu"], date: "2026-10-03" }));
  assert.equal(stepLabel(seen.at(-1).at(-1)), "在翻 Summer 小暑 2026-10-03…");
  time.advance(1_500);
  steps.event(toolResult("a"));
  time.advance(2_000);
  steps.event(toolUse("b", "WebSearch", { query: "上海 明天 天气" }));
  time.advance(3_000);
  steps.event(toolResult("b"));
  time.advance(2_000);
  steps.writing();
  const done = steps.finish();

  assert.deepEqual(done.map(stepLabel), [
    "想了 4 秒",
    "翻了 Summer 小暑 2026-10-03",
    "想了 2 秒",
    "网上搜了：上海 明天 天气",
    "想了 2 秒",
  ]);
  assert.equal(summarizeSteps(done, "chat"), "想了 8 秒 · 翻了 Summer · 搜了 1 次");
  // Tool output never lands in a step.
  assert.ok(!JSON.stringify(done).includes("secret output"));
});

test("a short pause between tools is not listed as thinking", () => {
  const time = clock();
  const steps = createReplySteps({ mode: "chat", now: time.now });
  steps.start();
  time.advance(300);
  steps.event(toolUse("a", "mcp__iooi__reading_shelf"));
  time.advance(800);
  steps.event(toolResult("a"));
  time.advance(400);
  steps.event(toolUse("b", "mcp__iooi__reading_read"));
  time.advance(900);
  steps.event(toolResult("b"));
  time.advance(500);
  const done = steps.finish();
  assert.deepEqual(done.map(stepLabel), ["看了书架", "读了书"]);
  assert.equal(summarizeSteps(done, "chat"), "看了书");
});

test("a quick plain reply keeps a single thinking step", () => {
  const time = clock();
  const steps = createReplySteps({ mode: "chat", now: time.now });
  steps.start();
  time.advance(6_400);
  steps.writing();
  time.advance(3_000);
  const done = steps.finish();
  assert.equal(done.length, 1);
  assert.equal(summarizeSteps(done, "chat"), "想了 6 秒");
});

test("work steps name files and commands, never code, and merge repeats", () => {
  const time = clock();
  const steps = createReplySteps({ mode: "work", now: time.now });
  steps.start();
  time.advance(5_000);
  for (const id of ["r1", "r2"]) {
    steps.event(toolUse(id, "Read", { file_path: "/home/x/iooi/app/api/chat/route.ts" }));
    time.advance(300);
    steps.event(toolResult(id));
    time.advance(200);
  }
  steps.event(toolUse("e1", "Edit", { file_path: "/home/x/iooi/app/lib/claude-code.ts", old_string: "const a = 1", new_string: "const a = 2" }));
  time.advance(500);
  steps.event(toolResult("e1"));
  steps.event(toolUse("g1", "Grep", { pattern: "PRIVATE_TOKEN" }));
  steps.event(toolResult("g1"));
  steps.event(toolUse("b1", "Bash", { command: "PATH=/opt/node/bin:$PATH npm test", description: "Run tests" }));
  time.advance(12_000);
  steps.event(toolResult("b1"));
  steps.event(toolUse("b2", "Bash", { command: "ls app", description: "List app folder" }));
  steps.event(toolResult("b2"));
  steps.event({ type: "system", subtype: "status", status: "compacting" });
  time.advance(20_000);
  steps.event({ type: "system", subtype: "compact_boundary" });
  const done = steps.finish();
  const labels = done.map(stepLabel);
  assert.deepEqual(labels, [
    "想了 5 秒",
    "看了 route.ts ×2",
    "改了 claude-code.ts",
    "翻了代码",
    "跑了测试",
    "跑了命令：List app folder",
    "压缩了上下文",
  ]);
  const text = JSON.stringify(done);
  assert.ok(!text.includes("const a"));
  assert.ok(!text.includes("PRIVATE_TOKEN"));
  assert.ok(!text.includes("/home/x"));
  assert.equal(summarizeSteps(done, "work"), "忙了 39 秒 · 看了 1 个文件 · 改了 1 个文件 · 翻了 1 次代码 · 跑了 2 次命令 · 压缩了上下文");
});

test("parallel tools stay running until each one returns", () => {
  const time = clock();
  const steps = createReplySteps({ mode: "chat", now: time.now });
  steps.start();
  time.advance(2_000);
  steps.event({ type: "assistant", message: { content: [
    { type: "tool_use", id: "a", name: "mcp__iooi__blog_read", input: {} },
    { type: "tool_use", id: "b", name: "mcp__iooi__surf_board", input: {} },
  ] } });
  time.advance(1_000);
  steps.event(toolResult("a"));
  let list = steps.steps();
  assert.equal(list.filter((step) => step.ms === undefined).length, 1);
  assert.equal(stepLabel(list.at(-1)), "在看论坛…");
  steps.event(toolResult("b"));
  list = steps.steps();
  assert.equal(stepLabel(list.at(-1)), "在想…");
});

test("a replayed tool_use and a second compaction are each counted once", () => {
  const time = clock();
  const steps = createReplySteps({ mode: "work", now: time.now });
  steps.start();
  steps.event(toolUse("a", "Read", { file_path: "/x/a.ts" }));
  steps.event(toolUse("a", "Read", { file_path: "/x/a.ts" }));
  steps.event(toolResult("a"));
  for (let i = 0; i < 2; i += 1) {
    steps.event({ type: "system", subtype: "status", status: "compacting" });
    steps.event({ type: "system", subtype: "status", status: "compacting" });
    time.advance(5_000);
    steps.event({ type: "system", subtype: "compact_boundary" });
    time.advance(500);
    steps.event(toolUse(`r${i}`, "Read", { file_path: "/x/b.ts" }));
    steps.event(toolResult(`r${i}`));
  }
  assert.deepEqual(steps.finish().map(stepLabel), [
    "看了 a.ts", "压缩了上下文", "看了 b.ts", "压缩了上下文", "看了 b.ts",
  ]);
});

test("unknown and named tools get readable labels", () => {
  assert.equal(describeTool("mcp__iooi__clawd_action", { action: "feed" }, "chat").active, "在喂小砖");
  assert.equal(describeTool("mcp__iooiblog__blog_feed", {}, "chat").done, "逛了广场");
  assert.equal(describeTool("WebFetch", { url: "https://www.example.com/a/b?q=1" }, "chat").active, "在看网页：example.com");
  assert.equal(describeTool("SomethingNew", {}, "chat").active, "在用工具");
});

test("stored steps are filtered before display", () => {
  const good = { kind: "tool", active: "在看书架", done: "看了书架", t: 1, ms: 5 };
  assert.deepEqual(cleanReplySteps([good, { kind: "evil" }, null, "x"]), [good]);
  assert.deepEqual(cleanReplySteps("nope"), []);
});
