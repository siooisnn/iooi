import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { chmod, chown, readFile, rename, stat, unlink, writeFile } from "fs/promises";

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
  stale?: boolean;
};

type ClaudeOAuth = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  refreshTokenExpiresAt?: number;
  scopes?: string[];
  [key: string]: unknown;
};

type ClaudeCredentials = {
  claudeAiOauth?: ClaudeOAuth;
  [key: string]: unknown;
};

type OAuthRefreshResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
};

class ClaudeUsageRequestError extends Error {
  status: number;

  constructor(status: number) {
    super(`Claude usage returned ${status}`);
    this.status = status;
  }
}

let cachedUsage: ClaudeUsage | null = null;
let cachedAt = 0;
let refreshInFlight: Promise<ClaudeOAuth> | null = null;
const CACHE_MS = 60_000;
const CLAUDE_CODE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

function credentialsFile() {
  return process.env.CLAUDE_CODE_CREDENTIALS_FILE
    || "/home/claude-iooi/.claude/.credentials.json";
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

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

async function readCredentials(path: string) {
  return JSON.parse(await readFile(/* turbopackIgnore: true */ path, "utf8")) as ClaudeCredentials;
}

async function replaceCredentials(path: string, credentials: ClaudeCredentials) {
  const fileStat = await stat(/* turbopackIgnore: true */ path);
  const temporaryPath = `${path}.iooi-${process.pid}-${randomUUID()}.tmp`;
  try {
    await writeFile(
      /* turbopackIgnore: true */ temporaryPath,
      `${JSON.stringify(credentials, null, 2)}\n`,
      { encoding: "utf8", mode: fileStat.mode & 0o777 },
    );
    await chmod(/* turbopackIgnore: true */ temporaryPath, fileStat.mode & 0o777);
    if (process.platform !== "win32") {
      await chown(/* turbopackIgnore: true */ temporaryPath, fileStat.uid, fileStat.gid);
    }
    await rename(/* turbopackIgnore: true */ temporaryPath, path);
  } finally {
    await unlink(/* turbopackIgnore: true */ temporaryPath).catch(() => {});
  }
}

async function requestClaudeUsage(accessToken: string): Promise<ClaudeUsage> {
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
    if (!response.ok) throw new ClaudeUsageRequestError(response.status);
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

async function refreshClaudeOAuth(path: string, staleAccessToken: string) {
  const latestCredentials = await readCredentials(path);
  const latestOAuth = latestCredentials.claudeAiOauth || {};
  if (latestOAuth.accessToken && latestOAuth.accessToken !== staleAccessToken) {
    return latestOAuth;
  }

  const refreshToken = latestOAuth.refreshToken;
  if (!refreshToken) throw new Error("Claude subscription refresh credential is unavailable");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(
      process.env.CLAUDE_CODE_OAUTH_TOKEN_URL || "https://platform.claude.com/v1/oauth/token",
      {
        method: "POST",
        headers: {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
          "User-Agent": process.env.CLAUDE_CODE_OAUTH_USER_AGENT || "claude-code/2.1.236",
        },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: process.env.CLAUDE_CODE_OAUTH_CLIENT_ID || CLAUDE_CODE_CLIENT_ID,
        }),
        cache: "no-store",
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error(`Claude OAuth refresh returned ${response.status}`);
    const refreshed = await response.json() as OAuthRefreshResponse;
    if (!refreshed.access_token) throw new Error("Claude OAuth refresh returned no access token");

    const currentCredentials = await readCredentials(path);
    const currentOAuth = currentCredentials.claudeAiOauth || {};
    if (currentOAuth.refreshToken && currentOAuth.refreshToken !== refreshToken) {
      return currentOAuth;
    }

    const now = Date.now();
    const nextOAuth: ClaudeOAuth = {
      ...currentOAuth,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token || refreshToken,
      expiresAt: now + Math.max(60, Number(refreshed.expires_in) || 28_800) * 1000,
      ...(refreshed.refresh_token_expires_in
        ? { refreshTokenExpiresAt: now + refreshed.refresh_token_expires_in * 1000 }
        : {}),
      ...(refreshed.scope
        ? { scopes: refreshed.scope.split(/\s+/).filter(Boolean) }
        : {}),
    };
    await replaceCredentials(path, { ...currentCredentials, claudeAiOauth: nextOAuth });
    return nextOAuth;
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshClaudeOAuthViaCli(path: string, staleAccessToken: string) {
  const home = "/home/claude-iooi";
  const binary = "/home/claude-iooi/.local/bin/claude";
  const uid = positiveInt(process.env.CLAUDE_CODE_UID, 1001);
  const gid = positiveInt(process.env.CLAUDE_CODE_GID, 1001);
  const timeoutMs = positiveInt(process.env.CLAUDE_CODE_REFRESH_TIMEOUT_MS, 90_000);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ binary, [
      "-p",
      "--model", process.env.CLAUDE_CODE_REFRESH_MODEL || "haiku",
      "--effort", "low",
      "--tools", "",
      "--max-turns", "1",
      "--no-session-persistence",
      "--output-format", "json",
    ], {
      cwd: home,
      uid,
      gid,
      stdio: ["pipe", "ignore", "ignore"],
      env: {
        ...process.env,
        HOME: home,
        USER: process.env.CLAUDE_CODE_USER || "claude-iooi",
        LOGNAME: process.env.CLAUDE_CODE_USER || "claude-iooi",
        LANG: "C.UTF-8",
        NO_COLOR: "1",
      },
    });
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error("Claude Code credential refresh timed out"));
    }, timeoutMs);
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(`Claude Code credential refresh exited with ${code}`));
        return;
      }
      finish();
    });
    child.stdin.on("error", () => {});
    child.stdin.end("Reply only with OK.", "utf8");
  });

  const oauth = (await readCredentials(path)).claudeAiOauth || {};
  if (!oauth.accessToken || oauth.accessToken === staleAccessToken) {
    throw new Error("Claude Code did not rotate the expired credential");
  }
  return oauth;
}

async function refreshedOAuth(path: string, staleAccessToken: string) {
  if (!refreshInFlight) {
    refreshInFlight = refreshClaudeOAuth(path, staleAccessToken)
      .catch(() => refreshClaudeOAuthViaCli(path, staleAccessToken))
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function fetchClaudeUsage(): Promise<ClaudeUsage> {
  const path = credentialsFile();
  const credentials = await readCredentials(path);
  const accessToken = credentials.claudeAiOauth?.accessToken;
  if (!accessToken) throw new Error("Claude subscription credential is unavailable");

  try {
    return await requestClaudeUsage(accessToken);
  } catch (error) {
    if (!(error instanceof ClaudeUsageRequestError) || error.status !== 401) throw error;
    const oauth = await refreshedOAuth(path, accessToken);
    if (!oauth.accessToken) throw new Error("Claude subscription refresh returned no access token");
    return requestClaudeUsage(oauth.accessToken);
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
    if (cachedUsage) {
      return Response.json({ ok: true, usage: { ...cachedUsage, stale: true } }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    return Response.json({ ok: false, error: "Claude 订阅额度暂时读不到" }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
