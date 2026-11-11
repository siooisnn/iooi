import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./helpers/resolve-typescript.mjs";
const { summarizeClaudeFailure, recordClaudeFailure } = await import("../app/lib/claude-reply-diagnostics.ts");

test("failed result retains provider status and category without retaining echoed private content", () => {
  const stdout = JSON.stringify({ type: "result", is_error: true, subtype: "error_during_execution",
    errors: [{ status_code: 403, error: { type: "permission_error", message: "reasoning_extraction PRIVATE_PROMPT sk-ant-PRIVATE_TOKEN" } }],
    result: "PRIVATE_IMAGE_BASE64" });
  const row = summarizeClaudeFailure(stdout, "API Error: 429 rate_limit_error PRIVATE_STDERR", { phase: "exit", exitCode: 1 });
  assert.deepEqual(row.httpStatuses, [403, 429]);
  assert.deepEqual(row.providerErrors, ["permission_error", "rate_limit_error"]);
  assert.deepEqual(row.categories, ["reasoning_extraction"]);
  assert.equal(row.resultSubtype, "error_during_execution");
  assert.equal(row.hasResult, true);
  assert.equal(row.resultIsError, true);
  assert.equal(row.exitCode, 1);
  assert.doesNotMatch(JSON.stringify(row), /PRIVATE_|sk-ant/);
});

test("normal text, thinking and tool results never become supposed provider failures", () => {
  const content = "HTTP 403 permission_error reasoning_extraction PRIVATE_TEXT";
  const stdout = [
    { type: "assistant", message: { content: [{ type: "text", text: content }, { type: "thinking", thinking: content }] } },
    { type: "user", message: { content: [{ type: "tool_result", content }] } },
    { type: "result", is_error: false, subtype: "success", result: content },
  ].map(JSON.stringify).join("\n");
  const row = summarizeClaudeFailure(stdout, "", { phase: "integrity" });
  assert.deepEqual(row.httpStatuses, []);
  assert.deepEqual(row.providerErrors, []);
  assert.deepEqual(row.categories, []);
  assert.doesNotMatch(JSON.stringify(row), /PRIVATE_TEXT/);
});

test("malformed output, connection failure and process signal remain distinguishable", () => {
  const row = summarizeClaudeFailure("null\nnot json PRIVATE_OUTPUT", "", {
    phase: "exit", exitCode: null, signal: "SIGTERM", error: new Error("ECONNRESET PRIVATE_ERROR"),
  });
  assert.equal(row.hasResult, false);
  assert.equal(row.signal, "SIGTERM");
  assert.deepEqual(row.categories, ["connection"]);
  assert.deepEqual(row.httpStatuses, []);
  assert.doesNotMatch(JSON.stringify(row), /PRIVATE_/);
});

test("failure records rotate with existing evidence and contain metadata only", () => {
  const dir = mkdtempSync(join(tmpdir(), "iooi-failure-evidence-"));
  try {
    const path = join(dir, "claude-reply-diagnostics.jsonl");
    writeFileSync(path, "x".repeat(256 * 1024));
    recordClaudeFailure("PRIVATE_STDOUT", "HTTP 503 overloaded_error PRIVATE_STDERR", "test", { phase: "timeout" }, dir);
    const row = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(statSync(`${path}.1`).size, 256 * 1024);
    assert.equal(row.kind, "failure");
    assert.equal(row.phase, "timeout");
    assert.deepEqual(row.httpStatuses, [503]);
    assert.doesNotMatch(JSON.stringify(row), /PRIVATE_|resultStart|textStart/);
    // Logging failure must preserve the original request outcome.
    recordClaudeFailure("", "", "test", { phase: "parse" }, path);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
