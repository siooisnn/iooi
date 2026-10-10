import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseNudgeReply, NUDGE_MARKER } from "../app/lib/chat-nudge.ts";
import { createVisibleReplyStream } from "../app/lib/visible-reply-stream.ts";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts") && !specifier.endsWith(".ts")) {
    const url = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
} });
const { mergeChatMessages, hasLaterUserMessage } = await import("../app/lib/chat-sessions.ts");

test("a nudge is optional, scoped and limited to one action", () => {
  assert.deepEqual(parseNudgeReply("我在。", true), { reply: "我在。", nudge: false });
  assert.deepEqual(parseNudgeReply(`抖回来啦 ${NUDGE_MARKER}${NUDGE_MARKER}`, true), { reply: "抖回来啦", nudge: true });
  assert.deepEqual(parseNudgeReply(`我在。${NUDGE_MARKER}`, false), { reply: "我在。", nudge: false });
  assert.deepEqual(parseNudgeReply("我在。[iooi_nudge", true), { reply: "我在。", nudge: false });
  assert.deepEqual(parseNudgeReply("我在。[iooi_nu", true), { reply: "我在。", nudge: false });
});

test("nudge metadata cannot flash at any streaming chunk boundary", () => {
  const text = "我在。[iooi_nudge]继续聊吧。";
  for (let split = 1; split < text.length; split++) {
    const stream = createVisibleReplyStream();
    const output = stream.push(text.slice(0, split)) + stream.push(text.slice(split)) + stream.finish();
    assert.equal(output, "我在。继续聊吧。", `boundary ${split}`);
  }
  const stream = createVisibleReplyStream();
  let output = "";
  for (const character of text) output += stream.push(character);
  assert.equal(output + stream.finish(), "我在。继续聊吧。");
});

test("client history retains same-minute nudge rounds and accepts the latest reply", () => {
  const first = { role: "user", content: "你发送了一个闪屏振动。", source: "chat_nudge", time: "10:00", date: "2026/10/10", roundId: "first" };
  const second = { ...first, roundId: "second" };
  const messages = mergeChatMessages([first], [first, second]);
  assert.equal(messages.length, 2);
  assert.equal(hasLaterUserMessage(messages, first), true);
  assert.equal(hasLaterUserMessage(messages, second), false);
});
