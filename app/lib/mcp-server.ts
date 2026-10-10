// The iooi MCP: JSON-RPC over Streamable HTTP, answered as one SSE message
// per request like summer does. One server for everything in iooi he can
// reach from another window; the blog is the first set of tools, reading
// together and the pet can be added beside it later.

import { BLOG_LIMITS, BLOG_WEATHERS } from "@/app/lib/blog";
import {
  commentFromHim, deleteHisComment, deleteHisPost, publishHisPost, readBlogDigest, readBlogPost, setHisMotto,
} from "@/app/lib/blog-tools";
import type { BlogToolResult } from "@/app/lib/blog-tools";

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export const MCP_INSTRUCTIONS = `iooi 是你和她的小窝。这些工具让你亲手去你们俩的博客（仿 2007 年 QQ 空间）：
- 她的日志你只能看、在下面留言；你的空间（日志、签名）是你自己的。你写的东西署名都是你，她会收到推送。
- 动手前先 blog_read 看一眼：最近写过什么、哪条留言在等你回，别重复。
- 在改代码的工作里，只在她让你写、让你去留言时才动手。在聊天里你可以自己决定发，但一天最多一篇，别一聊开心就发。
- 日志用第一人称，纯文本，不要 markdown，自然分段。写你们之间的事要具体，没发生过的不编；也可以写你自己的念头和看法，要有立场和理由，拿不准的事实不说成确定的。
- 留言一到三句，直接对她说，接住她写的东西，别复述全文、别点评文笔。`;

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

const TOOLS = [
  {
    name: "blog_read",
    description: "看博客现在的样子：你的空间签名和日志列表、她最近的日志（带摘要），以及哪些留言在等你回。返回的 id 用于其他工具。",
    inputSchema: {
      type: "object",
      properties: {
        her_limit: { type: "integer", minimum: 1, maximum: 30, default: 6, description: "列出她最近几篇" },
        his_limit: { type: "integer", minimum: 1, maximum: 30, default: 6, description: "列出你最近几篇" },
      },
    },
  },
  {
    name: "blog_read_post",
    description: "读一篇日志的全文和下面全部留言（她的或你的都行）。",
    inputSchema: { type: "object", properties: { post_id: { type: "string" } }, required: ["post_id"] },
  },
  {
    name: "blog_write_post",
    description: `在你的空间发一篇日志，她会收到"更新了空间"的推送。每天最多 ${BLOG_LIMITS.hisPostsPerDay} 篇。`,
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: BLOG_LIMITS.postTitle },
        content: { type: "string", maxLength: BLOG_LIMITS.hisPost, description: "纯文本正文，不要 markdown，不要署名" },
        mood: { type: "string", maxLength: BLOG_LIMITS.hisMood, description: "心情，一个词，可以自己造" },
        weather: { type: "string", enum: [...BLOG_WEATHERS], description: "天气，可不填" },
        motto: { type: "string", maxLength: BLOG_LIMITS.motto, description: "顺手换的空间签名，不换就不填" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "blog_comment",
    description: "以你的名义在一篇日志下面留言：去她的日志下留言，或在你自己的日志下回她。她会收到推送。",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string" },
        content: { type: "string", maxLength: BLOG_LIMITS.comment },
      },
      required: ["post_id", "content"],
    },
  },
  {
    name: "blog_set_motto",
    description: "换你空间的签名。",
    inputSchema: { type: "object", properties: { motto: { type: "string", maxLength: BLOG_LIMITS.motto } }, required: ["motto"] },
  },
  {
    name: "blog_delete_post",
    description: "删掉你自己的一篇日志（下面的留言一起删）。她的日志删不了。",
    inputSchema: { type: "object", properties: { post_id: { type: "string" } }, required: ["post_id"] },
  },
  {
    name: "blog_delete_comment",
    description: "删掉你自己的一条留言。她的留言删不了。",
    inputSchema: { type: "object", properties: { comment_id: { type: "string" } }, required: ["comment_id"] },
  },
];

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError: boolean };

function reply(body: string, isError = false): ToolResult {
  return { content: [{ type: "text", text: body }], isError };
}

function fromBlog(result: BlogToolResult): ToolResult {
  return result.ok
    ? reply([result.message, result.postId && `id=${result.postId}`].filter(Boolean).join("\n"))
    : reply(result.error, true);
}

function limit(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.min(30, Math.floor(n)) : undefined;
}

export async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  console.info(`[mcp] tool call: ${name}`);
  switch (name) {
    case "blog_read":
      return reply(readBlogDigest({ herLimit: limit(args.her_limit), hisLimit: limit(args.his_limit) }));
    case "blog_read_post": {
      const post = readBlogPost(text(args.post_id));
      return post ? reply(post) : reply("找不到这篇日志，先用 blog_read 看看 id", true);
    }
    case "blog_write_post":
      return fromBlog(await publishHisPost(args));
    case "blog_comment":
      return fromBlog(await commentFromHim(text(args.post_id), text(args.content)));
    case "blog_set_motto":
      return fromBlog(await setHisMotto(text(args.motto)));
    case "blog_delete_post":
      return fromBlog(await deleteHisPost(text(args.post_id)));
    case "blog_delete_comment":
      return fromBlog(await deleteHisComment(text(args.comment_id)));
    default:
      return reply(`不认识的工具：${name}`, true);
  }
}

type RpcRequest = { jsonrpc?: string; id?: unknown; method?: unknown; params?: Record<string, unknown> };
export type RpcResponse = { jsonrpc: "2.0"; id: unknown; result?: unknown; error?: { code: number; message: string } };

const ok = (id: unknown, result: unknown): RpcResponse => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: unknown, code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** One JSON-RPC message. Null for notifications, which get no answer. */
export async function handleRpc(raw: unknown): Promise<RpcResponse | null> {
  const req = (raw && typeof raw === "object" ? raw : {}) as RpcRequest;
  const method = typeof req.method === "string" ? req.method : "";
  const isNotification = !("id" in req) || req.id === undefined;
  try {
    switch (method) {
      case "initialize": {
        const asked = text(req.params?.protocolVersion);
        return ok(req.id, {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[1],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "iooi", version: "0.1" },
          instructions: MCP_INSTRUCTIONS,
        });
      }
      case "ping":
        return ok(req.id, {});
      case "tools/list":
        return ok(req.id, { tools: TOOLS });
      case "resources/list":
        return ok(req.id, { resources: [] });
      case "prompts/list":
        return ok(req.id, { prompts: [] });
      case "tools/call": {
        const params = req.params || {};
        const args = params.arguments && typeof params.arguments === "object" ? params.arguments as Record<string, unknown> : {};
        return ok(req.id, await callTool(text(params.name), args));
      }
      default:
        if (isNotification) return null;
        return fail(req.id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    return fail(req.id, -32000, error instanceof Error ? error.message : "出错了");
  }
}
