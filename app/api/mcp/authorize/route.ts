import { authorize } from "@/app/lib/mcp-oauth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const result = await authorize(new URL(request.url).searchParams);
  if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
  return new Response(null, { status: 302, headers: { Location: result.redirect, "Cache-Control": "no-store" } });
}
