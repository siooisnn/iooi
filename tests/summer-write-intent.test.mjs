import assert from "node:assert/strict";
import test from "node:test";

import { isExplicitSummerWriteRequest } from "../app/lib/summer-write-intent.ts";

test("bedtime Summer write requests are direct-write intent", () => {
  assert.equal(isExplicitSummerWriteRequest("整理一下今天的内容，写进 Summer"), true);
  assert.equal(isExplicitSummerWriteRequest("睡前帮我记下今天发生的事"), true);
  assert.equal(isExplicitSummerWriteRequest("别忘了写进 Summer"), true);
});

test("search-and-read requests are not mistaken for direct writes", () => {
  assert.equal(isExplicitSummerWriteRequest("找找之前的日记，再告诉我写进了什么"), false);
  assert.equal(isExplicitSummerWriteRequest("搜一下 Summer"), false);
  assert.equal(isExplicitSummerWriteRequest("这条不要写进 Summer"), false);
  assert.equal(isExplicitSummerWriteRequest("你有没有记住刚才那件事？"), false);
});
