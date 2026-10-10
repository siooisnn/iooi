import assert from "node:assert/strict";
import test from "node:test";
import { hasSpeakableText, speakableText } from "../app/lib/tts-text.ts";

test("kaomoji, emoji and hearts are not read out", () => {
  assert.equal(speakableText("这个做得好 (｡•̀ᴗ-)✧"), "这个做得好");
  assert.equal(speakableText("改吧改吧(^o^)/"), "改吧改吧");
  assert.equal(speakableText("加油老婆 ♡ 💢"), "加油老婆");
  assert.equal(speakableText("回去吃点好的～"), "回去吃点好的");
});

test("real asides in brackets stay", () => {
  assert.equal(speakableText("问三遍正常 (笑)"), "问三遍正常 (笑)");
  assert.equal(speakableText("换成 (Opus 5.5) 吧"), "换成 (Opus 5.5) 吧");
});

test("links, sources and code are dropped, link labels kept", () => {
  assert.equal(speakableText("看 [MindStudio](https://mindstudio.ai/x) 和 https://a.com/b 。"), "看 MindStudio 和。");
  assert.equal(speakableText("不支持（来源：MindStudio 博客）中文"), "不支持 中文");
  assert.equal(speakableText("改好了\n```ts\nconst a = 1\n```\n去看看"), "改好了\n去看看");
  assert.equal(speakableText("改了 `mood.css` 和 `app/x.css`"), "改了 mood.css 和");
});

test("markdown marks go, numbered lines and units read naturally", () => {
  assert.equal(speakableText("- **橡皮屑吹你身上不行**"), "橡皮屑吹你身上不行");
  assert.equal(speakableText("## 标题\n1. 先做小喇叭"), "标题\n1. 先做小喇叭");
  assert.equal(speakableText("今天 26°C，湿度 80%"), "今天 26度，湿度 80%");
});

test("only decoration means nothing to say", () => {
  assert.equal(hasSpeakableText("(｡•́︿•̀｡) ♡"), false);
  assert.equal(hasSpeakableText("https://example.com"), false);
  assert.equal(hasSpeakableText("在呢"), true);
});
