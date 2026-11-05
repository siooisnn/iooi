import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/resolve-typescript.mjs";

const { streamUsedWebSearch, chatToolNames } = await import("../app/lib/claude-code.ts");
const { hasSafeSummerEdit } = await import("../app/lib/summer-tools.ts");

test("Summer side tools require the fragment-safe edit schema", () => {
  for (const name of ["wake", "search", "edit", "read", "daily_review"]) {
    assert.ok(chatToolNames(true).includes(`mcp__summer__${name}`));
  }
  assert.ok(!chatToolNames().includes("mcp__summer__edit"));
  assert.ok(chatToolNames().includes("mcp__summer__read"));
  assert.equal(hasSafeSummerEdit([{ name: "edit", inputSchema: { properties: { content: { type: "string" } } } }]), false);
  assert.equal(hasSafeSummerEdit([{ name: "edit", inputSchema: { properties: { old_content: { type: "string" } } } }]), true);
});

test("Claude search use follows actual subscription tool calls", () => {
  const searchEvent = JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "text", text: "Searching" }, { type: "tool_use", name: "WebSearch" }] },
  });
  const replyEvent = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Hello" }] } });
  assert.equal(streamUsedWebSearch(`${replyEvent}\n${searchEvent}`), true);
  assert.equal(streamUsedWebSearch(`${replyEvent}\nnot-json`), false);
});
