// Who may use the iooi MCP. Two ways in, the same as summer:
//  - a fixed bearer token (IOOI_MCP_TOKEN) for clients configured by hand,
//    like work mode's Claude Code;
//  - OAuth (authorization code + PKCE) for connectors such as the official
//    app, with a fixed client id and secret entered once in the connector.
// The secret is checked when the code is exchanged, so /authorize can hand
// out codes without a login page; a code is worthless without the secret.
// Nothing is open when nothing is configured.

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { readMcpAuthStore, withMcpAuthStore } from "@/app/lib/store";

export const MCP_SCOPE = "iooi";
const CODE_TTL_S = 600;
const ACCESS_TTL_S = 60 * 60 * 24 * 30;
const REFRESH_TTL_S = ACCESS_TTL_S * 6;

export function mcpToken() {
  return (process.env.IOOI_MCP_TOKEN || "").trim();
}

export function oauthClientId() {
  return (process.env.IOOI_MCP_CLIENT_ID || "iooi-claude").trim();
}

export function oauthClientSecret() {
  return (process.env.IOOI_MCP_CLIENT_SECRET || process.env.IOOI_MCP_TOKEN || "").trim();
}

export function mcpConfigured() {
  return Boolean(mcpToken() || oauthClientSecret());
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

const sha = (value: string) => createHash("sha256").update(value).digest();
// Only hashes are kept on disk, so the file never holds a usable token.
const keyOf = (value: string) => sha(value).toString("hex");

export function verifyPkce(verifier: string, challenge: string, method: string) {
  if (!challenge) return true;
  if (method === "plain") return safeEqual(verifier, challenge);
  return safeEqual(sha(verifier).toString("base64url"), challenge);
}

/** Where the outside world reaches iooi, behind nginx. */
export function publicBase(request: Request) {
  const fixed = (process.env.IOOI_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (fixed) return fixed;
  const proto = (request.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host).split(",")[0].trim();
  return `${proto}://${host}`;
}

export function resourceMetadata(base: string) {
  return {
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    scopes_supported: [MCP_SCOPE],
  };
}

export function serverMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/mcp/authorize`,
    token_endpoint: `${base}/api/mcp/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256", "plain"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    scopes_supported: [MCP_SCOPE],
  };
}

type Saved = {
  type: "code" | "access" | "refresh";
  expiresAt: number;
  redirectUri?: string;
  challenge?: string;
  method?: string;
};

const nowS = () => Math.floor(Date.now() / 1000);

function entries(store: Record<string, unknown>) {
  const raw = store.entries && typeof store.entries === "object" ? store.entries as Record<string, Saved> : {};
  const now = nowS();
  // Expired entries go whenever anything is written.
  return Object.fromEntries(Object.entries(raw).filter(([, saved]) => saved && saved.expiresAt > now));
}

function lookup(value: string, type: Saved["type"]) {
  if (!value) return null;
  const saved = entries(readMcpAuthStore() || {})[keyOf(value)];
  return saved && saved.type === type ? saved : null;
}

/** GET /api/mcp/authorize: a code straight back to the connector. */
export async function authorize(params: URLSearchParams): Promise<{ redirect: string } | { error: string }> {
  const redirectUri = params.get("redirect_uri") || "";
  if (params.get("response_type") !== "code" || !redirectUri || !safeEqual(params.get("client_id") || "", oauthClientId())) {
    return { error: "invalid_request" };
  }
  if (!oauthClientSecret()) return { error: "iooi MCP 还没配置" };
  let target: URL;
  try {
    target = new URL(redirectUri);
  } catch {
    return { error: "invalid_request" };
  }
  if (target.protocol !== "https:" && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(target.hostname)) return { error: "invalid_request" };
  const code = randomBytes(32).toString("base64url");
  await withMcpAuthStore((store) => {
    const next = entries(store);
    next[keyOf(code)] = {
      type: "code",
      expiresAt: nowS() + CODE_TTL_S,
      redirectUri,
      challenge: params.get("code_challenge") || "",
      method: params.get("code_challenge_method") || "S256",
    };
    store.entries = next;
  });
  target.searchParams.set("code", code);
  const state = params.get("state");
  if (state) target.searchParams.set("state", state);
  return { redirect: target.toString() };
}

async function issue() {
  const access = randomBytes(40).toString("base64url");
  const refresh = randomBytes(40).toString("base64url");
  const now = nowS();
  await withMcpAuthStore((store) => {
    const next = entries(store);
    next[keyOf(access)] = { type: "access", expiresAt: now + ACCESS_TTL_S };
    next[keyOf(refresh)] = { type: "refresh", expiresAt: now + REFRESH_TTL_S };
    store.entries = next;
  });
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: MCP_SCOPE };
}

function clientCredentials(form: Record<string, string>, authorization: string) {
  if (authorization.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(authorization.slice(6).trim(), "base64").toString("utf-8");
      const split = decoded.indexOf(":");
      if (split < 0) return { id: "", secret: "" };
      return { id: decodeURIComponent(decoded.slice(0, split)), secret: decodeURIComponent(decoded.slice(split + 1)) };
    } catch {
      return { id: "", secret: "" };
    }
  }
  return { id: form.client_id || "", secret: form.client_secret || "" };
}

/** POST /api/mcp/token. */
export async function exchangeToken(form: Record<string, string>, authorization: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const client = clientCredentials(form, authorization);
  if (!oauthClientSecret() || !safeEqual(client.id, oauthClientId()) || !safeEqual(client.secret, oauthClientSecret())) {
    return { status: 401, body: { error: "invalid_client" } };
  }
  if (form.grant_type === "authorization_code") {
    const code = form.code || "";
    const saved = lookup(code, "code");
    if (code) {
      // A code is good once, whatever happens next.
      await withMcpAuthStore((store) => {
        const next = entries(store);
        delete next[keyOf(code)];
        store.entries = next;
      });
    }
    if (!saved || saved.redirectUri !== (form.redirect_uri || "")) return { status: 400, body: { error: "invalid_grant" } };
    if (!verifyPkce(form.code_verifier || "", saved.challenge || "", saved.method || "S256")) {
      return { status: 400, body: { error: "invalid_grant", error_description: "PKCE verification failed" } };
    }
    return { status: 200, body: await issue() };
  }
  if (form.grant_type === "refresh_token") {
    if (!lookup(form.refresh_token || "", "refresh")) return { status: 400, body: { error: "invalid_grant" } };
    return { status: 200, body: await issue() };
  }
  return { status: 400, body: { error: "unsupported_grant_type" } };
}

/** Whether this request may call the MCP tools. */
export function mcpAuthorized(request: Request) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7).trim();
  if (!token) return false;
  const fixed = mcpToken();
  if (fixed && safeEqual(token, fixed)) return true;
  return Boolean(lookup(token, "access"));
}
