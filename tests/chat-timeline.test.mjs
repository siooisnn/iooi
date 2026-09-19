import assert from "node:assert/strict";
import test from "node:test";
import { alignLegacySummerCalls, latestUserSession, messageTimestamp } from "../app/lib/chat-timeline.ts";
import { createSessionSyncHandlers } from "../app/lib/session-sync.ts";

const user = (time, content = "醒了") => ({ role: "user", content, date: "2026/9/17", time });

test("care follows latest user activity rather than storage order or assistant activity", () => {
  const yesterday = { id: "yesterday", messages: [user("03:01"), { ...user("09:00"), role: "assistant" }] };
  const morning = { id: "morning", messages: [user("07:46")] };
  assert.equal(latestUserSession([yesterday, morning]), morning);
  assert.equal(latestUserSession([morning, yesterday]), morning);
});

test("care ignores memo, group, empty and invalid-time windows", () => {
  const chat = { id: "chat", messages: [user("07:46")] };
  assert.equal(latestUserSession([
    { id: "memo", kind: "memo", messages: [user("10:00")] },
    { id: "group", kind: "group", messages: [user("11:00")] },
    { id: "draft", messages: [] },
    { id: "invalid", messages: [{ role: "user" }] }, chat,
  ]), chat);
  assert.equal(latestUserSession([]), undefined);
});

test("stored dates parse as UTC+8 with padded and unpadded dates", () => {
  assert.equal(messageTimestamp(user("07:46")), Date.parse("2026-09-17T07:46:00+08:00"));
  assert.equal(messageTimestamp({ date: "2026-09-17", time: "07:46" }), messageTimestamp(user("07:46")));
});

test("old overwritten read time displays beside its reply without mutating history", () => {
  const messages = [user("07:45"), { ...user("07:47"), role: "assistant", source: "summer_call" }, { ...user("07:45"), role: "assistant" }];
  const shown = alignLegacySummerCalls(messages);
  assert.equal(shown[1].time, "07:45");
  assert.equal(messages[1].time, "07:47");
  assert.equal(shown[2], messages[2]);
  assert.equal(alignLegacySummerCalls([{ ...messages[1], roundId: "new" }, messages[2]])[0].time, "07:47");
});

test("legacy read alignment never crosses another user turn", () => {
  const call = { ...user("07:47"), role: "assistant", source: "summer_call" };
  assert.equal(alignLegacySummerCalls([call, user("07:48"), { ...user("07:49"), role: "assistant" }])[0], call);
});

test("sync keeps identical reads and replies from separate turns and deduplicates snapshots", async () => {
  const replies = ["first", "second"].flatMap(roundId => [
    { role: "assistant", content: "summer · wake", source: "summer_call", date: "2026/9/17", time: "07:46", roundId },
    { role: "assistant", content: "再睡一会儿吧", date: "2026/9/17", time: "07:46", roundId },
  ]);
  const store = { sessions: [{ id: "morning", messages: replies.slice(0, 2) }] };
  const handlers = createSessionSyncHandlers({ read: () => store, write: async fn => fn(store) });
  const send = () => handlers.POST(new Request("http://test/api/sync", { method: "POST", body: JSON.stringify({ sessions: [{ id: "morning", messages: replies }] }) }));
  assert.equal((await send()).status, 200);
  await send();
  assert.deepEqual(store.sessions[0].messages, replies);
});
