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

test("only images after the model's last reply count as the current round", async () => {
  const { currentRoundStart } = await import("../app/lib/message-images.ts");
  const history = [
    { role: "user", content: "这又是什么", image: "/uploads/plan.png" },
    { role: "assistant", content: "这是移动的 AI 套餐。" },
    { role: "user", content: "等五点多再出去" },
  ];
  assert.equal(currentRoundStart(history), 2);
  // Group chat: her image, then the other member's comment, both still current.
  assert.equal(currentRoundStart([
    { role: "assistant", content: "上一轮" },
    { role: "user", content: "看图", image: "/uploads/new.png" },
    { role: "user", content: "【GPT在群里说】\n挺好看" },
  ]), 1);
  assert.equal(currentRoundStart([{ role: "user", content: "第一句", image: "/uploads/a.png" }]), 0);
});
