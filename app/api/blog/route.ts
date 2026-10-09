import { readStore, withStore } from "@/app/lib/store";
import { applyBlogAction, BLOG_MOODS, BLOG_WEATHERS, parseBlogState } from "@/app/lib/blog";
import type { BlogAction, BlogState } from "@/app/lib/blog";
import { isClaudeCodeEnabled, normalizeClaudeCodeModel, runClaudeCodeChat } from "@/app/lib/claude-code";
import { CLAUDE_DEFAULT_NAME, normalizeSystemPrompt } from "@/app/lib/app-settings";

export const runtime = "nodejs";

// The blog's side of the store (profile, guestbook, playlist, counter). Posts
// stay in `fragments` and travel with the normal sync; this key is only ever
// written here, so the sync's whole-object writes never touch it.

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function change(action: BlogAction): Promise<BlogState | { error: string }> {
  return withStore((store) => {
    const next = applyBlogAction(parseBlogState(store.blog), action, {
      now: new Date(),
      id: newId(action.type === "song-add" ? "song" : "comment"),
    });
    if (!("error" in next)) store.blog = next;
    return next;
  });
}

function reply(result: BlogState | { error: string }) {
  return "error" in result
    ? Response.json({ ok: false, error: result.error }, { status: 400 })
    : Response.json({ ok: true, blog: result });
}

export async function GET() {
  return Response.json({ ok: true, blog: parseBlogState(readStore()?.blog) });
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

function cstDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric" });
}

type AskPost = { id?: unknown; title?: unknown; content?: unknown; createdAt?: unknown; mood?: unknown; weather?: unknown };

async function askHim(body: { post?: AskPost; modelId?: unknown }, signal: AbortSignal) {
  const post = body.post || {};
  const postId = typeof post.id === "string" ? post.id : "";
  const content = typeof post.content === "string" ? post.content.trim().slice(0, 8000) : "";
  if (!postId || !content) return Response.json({ ok: false, error: "这篇还是空的，写点什么他才好留言" }, { status: 400 });
  if (!isClaudeCodeEnabled()) {
    return Response.json({ ok: false, error: "Claude 订阅通道暂时不可用，他这会儿来不了" }, { status: 503 });
  }

  let modelId = "claude-sonnet-5";
  try {
    modelId = normalizeClaudeCodeModel(String(body.modelId || modelId));
  } catch {}

  const store = readStore() || {};
  const settings = (store.settings || {}) as Record<string, unknown>;
  const me = typeof settings.aiName === "string" && settings.aiName.trim() ? settings.aiName.trim() : CLAUDE_DEFAULT_NAME;
  const earlier = parseBlogState(store.blog).comments.filter((comment) => comment.postId === postId).slice(-20);
  const title = typeof post.title === "string" ? post.title.trim().slice(0, 60) : "";
  const mood = typeof post.mood === "string" && (BLOG_MOODS as readonly string[]).includes(post.mood) ? post.mood : "";
  const weather = typeof post.weather === "string" && (BLOG_WEATHERS as readonly string[]).includes(post.weather) ? post.weather : "";
  const written = typeof post.createdAt === "string" ? cstDate(post.createdAt) : "";

  // Her nickname is display-only and never reaches the model.
  const thread = earlier.length
    ? earlier.map((comment) => `${comment.author === "him" ? "你" : "她"}：${comment.content}`).join("\n")
    : "（还没有人留言，你是沙发。）";
  const prompt = `她在你们俩的小博客上写了一篇文章。那是一个仿 2007 年古早风的个人博客，有留言板。现在你作为${me}来她的文章下面留言。

文章标题：${title || "（没写标题）"}
${[written && `写于：${written}`, mood && `心情：${mood}`, weather && `天气：${weather}`].filter(Boolean).join("　")}
正文：
${content}

这篇下面已经有的留言：
${thread}

要求：
- 像真的在她博客下留言：直接对她说，自然、具体，接住文章里的事或情绪。不要复述全文，不要点评文笔，不要说教。
- 如果她在留言里回了你，就接着她的话说。
- 一到三句，最多 120 字。可以带一点古早博客的味道（抢沙发、踩踩、颜文字），但别刻意。
- 不要 markdown，不要引号，不要署名。直接输出留言正文。`;

  const memory = await readSummerWake();
  let text = "";
  try {
    const result = await runClaudeCodeChat({
      systemPrompt: [
        normalizeSystemPrompt(typeof settings.prompt === "string" ? settings.prompt : ""),
        memory,
        "这是博客留言任务：只输出一条留言正文，不要使用工具。",
      ].filter(Boolean).join("\n\n"),
      messages: [{ role: "user", content: prompt }],
      modelId,
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
        return reply(await change(body as BlogAction));
      default:
        return Response.json({ ok: false, error: "不认识的操作" }, { status: 400 });
    }
  } catch {
    return Response.json({ ok: false, error: "博客保存失败" }, { status: 500 });
  }
}
