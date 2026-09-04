import { readFile } from "fs/promises";

export const runtime = "nodejs";

type UsageWindow = {
  utilization: number;
  resets_at: string | null;
};

type ClaudeUsage = {
  five_hour: UsageWindow | null;
  seven_day: UsageWindow | null;
  seven_day_opus: UsageWindow | null;
  seven_day_sonnet: UsageWindow | null;
  updated_at: string;
};

let cachedUsage: ClaudeUsage | null = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

function normalizeWindow(value: unknown): UsageWindow | null {
  if (!value || typeof value !== "object") return null;
  const window = value as { utilization?: unknown; resets_at?: unknown };
  const utilization = Number(window.utilization);
  if (!Number.isFinite(utilization)) return null;
  return {
    utilization: Math.min(100, Math.max(0, utilization)),
    resets_at: typeof window.resets_at === "string" ? window.resets_at : null,
  };
}

async function fetchClaudeUsage(): Promise<ClaudeUsage> {
  const credentialsFile = process.env.CLAUDE_CODE_CREDENTIALS_FILE
    || "/home/claude-iooi/.claude/.credentials.json";
  const credentials = JSON.parse(
    await readFile(/* turbopackIgnore: true */ credentialsFile, "utf8"),
  ) as {
    claudeAiOauth?: { accessToken?: string };
  };
  const accessToken = credentials.claudeAiOauth?.accessToken;
  if (!accessToken) throw new Error("Claude subscription credential is unavailable");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        "user-agent": process.env.CLAUDE_CODE_USER_AGENT || "claude-code/2.1.236",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Claude usage returned ${response.status}`);
    const raw = await response.json() as Record<string, unknown>;
    return {
      five_hour: normalizeWindow(raw.five_hour),
      seven_day: normalizeWindow(raw.seven_day),
      seven_day_opus: normalizeWindow(raw.seven_day_opus),
      seven_day_sonnet: normalizeWindow(raw.seven_day_sonnet),
      updated_at: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
  try {
    if (!forceRefresh && cachedUsage && Date.now() - cachedAt < CACHE_MS) {
      return Response.json({ ok: true, usage: cachedUsage }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    cachedUsage = await fetchClaudeUsage();
    cachedAt = Date.now();
    return Response.json({ ok: true, usage: cachedUsage }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json({ ok: false, error: "Claude 订阅额度暂时读不到" }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
