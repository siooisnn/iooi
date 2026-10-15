import { BlogConnectionError, blogConnectionStatus, disconnectBlogConnection, requireBlogOwner, startBlogConnection } from "@/app/lib/blog-connection";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try {
    requireBlogOwner(request);
    if (request.method === "POST") {
      const result = await startBlogConnection(request);
      return Response.json({ url: result.url }, { headers: { "Set-Cookie": result.cookie, "Cache-Control": "no-store" } });
    }
    return Response.json(request.method === "DELETE" ? await disconnectBlogConnection() : await blogConnectionStatus(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof BlogConnectionError ? error.message : "博客连接暂时不可用，请稍后重试" },
      { status: error instanceof BlogConnectionError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
  }
}
export { handle as GET, handle as POST, handle as DELETE };
