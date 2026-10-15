import { finishBlogConnection } from "@/app/lib/blog-connection";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  let target = "/?iooiblog=failed";
  try { target = await finishBlogConnection(request); } catch { /* The settings card explains how to retry. */ }
  return new Response(null, { status: 303, headers: { Location: target, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
    "Set-Cookie": `iooi-blog-oauth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${new URL(request.url).protocol === "https:" ? "; Secure" : ""}` } });
}
