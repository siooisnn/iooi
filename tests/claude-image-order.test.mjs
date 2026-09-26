import assert from "node:assert/strict";
import test from "node:test";
import { renderStreamInput } from "../app/lib/claude-code.ts";

test("an earlier image stays before the current user text in Claude input", () => {
  const image = { type: "image", source: { type: "base64", media_type: "image/png", data: "abcd" } };
  const payload = JSON.parse(renderStreamInput([
    { role: "user", content: [{ type: "text", text: "" }, image] },
    { role: "assistant", content: "看到了。" },
    { role: "user", content: "那下一步呢？" },
  ]).trim());
  const blocks = payload.message.content;
  assert.equal(blocks[1].type, "image");
  assert.match(blocks[3].text, /用户本轮消息.*那下一步呢？/s);
  assert.equal(blocks.filter((block) => block.type === "image").length, 1);
});
