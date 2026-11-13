import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/resolve-typescript.mjs";
const { fableUsageWindow } = await import("../app/lib/claude-usage.ts");
const { normalizeClaudeCodeModel } = await import("../app/lib/claude-code.ts");

test("Fable model reaches the subscription runner", () => {
  assert.equal(normalizeClaudeCodeModel("anthropic/claude-fable-5-2"), "claude-fable-5-2");
  assert.equal(normalizeClaudeCodeModel("claude-fable-5.2"), "claude-fable-5-2");
});

test("Fable uses scoped utilization, not its share of total weekly usage", () => {
  const raw = {
    seven_day: { utilization: 45 },
    limits: [
      { kind: "weekly_all", percent: 45 },
      { kind: "weekly_scoped", percent: 50, resets_at: "2026-11-14T17:00:00Z", scope: { model: { id: null, display_name: "Fable" } } },
    ],
    weekly_scoped_shares: [{ limit_index: 1, used_percent_of_weekly: 25, allowance_percent_of_weekly: 50 }],
  };
  assert.deepEqual(fableUsageWindow(raw), { utilization: 50, resets_at: "2026-11-14T17:00:00Z", allowance_percent_of_weekly: 50 });
  raw.limits[1].percent = 0;
  assert.equal(fableUsageWindow(raw).utilization, 0);
  raw.limits[1].percent = 100;
  assert.equal(fableUsageWindow(raw).utilization, 100);
});

test("missing or invalid Fable data never fabricates full remaining quota", () => {
  for (const percent of [null, undefined, "", "0", NaN]) {
    assert.equal(fableUsageWindow({ limits: [{ kind: "weekly_scoped", percent, scope: { model: { display_name: "Fable" } } }] }), null);
  }
  assert.equal(fableUsageWindow({ seven_day: { utilization: 20 } }), null);
  assert.equal(fableUsageWindow({ limits: [{ kind: "weekly_scoped", percent: 20, scope: { model: { display_name: "Sonnet" } } }] }), null);
  assert.deepEqual(fableUsageWindow({ seven_day_fable: { utilization: 17, resets_at: null } }), { utilization: 17, resets_at: null });
});
