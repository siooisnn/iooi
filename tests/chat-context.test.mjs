import assert from "node:assert/strict";
import test from "node:test";

import { buildChatContext } from "../app/lib/chat-context.ts";

const conversation = [
  { role: "user", content: "上午第一件事" },
  { role: "assistant", content: "记得" },
  { role: "user", content: "下午第二件事" },
  { role: "assistant", content: "也记得" },
  { role: "user", content: "晚上第三件事" },
];

test("Claude full-window mode keeps every text message", () => {
  const result = buildChatContext(conversation, { mode: "full-window", maxUserTurns: 2 });
  assert.equal(result.stats.context_mode, "full-window");
  assert.equal(result.stats.context_truncated, false);
  assert.equal(result.stats.context_omitted_messages, 0);
  assert.match(result.messages[0].content, /上午第一件事/);
  assert.match(result.messages.at(-1).content, /晚上第三件事/);
});

test("rolling-summary mode still limits GPT to the configured turns", () => {
  const result = buildChatContext(conversation, { mode: "rolling-summary", maxUserTurns: 2 });
  assert.equal(result.stats.context_mode, "rolling-summary");
  assert.equal(result.stats.context_truncated, true);
  assert.doesNotMatch(result.messages.map((message) => message.content).join("\n"), /上午第一件事/);
  assert.match(result.messages[0].content, /下午第二件事/);
});

test("old media is dropped without dropping its caption text", () => {
  const result = buildChatContext([
    { role: "user", content: "旧图说明", image: "/uploads/old.png" },
    { role: "assistant", content: "收到" },
    { role: "user", content: "新图说明", image: "/uploads/new.png" },
  ], { mode: "full-window", maxUserTurns: 30, mediaTail: 1 });
  assert.equal(result.messages[0].content, "旧图说明");
  assert.equal(result.messages[0].image, undefined);
  assert.equal(result.messages.at(-1).image, "/uploads/new.png");
});
