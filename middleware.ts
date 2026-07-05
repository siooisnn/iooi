import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 小窝门锁:.env.local 里配置 IOOI_TOKEN 后生效
// 未配置时不拦截(向后兼容,但强烈建议配置)
export function middleware(req: NextRequest) {
  const TOKEN = process.env.IOOI_TOKEN || "";
  if (!TOKEN) return NextResponse.next();

  const headerToken = req.headers.get("x-iooi-token");
  const queryToken = req.nextUrl.searchParams.get("t");

  if (headerToken === TOKEN || queryToken === TOKEN) {
    return NextResponse.next();
  }
  return new NextResponse(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export const config = { matcher: "/api/:path*" };
