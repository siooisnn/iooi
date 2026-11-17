import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/resolve-typescript.mjs";
const { normalizeClaudeCodeModel } = await import("../app/lib/claude-code.ts");
const { MODELS, normalizeClaudeSettings } = await import("../app/lib/app-settings.ts");

test("retired model selections fall back to an available subscription model", () => {
  for (const model of ["fable52", "fable5.2", "claude-fable-5.2", "claude-fable-5-2", "anthropic/claude-fable-5-2"]) {
    const settings = normalizeClaudeSettings({ model });
    assert.equal(settings.model, "sonnet5");
    assert.ok(MODELS.some((entry) => entry.id === settings.model));
  }
});

test("retired Fable models cannot reach the subscription runner", () => {
  for (const model of ["anthropic/claude-fable-5-2", "claude-fable-5.2"]) {
    assert.throws(() => normalizeClaudeCodeModel(model), /Unsupported Claude model/);
  }
  assert.equal(normalizeClaudeCodeModel("claude-sonnet-5"), "claude-sonnet-5");
});
