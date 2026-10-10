import { publicBase, resourceMetadata } from "@/app/lib/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Served at /.well-known/oauth-protected-resource[/api/mcp] by a rewrite in next.config.ts.
export function GET(request: Request) {
  return Response.json(resourceMetadata(publicBase(request)));
}
