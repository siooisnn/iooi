import assert from "node:assert/strict";
import test from "node:test";
import { GROUP_CONTEXT_BUDGET, WORK_CONTEXT_BUDGET, planContext, contextPrefixHash, summaryChunks, estimateTokens, contextText, summarizeContextPlan } from "../app/lib/context-budget.ts";
import { workContextHistory } from "../app/lib/work-context.ts";
import { codeTaskProgress } from "../app/lib/code-task-progress.ts";

const history = Array.from({ length: 90 }, (_, index) => ({ index, role: index % 2 ? "assistant" : "user", speaker: index % 2 ? "酥酥" : "用户", content: `第${index}条的完整内容。${" hello".repeat(1200)}` }));
test("100k group and 150k work budgets preserve all raw text below the limit", () => {
  assert.equal(GROUP_CONTEXT_BUDGET, 100_000);
  assert.equal(WORK_CONTEXT_BUDGET, 150_000);
  const small = history.slice(0, 50);
  assert.equal(planContext(small, undefined, GROUP_CONTEXT_BUDGET).older.length, 0);
  assert.equal(planContext(history, undefined, WORK_CONTEXT_BUDGET).older.length, 0);
  assert.equal(small[0].content.length > 1500, true);
});
test("exactly at budget does not compact; crossing it preserves a recent full tail", () => {
  const total = history.reduce((n, m) => n + estimateTokens(contextText(m)) + 8, 0);
  assert.equal(planContext(history, undefined, total, 0).older.length, 0);
  const plan = planContext(history, undefined, total - 1, 0);
  assert.ok(plan.older.length > 0);
  assert.ok(plan.until < history.at(-1).index);
  assert.deepEqual([...plan.older, ...history.filter((m) => m.index >= plan.until)], history);
});
test("saved summary resumes at its cutoff, and editing old text invalidates it", () => {
  const snapshot = { summary: "旧前情", until: 40, prefixHash: contextPrefixHash(history, 40) };
  assert.equal(planContext(history, snapshot, WORK_CONTEXT_BUDGET).current, snapshot);
  const edited = history.map((m, i) => i === 0 ? { ...m, content: "已编辑" } : m);
  assert.equal(planContext(edited, snapshot, WORK_CONTEXT_BUDGET).current.until, 0);
  assert.equal(planContext(history.slice(0, 20), snapshot, WORK_CONTEXT_BUDGET).current.until, 0);
});
test("long Unicode messages are chunked without a lost tail, broken emoji, or hidden 80-message cap", () => {
  const long = [{ index: 0, role: "user", speaker: "郁郁", content: "🥲前情𠮷测试".repeat(1000) + "最终尾部" }];
  const chunks = summaryChunks(long, 130);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(""), contextText(long[0]));
  assert.ok(chunks.every((chunk) => !chunk.includes("\ufffd") && estimateTokens(chunk) <= 130));
  assert.match(summaryChunks(history).join("\n"), /第89条/);
});
test("failed summarization does not advance the cutoff or mutate the original records", async () => {
  const original = structuredClone(history);
  const plan = planContext(history, undefined, GROUP_CONTEXT_BUDGET);
  let calls = 0;
  await assert.rejects(summarizeContextPlan(plan, history, GROUP_CONTEXT_BUDGET, async () => {
    if (++calls > 1) throw new Error("subscription unavailable");
    return "部分摘要";
  }), /subscription unavailable/);
  assert.equal(plan.current.until, 0);
  assert.deepEqual(history, original);
});
test("success merges all chunks, then saves a verifiable cutoff", async () => {
  const plan = planContext(history, undefined, GROUP_CONTEXT_BUDGET);
  const received = [];
  const snapshot = await summarizeContextPlan(plan, history, GROUP_CONTEXT_BUDGET, async (chunk, previous) => {
    received.push(chunk);
    return `${previous}摘要${received.length}`;
  });
  assert.equal(snapshot.until, plan.until);
  assert.equal(snapshot.prefixHash, contextPrefixHash(history, plan.until));
  assert.match(received.join("\n"), new RegExp(`第${plan.older.at(-1).index}条`));
});
test("oversized latest message fails explicitly rather than truncating it", () => {
  assert.throws(() => planContext(history.slice(-1), undefined, 500), /最新一条消息超过/);
});
test("work preserves the current instruction while summarizing even a huge previous result", () => {
  const records = [{ index: 0, role: "assistant", content: " hello".repeat(151_000) }, { index: 1, role: "user", content: "继续当前任务" }];
  const plan = planContext(records, undefined, WORK_CONTEXT_BUDGET);
  assert.equal(plan.until, 1);
  assert.equal(plan.older[0].content, records[0].content);
  assert.equal(records[plan.until].content, "继续当前任务");
});
test("work context excludes normal chat, another project, and the current instruction", () => {
  const records = [
    { role: "user", content: "私聊" },
    { role: "assistant", content: "Summer项目", source: "code_task_summer" },
    ...history.map((m) => ({ ...m, source: "code_task_iooi" })),
    { role: "user", content: "当前指令", source: "code_task_iooi", roundId: "current" },
  ];
  const result = workContextHistory(records, "iooi", "current");
  assert.equal(result.length, 90);
  assert.equal(result[0].content, history[0].content);
  assert.equal(result.at(-1).content, history.at(-1).content);
});
test("native work compaction events and tool progress are visible", () => {
  assert.deepEqual(codeTaskProgress({ type: "system", subtype: "status", status: "compacting" }), ["正在压缩上下文…"]);
  assert.match(codeTaskProgress({ type: "system", subtype: "compact_boundary" })[0], /压缩完成/);
  assert.deepEqual(codeTaskProgress({ type: "assistant", message: { content: [{ type: "text" }, { type: "tool_use", name: "Edit" }] } }), ["正在修改代码…"]);
});
