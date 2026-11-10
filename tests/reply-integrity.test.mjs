import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import "./helpers/resolve-typescript.mjs";
const { createReplyIntegrityGuard, hasInternalReplyTag, excludeAbnormalReply, cleanReplyContext } = await import("../app/lib/reply-integrity.ts");
const { buildChatContext } = await import("../app/lib/chat-context.ts");
const { summarizeClaudeReply, recordClaudeReply } = await import("../app/lib/claude-reply-diagnostics.ts");

test("internal tags are blocked at every stream split, including truncated tags", () => {
  for (const text of ["ny<thinking_mode>interrupted</thinking_mode>", "<reasoning_extraction>failed</reasoning_extraction>", "<thinking_mode"]) {
    assert.equal(hasInternalReplyTag(text), true);
    for (let i = 0; i <= text.length; i++) {
      const guard = createReplyIntegrityGuard();
      const visible = guard.push(text.slice(0, i)) + guard.push(text.slice(i)) + guard.finish();
      assert.equal(guard.blocked, true);
      assert.doesNotMatch(visible, /thinking_mode|reasoning_extraction|interrupted/);
    }
  }
});

test("normal English, HTML and quoted protocol examples survive character streaming", () => {
  for (const text of ["She wants to sleep. 这是一段正常英文。", "<div>Hello</div>", "示例：`<thinking_mode>interrupted</thinking_mode>`。", "```xml\n<thinking_mode>example</thinking_mode>\n```\n回复", "~~~xml\n<reasoning_extraction>example</reasoning_extraction>\n~~~"]) {
    const guard = createReplyIntegrityGuard();
    const visible = [...text].map((c) => guard.push(c)).join("") + guard.finish();
    assert.equal(visible, text);
    assert.equal(guard.blocked, false);
    assert.equal(hasInternalReplyTag(text), false);
  }
  assert.equal(excludeAbnormalReply({ role: "user", content: "<thinking_mode>" }), false);
  assert.equal(excludeAbnormalReply({ role: "assistant", content: "ny<thinking_mode>interrupted</thinking_mode>" }), true);
});

test("confirmed planning is excluded after bubble merging while real replies and stored text survive", () => {
  const planning = "Planning-only test fixture.";
  const prefix = "Response plan test fixture.";
  const answer = "你好，继续聊。";
  const mixed = prefix + answer;
  const fingerprint = (text) => createHash("sha256").update(text).digest("hex");
  const rules = { [fingerprint(planning)]: null, [fingerprint(mixed)]: prefix.length };
  const saved = [
    { role: "user", content: "hello" },
    { role: "assistant", content: planning },
    { role: "assistant", content: mixed },
    { role: "assistant", content: "A normal English answer." },
    { role: "user", content: "continue" },
  ];
  const before = structuredClone(saved);
  const merged = buildChatContext(saved, { mode: "full-window", maxUserTurns: 80 }).messages;
  const cleaned = merged.flatMap((message) => cleanReplyContext(message, rules) || []);
  assert.equal(cleaned[1].content, `${answer}\n\nA normal English answer.`);
  assert.deepEqual(saved, before, "history is never rewritten");
  assert.equal(cleanReplyContext({ role: "assistant", content: planning }, rules), null);
  const user = { role: "user", content: planning };
  assert.equal(cleanReplyContext(user, rules), user, "user quotations remain verbatim");
  const code = { role: "assistant", content: `\`\`\`text\nexample\n\n${planning}\n\n\`\`\`` };
  assert.equal(cleanReplyContext(code, rules), code, "quoted code is not filtered");
  const similar = { role: "assistant", content: `${planning} This is a different paragraph.` };
  assert.equal(cleanReplyContext(similar, rules), similar, "similar English is not a confirmed match");
});

test("response evidence separates text from thinking and tools, bounds excerpts and rotates", () => {
  const event = (delta) => JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta } });
  const raw = [event({ type: "thinking_delta", thinking: "PRIVATE_THINKING" }), event({ type: "input_json_delta", partial_json: "PRIVATE_TOOL_INPUT" }), event({ type: "text_delta", text: "visible" })].join("\n");
  const evidence = summarizeClaudeReply(raw, "x".repeat(9000));
  assert.equal(evidence.textStart, "visible");
  assert.equal(evidence.types.thinking_delta, 1);
  assert.equal(evidence.resultLength, 9000);
  assert.equal(evidence.resultStart.length, 1024);
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE_/);
  const dir = mkdtempSync(join(tmpdir(), "iooi-reply-evidence-"));
  try {
    const path = join(dir, "claude-reply-diagnostics.jsonl");
    writeFileSync(path, "x".repeat(256 * 1024));
    recordClaudeReply(raw, "ny<thinking_mode>interrupted</thinking_mode>", "test", true, dir);
    assert.equal(statSync(`${path}.1`).size, 256 * 1024);
    assert.equal(JSON.parse(readFileSync(path, "utf8")).blocked, true);
    assert.doesNotMatch(readFileSync(path, "utf8"), /PRIVATE_/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
