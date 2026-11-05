import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/resolve-typescript.mjs";
const { createSessionSyncHandlers } = await import("../app/lib/session-sync.ts");
const { mergeChatSessionLists } = await import("../app/lib/chat-sessions.ts");

test("each window retains its participants, writing mode and model, including empty groups", async () => {
  const store = {};
  const handler = createSessionSyncHandlers({ read: () => store, write: async (fn) => fn(store) });
  const first = { id: "first", name: "论文", kind: "group", messages: [], groupOptions: { mode: "writing", participants: ["claude", "deepseek"], gptModel: "openai/gpt-6.1-sol" } };
  const second = { id: "second", name: "日常", kind: "group", messages: [], groupOptions: { mode: "chat", participants: ["gpt"], gptModel: "openai/gpt-6-sol" } };
  const response = await handler.POST(new Request("http://local/api/group/sync", { method: "POST", body: JSON.stringify({ sessions: [first, second] }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(store.sessions.map((s) => s.groupOptions), [first.groupOptions, second.groupOptions]);
  const restored = mergeChatSessionLists([], store.sessions, new Set());
  assert.deepEqual(restored[0].groupOptions, first.groupOptions);
  await handler.POST(new Request("http://local/api/group/sync", { method: "POST", body: JSON.stringify({ sessions: [{ ...first, groupOptions: { ...first.groupOptions, participants: ["deepseek"] } }] }) }));
  assert.deepEqual(store.sessions.find((s) => s.id === "first").groupOptions.participants, ["deepseek"]);
  assert.deepEqual(store.sessions.find((s) => s.id === "second").groupOptions, second.groupOptions);
});
