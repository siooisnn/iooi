import { readPhone } from "@/app/lib/phone-store";

// Her window only looks. Decoration writes are exposed through the full MCP
// connection, using the existing iooi authentication and access scopes.
export async function GET() {
  return Response.json({ ok: true, phone: readPhone() }, { headers: { "Cache-Control": "no-store" } });
}
