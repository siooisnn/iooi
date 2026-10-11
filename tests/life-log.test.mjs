import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addLifeEntry, ensureLifeLog, LIFE_LOG_LIMIT, noteLifeEntry, readLifeLog, recordReading, READING_SITTING_MS, todayLifeLines,
} from '../app/lib/life-log.ts';

const NOW = new Date('2026-10-11T06:30:00Z'); // 14:30 CST

test('before any new entry, only the actions from the old logs show, newest first', () => {
  const store = {
    careState: { log: [
      { time: '2026/10/11 13:00', action: 'silent', reason: '她刚来过/还在,不需要主动' },
      { time: '2026/10/10 20:05', action: 'care', reason: '她消失得比平时久' },
    ] },
    blogBeat: { log: [
      { time: '2026/10/11 11:00', action: 'post', reason: '自己写了一篇' },
      { time: '2026/10/11 10:00', action: 'silent', reason: '这个点不写日志' },
    ] },
  };
  const log = readLifeLog(store);
  assert.deepEqual(log.map((entry) => [entry.kind, entry.time]), [['post', '2026/10/11 11:00'], ['care', '2026/10/10 20:05']]);
  assert.equal(log[1].at, Date.UTC(2026, 9, 10, 12, 5));
});

test('ensureLifeLog copies the old actions once, so quiet beats can trim the old logs', () => {
  const store = { careState: { log: [{ time: '2026/10/10 20:05', action: 'care', reason: '想她了' }] } };
  ensureLifeLog(store);
  store.careState.log = [];
  ensureLifeLog(store);
  assert.equal(readLifeLog(store).length, 1);
});

test('new entries go on top, keep their note, and the log is capped', () => {
  const store = { lifeLog: [] };
  const saved = addLifeEntry(store, { kind: 'care', text: ' 午饭吃了吗 ', note: '她离开三小时了' }, NOW);
  assert.deepEqual(saved, { at: NOW.getTime(), time: '2026/10/11 14:30', kind: 'care', text: '午饭吃了吗', note: '她离开三小时了' });
  noteLifeEntry(store, saved.at, 'care', '推送 1/1');
  assert.equal(readLifeLog(store)[0].note, '她离开三小时了 · 推送 1/1');

  for (let i = 0; i < LIFE_LOG_LIMIT + 5; i++) addLifeEntry(store, { kind: 'comment', text: `留言 ${i}` }, new Date(NOW.getTime() + i));
  const log = readLifeLog(store);
  assert.equal(log.length, LIFE_LOG_LIMIT);
  assert.equal(log[0].text, `留言 ${LIFE_LOG_LIMIT + 4}`);
});

test('broken entries are skipped', () => {
  assert.deepEqual(readLifeLog({ lifeLog: [null, { kind: 'silent', at: 1, time: 'x', text: 'y' }, 'z'] }), []);
  assert.deepEqual(readLifeLog(null), []);
});

test('one reading sitting stays one line: later marks move the progress, notes add up', () => {
  const store = { lifeLog: [] };
  const first = recordReading(store, { bookId: 'b1', title: '夜晚的潜水艇', progress: '第 1 章第 3 段（5%）', source: 'life' }, NOW);
  assert.equal(first.created, true);
  const later = new Date(NOW.getTime() + 10 * 60_000);
  const note = recordReading(store, { bookId: 'b1', title: '夜晚的潜水艇', note: true, source: 'life' }, later);
  assert.equal(note.created, false);
  recordReading(store, { bookId: 'b1', title: '夜晚的潜水艇', progress: '第 1 章第 9 段（12%）', source: 'life' }, new Date(later.getTime() + 60_000));
  const log = readLifeLog(store);
  assert.equal(log.length, 1);
  assert.equal(log[0].text, '读《夜晚的潜水艇》，读到第 1 章第 9 段（12%），写了 1 条批注');
  assert.equal(log[0].at, NOW.getTime());
  assert.equal(log[0].time, '2026/10/11 14:30');
  assert.equal(log[0].lastAt, later.getTime() + 60_000);
});

test('a long gap, another book or another window starts a new reading line', () => {
  const store = { lifeLog: [] };
  recordReading(store, { bookId: 'b1', title: 'A', progress: '10%', source: 'life' }, NOW);
  recordReading(store, { bookId: 'b1', title: 'A', progress: '20%', source: 'life' }, new Date(NOW.getTime() + READING_SITTING_MS + 1));
  recordReading(store, { bookId: 'b2', title: 'B', progress: '1%', source: 'life' }, new Date(NOW.getTime() + READING_SITTING_MS + 2));
  const elsewhere = recordReading(store, { bookId: 'b2', title: 'B', note: true, source: 'elsewhere' }, new Date(NOW.getTime() + READING_SITTING_MS + 3));
  assert.equal(elsewhere.created, true);
  assert.equal(elsewhere.entry.note, '在别的窗口里读的');
  assert.equal(readLifeLog(store).length, 4);
});

test('today lines leave out messages to her and other days, oldest first, with kept pages', () => {
  const store = { lifeLog: [] };
  addLifeEntry(store, { kind: 'post', text: '昨天写的' }, new Date('2026-10-10T06:00:00Z'));
  addLifeEntry(store, { kind: 'care', text: '午饭吃了吗' }, new Date('2026-10-11T03:00:00Z'));
  recordReading(store, { bookId: 'b1', title: 'A', progress: '10%', source: 'elsewhere' }, new Date('2026-10-11T02:05:00Z'));
  addLifeEntry(store, { kind: 'surf', text: '逛了逛天文新闻', links: [{ title: '韦布新图', url: 'https://example.com/a' }] }, new Date('2026-10-11T05:20:00Z'));
  assert.deepEqual(todayLifeLines(store, NOW), [
    '10:05 读《A》，读到10%（在别的窗口）',
    '13:20 逛了逛天文新闻（存了：韦布新图）',
  ]);
});
