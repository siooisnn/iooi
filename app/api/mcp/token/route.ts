import { exchangeToken } from "@/app/lib/mcp-oauth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let form: Record<string, string> = {};
  try {
    const raw = await request.text();
    if ((request.headers.get("content-type") || "").includes("application/json")) {
      const data = JSON.parse(raw || "{}") as Record<string, unknown>;
      form = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typeof value === "string" ? value : String(value ?? "")]));
    } else {
      form = Object.fromEntries(new URLSearchParams(raw));
    }
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const result = await exchangeToken(form, request.headers.get("authorization") || "");
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
