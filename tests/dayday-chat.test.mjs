import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './helpers/resolve-typescript.mjs';

const original = process.cwd();
const sandbox = mkdtempSync(join(tmpdir(), 'iooi-dayday-test-'));
process.chdir(sandbox);
after(() => { process.chdir(original); rmSync(sandbox, { recursive: true, force: true }); });
const { applyDayday, emptyBook, ledgerView, parseBook } = await import('../app/lib/dayday-ledger.ts');
const { runDayday, readBook } = await import('../app/lib/dayday-store.ts');
const { runDaydayAI, runDaydayMarkers, daydayCareOverview } = await import('../app/lib/dayday-tools.ts');
const { callDaydayTool } = await import('../app/lib/dayday-mcp.ts');
const { parseDaydayMarkers, stripDaydayMarkers } = await import('../app/lib/dayday-markers.ts');
const { createVisibleReplyStream } = await import('../app/lib/visible-reply-stream.ts');
const NOW = new Date('2026-10-19T12:00:00+08:00');
const run = (book, action, input, bySusu = false, now = NOW) => applyDayday(book, action, input, { now, bySusu });
function book() { const b = emptyBook(); run(b, 'settings.set', { payday: 15, startAmount: 100000 }); return b; }

test('both directions share one pool: send holds, receive/return releases, spending never changes', () => {
  for (const fromSusu of [false, true]) for (const kind of ['redpacket', 'transfer']) {
    const b = book();
    const gift = run(b, 'money.send', { kind, amount: 1800, note: '抱抱' }, fromSusu);
    assert.equal(gift.from, fromSusu ? 'susu' : 'her');
    assert.equal(ledgerView(b).remaining, 98200);
    assert.equal(ledgerView(b).giftHeld, 1800);
    assert.throws(() => run(b, 'money.receive', { id: gift.id }, fromSusu), /收款方/);
    run(b, 'money.receive', { id: gift.id }, !fromSusu);
    run(b, 'money.receive', { id: gift.id }, !fromSusu);
    run(b, 'money.return', { id: gift.id }, !fromSusu);
    assert.equal(gift.status, 'received');
    assert.equal(ledgerView(b).remaining, 100000);
    assert.equal(ledgerView(b).spent, 0);
    assert.equal(ledgerView(b).cycleIncome, 0);
    const returned = run(b, 'money.send', { kind, amount: 600 }, fromSusu);
    run(b, 'money.return', { id: returned.id }, !fromSusu);
    assert.equal(ledgerView(b).remaining, 100000);
  }
});

test('pending gifts cannot overdraw or manufacture entries and old books get defaults', () => {
  const b = book();
  run(b, 'money.send', { kind: 'transfer', amount: 99000 });
  assert.throws(() => run(b, 'money.send', { kind: 'redpacket', amount: 1001 }, true), /余额/);
  assert.equal(b.gifts.length, 1);
  assert.equal(b.entries.length, 0);
  assert.deepEqual(parseBook({ version: 1 }).gifts, []);
});

test('only she can confirm fixed costs and old cycle cards cannot charge a new cycle', () => {
  const b = book();
  const f = run(b, 'fixed.add', { name: '订阅', amount: 2000, day: 16 }, true);
  assert.throws(() => run(b, 'fixed.pay', { id: f.id }, true), /她点卡片/);
  assert.throws(() => run(b, 'fixed.skip', { id: f.id }, true), /她点卡片/);
  assert.throws(() => run(b, 'fixed.pay', { id: f.id, cycle: '2026-09-15' }), /旧周期/);
  run(b, 'fixed.update', { id: f.id, name: '新订阅', amount: 3000, day: 17 }, true);
  run(b, 'fixed.pay', { id: f.id, cycle: '2026-10-15' });
  assert.throws(() => run(b, 'fixed.pay', { id: f.id, cycle: '2026-10-15' }), /已经处理/);
  assert.equal(ledgerView(b).spent, 3000);
  run(b, 'fixed.update', { id: f.id, name: '新订阅', amount: 4000, day: 17 }, true);
  assert.equal(ledgerView(b).due.length, 0, 'editing preserves the paid cycle');
});

test('ledger edits preserve original dates, and refills can be renamed', () => {
  const b = book();
  const e = run(b, 'entry.add', { kind: 'expense', cat: 'food', amount: 1800, note: '午饭', at: '2026-10-18T04:00:00Z' }, true);
  run(b, 'entry.update', { id: e.id, kind: 'expense', cat: 'food', amount: 2000, note: '午饭改价' }, true);
  assert.equal(e.at, '2026-10-18T04:00:00.000Z');
  assert.equal(e.bySusu, true);
  const refill = run(b, 'refill.add', { name: '纸巾' }, true);
  run(b, 'refill.update', { id: refill.id, name: '厨房纸' }, true);
  assert.equal(refill.name, '厨房纸');
});

test('dayday markers never leak at any stream boundary, including unfinished blocks', () => {
  const marker = '[dayday]{"action":"entry.add","input":{"kind":"expense","cat":"food","amount":1800,"note":"午饭"}}[/dayday]';
  const input = `记好了。${marker}抱抱。`;
  assert.equal(parseDaydayMarkers(input)[0].input.amount, 1800);
  assert.equal(stripDaydayMarkers(input), '记好了。抱抱。');
  for (let split = 0; split <= input.length; split++) {
    const stream = createVisibleReplyStream();
    assert.equal(stream.push(input.slice(0, split)) + stream.push(input.slice(split)) + stream.finish(), '记好了。抱抱。');
  }
  const stream = createVisibleReplyStream();
  assert.equal(stream.push('好[dayday]{"action":') + stream.finish(), '好');
  assert.equal(stripDaydayMarkers('好[dayday]{"action":'), '好');
  assert.equal(parseDaydayMarkers('[dayday]坏JSON[/dayday]')[0].action, 'invalid');
});

test('atomic store retries apply once and recover the same result for cards', async () => {
  await runDayday('settings.set', { payday: 15, startAmount: 100000 }, { now: NOW });
  const results = await Promise.all(Array.from({ length: 5 }, () => runDayday('money.send', { kind: 'transfer', amount: 1800 }, { requestId: 'same_gift_1234', bySusu: true, now: NOW })));
  assert.equal(results.filter((r) => !r.repeated).length, 1);
  assert.equal(new Set(results.map((r) => r.result.id)).size, 1);
  const b = await readBook(NOW);
  assert.equal(b.gifts.length, 1);
  assert.equal(ledgerView(b).remaining, 98200);
});

test('hidden chat writes are idempotent; failed or forbidden operations yield failure cards', async () => {
  const markers = [{ action: 'entry.add', input: { kind: 'expense', cat: 'food', amount: 1800, note: '午饭' } }];
  const first = await runDaydayMarkers(markers, 'session:round1');
  const second = await runDaydayMarkers(markers, 'session:round1');
  assert.equal(first[0].targetId, second[0].targetId);
  assert.equal((await readBook()).entries.length, 1);
  assert.equal(first[0].text, '已记 · 午饭 ¥18 · 饮食');
  for (const action of ['fixed.pay', 'fixed.skip', 'settings.set', 'invalid']) {
    const cards = await runDaydayMarkers([{ action, input: {} }], `session:${action}`);
    assert.equal(cards[0].ok, false);
  }
  await assert.rejects(() => runDaydayAI('settings.set', {}), /不能执行/);
});

test('MCP reads current book and restricts writes to full access with valid request ids', async () => {
  const result = await callDaydayTool('dayday_book', {}, 'read');
  assert.ok(JSON.parse(result.content[0].text).view.cycleEntries.length);
  await assert.rejects(() => callDaydayTool('dayday_action', { action: 'entry.add', input: {} }, 'read'), /dayday标记/);
  await assert.rejects(() => callDaydayTool('dayday_action', { action: 'entry.add', input: {}, requestId: 'bad' }, 'full'), /requestId/);
});

test('human money send saves a recoverable chat card and retries do not duplicate it', async () => {
  const { POST } = await import('../app/api/dayday/route.ts');
  const { readStore } = await import('../app/lib/store.ts');
  const body = { action: 'money.send', kind: 'redpacket', amount: 520, note: '爱你', sessionId: 'chat-money-test', requestId: 'human_money_001' };
  for (let i = 0; i < 2; i++) {
    const response = await POST(new Request('http://localhost/api/dayday', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    assert.equal(response.status, 200);
  }
  const session = readStore().sessions.find((s) => s.id === body.sessionId);
  assert.equal(session.messages.length, 1);
  assert.equal(session.messages[0].source, 'ledger_card');
  assert.equal(session.messages[0].role, 'user');
  assert.match(session.messages[0].content, /酥酥.*¥5.2/);
});

test('heartbeat sees budget context without refill names and cannot write to dayday', async () => {
  await runDayday('refill.add', { name: '不应推送的厨房纸' });
  const before = await readBook();
  const context = await daydayCareOverview();
  assert.match(context, /剩余.*今日支出.*运输中/);
  assert.ok(!context.includes('不应推送的厨房纸'));
  assert.match(context, /待补项不发推送/);
  assert.deepEqual(await readBook(), before);
  await assert.rejects(() => callDaydayTool('dayday_action', { action: 'money.send', input: { kind: 'redpacket', amount: 100 }, requestId: 'life_gift_001' }, 'life'), /不能改账/);
  const { handleRpc } = await import('../app/lib/mcp-server.ts');
  const list = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'life');
  const names = list.result.tools.map((t) => t.name);
  assert.ok(names.includes('dayday_book') && names.includes('dayday_shop') && names.includes('dayday_items'));
  assert.ok(!names.includes('dayday_action'));
});
