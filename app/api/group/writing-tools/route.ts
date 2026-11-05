import { groupWritingScope } from "@/app/lib/group-writing-mcp";
import { callWritingTool, WRITING_TOOLS } from "@/app/lib/group-writing-tools";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const scope = groupWritingScope(request.headers.get("authorization"));
  if (!scope) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  let result: unknown;
  if (body.method === "initialize") result = { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "writing", version: "1" } };
  else if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
  else if (body.method === "tools/list") result = { tools: WRITING_TOOLS };
  else if (body.method === "tools/call") {
    try {
      const data = await callWritingTool(body.params?.name, body.params?.arguments || {}, scope);
      result = { content: [{ type: "text", text: JSON.stringify(data) }], isError: false };
    } catch (error) { result = { content: [{ type: "text", text: error instanceof Error ? error.message : "工具失败" }], isError: true }; }
  } else return Response.json({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "Unknown method" } });
  return Response.json({ jsonrpc: "2.0", id: body.id, result });
}
