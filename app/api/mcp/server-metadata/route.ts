import { publicBase, serverMetadata } from "@/app/lib/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Served at /.well-known/oauth-authorization-server and openid-configuration by a rewrite in next.config.ts.
export function GET(request: Request) {
  return Response.json(serverMetadata(publicBase(request)));
}
