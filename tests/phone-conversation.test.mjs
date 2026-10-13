import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-typescript.mjs';
const { phoneConversation, phoneMessageSide, phoneMessagePreview } = await import('../app/lib/phone-conversation.ts');

test('the phone reads private history in order without changing stored roles or records', () => {
  const sessions = [
    { id: 'new', createdAt: '2026-10-14T00:00:00+08:00', messages: [
      { role: 'user', content: '晚上好', date: '2026/10/14', time: '20:30' },
      { role: 'assistant', content: '我在呢', date: '2026/10/14', time: '20:30' },
    ] },
    { id: 'old', createdAt: '2026-10-13T00:00:00+08:00', messages: [
      { role: 'user', content: '昨天', date: '2026/10/13', time: '20:30' },
      { role: 'assistant', content: '旧记录没有日期', time: '20:31' },
    ] },
  ];
  const before = JSON.stringify(sessions);
  const entries = phoneConversation(sessions);
  assert.deepEqual(entries.map((e) => e.message.content), ['昨天', '旧记录没有日期', '晚上好', '我在呢']);
  assert.deepEqual(entries.map((e) => phoneMessageSide(e.message)), ['left', 'right', 'left', 'right']);
  assert.equal(entries[2].message, sessions[0].messages[0]);
  assert.equal(JSON.stringify(sessions), before);
});

test('the single contact excludes group, GPT and system records while retaining images and files', () => {
  const plain = { role: 'assistant', content: '', time: '10:00', date: '2026/10/14' };
  const entries = phoneConversation([
    { id: 'group', kind: 'group', createdAt: '', messages: [{ ...plain, content: '群聊' }] },
    { id: 'private', createdAt: '', messages: [
      { ...plain, source: 'summer_call', content: '唤醒' },
      { ...plain, source: 'code_task_iooi', content: '开发任务' },
      { ...plain, source: 'blog_card', content: '日志回执' },
      { ...plain, speaker: 'gpt', content: '郁郁' },
      { ...plain, image: '/uploads/old.png' },
      { ...plain, file: '/uploads/note.txt' },
      { ...plain },
    ] },
  ]);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((e) => phoneMessagePreview(e.message)), ['[图片]', '[文件]']);
  assert.equal(phoneMessagePreview(), '');
});
