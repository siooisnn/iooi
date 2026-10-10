import { readStore } from "@/app/lib/store";
import { parseBlogState } from "@/app/lib/blog";
import type { BlogAction, BlogState } from "@/app/lib/blog";
import { changeBlog, commentAsHim, himWritingVisible, writeHisPost } from "@/app/lib/blog-him";
import type { AskPost, HimResult } from "@/app/lib/blog-him";

export const runtime = "nodejs";

// The blog's side of the store (profile, guestbook, playlist, counter, and his
// space). Her posts stay in `fragments` and travel with the normal sync; this
// key is only ever written on the server, so the sync's whole-object writes
// never touch it. His writing and commenting live in blog-him.ts, shared with
// the heartbeat.

function reply(result: BlogState | { error: string }) {
  return "error" in result
    ? Response.json({ ok: false, error: result.error }, { status: 400 })
    : Response.json({ ok: true, blog: result, writing: himWritingVisible() });
}

function replyHim(result: HimResult) {
  if (result.kind === "done") return reply(result.blog);
  if (result.kind === "skipped") return Response.json({ ok: false, error: result.reason }, { status: 409 });
  return Response.json({ ok: false, error: result.error }, { status: result.status });
}

export async function GET() {
  return Response.json({ ok: true, blog: parseBlogState(readStore()?.blog), writing: himWritingVisible() });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "请求格式不对" }, { status: 400 });
  }
  try {
    switch (body.type) {
      case "ask": {
        const post = (body.post || {}) as AskPost;
        return replyHim(await commentAsHim({
          postId: typeof post.id === "string" ? post.id : "",
          sent: post,
          modelId: body.modelId,
          signal: request.signal,
        }));
      }
      case "him-write":
        return replyHim(await writeHisPost({ topic: typeof body.topic === "string" ? body.topic.trim() : "", modelId: body.modelId }));
      case "comment":
        // Only he comes in through "ask"; anything posted here is hers.
        return reply(await changeBlog({ type: "comment", postId: String(body.postId || ""), content: String(body.content || ""), author: "her" }));
      case "visit":
      case "view":
      case "profile":
      case "song-add":
      case "song-remove":
      case "comment-delete":
      case "post-delete":
      case "him-post-delete":
        // "him-post-add" is deliberately missing: his posts only come from writeHisPost.
        return reply(await changeBlog(body as BlogAction));
      default:
        return Response.json({ ok: false, error: "不认识的操作" }, { status: 400 });
    }
  } catch {
    return Response.json({ ok: false, error: "博客保存失败" }, { status: 500 });
  }
}
