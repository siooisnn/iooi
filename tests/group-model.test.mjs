import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/resolve-typescript.mjs";
const { groupApiReply } = await import("../app/lib/group-model.ts");

test("DeepSeek and GPT use the exact models; only writing rounds get tools", async () => {
  const oldFetch = globalThis.fetch;
  const oldDs = process.env.GROUP_DEEPSEEK_API_KEY, oldGpt = process.env.OPENROUTER_API_KEY;
  process.env.GROUP_DEEPSEEK_API_KEY = "test-ds"; process.env.OPENROUTER_API_KEY = "test-gpt";
  try {
    for (const speaker of ["deepseek", "gpt"]) {
      const seen = [];
      const calls = [];
      globalThis.fetch = async (url, init) => {
        const payload = JSON.parse(init.body); seen.push({ url, payload });
        if (payload.tools && seen.length === 1) return Response.json({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "1", type: "function", function: { name: "writing_write", arguments: '{"path":"draft.md","content":"draft"}' } }] } }] });
        return Response.json({ choices: [{ message: { role: "assistant", content: "完成了" } }] });
      };
      const model = speaker === "gpt" ? "openai/gpt-6.1-sol" : "deepseek-flash";
      await groupApiReply({ speaker, model, messages: [{ role: "user", content: "写稿" }], writing: true, signal: AbortSignal.timeout(1000), tool: async (name, args) => { calls.push({ name, args }); return { ok: true }; } });
      assert.equal(seen.length, 2); assert.equal(calls.length, 1);
      assert.equal(seen[0].payload.model, model);
      assert.ok(seen.every(({ url }) => !url.includes("summer")));
      assert.ok(seen[1].payload.messages.some((m) => m.role === "tool" && JSON.parse(m.content).ok));
      seen.length = 0;
      await groupApiReply({ speaker, model, messages: [{ role: "user", content: "聊天" }], writing: false, signal: AbortSignal.timeout(1000), tool: async () => { throw new Error("must not call"); } });
      assert.equal(seen[0].payload.tools, undefined);
    }
    globalThis.fetch = async () => Response.json({ error: { message: "not printed" } }, { status: 401 });
    await assert.rejects(groupApiReply({ speaker: "deepseek", model: "deepseek-flash", messages: [], writing: false, signal: AbortSignal.timeout(1000), tool: async () => {} }), /没有切换到其他模型/);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of [["GROUP_DEEPSEEK_API_KEY", oldDs], ["OPENROUTER_API_KEY", oldGpt]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
