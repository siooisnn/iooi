export type FableUsageWindow = {
  utilization: number;
  resets_at: string | null;
  allowance_percent_of_weekly?: number;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function percent(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value)) : null;
}

// Current OAuth usage reports model-specific windows in limits, rather than
// the legacy seven_day_* fields. percent is relative to the scoped allowance.
export function fableUsageWindow(raw: Record<string, unknown>): FableUsageWindow | null {
  const limits = Array.isArray(raw.limits) ? raw.limits : [];
  const index = limits.findIndex((value) => {
    const limit = record(value);
    const model = record(record(limit.scope).model);
    return limit.kind === "weekly_scoped"
      && (String(model.display_name || "").toLowerCase() === "fable"
        || /^claude-fable(?:-|$)/.test(String(model.id || "").toLowerCase()));
  });
  const limit = record(limits[index]);
  const legacy = record(raw.seven_day_fable);
  const utilization = percent(limit.percent) ?? percent(legacy.utilization);
  if (utilization === null) return null;
  const source = percent(limit.percent) !== null ? limit : legacy;
  const shares = Array.isArray(raw.weekly_scoped_shares) ? raw.weekly_scoped_shares : [];
  const share = record(shares.find((value) => index >= 0 && record(value).limit_index === index));
  const allowance = percent(share.allowance_percent_of_weekly);
  return {
    utilization,
    resets_at: typeof source.resets_at === "string" ? source.resets_at : null,
    ...(allowance !== null ? { allowance_percent_of_weekly: allowance } : {}),
  };
}
