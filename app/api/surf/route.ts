import { isSurfId, removeFromBoard, replyThread, addThread } from "@/app/lib/surf-board";
import { listBoard } from "@/app/lib/surf-store";
import { withSurfStore } from "@/app/lib/store";

function fail(error: unknown, status = 400) {
  return Response.json({ ok: false, error: error instanceof Error ? error.message : "论坛出了点问题，请稍后再试。" }, { status });
}

/** The whole board, newest activity first. */
export async function GET() {
  return Response.json({ ok: true, threads: listBoard() });
}

/**
 * JSON actions from her page: post (a thread of her own), reply (a floor),
 * delete (any thread or floor: it's her board to tidy).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return fail(new Error("请求不完整。"));
  try {
    if (body.action === "post") {
      const thread = await withSurfStore((store) => addThread(store, { who: "her", title: body.title, content: body.content, links: body.links }));
      return Response.json({ ok: true, thread, threads: listBoard() });
    }
    if (!isSurfId(body.thread)) return fail(new Error("帖子的编号不对。"));
    const threadId = body.thread;
    if (body.action === "reply") {
      const { thread } = await withSurfStore((store) => replyThread(store, threadId, "her", body.content));
      return Response.json({ ok: true, thread, threads: listBoard() });
    }
    if (body.action === "delete") {
      if (body.reply !== undefined && !isSurfId(body.reply)) return fail(new Error("回帖的编号不对。"));
      const replyId = typeof body.reply === "string" ? body.reply : undefined;
      const removed = await withSurfStore((store) => removeFromBoard(store, threadId, replyId));
      if (!removed) return fail(new Error(replyId ? "这条回帖已经不在了。" : "这个帖子已经不在了。"), 404);
      return Response.json({ ok: true, threads: listBoard() });
    }
    return fail(new Error("不认识这个操作。"));
  } catch (error) {
    return fail(error);
  }
}
