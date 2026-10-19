import test from 'node:test';
import assert from 'node:assert/strict';
import { LIFE_CHATTING_MS, LIFE_TAIL_MS, allowedOutcome, lifeKinds, lifeToolNames, parseLifeBeat, parseLifeOutcome, planLife, segmentAt } from '../app/lib/life-plan.ts';

// CST = UTC+8.
const at = (hhmm, day = '2026-10-11') => Date.parse(`${day}T${hhmm}:00+08:00`);
const empty = { day: '', slots: {} };

test('only 9:00–23:00 has stretches', () => {
  assert.equal(segmentAt(at('08:59')), null);
  assert.equal(segmentAt(at('09:00')).id, 'morning');
  assert.equal(segmentAt(at('12:00')).id, 'afternoon');
  assert.equal(segmentAt(at('22:59')).id, 'evening');
  assert.equal(segmentAt(at('23:00')), null);
  const night = planLife(empty, at('02:00'), 0.5, null);
  assert.equal(night.action, 'silent');
  assert.equal(night.state.day, '2026-10-11');
  assert.equal(night.changed, true);
});

test('the first beat in a stretch picks a moment that leaves room before it ends', () => {
  const low = planLife(empty, at('09:10'), 0, null);
  assert.equal(low.state.slots.morning.target, at('09:10'));
  assert.equal(low.action, 'run');
  // The moment is picked from now on, never in the past.
  const early = planLife(empty, at('10:00'), 0.5, null);
  assert.ok(early.state.slots.morning.target >= at('10:00'));
  const high = planLife(empty, at('09:10'), 0.9999, null);
  assert.ok(high.state.slots.morning.target < at('12:00') - LIFE_TAIL_MS);
  assert.ok(high.state.slots.morning.target > at('11:00'));
  // Picked late in the stretch: still goes now rather than never.
  const late = planLife(empty, at('11:40'), 0.7, null);
  assert.equal(late.action, 'run');
});

test('it runs once the moment comes, then the stretch is done', () => {
  const planned = planLife(empty, at('13:00'), 0.5, null);
  assert.equal(planned.action, 'silent');
  const target = planned.state.slots.afternoon.target;
  const run = planLife(planned.state, target + 1, 0.1, null);
  assert.equal(run.action, 'run');
  assert.equal(run.segment, 'afternoon');
  assert.equal(run.state.slots.afternoon.done, true);
  const again = planLife(run.state, target + 3600_000, 0.1, null);
  assert.equal(again.action, 'silent');
  assert.equal(again.changed, false);
});

test('waits while she is chatting, and her messages never move the moment', () => {
  const state = { day: '2026-10-11', slots: { evening: { target: at('19:00') } } };
  const waiting = planLife(state, at('19:30'), 0.5, at('19:25'));
  assert.equal(waiting.action, 'silent');
  assert.equal(waiting.state.slots.evening.target, at('19:00'));
  const after = planLife(state, at('19:30'), 0.5, at('19:30') - LIFE_CHATTING_MS - 1);
  assert.equal(after.action, 'run');
});

test('a new day starts with fresh stretches; a missed stretch is not carried over', () => {
  const yesterday = { day: '2026-10-10', slots: { morning: { target: at('10:00', '2026-10-10'), done: true }, evening: { target: at('20:00', '2026-10-10') } } };
  const plan = planLife(yesterday, at('10:00'), 0, null);
  assert.equal(plan.state.day, '2026-10-11');
  assert.deepEqual(Object.keys(plan.state.slots), ['morning']);
  assert.equal(plan.action, 'run');
});

test('stored state is read defensively', () => {
  assert.deepEqual(parseLifeBeat(null), { day: '', slots: {} });
  assert.deepEqual(parseLifeBeat({ day: 'x', slots: { morning: { target: 5, done: true }, noon: { target: 1 }, evening: { target: 'no' } }, log: [] }),
    { day: 'x', slots: { morning: { target: 5, done: true } } });
});

test('his closing JSON is parsed with fences and words around it', () => {
  const read = parseLifeOutcome('读完了。\n```json\n{"did":"read","line":"读到第二章，  停在一句话上"}\n```');
  assert.deepEqual(read, { did: 'read', line: '读到第二章， 停在一句话上', links: [], title: '', post: '', share: '', reason: '' });

  const thread = parseLifeOutcome(JSON.stringify({ did: 'surf', line: 'x', title: '  一个  标题 ', post: '第一段\r\n\n\n\n第二段' }));
  assert.equal(thread.title, '一个 标题');
  assert.equal(thread.post, '第一段\n\n第二段');
  assert.equal(parseLifeOutcome('{"did":"read","title":"t","post":"p"}').post, '');

  const surf = parseLifeOutcome(JSON.stringify({
    did: 'surf', line: '逛了逛', share: '你看这个', links: [
      { title: '好东西', url: 'https://example.com/x', why: '想起你' },
      { title: '坏链接', url: 'javascript:alert(1)' },
      { url: 'http://example.org' },
    ],
  }));
  assert.deepEqual(surf.links, [
    { title: '好东西', url: 'https://example.com/x', why: '想起你' },
    { title: 'http://example.org', url: 'http://example.org' },
  ]);
  assert.equal(surf.share, '你看这个');

  // Only a surf can carry links or a message for her.
  const sneaky = parseLifeOutcome('{"did":"read","line":"x","share":"hi","links":[{"title":"a","url":"https://a.b"}]}');
  assert.equal(sneaky.share, '');
  assert.deepEqual(sneaky.links, []);

  assert.equal(parseLifeOutcome('{"did":"nap","reason":"困"}').did, 'none');
  assert.equal(parseLifeOutcome('没有 JSON'), null);
  assert.equal(parseLifeOutcome('{"did": broken'), null);
});

test('reading and surfing each have their own switch, both off by default', () => {
  assert.deepEqual(lifeKinds({}), { read: false, surf: false, dayday: false, clawd: false });
  assert.deepEqual(lifeKinds({ lifeRead: true }), { read: true, surf: false, dayday: false, clawd: false });
  assert.deepEqual(lifeKinds({ lifeSurf: true, lifeRead: 'yes' }), { read: false, surf: true, dayday: false, clawd: false });
});

test('his own time only gets the tools for what is switched on', () => {
  const readOnly = lifeToolNames({ read: true, surf: false, dayday: false, clawd: false });
  assert.ok(readOnly.includes('mcp__iooi__reading_mark'));
  assert.ok(!readOnly.includes('WebSearch') && !readOnly.includes('WebFetch'));
  const surfOnly = lifeToolNames({ read: false, surf: true, dayday: false, clawd: false });
  assert.ok(surfOnly.includes('WebSearch') && surfOnly.includes('WebFetch'));
  assert.ok(!surfOnly.some((name) => name.startsWith('mcp__iooi__reading_')));
  assert.ok(surfOnly.includes('mcp__iooi__surf_board') && surfOnly.includes('mcp__iooi__surf_reply'));
  assert.ok(!readOnly.some((name) => name.startsWith('mcp__iooi__surf_')));
  assert.ok(!lifeToolNames({ read: true, surf: true }).includes('mcp__iooi__surf_post'));
  for (const names of [readOnly, surfOnly, lifeToolNames({ read: true, surf: true })]) {
    assert.ok(names.includes('mcp__summer__read'));
    for (const name of ['dayday_book', 'dayday_shop', 'dayday_items']) assert.ok(!names.includes(`mcp__iooi__${name}`));
    assert.ok(!names.includes('mcp__iooi__dayday_action'));
    assert.ok(!names.some((name) => /blog_(write|comment|delete)|summer__edit/.test(name)));
  }
});

test('an outcome for something switched off counts as nothing done', () => {
  const surf = parseLifeOutcome('{"did":"surf","line":"逛了逛","links":[{"title":"a","url":"https://a.example"}],"share":"看这个"}');
  const dropped = allowedOutcome(surf, { read: true, surf: false, dayday: false, clawd: false });
  assert.equal(dropped.did, 'none');
  assert.equal(dropped.share, '');
  assert.deepEqual(dropped.links, []);
  assert.equal(allowedOutcome(surf, { read: false, surf: true }), surf);
  const read = parseLifeOutcome('{"did":"read","line":"读了两段"}');
  assert.equal(allowedOutcome(read, { read: false, surf: true }).did, 'none');
  assert.equal(allowedOutcome(null, { read: true, surf: true }), null);
});

test('dayday has its own switch, scoped tools and bounded review output', () => {
  assert.deepEqual(lifeKinds({ lifeDayday: true }), { read: false, surf: false, dayday: true, clawd: false });
  const names = lifeToolNames({ read: false, surf: false, dayday: true, clawd: false });
  assert.ok(names.includes('mcp__iooi__dayday_shop') && names.includes('mcp__iooi__dayday_items'));
  assert.ok(!names.includes('mcp__iooi__dayday_action') && !names.includes('WebSearch'));
  const outcome = parseLifeOutcome(JSON.stringify({ did: 'dayday', line: '逛了商城', reviews: [{ id: 'p1', text: '好看' }, { id: 'p2', text: '你有类似的了' }, { id: 'p3', text: '不应该写第三件' }], share: '不要发无关推送' }));
  assert.equal(outcome.did, 'dayday');
  assert.equal(outcome.reviews.length, 2);
  assert.equal(outcome.share, '');
  assert.equal(allowedOutcome(outcome, { read: true, surf: true, dayday: false }).did, 'none');
  assert.equal(allowedOutcome(outcome, { read: false, surf: false, dayday: true, clawd: false }), outcome);
});

test('clawd shares the existing heartbeat plan and only gets care tools when enabled', () => {
  assert.equal(lifeKinds({ lifeClawd: true }).clawd, true);
  const on = lifeToolNames({ read: false, surf: false, clawd: true });
  assert.ok(on.includes('mcp__iooi__clawd_read') && on.includes('mcp__iooi__clawd_action'));
  assert.ok(!on.includes('mcp__iooi__clawd_talk'));
  assert.ok(!lifeToolNames({ read: true, surf: true, clawd: false }).some((name) => name.includes('clawd')));
  const outcome = parseLifeOutcome('{"did":"clawd","line":"摸了摸小砖的头"}');
  assert.equal(allowedOutcome(outcome, { read: false, surf: false, clawd: false }).did, 'none');
  assert.equal(allowedOutcome(outcome, { read: false, surf: false, clawd: true }), outcome);
});
