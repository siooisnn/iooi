import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import "./helpers/resolve-typescript.mjs";
const blog = await import("../app/lib/blog-connection.ts");

test("Blog OAuth binds PKCE to the browser, refreshes once, isolates secrets and revokes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iooi-blog-connect-"));
  const oldDir = process.env.IOOI_BLOG_DATA_DIR, oldToken = process.env.IOOI_TOKEN, oldOrigin = process.env.IOOI_PUBLIC_URL;
  process.env.IOOI_BLOG_DATA_DIR = dir; process.env.IOOI_TOKEN = "owner-test"; process.env.IOOI_PUBLIC_URL = "https://iooi.example.test";
  const originalFetch = globalThis.fetch;
  let refreshes = 0, revoked = 0;
  let verifier = "", callback = "";
  let offline = false;
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).startsWith(blog.BLOG_ORIGIN));
    assert.equal(options.redirect, "error");
    if (String(url).endsWith("/register")) {
      callback = JSON.parse(options.body).redirect_uris[0];
      return Response.json({ client_id: "client-test" });
    }
    if (String(url).endsWith("/token")) {
      if (offline) return Response.json({ error: "invalid_grant" }, { status: 400 });
      const params = new URLSearchParams(options.body);
      if (params.get("grant_type") === "refresh_token") refreshes++;
      else verifier = params.get("code_verifier");
      assert.equal(params.get("resource"), blog.BLOG_MCP_URL);
      return Response.json({ access_token: `secret-access-${refreshes}`, refresh_token: `secret-refresh-${refreshes}`, expires_in: 3600, scope: blog.BLOG_SCOPE });
    }
    if (String(url).endsWith("/revoke")) { revoked++; return Response.json({ ok: true }); }
    if (String(url).endsWith("/mcp")) {
      if (offline) return Response.json({ error: "invalid_token" }, { status: 401 });
      assert.ok(options.headers.Authorization.startsWith("Bearer secret-access-"));
      return Response.json({ result: { content: [{ type: "text", text: JSON.stringify({ id: "ai-test", handle: "susu", name: "酥酥", kind: "ai" }) }] } });
    }
    throw new Error("Unexpected remote URL");
  };
  try {
    assert.throws(() => blog.requireBlogOwner(new Request("https://iooi.example.test/api/blog-connection")), /解锁/);
    assert.throws(() => blog.requireBlogOwner(new Request("https://iooi.example.test/api/blog-connection", { method: "POST", headers: { "x-iooi-token": "owner-test", origin: "https://evil.example" } })), /来源/);
    const request = new Request("https://iooi.example.test/api/blog-connection", { method: "POST", headers: { "x-iooi-token": "owner-test", origin: "https://iooi.example.test" } });
    blog.requireBlogOwner(request);
    assert.deepEqual(await blog.blogConnectionStatus(), { status: "disconnected" });
    const start = await blog.startBlogConnection(request);
    const authorize = new URL(start.url), state = authorize.searchParams.get("state");
    assert.equal(callback, "https://iooi.example.test/blog-connect/callback");
    assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
    const returnURL = `${callback}?code=code-test&state=${state}`;
    await assert.rejects(blog.finishBlogConnection(new Request(returnURL)), /不是从此设备/);
    const cookie = start.cookie.split(";")[0];
    assert.equal(await blog.finishBlogConnection(new Request(returnURL, { headers: { cookie } })), "https://iooi.example.test/?iooiblog=connected");
    assert.ok(verifier.length >= 43);
    await assert.rejects(blog.finishBlogConnection(new Request(returnURL, { headers: { cookie } })), /授权已过期/);
    const status = await blog.blogConnectionStatus();
    assert.equal(status.identity.handle, "susu");
    assert.equal(JSON.stringify(status).includes("secret-access"), false);
    assert.equal(JSON.stringify(status).includes("secret-refresh"), false);
    const path = join(dir, "blog-connection.json");
    if (process.platform !== "win32") assert.equal((await stat(path)).mode & 0o777, 0o600);
    const saved = JSON.parse(await readFile(path, "utf8")); saved.connection.expires = 0;
    await writeFile(path, JSON.stringify(saved));
    const connections = await Promise.all(Array.from({ length: 4 }, () => blog.blogMcpConnection()));
    assert.equal(refreshes, 1);
    assert.ok(connections.every(connection => connection.access === "secret-access-1"));
    assert.ok(blog.blogToolsForScope("blog:read").includes("mcp__iooiblog__blog_feed"));
    assert.equal(blog.blogToolsForScope("blog:read").includes("mcp__iooiblog__blog_write_post"), false);
    assert.ok(blog.blogToolsForScope(blog.BLOG_SCOPE).includes("mcp__iooiblog__blog_add_friend"));
    assert.ok(blog.blogToolsForScope("blog:read").includes("mcp__iooiblog__blog_inbox"));
    assert.ok(blog.blogToolsForScope("blog:read").includes("mcp__iooiblog__blog_mark_read"));
    assert.equal(blog.blogToolsForScope("blog:read").includes("mcp__iooiblog__blog_delete_comment"), false);
    assert.ok(blog.blogToolsForScope(blog.BLOG_SCOPE).includes("mcp__iooiblog__blog_delete_comment"));
    offline = true;
    assert.equal((await blog.blogConnectionStatus()).status, "needs_auth");
    assert.equal(await blog.blogMcpConnection(), null);
    offline = false;
    await blog.disconnectBlogConnection();
    assert.equal(revoked, 1);
    assert.equal(await blog.blogMcpConnection(), null);
    assert.equal((await readFile(path, "utf8")).includes("secret-refresh"), false);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of [["IOOI_BLOG_DATA_DIR", oldDir], ["IOOI_TOKEN", oldToken], ["IOOI_PUBLIC_URL", oldOrigin]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
