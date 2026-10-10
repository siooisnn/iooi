import { randomUUID } from "crypto";
import { MCP_SCOPE, mcpAuthorized, mcpConfigured, publicBase } from "@/app/lib/mcp-oauth";
import { handleRpc } from "@/app/lib/mcp-server";
import type { RpcResponse } from "@/app/lib/mcp-server";

export const runtime = "nodejs";

// The iooi MCP endpoint. The app's IOOI_TOKEN gate (middleware.ts) skips
// /api/mcp: MCP clients carry their own bearer token, checked here.

function sse(payloads: RpcResponse[], request: Request, status = 200, extra: Record<string, string> = {}) {
  const body = payloads.map((payload) => `event: message\ndata: ${JSON.stringify(payload)}\n\n`).join("");
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "mcp-session-id": request.headers.get("mcp-session-id") || randomUUID(),
      ...extra,
    },
  });
}

function unauthorized(request: Request) {
  const metadata = `${publicBase(request)}/.well-known/oauth-protected-resource/api/mcp`;
  return sse([{ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } }], request, 401, {
    "WWW-Authenticate": `Bearer resource_metadata="${metadata}", scope="${MCP_SCOPE}"`,
  });
}

export async function POST(request: Request) {
  if (!mcpConfigured()) {
    return Response.json({ error: "iooi MCP 还没配置（缺 IOOI_MCP_TOKEN）" }, { status: 503 });
  }
  if (!mcpAuthorized(request)) return unauthorized(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return sse([{ jsonrpc: "2.0", id: null, error: { code: -32700, message: `Parse error: ${error instanceof Error ? error.message : ""}` } }], request);
  }
  const batch = Array.isArray(body) ? body : [body];
  const answers = (await Promise.all(batch.map(handleRpc))).filter((answer): answer is RpcResponse => answer !== null);
  if (!answers.length) {
    return new Response(null, { status: 202, headers: { "mcp-session-id": request.headers.get("mcp-session-id") || randomUUID() } });
  }
  return sse(answers, request);
}

// No server-initiated stream and no sessions to end.
export function GET() {
  return new Response("Use POST for MCP requests", { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
