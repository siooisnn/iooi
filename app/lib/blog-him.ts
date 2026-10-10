// His side of the blog, on the server: writing a post in his space, leaving a
// comment, and the heartbeat's quiet visits. The blog route uses this when she
// asks; /api/care uses it when nobody asks. The pure decisions live in blog.ts.

import { readStore, withStore } from "@/app/lib/store";
import {
  applyBlogAction, BLOG_BEAT, BLOG_LIMITS, BLOG_MOODS, BLOG_WEATHERS, latestHisPost, parseBlogState, parseHisDecision,
  pickBlogVisit, postExcerpt, postImages, postTitle, shouldConsiderWriting, sortPosts,
} from "@/app/lib/blog";
import { loadUploadImages } from "@/app/lib/upload-images";
import type { BlogAction, BlogState, HisDraft, HisPost } from "@/app/lib/blog";
import { describePushResult, sendPushToAll } from "@/app/lib/push";
import { isClaudeCodeEnabled, normalizeClaudeCodeModel, runClaudeCodeChat } from "@/app/lib/claude-code";
import { CLAUDE_DEFAULT_NAME, MODELS, normalizeSystemPrompt } from "@/app/lib/app-settings";

// One post at a time. Kept on globalThis so the blog route and the heartbeat
// route see the same desk even if they are bundled apart. "auto" never shows
// on the page: she should find out from the push, not from a notepad.
type Desk = { writing: "asked" | "auto" | null };
const desk: Desk = ((globalThis as { __iooiHisDesk?: Desk }).__iooiHisDesk ??= { writing: null });

/** Whether the page should show "正在写日志…". Only when she asked. */
export function himWritingVisible() {
  return desk.writing === "asked";
}

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function changeBlog(action: BlogAction): Promise<BlogState | { error: string }> {
  return withStore((store) => {
    const next = applyBlogAction(parseBlogState(store.blog), action, {
      now: new Date(),
      id: newId(action.type === "song-add" ? "song" : action.type === "him-post-add" ? "him" : "comment"),
    });
    if (!("error" in next)) store.blog = next;
    return next;
  });
}

// The same memory the chat wakes up with, so he sounds like himself.
// Read-only; if summer is slow or down he goes ahead without it.
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

function cstHour() {
  return (new Date().getUTCHours() + 8) % 24;
}

function cstDay() {
  return new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

export function hisName(settings: Record<string, unknown>) {
  return typeof settings.aiName === "string" && settings.aiName.trim() ? settings.aiName.trim() : CLAUDE_DEFAULT_NAME;
}

function pickModel(raw: unknown) {
  try {
    return normalizeClaudeCodeModel(String(raw || "claude-sonnet-5"));
  } catch {
    return "claude-sonnet-5";
  }
}

/** The chat's model, for when nobody on the page picked one. */
function settingsModel(settings: Record<string, unknown>) {
  return (MODELS.find((model) => model.id === settings.model) || MODELS[0]).apiId;
}

function cstDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric" });
}

function shortDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric" });
}

function systemPrompt(settings: Record<string, unknown>, memory: string, task: string) {
  return [normalizeSystemPrompt(typeof settings.prompt === "string" ? settings.prompt : ""), memory, task].filter(Boolean).join("\n\n");
}

export type HerPost = {
  id: string; title: string; content: string; createdAt: string; updatedAt: string; mood: string; weather: string; images: string[];
};

/** Her posts as stored by the sync (`fragments`), newest first. */
export function herPostsFrom(store: Record<string, unknown>): HerPost[] {
  return sortPosts((Array.isArray(store.fragments) ? store.fragments : []).flatMap((item) => {
    const post = item as Record<string, unknown>;
    if (!post || typeof post.id !== "string" || typeof post.content !== "string") return [];
    const images = postImages(post);
    if ((!post.content.trim() && !images.length) || typeof post.createdAt !== "string") return [];
    return [{
      id: post.id,
      title: typeof post.title === "string" ? post.title : "",
      content: post.content,
      createdAt: post.createdAt,
      updatedAt: typeof post.updatedAt === "string" ? post.updatedAt : post.createdAt,
      mood: typeof post.mood === "string" && (BLOG_MOODS as readonly string[]).includes(post.mood) ? post.mood : "",
      weather: typeof post.weather === "string" && (BLOG_WEATHERS as readonly string[]).includes(post.weather) ? post.weather : "",
      images,
    }];
  }));
}

// ── Comments ──

type PostForComment = { title: string; content: string; createdAt: string; mood: string; weather: string; images: number };

function commentPrompt(me: string, post: PostForComment, thread: string, own: boolean, auto: boolean) {
  const written = post.createdAt ? cstDate(post.createdAt) : "";
  const head = own
    ? `你在你们俩的小博客上有自己的空间。下面是你自己写的一篇日志，她来看了，在下面留了言。现在你作为${me}在自己的日志下面回她。`
    : auto
      ? `她在你们俩的小博客上写了一篇文章。那是一个仿 2007 年古早风的个人博客，有留言板。她没叫你，是你自己过来串门看到的。现在你作为${me}在她的文章下面留言。`
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
${post.content || "（没写字，只放了图。）"}
${post.images ? `\n她在文章里配了 ${post.images} 张图，附在这段话后面，按顺序排。图也是文章的一部分：看清楚图里是什么，可以接着图说，但别一张张描述。\n` : ""}
这篇下面已经有的留言：
${thread}

要求：
${rules}
- 不要 markdown，不要引号，不要署名。直接输出留言正文。`;
}

export type AskPost = { id?: unknown; title?: unknown; content?: unknown; createdAt?: unknown; mood?: unknown; weather?: unknown; images?: unknown };

export type HimResult =
  | { kind: "done"; blog: BlogState }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; error: string; status: number };

/**
 * He leaves a comment under a post. When she asks, the page sends her post
 * (it may have unsynced edits); on his own he reads it from the store. His
 * own posts always come from the store. `expectLast` makes an unasked visit
 * stand down if someone else spoke in the thread while he was thinking.
 */
export async function commentAsHim({ postId, sent, modelId, auto = false, signal }: {
  postId: string;
  sent?: AskPost;
  modelId?: unknown;
  auto?: boolean;
  signal?: AbortSignal;
}): Promise<HimResult> {
  const store = readStore() || {};
  const blog = parseBlogState(store.blog);
  const ownPost = blog.him.posts.find((post) => post.id === postId);
  const stored = ownPost ? undefined : herPostsFrom(store).find((post) => post.id === postId);
  const given = sent || {};
  const fromPage = !ownPost && !auto && (typeof given.content === "string" || Array.isArray(given.images));
  const content = ownPost ? ownPost.content
    : fromPage ? (typeof given.content === "string" ? given.content.trim().slice(0, 8000) : "")
      : stored?.content.trim().slice(0, 8000) || "";
  // Only her own uploads; his posts have no photos.
  const imageUrls = ownPost ? [] : fromPage ? postImages(given) : stored?.images || [];
  const images = loadUploadImages(imageUrls);
  if (!postId || (!content && !images.length)) return { kind: "failed", error: "这篇还是空的，写点什么他才好留言", status: 400 };
  if (!isClaudeCodeEnabled()) return { kind: "failed", error: "Claude 订阅通道暂时不可用，他这会儿来不了", status: 503 };

  const settings = (store.settings || {}) as Record<string, unknown>;
  const me = hisName(settings);
  const earlier = blog.comments.filter((comment) => comment.postId === postId).slice(-20);
  if (ownPost && !earlier.some((comment) => comment.author === "her")) {
    return { kind: "failed", error: "你还没在这篇下面留言，他没什么好回的～", status: 400 };
  }
  const lastBefore = earlier[earlier.length - 1]?.id || "";

  // Her nickname is display-only and never reaches the model.
  const thread = earlier.length
    ? earlier.map((comment) => `${comment.author === "him" ? "你" : "她"}：${comment.content}`).join("\n")
    : "（还没有人留言，你是沙发。）";
  const post: PostForComment = ownPost
    ? { title: ownPost.title, content, createdAt: ownPost.createdAt, mood: ownPost.mood || "", weather: ownPost.weather || "", images: 0 }
    : !fromPage && stored
      ? { title: stored.title, content, createdAt: stored.createdAt, mood: stored.mood, weather: stored.weather, images: images.length }
      : {
        title: typeof given.title === "string" ? given.title.trim().slice(0, 60) : "",
        content,
        createdAt: typeof given.createdAt === "string" ? given.createdAt : "",
        mood: typeof given.mood === "string" && (BLOG_MOODS as readonly string[]).includes(given.mood) ? given.mood : "",
        weather: typeof given.weather === "string" && (BLOG_WEATHERS as readonly string[]).includes(given.weather) ? given.weather : "",
        images: images.length,
      };

  const memory = await readSummerWake();
  let text = "";
  try {
    const result = await runClaudeCodeChat({
      systemPrompt: systemPrompt(settings, memory, "这是博客留言任务：只输出一条留言正文，不要使用工具。"),
      messages: [{
        role: "user",
        content: images.length
          ? [{ type: "text", text: commentPrompt(me, post, thread, Boolean(ownPost), auto) }, ...images]
          : commentPrompt(me, post, thread, Boolean(ownPost), auto),
      }],
      modelId: pickModel(modelId ?? settingsModel(settings)),
      reasoningEffort: "low",
      priority: auto ? "background" : "interactive",
      signal,
    });
    text = result.reply.trim().replace(/^["“「]+|["”」]+$/g, "").trim();
  } catch {
    return { kind: "failed", error: "他这次没赶上，等会儿再叫他试试", status: 502 };
  }
  if (!text) return { kind: "failed", error: "他想了半天没写出来，再叫他一次吧", status: 502 };

  const saved = await withStore((current): BlogState | { error: string } | null => {
    const state = parseBlogState(current.blog);
    if (auto) {
      const thread = state.comments.filter((comment) => comment.postId === postId);
      if ((thread[thread.length - 1]?.id || "") !== lastBefore) return null;
    }
    const next = applyBlogAction(state, { type: "comment", postId, content: text, author: "him" }, { now: new Date(), id: newId("comment") });
    if (!("error" in next)) current.blog = next;
    return next;
  });
  if (!saved) return { kind: "skipped", reason: "他想好的时候，这条留言下面已经有新回复了" };
  if ("error" in saved) return { kind: "failed", error: saved.error, status: 400 };

  if (auto) {
    const title = ownPost ? ownPost.title : postTitle({ id: postId, content, createdAt: post.createdAt, updatedAt: post.createdAt, title: post.title, images: imageUrls });
    try {
      const push = await sendPushToAll({
        title: ownPost ? `${me}回了你的留言` : `${me}来踩了你的博客`,
        body: `《${title}》${text.slice(0, 80)}`,
      });
      console.info(`[blog] his visit · ${describePushResult(push)}`);
    } catch {}
  }
  return { kind: "done", blog: saved };
}

// ── Posts ──

function writePrompt(me: string, topic: string, blog: BlogState, herPosts: HerPost[], auto: boolean) {
  const mine = sortPosts(blog.him.posts).slice(0, 8)
    .map((post: HisPost) => `- ${shortDate(post.createdAt)}《${post.title}》：${postExcerpt({ ...post, updatedAt: post.createdAt }, 50)}`);
  const hers = herPosts.slice(0, 5)
    .map((post) => `- ${shortDate(post.createdAt)}《${post.title || "无题"}》：${postExcerpt(post, 40)}`);
  const ask = auto
    ? "没人叫你写。你隔了一阵自己来空间看看，想想要不要写一篇。"
    : topic ? `她点了“叫他写一篇”，想看你写：${topic}` : "她点了“叫他写一篇”，没出题目，写什么你自己定。";
  const post = `{"title":"标题","content":"正文","mood":"心情","weather":"天气或空字符串","motto":"新签名或空字符串"}`;
  return `你在你们俩的小博客上有一个自己的空间，像 2007 年的 QQ 空间。她会来看、来留言。现在你作为${me}在自己的空间写一篇日志。

现在是：${cstNow()}
${ask}

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
${auto ? `- 这次是你自己想写才写。手上没有真想写的东西，就不写，别为了更新凑一篇。

只输出一个 JSON 对象，不要代码块，不要别的话。想写就输出：
${post}
不想写就输出：
{"skip":true,"reason":"为什么今天不写"}` : `
只输出一个 JSON 对象，不要代码块，不要别的话：
${post}`}`;
}

/**
 * He writes a post in his space. Asked: she is waiting (the page shows a
 * notepad). Auto: the heartbeat sent him, he may decide not to write, and
 * nothing shows until the push.
 */
export async function writeHisPost({ topic = "", modelId, auto = false }: { topic?: string; modelId?: unknown; auto?: boolean }): Promise<HimResult> {
  if (desk.writing) {
    return { kind: "failed", error: desk.writing === "asked" ? "他正在写呢，等这篇写完～" : "他这会儿在忙，等会儿再叫他", status: 409 };
  }
  if (!isClaudeCodeEnabled()) return { kind: "failed", error: "Claude 订阅通道暂时不可用，他这会儿写不了", status: 503 };
  desk.writing = auto ? "auto" : "asked";
  try {
    const store = readStore() || {};
    const settings = (store.settings || {}) as Record<string, unknown>;
    const me = hisName(settings);
    const blog = parseBlogState(store.blog);
    const memory = await readSummerWake();
    let raw = "";
    try {
      // No abort signal: if she closes the blog he keeps writing, and the
      // push tells her when it is up.
      const result = await runClaudeCodeChat({
        systemPrompt: systemPrompt(settings, memory, "这是写空间日志的任务：只输出要求的 JSON，不要使用工具。"),
        messages: [{ role: "user", content: writePrompt(me, topic.slice(0, BLOG_LIMITS.topic), blog, herPostsFrom(store), auto) }],
        modelId: pickModel(modelId ?? settingsModel(settings)),
        reasoningEffort: "medium",
        priority: auto ? "background" : "interactive",
      });
      raw = result.reply;
    } catch {
      return { kind: "failed", error: "他这篇没写完，等会儿再叫他试试", status: 502 };
    }
    const decision = parseHisDecision(raw);
    if (decision && "skip" in decision && auto) return { kind: "skipped", reason: decision.skip };
    const draft: HisDraft | null = decision && "draft" in decision ? decision.draft : null;
    if (!draft) return { kind: "failed", error: "他写了半天没写成，再叫他一次吧", status: 502 };

    const result = await changeBlog({ type: "him-post-add", ...draft });
    if ("error" in result) return { kind: "failed", error: result.error, status: 400 };
    try {
      const push = await sendPushToAll({ title: `${me}更新了空间`, body: `《${draft.title}》${postExcerpt({ id: "", createdAt: "", updatedAt: "", content: draft.content }, 40)}` });
      console.info(`[blog] his post is up · ${describePushResult(push)}`);
    } catch {}
    return { kind: "done", blog: result };
  } finally {
    desk.writing = null;
  }
}

// ── The heartbeat ──

type BeatLog = { time: string; action: string; reason: string };
type Beat = {
  lastConsideredAt: number;
  day: string;
  comments: number;
  tried: Record<string, number>;
  log: BeatLog[];
};

function parseBeat(raw: unknown): Beat {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const tried: Record<string, number> = {};
  if (source.tried && typeof source.tried === "object") {
    for (const [key, value] of Object.entries(source.tried as Record<string, unknown>)) {
      if (typeof value === "number" && value > 0) tried[key] = value;
    }
  }
  return {
    lastConsideredAt: typeof source.lastConsideredAt === "number" ? source.lastConsideredAt : 0,
    day: typeof source.day === "string" ? source.day : "",
    comments: typeof source.comments === "number" ? source.comments : 0,
    tried,
    log: Array.isArray(source.log) ? source.log as BeatLog[] : [],
  };
}

/** Changes `blogBeat`, a server-only key the page never syncs back. */
async function updateBeat(fn: (beat: Beat) => void, entry?: { action: string; reason: string }) {
  await withStore((store) => {
    const beat = parseBeat(store.blogBeat);
    fn(beat);
    if (entry) {
      beat.log.unshift({ time: `${cstDay()} ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" })}`, ...entry });
      beat.log = beat.log.slice(0, 30);
    }
    // Only the latest few failed visits matter.
    beat.tried = Object.fromEntries(Object.entries(beat.tried).slice(-50));
    store.blogBeat = beat;
  });
}

/**
 * One heartbeat's worth of blog life, when the setting is on: answer her if
 * something of hers has been waiting long enough, otherwise maybe write.
 * At most one thing per beat.
 */
export async function blogHeartbeat(): Promise<{ action: string; reason: string }> {
  const store = readStore() || {};
  const settings = (store.settings || {}) as Record<string, unknown>;
  if (settings.blogAutonomy !== true) return { action: "silent", reason: "博客自己来已关闭" };
  const hour = cstHour();
  if (hour < 9 || hour >= 23) return { action: "silent", reason: "夜里不去串门" };
  if (!isClaudeCodeEnabled()) return { action: "silent", reason: "Claude 订阅通道未启用" };
  if (desk.writing) return { action: "silent", reason: "正在写日志" };

  const now = new Date();
  const today = cstDay();
  const blog = parseBlogState(store.blog);
  const beat = parseBeat(store.blogBeat);
  const commentsToday = beat.day === today ? beat.comments : 0;

  const visit = commentsToday < BLOG_BEAT.commentsPerDay ? pickBlogVisit(blog, herPostsFrom(store), now, beat.tried) : null;
  if (visit) {
    const result = await commentAsHim({ postId: visit.postId, auto: true });
    const entry = result.kind === "done"
      ? { action: "comment", reason: visit.own ? "在自己日志下回了她" : "去她博客留了言" }
      : { action: "silent", reason: result.kind === "skipped" ? result.reason : `留言没成：${result.error}` };
    await updateBeat((next) => {
      if (result.kind === "done") {
        next.comments = (next.day === today ? next.comments : 0) + 1;
        next.day = today;
      } else if (result.kind === "failed") {
        next.tried[visit.key] = (next.tried[visit.key] || 0) + 1;
      }
    }, entry);
    return entry;
  }

  if (hour < 10 || hour >= 22) return { action: "silent", reason: "这个点不写日志" };
  const latest = latestHisPost(blog);
  const plan = shouldConsiderWriting({ lastPostAt: latest?.createdAt ?? null, lastConsideredAt: beat.lastConsideredAt, now, roll: Math.random() });
  if (!plan.consider) {
    if (plan.counts) await updateBeat((next) => { next.lastConsideredAt = now.getTime(); }, { action: "silent", reason: plan.reason });
    return { action: "silent", reason: plan.reason };
  }
  // Counted before writing, so a failed or slow attempt waits until tomorrow.
  await updateBeat((next) => { next.lastConsideredAt = now.getTime(); });
  const result = await writeHisPost({ auto: true });
  const entry = result.kind === "done"
    ? { action: "post", reason: "自己写了一篇" }
    : { action: "silent", reason: result.kind === "skipped" ? `今天不写：${result.reason}` : `没写成：${result.error}` };
  await updateBeat(() => {}, entry);
  return entry;
}
