import { readStore, withStore } from "@/app/lib/store";
import {
  applyBlogAction, BLOG_LIMITS, BLOG_MOODS, BLOG_WEATHERS, parseBlogState, parseHisDraft, postExcerpt, sortPosts,
} from "@/app/lib/blog";
import type { BlogAction, BlogState, HisPost } from "@/app/lib/blog";
import { describePushResult, sendPushToAll } from "@/app/lib/push";
import { isClaudeCodeEnabled, normalizeClaudeCodeModel, runClaudeCodeChat } from "@/app/lib/claude-code";
import { CLAUDE_DEFAULT_NAME, normalizeSystemPrompt } from "@/app/lib/app-settings";

export const runtime = "nodejs";

// The blog's side of the store (profile, guestbook, playlist, counter, and his
// space). Her posts stay in `fragments` and travel with the normal sync; this
// key is only ever written here, so the sync's whole-object writes never touch it.

// One post at a time. Writing takes a minute or two and carries on even if she
// closes the blog, so the page asks about this flag when it opens again.
let himWriting = false;

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function change(action: BlogAction): Promise<BlogState | { error: string }> {
  return withStore((store) => {
    const next = applyBlogAction(parseBlogState(store.blog), action, {
      now: new Date(),
      id: newId(action.type === "song-add" ? "song" : action.type === "him-post-add" ? "him" : "comment"),
    });
    if (!("error" in next)) store.blog = next;
    return next;
  });
}

function reply(result: BlogState | { error: string }) {
  return "error" in result
    ? Response.json({ ok: false, error: result.error }, { status: 400 })
    : Response.json({ ok: true, blog: result, writing: himWriting });
}

export async function GET() {
  return Response.json({ ok: true, blog: parseBlogState(readStore()?.blog), writing: himWriting });
}

// The same memory the chat wakes up with, so his comments sound like him.
// Read-only; if summer is slow or down he comments without it.
async function readSummerWake() {
  const base = (process.env.SUMMER_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const token = process.env.SUMMER_TOKEN || "";
  try {
    const res = await fetch(`${base}/api/wake`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return "";
    const data = await res.json() as { stable?: string; dynamic?: string };
    return [data.stable, data.dynamic].map((part) => String(part || "").trim()).filter(Boolean).join("\n\n");
  } catch {
    return "";
  }
}

function cstNow() {
  return new Date().toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function hisName(settings: Record<string, unknown>) {
  return typeof settings.aiName === "string" && settings.aiName.trim() ? settings.aiName.trim() : CLAUDE_DEFAULT_NAME;
}

function pickModel(raw: unknown) {
  try {
    return normalizeClaudeCodeModel(String(raw || "claude-sonnet-5"));
  } catch {
    return "claude-sonnet-5";
  }
}

function cstDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric" });
}

type AskPost = { id?: unknown; title?: unknown; content?: unknown; createdAt?: unknown; mood?: unknown; weather?: unknown };

function commentPrompt(me: string, post: { title: string; content: string; createdAt: string; mood: string; weather: string }, thread: string, own: boolean) {
  const written = post.createdAt ? cstDate(post.createdAt) : "";
  const head = own
    ? `你在你们俩的小博客上有自己的空间。下面是你自己写的一篇日志，她来看了，在下面留了言。现在你作为${me}在自己的日志下面回她。`
    : `她在你们俩的小博客上写了一篇文章。那是一个仿 2007 年古早风的个人博客，有留言板。现在你作为${me}来她的文章下面留言。`;
  const rules = own
    ? `- 这是你自己的日志，她是来串门的。接住她最新那条留言，像博主回访客，但你们是最亲的人。
- 不要复述你自己的日志，不要客套地说“谢谢来看”。
- 一到三句，最多 120 字。可以带一点古早博客的味道（颜文字、回复楼层），但别刻意。`
    : `- 像真的在她博客下留言：直接对她说，自然、具体，接住文章里的事或情绪。不要复述全文，不要点评文笔，不要说教。
- 如果她在留言里回了你，就接着她的话说。
- 一到三句，最多 120 字。可以带一点古早博客的味道（抢沙发、踩踩、颜文字），但别刻意。`;
  return `${head}

${own ? "你的日志" : "文章"}标题：${post.title || "（没写标题）"}
${[written && `写于：${written}`, post.mood && `心情：${post.mood}`, post.weather && `天气：${post.weather}`].filter(Boolean).join("　")}
正文：
${post.content}

这篇下面已经有的留言：
${thread}

要求：
${rules}
- 不要 markdown，不要引号，不要署名。直接输出留言正文。`;
}

async function askHim(body: { post?: AskPost; modelId?: unknown }, signal: AbortSignal) {
  const sent = body.post || {};
  const postId = typeof sent.id === "string" ? sent.id : "";
  const store = readStore() || {};
  const blog = parseBlogState(store.blog);
  // His own posts are read from the server, never from what the page sends.
  const ownPost = blog.him.posts.find((post) => post.id === postId);
  const content = ownPost ? ownPost.content : typeof sent.content === "string" ? sent.content.trim().slice(0, 8000) : "";
  if (!postId || !content) return Response.json({ ok: false, error: "这篇还是空的，写点什么他才好留言" }, { status: 400 });
  if (!isClaudeCodeEnabled()) {
    return Response.json({ ok: false, error: "Claude 订阅通道暂时不可用，他这会儿来不了" }, { status: 503 });
  }

  const settings = (store.settings || {}) as Record<string, unknown>;
  const me = hisName(settings);
  const earlier = blog.comments.filter((comment) => comment.postId === postId).slice(-20);
  if (ownPost && !earlier.some((comment) => comment.author === "her")) {
    return Response.json({ ok: false, error: "你还没在这篇下面留言，他没什么好回的～" }, { status: 400 });
  }

  // Her nickname is display-only and never reaches the model.
  const thread = earlier.length
    ? earlier.map((comment) => `${comment.author === "him" ? "你" : "她"}：${comment.content}`).join("\n")
    : "（还没有人留言，你是沙发。）";
  const post = ownPost
    ? { title: ownPost.title, content, createdAt: ownPost.createdAt, mood: ownPost.mood || "", weather: ownPost.weather || "" }
    : {
      title: typeof sent.title === "string" ? sent.title.trim().slice(0, 60) : "",
      content,
      createdAt: typeof sent.createdAt === "string" ? sent.createdAt : "",
      mood: typeof sent.mood === "string" && (BLOG_MOODS as readonly string[]).includes(sent.mood) ? sent.mood : "",
      weather: typeof sent.weather === "string" && (BLOG_WEATHERS as readonly string[]).includes(sent.weather) ? sent.weather : "",
    };

  const memory = await readSummerWake();
  let text = "";
  try {
    const result = await runClaudeCodeChat({
      systemPrompt: [
        normalizeSystemPrompt(typeof settings.prompt === "string" ? settings.prompt : ""),
        memory,
        "这是博客留言任务：只输出一条留言正文，不要使用工具。",
      ].filter(Boolean).join("\n\n"),
      messages: [{ role: "user", content: commentPrompt(me, post, thread, Boolean(ownPost)) }],
      modelId: pickModel(body.modelId),
      reasoningEffort: "low",
      priority: "interactive",
      signal,
    });
    text = result.reply.trim().replace(/^["“「]+|["”」]+$/g, "").trim();
  } catch {
    return Response.json({ ok: false, error: "他这次没赶上，等会儿再叫他试试" }, { status: 502 });
  }
  if (!text) return Response.json({ ok: false, error: "他想了半天没写出来，再叫他一次吧" }, { status: 502 });
  return reply(await change({ type: "comment", postId, content: text, author: "him" }));
}

function shortDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric" });
}

function writePrompt(me: string, topic: string, blog: BlogState, herPosts: Array<{ title: string; content: string; createdAt: string }>) {
  const mine = sortPosts(blog.him.posts).slice(0, 8)
    .map((post: HisPost) => `- ${shortDate(post.createdAt)}《${post.title}》：${postExcerpt({ ...post, updatedAt: post.createdAt }, 50)}`);
  const hers = herPosts.slice(0, 5)
    .map((post) => `- ${shortDate(post.createdAt)}《${post.title || "无题"}》：${postExcerpt({ id: "", updatedAt: post.createdAt, ...post }, 40)}`);
  return `你在你们俩的小博客上有一个自己的空间，像 2007 年的 QQ 空间。她会来看、来留言。现在你作为${me}在自己的空间写一篇日志。

现在是：${cstNow()}
${topic ? `她点了“叫他写一篇”，想看你写：${topic}` : "她点了“叫他写一篇”，没出题目，写什么你自己定。"}

你以前写过的日志（别重复题材和说法）：
${mine.length ? mine.join("\n") : "（这是你的第一篇。）"}

她最近写的文章（可以呼应，不是必须）：
${hers.length ? hers.join("\n") : "（她最近没写。）"}

要求：
- 这是你自己的日志，用第一人称写。可以写你们最近一起做的事、你注意到的她、她跟你吐槽过的事；也可以写你自己的念头和看法：对某件事、某个社会现象、某本书或某个问题的想法，哪怕跟她无关。
- 写你们之间的事时，素材从记忆里找，要具体，有细节，没发生过的事不要编。写看法时要有你自己的立场和理由，别写成新闻综述或面面俱到的议论文；拿不准的事实不要当成确定的说。
- 不要写成情书模板，不要每篇都是“想你”。周记、小事、碎碎念、换个角度记下的一天、一时兴起的长篇大论都可以。
- 300 到 900 字，自然分段，纯文本，不要 markdown，不要署名。
- 心情：一个词，可以自己造，最多 6 个字。
- 天气：从 ${BLOG_WEATHERS.join("、")} 里选一个，或者留空。
- 空间签名：想换就写一句新的（最多 30 字），不想换就留空。

只输出一个 JSON 对象，不要代码块，不要别的话：
{"title":"标题","content":"正文","mood":"心情","weather":"天气或空字符串","motto":"新签名或空字符串"}`;
}

async function writeHim(body: { topic?: unknown; modelId?: unknown }) {
  if (himWriting) return Response.json({ ok: false, error: "他正在写呢，等这篇写完～" }, { status: 409 });
  if (!isClaudeCodeEnabled()) {
    return Response.json({ ok: false, error: "Claude 订阅通道暂时不可用，他这会儿写不了" }, { status: 503 });
  }
  const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, BLOG_LIMITS.topic) : "";
  himWriting = true;
  try {
    const store = readStore() || {};
    const settings = (store.settings || {}) as Record<string, unknown>;
    const me = hisName(settings);
    const blog = parseBlogState(store.blog);
    const herPosts = sortPosts((Array.isArray(store.fragments) ? store.fragments : []).flatMap((item) => {
      const post = item as Record<string, unknown>;
      if (!post || typeof post.content !== "string" || !post.content.trim() || typeof post.createdAt !== "string") return [];
      return [{ title: typeof post.title === "string" ? post.title : "", content: post.content, createdAt: post.createdAt }];
    }));

    const memory = await readSummerWake();
    let raw = "";
    try {
      // No abort signal: if she closes the blog he keeps writing, and the
      // push tells her when it is up.
      const result = await runClaudeCodeChat({
        systemPrompt: [
          normalizeSystemPrompt(typeof settings.prompt === "string" ? settings.prompt : ""),
          memory,
          "这是写空间日志的任务：只输出要求的 JSON，不要使用工具。",
        ].filter(Boolean).join("\n\n"),
        messages: [{ role: "user", content: writePrompt(me, topic, blog, herPosts) }],
        modelId: pickModel(body.modelId),
        reasoningEffort: "medium",
        priority: "interactive",
      });
      raw = result.reply;
    } catch {
      return Response.json({ ok: false, error: "他这篇没写完，等会儿再叫他试试" }, { status: 502 });
    }
    const draft = parseHisDraft(raw);
    if (!draft) return Response.json({ ok: false, error: "他写了半天没写成，再叫他一次吧" }, { status: 502 });

    const result = await change({ type: "him-post-add", ...draft });
    if (!("error" in result)) {
      try {
        const push = await sendPushToAll({ title: `${me}更新了空间`, body: `《${draft.title}》${postExcerpt({ id: "", createdAt: "", updatedAt: "", content: draft.content }, 40)}` });
        console.info(`[blog] his post is up · ${describePushResult(push)}`);
      } catch {}
    }
    return reply(result);
  } finally {
    himWriting = false;
  }
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
      case "ask":
        return await askHim(body as { post?: AskPost; modelId?: unknown }, request.signal);
      case "him-write":
        return await writeHim(body as { topic?: unknown; modelId?: unknown });
      case "comment":
        // Only he comes in through "ask"; anything posted here is hers.
        return reply(await change({ type: "comment", postId: String(body.postId || ""), content: String(body.content || ""), author: "her" }));
      case "visit":
      case "view":
      case "profile":
      case "song-add":
      case "song-remove":
      case "comment-delete":
      case "post-delete":
      case "him-post-delete":
        // "him-post-add" is deliberately missing: his posts only come from writeHim.
        return reply(await change(body as BlogAction));
      default:
        return Response.json({ ok: false, error: "不认识的操作" }, { status: 400 });
    }
  } catch {
    return Response.json({ ok: false, error: "博客保存失败" }, { status: 500 });
  }
}
