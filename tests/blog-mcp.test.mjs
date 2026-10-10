import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts") && !specifier.endsWith(".ts")) {
    const url = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
} });

const { applyBlogAction, BLOG_LIMITS, hisPostsToday, parseBlogState } = await import("../app/lib/blog.ts");
const { blogDigest, blogPostText } = await import("../app/lib/blog-digest.ts");
const { asksForBlogPost, mentionsBlog, parseBlogMarkers, stripBlogMarkers } = await import("../app/lib/blog-markers.ts");
const { createVisibleReplyStream } = await import("../app/lib/visible-reply-stream.ts");

const NOW = new Date("2026-10-10T04:00:00Z");

test("chat markers become at most one post, three comments and one signature", () => {
  const reply = [
    "写好啦，放你那边去了。",
    '[blog_post title="下雨天" mood="安静" weather="小雨"]\n今天她下班淋了雨。\n\n我想给她撑伞。\n[/blog_post]',
    '[blog_post title="第二篇"]不该发[/blog_post]',
    '[blog_comment post="p1"]踩踩[/blog_comment]',
    "[blog_comment]没有 id[/blog_comment]",
    '[blog_comment post=“p2”]全角引号也行[/blog_comment]',
    "[blog_motto]下雨也要见面[/blog_motto]",
  ].join("\n");
  assert.deepEqual(parseBlogMarkers(reply), [
    { kind: "post", title: "下雨天", content: "今天她下班淋了雨。\n\n我想给她撑伞。", mood: "安静", weather: "小雨" },
    { kind: "comment", postId: "p1", content: "踩踩" },
    { kind: "comment", postId: "p2", content: "全角引号也行" },
    { kind: "motto", motto: "下雨也要见面" },
  ]);
  assert.equal(stripBlogMarkers(reply), "写好啦，放你那边去了。", "even a block that was not used never shows");
  assert.equal(stripBlogMarkers("你好[blog_motto]x[/blog_motto]"), "你好");
  assert.deepEqual(parseBlogMarkers("[blog_post title=\"空\"]  [/blog_post]"), []);
});

test("she asking for a post is told apart from just talking about the blog", () => {
  for (const text of ["老公你写一篇吧", "把这个写成篇日志", "发到空间", "记到博客里", "发篇日志"]) {
    assert.equal(asksForBlogPost(text), true, text);
  }
  for (const text of ["你空间签名好土", "我去看了你的博客", "今天好累"]) {
    assert.equal(asksForBlogPost(text), false, text);
  }
  assert.equal(mentionsBlog("我去你空间踩了"), true);
  assert.equal(mentionsBlog("今天好累"), false);
});

test("the stream hides blog markers however they are cut", () => {
  const text = '好，写了。[blog_post title="t"]正文[有方括号]也行[/blog_post][blog_motto]签名[/blog_motto]';
  for (let split = 0; split <= text.length; split += 1) {
    const stream = createVisibleReplyStream();
    const output = stream.push(text.slice(0, split)) + stream.push(text.slice(split)) + stream.finish();
    assert.equal(output, "好，写了。", `boundary ${split}`);
  }
});

test("his posts are capped per day and he can change his signature", () => {
  let blog = parseBlogState(null);
  for (let i = 0; i < BLOG_LIMITS.hisPostsPerDay; i += 1) {
    blog = applyBlogAction(blog, { type: "him-post-add", title: `第${i}篇`, content: "写" }, { now: NOW, id: `h${i}` });
  }
  assert.equal(hisPostsToday(blog, NOW), BLOG_LIMITS.hisPostsPerDay);
  assert.ok("error" in applyBlogAction(blog, { type: "him-post-add", title: "多", content: "写" }, { now: NOW, id: "over" }));
  const tomorrow = new Date(NOW.getTime() + 24 * 3600 * 1000);
  assert.equal(hisPostsToday(blog, tomorrow), 0);
  assert.ok(!("error" in applyBlogAction(blog, { type: "him-post-add", title: "明天", content: "写" }, { now: tomorrow, id: "t" })));

  assert.ok("error" in applyBlogAction(blog, { type: "him-motto", motto: "  " }, { now: NOW, id: "m" }));
  blog = applyBlogAction(blog, { type: "him-motto", motto: " 新签名 " }, { now: NOW, id: "m" });
  assert.equal(blog.him.motto, "新签名");
});

test("the digest and a post read as text with ids and who is waiting", () => {
  let blog = parseBlogState(null);
  blog = applyBlogAction(blog, { type: "him-post-add", title: "熵增", content: "乱是默认的" }, { now: NOW, id: "him-1" });
  blog = applyBlogAction(blog, { type: "comment", postId: "him-1", content: "哼", author: "her" }, { now: NOW, id: "c1" });
  const hers = [{ id: "p1", title: "", content: "今天下雨了，公交好挤", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), mood: "累", weather: "" }];
  const digest = blogDigest(blog, hers, { now: NOW });
  assert.match(digest, /今天他已经发了 1 篇/);
  assert.match(digest, /id=him-1 .*《熵增》.*她的留言还没回/);
  assert.match(digest, /id=p1 .*心情 累 · 他还没来过/);
  assert.match(digest, /今天下雨了/);

  const post = blogPostText(blog, hers, "him-1");
  assert.match(post, /《熵增》 id=him-1/);
  assert.match(post, /1楼 她 .* id=c1：哼/);
  assert.match(blogPostText(blog, hers, "p1"), /她写的/);
  assert.equal(blogPostText(blog, hers, "nope"), null);
});

test("her photos show up in the digest and the post as a count", () => {
  const blog = parseBlogState(null);
  const hers = [{
    id: "p2", title: "", content: "", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), mood: "", weather: "",
    images: ["/uploads/a.jpg", "/uploads/b.png"],
  }];
  assert.match(blogDigest(blog, hers, { now: NOW }), /id=p2 .*《图片日志》 · 配图 2 张/);
  const post = blogPostText(blog, hers, "p2");
  assert.match(post, /没写字，只放了图/);
  assert.match(post, /配了 2 张图/);
});
