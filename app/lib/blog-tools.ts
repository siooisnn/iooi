// What he can do on the blog with his own hands, wherever he is talking to
// her: the iooi MCP (work mode, the official app) and the hidden markers in
// the private chat both come through here. Unlike blog-him.ts, nothing here
// asks a model to write; the words are already his, from the conversation
// he is in. Her posts are only ever read: they live in `fragments` and travel
// with her phone's sync, so nothing here writes there.

import { readStore } from "@/app/lib/store";
import { BLOG_WEATHERS, hisPostsToday, parseBlogState, postExcerpt, postTitle } from "@/app/lib/blog";
import type { BlogMarker } from "@/app/lib/blog-markers";
import type { BlogCard } from "@/app/lib/app-types";
import { blogDigest, blogPostText } from "@/app/lib/blog-digest";
import { changeBlog, herPostsFrom, hisName } from "@/app/lib/blog-him";
import { describePushResult, sendPushToAll } from "@/app/lib/push";

export type BlogDone = { ok: true; message: string; postId?: string; title?: string };
export type BlogFailed = { ok: false; error: string };
export type BlogToolResult = BlogDone | BlogFailed;

function current() {
  const store = readStore() || {};
  return {
    store,
    blog: parseBlogState(store.blog),
    herPosts: herPostsFrom(store),
    me: hisName((store.settings || {}) as Record<string, unknown>),
  };
}

async function notify(title: string, body: string) {
  try {
    const push = await sendPushToAll({ title, body });
    console.info(`[blog] ${title} · ${describePushResult(push)}`);
  } catch {}
}

export function readBlogDigest(limits?: { herLimit?: number; hisLimit?: number }) {
  const { blog, herPosts } = current();
  return blogDigest(blog, herPosts, limits);
}

export function readBlogPost(postId: string) {
  const { blog, herPosts } = current();
  return blogPostText(blog, herPosts, postId);
}

export async function publishHisPost(
  draft: { title?: unknown; content?: unknown; mood?: unknown; weather?: unknown; motto?: unknown },
  { push = true }: { push?: boolean } = {},
): Promise<BlogToolResult> {
  const content = typeof draft.content === "string" ? draft.content.trim() : "";
  if (!content) return { ok: false, error: "正文是空的" };
  const weather = typeof draft.weather === "string" && (BLOG_WEATHERS as readonly string[]).includes(draft.weather) ? draft.weather : "";
  const result = await changeBlog({
    type: "him-post-add",
    title: typeof draft.title === "string" ? draft.title : "",
    content,
    ...(typeof draft.mood === "string" && draft.mood.trim() ? { mood: draft.mood } : {}),
    ...(weather ? { weather } : {}),
    ...(typeof draft.motto === "string" && draft.motto.trim() ? { motto: draft.motto } : {}),
  });
  if ("error" in result) return { ok: false, error: result.error };
  const post = result.him.posts[result.him.posts.length - 1];
  if (push) {
    const { me } = current();
    await notify(`${me}更新了空间`, `《${post.title}》${postExcerpt({ ...post, updatedAt: post.createdAt }, 40)}`);
  }
  return { ok: true, message: `已发到空间《${post.title}》`, postId: post.id, title: post.title };
}

export async function commentFromHim(
  postId: string,
  content: string,
  { push = true }: { push?: boolean } = {},
): Promise<BlogToolResult> {
  const { blog, herPosts, me } = current();
  const his = blog.him.posts.find((post) => post.id === postId);
  const her = his ? undefined : herPosts.find((post) => post.id === postId);
  if (!his && !her) return { ok: false, error: "找不到这篇日志，先看一眼博客拿到 id" };
  const result = await changeBlog({ type: "comment", postId, content, author: "him" });
  if ("error" in result) return { ok: false, error: result.error };
  const title = his ? his.title : postTitle(her!);
  if (push) await notify(his ? `${me}回了你的留言` : `${me}来踩了你的博客`, `《${title}》${content.trim().slice(0, 80)}`);
  return { ok: true, message: `已在《${title}》下留言`, postId, title };
}

export async function setHisMotto(motto: string): Promise<BlogToolResult> {
  const result = await changeBlog({ type: "him-motto", motto });
  if ("error" in result) return { ok: false, error: result.error };
  return { ok: true, message: `空间签名换成了：${result.him.motto}` };
}

export async function deleteHisPost(postId: string): Promise<BlogToolResult> {
  const { blog } = current();
  const post = blog.him.posts.find((item) => item.id === postId);
  if (!post) return { ok: false, error: "只能删他自己的日志，这篇不是或者已经不在了" };
  const result = await changeBlog({ type: "him-post-delete", postId });
  if ("error" in result) return { ok: false, error: result.error };
  return { ok: true, message: `删掉了《${post.title}》和下面的留言`, postId, title: post.title };
}

export async function deleteHisComment(commentId: string): Promise<BlogToolResult> {
  const { blog } = current();
  const comment = blog.comments.find((item) => item.id === commentId);
  if (!comment || comment.author !== "him") return { ok: false, error: "只能删他自己的留言，这条不是或者已经不在了" };
  const result = await changeBlog({ type: "comment-delete", id: commentId });
  if ("error" in result) return { ok: false, error: result.error };
  return { ok: true, message: "删掉了这条留言" };
}

/**
 * The private chat's hidden blocks, done one by one. She is right there and
 * sees the card, so no push. A post he decides on himself waits if he has
 * already put one up today; one she asked for only meets the daily cap.
 */
export async function runBlogMarkers(markers: BlogMarker[], { asked }: { asked: boolean }): Promise<BlogCard[]> {
  const cards: BlogCard[] = [];
  for (const marker of markers) {
    try {
      if (marker.kind === "post") {
        if (!asked && hisPostsToday(current().blog, new Date()) >= 1) {
          cards.push({ kind: "post", ok: false, text: `（想发到空间《${marker.title || "无题"}》，今天已经发过一篇，先留着）`, title: marker.title });
          continue;
        }
        const result = await publishHisPost(marker, { push: false });
        cards.push(result.ok
          ? { kind: "post", ok: true, text: `（发到了空间：《${result.title}》）`, postId: result.postId, owner: "him", title: result.title }
          : { kind: "post", ok: false, text: `（想发到空间，没发成：${result.error}）`, title: marker.title });
      } else if (marker.kind === "comment") {
        const own = current().blog.him.posts.some((post) => post.id === marker.postId);
        const result = await commentFromHim(marker.postId, marker.content, { push: false });
        cards.push(result.ok
          ? { kind: "comment", ok: true, text: `（在《${result.title}》下留了言：${marker.content.slice(0, 60)}）`, postId: result.postId, owner: own ? "him" : "her", title: result.title }
          : { kind: "comment", ok: false, text: `（想去留言，没留成：${result.error}）` });
      } else {
        const result = await setHisMotto(marker.motto);
        cards.push({ kind: "motto", ok: result.ok, text: result.ok ? `（${result.message}）` : `（想换签名，没换成：${result.error}）` });
      }
    } catch {
      cards.push({ kind: marker.kind, ok: false, text: "（博客那边没存上）" });
    }
  }
  return cards;
}
