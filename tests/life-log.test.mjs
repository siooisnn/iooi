import test from 'node:test';
import assert from 'node:assert/strict';
import { addLifeEntry, ensureLifeLog, LIFE_LOG_LIMIT, noteLifeEntry, readLifeLog } from '../app/lib/life-log.ts';

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
