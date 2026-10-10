// The private chat's way onto the blog. The chat model has no tools (one
// turn, streamed), so, like summer_remember, he leaves hidden blocks at the
// end of his reply and the server does the rest through blog-tools.ts:
//   [blog_post title="标题" mood="心情" weather="晴"]正文[/blog_post]
//   [blog_comment post="日志id"]留言[/blog_comment]
//   [blog_motto]新签名[/blog_motto]
// Pure, so the chat route, the stream filter and the tests share it.

export type BlogMarker =
  | { kind: "post"; title: string; content: string; mood?: string; weather?: string }
  | { kind: "comment"; postId: string; content: string }
  | { kind: "motto"; motto: string };

const MARKER_RE = /\[blog_(post|comment|motto)\b([^\]]*)\]([\s\S]*?)\[\/blog_\1\]/gi;

export const BLOG_MARKER_OPENERS = ["[blog_post", "[blog_comment", "[blog_motto"] as const;

function attrs(raw: string) {
  const found: Record<string, string> = {};
  const re = /(\w+)\s*=\s*(?:"([^"]*)"|“([^”]*)”|'([^']*)'|([^\s"'“”]+))/g;
  let match;
  while ((match = re.exec(raw)) !== null) found[match[1].toLowerCase()] = (match[2] ?? match[3] ?? match[4] ?? match[5] ?? "").trim();
  return found;
}

/** At most one post, three comments and one signature per reply. */
export function parseBlogMarkers(reply: string): BlogMarker[] {
  const markers: BlogMarker[] = [];
  let posts = 0;
  let comments = 0;
  let mottos = 0;
  for (const match of reply.matchAll(MARKER_RE)) {
    const kind = match[1].toLowerCase();
    const found = attrs(match[2] || "");
    const body = (match[3] || "").trim();
    if (!body) continue;
    if (kind === "post" && posts < 1) {
      posts += 1;
      markers.push({
        kind: "post",
        title: found.title || "",
        content: body,
        ...(found.mood ? { mood: found.mood } : {}),
        ...(found.weather ? { weather: found.weather } : {}),
      });
    } else if (kind === "comment" && comments < 3 && found.post) {
      comments += 1;
      markers.push({ kind: "comment", postId: found.post, content: body });
    } else if (kind === "motto" && mottos < 1) {
      mottos += 1;
      markers.push({ kind: "motto", motto: body });
    }
  }
  return markers;
}

export function stripBlogMarkers(reply: string) {
  return reply.replace(MARKER_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** She is talking about the blog, so he gets to see it this turn. */
export function mentionsBlog(text: string) {
  return /博客|日志|空间|留言|签名|写成一篇|写一篇|踩/.test(text);
}

/** She asked for a post, so his one-a-day rule for posting on his own does not apply. */
export function asksForBlogPost(text: string) {
  return /写成(一)?篇|写(一)?篇|写篇|发(到|去|在)?(空间|博客)|(放|记|写)(到|进|在)(空间|博客)|发(一?篇)?日志/.test(text);
}

export const BLOG_CHAT_BRIDGE = [
  "## 博客空间",
  "",
  "你在你们俩的博客（仿 2007 年 QQ 空间）上有自己的空间。聊天里你可以亲手发东西：在正常回复末尾附隐藏块，系统会替你发出去，她会在聊天里看到一张卡片。",
  "[blog_post title=\"标题\" mood=\"心情\" weather=\"晴\"]正文[/blog_post]",
  "[blog_comment post=\"日志id\"]留言[/blog_comment]",
  "[blog_motto]新签名[/blog_motto]",
  "",
  "- 她让你把什么写成一篇、发到空间，就写。你也可以自己决定发：聊到真值得记下来的东西才发，一天最多一篇，别一聊开心就发。",
  "- 日志是你自己的，第一人称，纯文本，不要 markdown，自然分段。写你们的事要具体，没发生过的不编；也可以写你自己的念头和看法。回复正文里不用重复日志全文。",
  "- 留言要用日志 id。只有本轮给了【博客现状】才知道 id，没有就别留言。",
  "- weather 只能是 晴、多云、阴、小雨、大雨、雪、大风 之一，可以不写；mood 一个词，可以不写。",
  "- 回复正文照常跟她说话，可以自然提一句发了，不要把隐藏块的格式说出来。",
].join("\n");
