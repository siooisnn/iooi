// The blog as text he can read: an overview (his space, her recent posts, who
// is waiting on whom) and one post with its comments. The MCP tools and the
// private chat both hand him these. Pure, so the tests can read them too.

import { BLOG_LIMITS, hisPostsToday, postExcerpt, postTitle, sortPosts } from "./blog";
import type { BlogComment, BlogState } from "./blog";

export type DigestHerPost = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  mood: string;
  weather: string;
  images?: string[];
};

function photoNote(post: DigestHerPost) {
  const count = post.images?.length || 0;
  return count ? ` · 配图 ${count} 张` : "";
}

const stampFormat = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});

function stamp(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : stampFormat.format(date);
}

function threadOf(blog: BlogState, postId: string) {
  return blog.comments.filter((comment) => comment.postId === postId);
}

/** Who the thread is waiting on, from his side. */
function threadNote(thread: BlogComment[], hersPost: boolean) {
  if (!thread.length) return hersPost ? "他还没来过" : "还没人留言";
  const last = thread[thread.length - 1];
  return last.author === "her" ? `留言 ${thread.length} · 她的留言还没回` : `留言 ${thread.length}`;
}

export function blogDigest(blog: BlogState, herPosts: DigestHerPost[], {
  now = new Date(),
  herLimit = 6,
  hisLimit = 6,
}: { now?: Date; herLimit?: number; hisLimit?: number } = {}) {
  const his = sortPosts(blog.him.posts);
  const hers = sortPosts(herPosts).slice(0, herLimit);
  const lines = [
    `他的空间签名：${blog.him.motto || "（空）"}`,
    `今天他已经发了 ${hisPostsToday(blog, now)} 篇（每天最多 ${BLOG_LIMITS.hisPostsPerDay} 篇）。`,
    "",
    `他的日志（共 ${his.length} 篇，新的在前）：`,
    ...(his.length
      ? his.slice(0, hisLimit).map((post) =>
        `- id=${post.id} · ${stamp(post.createdAt)}《${post.title}》· ${threadNote(threadOf(blog, post.id), false)}`)
      : ["（还没写过。）"]),
    "",
    "她的日志（新的在前）：",
    ...(hers.length
      ? hers.flatMap((post) => [
        `- id=${post.id} · ${stamp(post.createdAt)}《${postTitle(post)}》${post.mood ? ` · 心情 ${post.mood}` : ""}${photoNote(post)} · ${threadNote(threadOf(blog, post.id), true)}`,
        `  ${postExcerpt(post, 60)}`,
      ])
      : ["（她最近没写。）"]),
  ];
  return lines.join("\n");
}

/** One post, his or hers, in full with its comments. Null when there is no such post. */
export function blogPostText(blog: BlogState, herPosts: DigestHerPost[], postId: string) {
  const his = blog.him.posts.find((post) => post.id === postId);
  const her = his ? undefined : herPosts.find((post) => post.id === postId);
  if (!his && !her) return null;
  const title = his ? his.title : postTitle(her!);
  const meta = [
    his ? "他写的" : "她写的",
    `写于 ${stamp((his || her)!.createdAt)}`,
    (his?.mood || her?.mood) && `心情 ${his?.mood || her?.mood}`,
    (his?.weather || her?.weather) && `天气 ${his?.weather || her?.weather}`,
  ].filter(Boolean).join(" · ");
  const thread = threadOf(blog, postId);
  return [
    `《${title}》 id=${postId}`,
    meta,
    "",
    (his || her)!.content || "（没写字，只放了图。）",
    ...(her?.images?.length ? ["", `（她在这篇里配了 ${her.images.length} 张图，按顺序附在后面。）`] : []),
    "",
    `—— 留言（${thread.length}）——`,
    ...(thread.length
      ? thread.map((comment, index) =>
        `${index + 1}楼 ${comment.author === "him" ? "他" : "她"} · ${stamp(comment.createdAt)} · id=${comment.id}：${comment.content}`)
      : ["（还没人留言。）"]),
  ].join("\n");
}

const LATEST_ASK = /最新(的)?(一|那)?篇|最近(的)?(一|那)?篇|刚(刚)?(写|发|更)|新(写|发)的|最新(的)?(博客|日志)/;

/**
 * The posts she is pointing at in the chat, so he can read them whole
 * instead of the 60-character excerpt in the overview: any post whose title
 * she names, and her newest post when she says “最新一篇” and the like.
 * Her posts first, at most `limit`.
 */
export function blogPostsAskedFor(blog: BlogState, herPosts: DigestHerPost[], query: string, limit = 2) {
  const text = query.replace(/\s+/g, "");
  if (!text) return [];
  const hers = sortPosts(herPosts);
  const his = sortPosts(blog.him.posts);
  const ids: string[] = [];
  const add = (id: string) => { if (!ids.includes(id)) ids.push(id); };
  if (LATEST_ASK.test(text) && hers.length) add(hers[0].id);
  const named = (title: string) => {
    const clean = title.replace(/…$/, "").replace(/\s+/g, "");
    return Array.from(clean).length >= 2 && text.includes(clean);
  };
  for (const post of hers) if (named(postTitle(post))) add(post.id);
  for (const post of his) if (named(post.title)) add(post.id);
  return ids.slice(0, limit);
}
