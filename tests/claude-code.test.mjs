import assert from "node:assert/strict";
import test from "node:test";
import { streamUsedWebSearch } from "../app/lib/claude-code.ts";

test("Claude search use follows actual subscription tool calls", () => {
  const searchEvent = JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "text", text: "Searching" }, { type: "tool_use", name: "WebSearch" }] },
  });
  const replyEvent = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Hello" }] } });
  assert.equal(streamUsedWebSearch(`${replyEvent}\n${searchEvent}`), true);
  assert.equal(streamUsedWebSearch(`${replyEvent}\nnot-json`), false);
});
