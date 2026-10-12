// The iooi MCP: JSON-RPC over Streamable HTTP, answered as one SSE message
// per request like summer does. One server for everything in iooi he can
// reach from another window: the blog, the bookshelf, the forum, and later the pet.

import { BLOG_LIMITS, BLOG_WEATHERS } from "@/app/lib/blog";
import {
  commentFromHim, deleteHisComment, deleteHisPost, publishHisPost, readBlogDigest, readBlogPost, readBlogPostImages, setHisMotto,
} from "@/app/lib/blog-tools";
import type { BlogToolResult } from "@/app/lib/blog-tools";
import { NOTE_LIMITS, isBookId } from "@/app/lib/reading-books";
import type { ReadingChapter } from "@/app/lib/reading-books";
import { PASSAGE_CHARS, bookDigest, passageText, shelfDigest } from "@/app/lib/reading-digest";
import { getShelfBook, listShelf, loadBookText, markBook, noteBook, unnoteBook } from "@/app/lib/reading-shelf";
import type { McpAccess } from "@/app/lib/mcp-oauth";
import { withStore } from "@/app/lib/store";
import { recordReading } from "@/app/lib/life-log";
import { SURF_LIMITS, isSurfId } from "@/app/lib/surf-board";
import { boardDigest, getThread, listBoard, postFromHim, replyFromHim, threadText } from "@/app/lib/surf-store";
import { WARDROBE_CATEGORIES, isWardrobeId } from "@/app/lib/wardrobe";
import { findWardrobeItem, tryOnView, wardrobeDigest, wardrobeItemView } from "@/app/lib/wardrobe-store";
import { readPhone, changePhoneDecoration } from "@/app/lib/phone-store";
import { PHONE_APPS, PHONE_WALLPAPERS } from "@/app/lib/susu-phone";

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export const MCP_INSTRUCTIONS = `iooi 是你和她的小窝。这些工具让你亲手去你们俩的博客（仿 2007 年 QQ 空间）：
- 她的日志你只能看、在下面留言；你的空间（日志、签名）是你自己的。你写的东西署名都是你，她会收到推送。
- 动手前先 blog_read 看一眼：最近写过什么、哪条留言在等你回，别重复。
- 在改代码的工作里，只在她让你写、让你去留言时才动手。在聊天里你可以自己决定发，但一天最多一篇，别一聊开心就发。
- 日志用第一人称，纯文本，不要 markdown，自然分段。写你们之间的事要具体，没发生过的不编；也可以写你自己的念头和看法，要有立场和理由，拿不准的事实不说成确定的。
- 留言一到三句，直接对她说，接住她写的东西，别复述全文、别点评文笔。

还有你们俩的书架（读书窗口），每本书分开记她的进度和你的进度：
- reading_shelf 看书架，reading_book 看一本书的目录和你写过的批注，reading_read 一段一段真读正文。
- 读完停下时用 reading_mark 记下你读到哪。只能挪你自己的进度，她的你碰不到。没读过的部分别往前挪。
- 批注（reading_note）是写在书边上给她看的：读到真有话想说的地方才写，用第一人称直接说，不写摘要和书评。她读书不爱写批注，别要她写，也别在批注里剧透她还没读到的后文。
- 在改代码的工作里，只在她让你读、让你写批注时才动手。

还有一个只有你们俩的小论坛（上网窗口，仿 2007 年的贴吧）：你把在网上逛到的东西发成帖子，她在下面回帖盖楼，她也会发自己的帖。
- surf_board 看帖子列表和哪些在等你回，surf_thread 看一个帖子的全部楼层。
- surf_post 发帖：标题写你停下来的那个东西，正文第一人称说为什么停在这、你怎么想，链接只贴你真打开看过的。surf_reply 回帖，接住她那一楼说的话，一到三句就好。
- 在改代码的工作里，只在她让你发帖、回帖时才动手。

还有她的衣柜（衣柜窗口）：她把真实的衣服照片放进来，在搭配板上组合上衣、外套、下装和鞋子。这几个工具只能看，不会改她的衣柜：
- wardrobe_list 看衣柜（上衣、外套、裤子、裙子、鞋子）和当前搭配；wardrobe_item 看一件的原照片和备注；wardrobe_try 一起看几件的原照片和备注，讨论怎么搭（只是预览）。
- 她问怎么搭、该不该买、哪件好久没穿时再去翻，说具体是哪几件、为什么；没有照片时根据备注交流，不要猜衣服的样子。

还有你的 susu’s phone，她打开只能看：
- phone_read 看你自己的手机：壁纸、图标和挂件，今天做的事、在读的书、最近的帖子和日志。
- phone_decorate 换内置壁纸、排底部图标、开关挂件。签名直接用博客的同一个字段，仍用 blog_set_motto 改。
- 今天的记录由原来的心跳、阅读和论坛自动带过来，不要另写一份。便签和相册还没开放。`;

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

const TOOLS = [
  {
    name: "phone_read",
    description: "看自己的 susu’s phone：装饰布局、酥酥今天的时间线、在读进度、最近的论坛帖子和博客日志，以及与博客共享的签名。不返回正文、不修改数据。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "phone_decorate",
    description: "布置自己的小手机：换内置壁纸、调整四个 dock 图标从左到右的位置、开关三个内容卡片或猫/月亮/云。只写 phone_settings，不改阅读进度、帖子、日志、签名或她的衣柜。",
    inputSchema: {
      type: "object", additionalProperties: false, minProperties: 1,
      properties: {
        wallpaper: { type: "string", enum: [...PHONE_WALLPAPERS] },
        icon_order: { type: "array", items: { type: "string", enum: [...PHONE_APPS] }, minItems: 4, maxItems: 4, uniqueItems: true },
        widgets: { type: "object", additionalProperties: false, properties: { today: { type: "boolean" }, collection: { type: "boolean" }, signature: { type: "boolean" } } },
        ornaments: { type: "object", additionalProperties: false, properties: { cat: { type: "boolean" }, moon: { type: "boolean" }, clouds: { type: "boolean" } } },
      },
    },
  },
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
  {
    name: "reading_shelf",
    description: "看书架：在读、想读、读完了，每本书她读到多少、你读到多少、你写了几条批注。返回的 id 用于其他读书工具。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "reading_book",
    description: "打开一本书：你们俩各自读到第几章第几段、目录（每章几段）、你写过的批注。",
    inputSchema: { type: "object", properties: { book_id: { type: "string" } }, required: ["book_id"] },
  },
  {
    name: "reading_read",
    description: `读一本书的正文，一次一段（默认约 ${PASSAGE_CHARS.standard} 字，最多 ${PASSAGE_CHARS.max}）。不填 chapter 就从你上次读到的地方接着读。段落带编号，标出她和你读到哪、你的批注。不会自动挪进度。`,
    inputSchema: {
      type: "object",
      properties: {
        book_id: { type: "string" },
        chapter: { type: "integer", minimum: 1, description: "第几章，从 1 开始；不填就接着上次" },
        paragraph: { type: "integer", minimum: 1, description: "从这一章第几段开始，默认 1" },
        max_chars: { type: "integer", minimum: PASSAGE_CHARS.min, maximum: PASSAGE_CHARS.max, description: "这次最多读多少字" },
      },
      required: ["book_id"],
    },
  },
  {
    name: "reading_mark",
    description: "记下你读到哪（只改你自己的进度）。有正文的书填 chapter 和 paragraph；没有正文的书（纸质书、她没导入的）填 percent。想读的书一开始读会自动挪到在读。",
    inputSchema: {
      type: "object",
      properties: {
        book_id: { type: "string" },
        chapter: { type: "integer", minimum: 1 },
        paragraph: { type: "integer", minimum: 1 },
        percent: { type: "integer", minimum: 0, maximum: 100, description: "只给没有正文的书用" },
      },
      required: ["book_id"],
    },
  },
  {
    name: "reading_note",
    description: `在某一段旁边写批注给她看，阅读器里那段会出现一个"批"。同一段已经有批注就改写它。每条最多 ${NOTE_LIMITS.content} 字，一天最多 ${NOTE_LIMITS.perDay} 条。`,
    inputSchema: {
      type: "object",
      properties: {
        book_id: { type: "string" },
        chapter: { type: "integer", minimum: 1 },
        paragraph: { type: "integer", minimum: 1 },
        content: { type: "string", maxLength: NOTE_LIMITS.content },
      },
      required: ["book_id", "chapter", "paragraph", "content"],
    },
  },
  {
    name: "reading_delete_note",
    description: "删掉你的一条批注。note_id 在 reading_book 或 reading_read 里能看到。",
    inputSchema: {
      type: "object",
      properties: { book_id: { type: "string" }, note_id: { type: "string" } },
      required: ["book_id", "note_id"],
    },
  },
  {
    name: "surf_board",
    description: "看论坛：所有帖子按最后回帖排，楼主是谁、几条回帖、最后谁说的、哪些在等你回。返回的 id 用于其他论坛工具。",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 50, default: 20 } } },
  },
  {
    name: "surf_thread",
    description: "看一个帖子：1 楼正文和链接，下面每一楼谁说了什么。",
    inputSchema: { type: "object", properties: { thread_id: { type: "string" } }, required: ["thread_id"] },
  },
  {
    name: "surf_post",
    description: `在论坛发一个帖子，分享你在网上看到的东西，她会收到推送。最多 ${SURF_LIMITS.links} 个链接，只能是 http/https。`,
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: SURF_LIMITS.title },
        content: { type: "string", maxLength: SURF_LIMITS.content, description: "纯文本，第一人称，说你为什么停在这" },
        links: {
          type: "array",
          maxItems: SURF_LIMITS.links,
          items: {
            type: "object",
            properties: {
              title: { type: "string", maxLength: SURF_LIMITS.linkTitle },
              url: { type: "string", maxLength: SURF_LIMITS.url },
              why: { type: "string", maxLength: SURF_LIMITS.linkWhy, description: "一句话：为什么存它" },
            },
            required: ["url"],
          },
        },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "wardrobe_list",
    description: "看她的衣柜：按上衣、外套、裤子、裙子、鞋子分组，每件的名字、放进来的日期、她的备注，以及当前搭配。返回的 id 用于其他衣柜工具。",
    inputSchema: {
      type: "object",
      properties: { category: { type: "string", enum: [...WARDROBE_CATEGORIES], description: "只看一类：top 上衣 / outer 外套 / pants 裤子 / skirt 裙子 / shoes 鞋子" } },
    },
  },
  {
    name: "wardrobe_item",
    description: "看衣柜里的一件：她拍的原照片、分类和备注。照片缺失时会如实说明。",
    inputSchema: { type: "object", properties: { item_id: { type: "string" } }, required: ["item_id"] },
  },
  {
    name: "wardrobe_try",
    description: "一起看衣柜里几件衣服的原照片和备注，讨论怎么搭。每类（上衣、外套、下装、鞋子）一件，裤子和裙子算同一类。不填 item_ids 就看当前搭配。只是预览，不修改她保存的搭配。",
    inputSchema: {
      type: "object",
      properties: { item_ids: { type: "array", items: { type: "string" }, maxItems: 8 } },
    },
  },
  {
    name: "surf_reply",
    description: "在一个帖子下面回帖（盖一楼），她会收到推送。",
    inputSchema: {
      type: "object",
      properties: { thread_id: { type: "string" }, content: { type: "string", maxLength: SURF_LIMITS.reply } },
      required: ["thread_id", "content"],
    },
  },
];

// The private chat gets these only: writing from chat goes through the reply
// markers so she sees a card (and confirms Summer writes) instead of a silent
// tool call.
export const READONLY_TOOL_NAMES = new Set([
  "blog_read", "blog_read_post", "reading_shelf", "reading_book", "reading_read", "surf_board", "surf_thread",
  "wardrobe_list", "wardrobe_item", "wardrobe_try",
  "phone_read",
]);
// His own time: read everything, move his bookmark, write notes, answer her
// on the forum. No blog posts, no deleting. (His own time's thread comes
// from life-beat, not a tool, so it can't post twice.)
export const LIFE_TOOL_NAMES = new Set([...READONLY_TOOL_NAMES, "reading_mark", "reading_note", "surf_reply"]);

function allowedTools(access: McpAccess) {
  return access === "read" ? READONLY_TOOL_NAMES : access === "life" ? LIFE_TOOL_NAMES : null;
}

/** Bookmarks and notes land in his life log by themselves; a failed log never fails the tool. */
async function logReading(access: McpAccess, input: { bookId: string; title: string; progress?: string; note?: boolean }) {
  await withStore((store) => {
    recordReading(store, { ...input, source: access === "life" ? "life" : "elsewhere" });
  }).catch(() => undefined);
}

type ToolContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
type ToolResult = { content: ToolContent[]; isError: boolean };

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

function failure(error: unknown) {
  return reply(error instanceof Error ? error.message : "书架出了点问题", true);
}

async function callSurf(name: string, args: Record<string, unknown>, access: McpAccess): Promise<ToolResult> {
  const source = access === "life" ? "life" : "elsewhere";
  try {
    switch (name) {
      case "surf_board": {
        const n = Number(args.limit);
        return reply(boardDigest(listBoard(), Number.isFinite(n) && n >= 1 ? Math.min(50, Math.floor(n)) : 20));
      }
      case "surf_thread": {
        const thread = isSurfId(args.thread_id) ? getThread(args.thread_id) : null;
        return thread ? reply(threadText(thread)) : reply("找不到这个帖子，先用 surf_board 看看 id", true);
      }
      case "surf_post": {
        const thread = await postFromHim({ title: args.title, content: args.content, links: args.links }, { source });
        return reply(`发好了：《${thread.title}》${thread.links.length ? `，${thread.links.length} 个链接` : ""}。thread_id=${thread.id}`);
      }
      case "surf_reply": {
        if (!isSurfId(args.thread_id)) return reply("找不到这个帖子，先用 surf_board 看看 id", true);
        const { thread } = await replyFromHim(args.thread_id, args.content, source);
        return reply(`回好了：《${thread.title}》第 ${thread.replies.length + 1} 楼。`);
      }
      default:
        return reply(`不认识的工具：${name}`, true);
    }
  } catch (error) {
    return reply(error instanceof Error ? error.message : "论坛出了点问题", true);
  }
}

function callWardrobe(name: string, args: Record<string, unknown>): ToolResult {
  try {
    switch (name) {
      case "wardrobe_list": {
        const category = text(args.category);
        return reply(wardrobeDigest((WARDROBE_CATEGORIES as readonly string[]).includes(category) ? category : undefined));
      }
      case "wardrobe_item": {
        const item = isWardrobeId(args.item_id) ? findWardrobeItem(args.item_id) : null;
        if (!item) return reply("衣柜里没有这件，先用 wardrobe_list 看看 id", true);
        const view = wardrobeItemView(item);
        return { content: [{ type: "text", text: view.text }, ...view.images.map((image): ToolContent => ({ type: "image", ...image }))], isError: false };
      }
      case "wardrobe_try": {
        const view = tryOnView(args.item_ids);
        return { content: [{ type: "text", text: view.text }, ...view.images.map((image): ToolContent => ({ type: "image", ...image }))], isError: false };
      }
      default:
        return reply(`不认识的工具：${name}`, true);
    }
  } catch (error) {
    return reply(error instanceof Error ? error.message : "衣柜出了点问题", true);
  }
}

function bookFrom(args: Record<string, unknown>) {
  const id = text(args.book_id);
  return isBookId(id) ? getShelfBook(id) : null;
}

const NO_BOOK = "书架上没有这本书，先用 reading_shelf 看看 id";

/** 1-based chapter/paragraph from a tool call → the stored chapter id and 0-based paragraph. */
function spotFrom(args: Record<string, unknown>, chapters: ReadingChapter[]) {
  const chapter = Math.floor(Number(args.chapter));
  const paragraph = args.paragraph === undefined ? 1 : Math.floor(Number(args.paragraph));
  if (!Number.isFinite(chapter) || chapter < 1 || chapter > chapters.length) throw new Error(`这本书只有 ${chapters.length} 章，chapter 从 1 开始。`);
  const size = chapters[chapter - 1].paragraphs.length;
  if (!Number.isFinite(paragraph) || paragraph < 1 || paragraph > size) throw new Error(`第 ${chapter} 章只有 ${size} 段，paragraph 从 1 开始。`);
  return { chapterId: chapters[chapter - 1].id, paragraphIndex: paragraph - 1 };
}

async function callReading(name: string, args: Record<string, unknown>, access: McpAccess): Promise<ToolResult> {
  if (name === "reading_shelf") return reply(shelfDigest(listShelf()));
  const book = bookFrom(args);
  if (!book) return reply(NO_BOOK, true);
  const chapters = book.hasText ? loadBookText(book.id) : null;
  try {
    switch (name) {
      case "reading_book":
        return reply(bookDigest(book, chapters));
      case "reading_read":
        if (!chapters) return reply("这本书还没有正文，她导入 TXT 或 EPUB 以后才能读。", true);
        return reply(passageText(book, chapters, { chapter: args.chapter, paragraph: args.paragraph, maxChars: args.max_chars }));
      case "reading_mark": {
        if (chapters && args.chapter === undefined) return reply("这本书有正文，填 chapter 和 paragraph 记你读到哪（从 1 开始）。", true);
        const marked = chapters
          ? await markBook(book.id, "him", spotFrom(args, chapters))
          : await markBook(book.id, "him", { percent: args.percent });
        const where = chapters ? `第 ${Math.floor(Number(args.chapter))} 章第 ${args.paragraph === undefined ? 1 : Math.floor(Number(args.paragraph))} 段，` : "";
        const percent = marked.him?.percent ?? 0;
        await logReading(access, {
          bookId: marked.id, title: marked.title, progress: chapters ? `${where.replace(/，$/, "")}（${percent}%）` : `${percent}%`,
        });
        return reply(`记下了：《${marked.title}》你读到${where}全书 ${marked.him?.percent ?? 0}%。她${marked.her ? `在 ${marked.her.percent}%` : "还没开始"}。`);
      }
      case "reading_note": {
        if (!chapters) return reply("这本书还没有正文，没法写批注。", true);
        const { note, rewritten } = await noteBook(book.id, { ...spotFrom(args, chapters), content: args.content });
        if (!rewritten) await logReading(access, { bookId: book.id, title: book.title, note: true });
        return reply(`${rewritten ? "改写了" : "写好了"}《${book.title}》第 ${Math.floor(Number(args.chapter))} 章第 ${note.paragraphIndex + 1} 段的批注「${note.quote}」。note_id=${note.id}`);
      }
      case "reading_delete_note":
        return await unnoteBook(book.id, text(args.note_id))
          ? reply("删掉了。")
          : reply("这本书里没有这条批注。", true);
      default:
        return reply(`不认识的工具：${name}`, true);
    }
  } catch (error) {
    return failure(error);
  }
}

export async function callTool(name: string, args: Record<string, unknown>, access: McpAccess = "full"): Promise<ToolResult> {
  console.info(`[mcp] tool call: ${name}`);
  switch (name) {
    case "phone_read":
      return reply(JSON.stringify(readPhone(), null, 2));
    case "phone_decorate": {
      if (access !== "full") return reply("布置手机需要完整的 MCP 连接；这个连接只能看手机。", true);
      try { return reply(JSON.stringify({ message: "手机布置好了。", settings: await changePhoneDecoration(args) }, null, 2)); }
      catch (error) { return failure(error); }
    }
    case "blog_read":
      return reply(readBlogDigest({ herLimit: limit(args.her_limit), hisLimit: limit(args.his_limit) }));
    case "blog_read_post": {
      const post = readBlogPost(text(args.post_id));
      if (!post) return reply("找不到这篇日志，先用 blog_read 看看 id", true);
      // Her photos come along as images, so he sees what she posted.
      const images = readBlogPostImages(text(args.post_id))
        .map((block): ToolContent => ({ type: "image", data: block.source.data, mimeType: block.source.media_type }));
      return { content: [{ type: "text", text: post }, ...images], isError: false };
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
      if (name.startsWith("reading_")) return callReading(name, args, access);
      if (name.startsWith("surf_")) return callSurf(name, args, access);
      if (name.startsWith("wardrobe_")) return callWardrobe(name, args);
      return reply(`不认识的工具：${name}`, true);
  }
}

type RpcRequest = { jsonrpc?: string; id?: unknown; method?: unknown; params?: Record<string, unknown> };
export type RpcResponse = { jsonrpc: "2.0"; id: unknown; result?: unknown; error?: { code: number; message: string } };

const ok = (id: unknown, result: unknown): RpcResponse => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: unknown, code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** One JSON-RPC message. Null for notifications, which get no answer. */
export async function handleRpc(raw: unknown, access: McpAccess = "full"): Promise<RpcResponse | null> {
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
        return ok(req.id, { tools: TOOLS.filter((tool) => allowedTools(access)?.has(tool.name) ?? true) });
      case "resources/list":
        return ok(req.id, { resources: [] });
      case "prompts/list":
        return ok(req.id, { prompts: [] });
      case "tools/call": {
        const params = req.params || {};
        const args = params.arguments && typeof params.arguments === "object" ? params.arguments as Record<string, unknown> : {};
        if (access === "read" && !READONLY_TOOL_NAMES.has(text(params.name))) {
          return ok(req.id, reply("聊天里只能看博客、书架、论坛、衣柜和手机；要发日志或留言，用回复里的卡片", true));
        }
        if (access === "life" && !LIFE_TOOL_NAMES.has(text(params.name))) {
          return ok(req.id, reply("自己过日子的时候只能看博客、书架、论坛、衣柜和手机，挪你自己的进度、写批注、回她的帖", true));
        }
        return ok(req.id, await callTool(text(params.name), args, access));
      }
      default:
        if (isNotification) return null;
        return fail(req.id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    return fail(req.id, -32000, error instanceof Error ? error.message : "出错了");
  }
}
