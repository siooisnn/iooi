import { createHmac, timingSafeEqual } from "node:crypto";
import { GROUP_SPEAKERS } from "./group-options";
import { WRITING_TOOLS, type WritingScope } from "./group-writing-tools";
const signature = (value: string) => createHmac("sha256", process.env.IOOI_TOKEN || "").update(`group-writing:${value}`).digest("base64url");
export function groupWritingMcp(scope: WritingScope) {
  if (!process.env.IOOI_TOKEN) throw new Error("写写工具尚未配置认证");
  const value = Buffer.from(JSON.stringify({ ...scope, expires: Date.now() + 20 * 60_000 })).toString("base64url");
  return { servers: { writing: { type: "http", url: `http://127.0.0.1:${process.env.PORT || "3000"}/api/group/writing-tools`, headers: {
    "x-iooi-token": process.env.IOOI_TOKEN, Authorization: `Bearer ${value}.${signature(value)}`,
  } } }, tools: WRITING_TOOLS.map((tool) => `mcp__writing__${tool.name}`) };
}
export function groupWritingScope(authorization: string | null): WritingScope | null {
  if (!process.env.IOOI_TOKEN) return null;
  try {
    const [value, signed, extra] = (authorization || "").replace(/^Bearer /, "").split(".");
    if (extra || !value || !signed) return null;
    const expected = Buffer.from(signature(value));
    const actual = Buffer.from(signed);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const scope = JSON.parse(Buffer.from(value, "base64url").toString());
    return typeof scope.sessionId === "string" && scope.sessionId.length <= 200 && GROUP_SPEAKERS.includes(scope.speaker) && scope.expires > Date.now() ? { sessionId: scope.sessionId, speaker: scope.speaker } : null;
  } catch { return null; }
}
