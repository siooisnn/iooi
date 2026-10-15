import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const BLOG_ORIGIN = "https://blog.sioois.cc";
export const BLOG_MCP_URL = `${BLOG_ORIGIN}/api/mcp`;
export const BLOG_SCOPE = "blog:read blog:write blog:comment profile:write friends:write";
export function blogToolsForScope(scope: string) {
  const granted = new Set(scope.split(" "));
  const tools: [string, string][] = [
    ["blog_me", "blog:read"], ["blog_feed", "blog:read"], ["blog_read_post", "blog:read"], ["blog_friends", "blog:read"],
    ["blog_write_post", "blog:write"], ["blog_update_post", "blog:write"], ["blog_delete_post", "blog:write"],
    ["blog_comment", "blog:comment"], ["blog_set_motto", "profile:write"],
    ["blog_add_friend", "friends:write"], ["blog_accept_friend", "friends:write"], ["blog_remove_friend", "friends:write"],
  ];
  return tools.filter(([, permission]) => granted.has(permission)).map(([name]) => `mcp__iooiblog__${name}`);
}
const COOKIE = "iooi-blog-oauth";
type Identity = { id: string; name: string; handle: string; kind: "ai" };
type Connection = { access: string; refresh: string; expires: number; scope: string; identity: Identity; needsAuth?: boolean };
type Pending = { verifier: string; browser: string; redirect: string; expires: number };
type State = { client?: string; connection?: Connection; pending?: Record<string, Pending> };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
const file = () => join(process.env.IOOI_BLOG_DATA_DIR || join(process.cwd(), "data"), "blog-connection.json");
function read(): State {
  if (!existsSync(file())) return {};
  return JSON.parse(readFileSync(file(), "utf8")) as State;
}
function save(state: State) {
  const target = file();
  mkdirSync(join(target, ".."), { recursive: true });
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, target);
}
let tail: Promise<unknown> = Promise.resolve();
function locked<T>(task: () => Promise<T>): Promise<T> {
  const next = tail.then(task, task);
  tail = next.catch(() => {});
  return next;
}
export class BlogConnectionError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
function equal(left: string, right: string) {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function requireBlogOwner(request: Request) {
  const token = process.env.IOOI_TOKEN || "";
  if (!token) throw new BlogConnectionError("请先配置 iooi 门锁", 503);
  if (!equal(request.headers.get("x-iooi-token") || "", token)) throw new BlogConnectionError("请先解锁 iooi", 401);
  if (request.method !== "GET") {
    const expected = new URL(publicOrigin(request)).origin;
    if (request.headers.get("origin") !== expected) throw new BlogConnectionError("请求来源不匹配", 403);
  }
}
function publicOrigin(request: Request) {
  const fixed = process.env.IOOI_PUBLIC_URL?.trim();
  if (fixed) return new URL(fixed).origin;
  const scheme = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || new URL(request.url).protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || new URL(request.url).host;
  return new URL(`${scheme}://${host}`).origin;
}
async function remote(path: string, init: RequestInit) {
  return fetch(`${BLOG_ORIGIN}${path}`, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000) });
}
async function tokenRequest(fields: Record<string, string>) {
  const response = await remote("/api/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const expired = response.status === 401 || (response.status === 400 && failure.error === "invalid_grant");
    throw new BlogConnectionError(expired ? "授权已失效，请重新连接独立博客" : "独立博客暂时不可用", expired ? 401 : 503);
  }
  const result = await response.json();
  if (typeof result.access_token !== "string" || typeof result.refresh_token !== "string" || !Number.isFinite(result.expires_in) || result.expires_in <= 0)
    throw new BlogConnectionError("博客授权响应不完整", 503);
  return { access: result.access_token as string, refresh: result.refresh_token as string,
    expires: Date.now() + result.expires_in * 1000, scope: String(result.scope || "") };
}
async function identity(access: string): Promise<Identity> {
  const response = await remote("/api/mcp", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "blog_me", arguments: {} } }) });
  if (!response.ok) throw new BlogConnectionError(response.status === 401 ? "授权已失效，请重新连接独立博客" : "独立博客暂时不可用", response.status === 401 ? 401 : 503);
  const body = await response.json();
  const text = body.result?.content?.find((item: { type: string }) => item.type === "text")?.text;
  if (body.result?.isError || !text) throw new BlogConnectionError("无法确认博客账号", 503);
  const me = JSON.parse(text);
  if (me.kind !== "ai" || typeof me.id !== "string" || typeof me.handle !== "string" || typeof me.name !== "string")
    throw new BlogConnectionError("请选择酥酥自己的 AI 账号", 400);
  return { id: me.id, handle: me.handle, name: me.name, kind: "ai" };
}
async function accessFor(state: State, force = false) {
  const connection = state.connection;
  if (!connection || connection.needsAuth) return null;
  if (!force && connection.expires > Date.now() + 90_000) return connection.access;
  try {
    const renewed = await tokenRequest({ grant_type: "refresh_token", client_id: state.client!, refresh_token: connection.refresh, resource: BLOG_MCP_URL });
    state.connection = { ...connection, ...renewed };
    save(state);
    return renewed.access;
  } catch (error) {
    if (error instanceof BlogConnectionError && error.status === 401) {
      connection.needsAuth = true; save(state);
    }
    throw error;
  }
}
export function blogMcpConnection() {
  return locked(async () => {
    try {
      const state = read();
      const access = await accessFor(state);
      if (!access || !state.connection) return null;
      return { access, identity: state.connection.identity, scope: state.connection.scope };
    } catch { return null; }
  });
}
export function blogConnectionHint() {
  try {
    const connection = read().connection;
    if (!connection) return "iooiblog 独立博客尚未连接。如果她要使用广场，提示她去 iooi 设置 → 独立博客连接；不能用家里的博客替代。";
    if (connection.needsAuth) return "iooiblog 独立博客授权已失效。如果她要使用广场，提示她去 iooi 设置 → 独立博客连接重新授权；不能假装已经操作成功。";
    return "iooiblog 独立博客暂时无法连接。如果她要使用广场，说明暂时无法操作，可到 iooi 设置 → 独立博客连接检查；不影响家里的博客和正常聊天。";
  } catch { return "独立博客连接暂时不可用，不影响正常聊天；需要时请到 iooi 设置 → 独立博客连接检查。"; }
}
export function startBlogConnection(request: Request) {
  return locked(async () => {
    const state = read();
    const redirect = `${publicOrigin(request)}/blog-connect/callback`;
    const target = new URL(redirect);
    if (target.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(target.hostname)) throw new BlogConnectionError("博客连接需要 HTTPS");
    if (!state.client) {
      const response = await remote("/api/oauth/register", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_name: "iooi · 酥酥", redirect_uris: [redirect] }) });
      if (!response.ok) throw new BlogConnectionError("暂时无法建立博客连接", 503);
      const result = await response.json();
      if (typeof result.client_id !== "string") throw new BlogConnectionError("博客连接响应不完整", 503);
      state.client = result.client_id;
    }
    const nonce = secret(), browser = secret(), verifier = secret() + secret();
    // One authorization at a time for this personal iooi instance.
    state.pending = { [digest(nonce)]: { verifier, browser: digest(browser), redirect, expires: Date.now() + 600_000 } };
    save(state);
    const params = new URLSearchParams({ client_id: state.client!, redirect_uri: redirect, response_type: "code", scope: BLOG_SCOPE,
      resource: BLOG_MCP_URL, state: nonce, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
    return { url: `${BLOG_ORIGIN}/authorize?${params}`, cookie: `${COOKIE}=${browser}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${target.protocol === "https:" ? "; Secure" : ""}` };
  });
}
async function revoke(state: State, connection: Pick<Connection, "refresh">) {
  const response = await remote("/api/oauth/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: connection.refresh, client_id: state.client! }) });
  if (!response.ok) throw new BlogConnectionError("没能撤销博客授权，请稍后重试", 503);
}
export function finishBlogConnection(request: Request) {
  return locked(async () => {
    const state = read(), params = new URL(request.url).searchParams;
    const key = digest(params.get("state") || "");
    const pending = state.pending?.[key];
    const cookie = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || "";
    if (!pending || pending.expires < Date.now() || !cookie || !equal(pending.browser, digest(cookie)))
      throw new BlogConnectionError("授权已过期或不是从此设备发起，请回 iooi 重新连接");
    delete state.pending![key]; save(state);
    if (params.get("error")) throw new BlogConnectionError("这次没有完成授权，原连接保持不变");
    const code = params.get("code");
    if (!code || code.length > 512) throw new BlogConnectionError("授权码无效");
    const tokens = await tokenRequest({ grant_type: "authorization_code", client_id: state.client!, code, code_verifier: pending.verifier,
      redirect_uri: pending.redirect, resource: BLOG_MCP_URL });
    try {
      const next: Connection = { ...tokens, identity: await identity(tokens.access) };
      // Keep only the chosen identity active when replacing a connection.
      if (state.connection) await revoke(state, state.connection);
      state.connection = next; save(state);
    } catch (error) {
      await revoke(state, tokens).catch(() => {});
      throw error;
    }
    return new URL("/?iooiblog=connected", pending.redirect).href;
  });
}
export function blogConnectionStatus() {
  return locked(async () => {
    const state = read();
    if (!state.connection) return { status: "disconnected" };
    try {
      let access = await accessFor(state);
      if (!access) return { status: "needs_auth", identity: state.connection.identity };
      let me: Identity;
      try { me = await identity(access); } catch (error) {
        if (!(error instanceof BlogConnectionError) || error.status !== 401) throw error;
        access = await accessFor(state, true);
        if (!access) return { status: "needs_auth", identity: state.connection.identity };
        me = await identity(access);
      }
      return { status: "connected", identity: me };
    } catch (error) {
      return { status: state.connection.needsAuth ? "needs_auth" : "unavailable", identity: state.connection.identity,
        message: error instanceof BlogConnectionError ? error.message : "独立博客暂时连接不上" };
    }
  });
}
export function disconnectBlogConnection() {
  return locked(async () => {
    const state = read();
    if (state.connection) await revoke(state, state.connection);
    delete state.connection; delete state.pending; save(state);
    return { status: "disconnected" };
  });
}
