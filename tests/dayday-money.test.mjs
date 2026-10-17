import test from 'node:test';
import assert from 'node:assert/strict';
import { newDayday, configureDayday, daydayCommand, initialDaydayGrant, sendDaydayTransfer, settleDaydayTransfer,
  settleDayday, availableDayday, daydaySnapshot, saveDaydayProduct, buyDayday, bankDayday, DAYDAY_TRANSFER_MS } from '../app/lib/dayday.ts';
import './helpers/resolve-typescript.mjs';
const { parseDaydayMarker, stripDaydayMarkers } = await import('../app/lib/dayday-chat.ts');
import { createVisibleReplyStream } from '../app/lib/visible-reply-stream.ts';
const { mergeChatMessages } = await import('../app/lib/chat-sessions.ts');

const NOW = Date.parse('2026-10-17T08:00:00+08:00');
function open() { const s = newDayday(NOW); configureDayday(s, { enabled: true }, NOW); initialDaydayGrant(s, NOW); return s; }
function send(s, amount = '52.00', kind = 'redpacket') { return sendDaydayTransfer(s, { amount, kind, message: '给你', sessionId: 'private' }, NOW); }

test('first allowance is human-only, once across different request IDs, and does not turn dayday on', () => {
  const s = newDayday(NOW);
  assert.throws(() => daydayCommand(s, 'initial_grant', { requestId: 'ai' }, NOW), /店长/);
  daydayCommand(s, 'initial_grant', { requestId: 'human1' }, NOW, true);
  daydayCommand(s, 'initial_grant', { requestId: 'human2' }, NOW + 1, true);
  assert.equal(s.wallet, 200000); assert.equal(s.enabled, false); assert.equal(s.ledger.length, 1);
  assert.deepEqual(s.salaryMonths, []);
  configureDayday(s, { enabled: true }, NOW + 2);
  settleDayday(s, Date.parse('2026-11-15T00:00:00+08:00'));
  assert.equal(s.wallet, 400000);
});
test('sending freezes available money while acceptance is the only actual debit', () => {
  const s = open(), t = send(s);
  assert.equal(s.wallet, 200000); assert.equal(availableDayday(s, NOW), 194800);
  assert.equal(daydaySnapshot(s, NOW).held, 5200); assert.equal(daydaySnapshot(s, NOW).monthlySpent, 0);
  settleDaydayTransfer(s, t.id, 'accepted', NOW + 1);
  assert.equal(s.wallet, 194800); assert.equal(daydaySnapshot(s, NOW).held, 0); assert.equal(daydaySnapshot(s, NOW).monthlySpent, 5200);
});
test('frozen money cannot be spent, deposited or promised in another transfer', () => {
  const s = open(); send(s, '1900');
  assert.throws(() => send(s, '101'), /余额不足/);
  assert.throws(() => bankDayday(s, { direction: 'deposit', amount: '101' }, NOW), /可用余额不足/);
  const p = saveDaydayProduct(s, { name: '商品', category: '书籍', price: '101' }, NOW);
  assert.throws(() => buyDayday(s, { items: [{ productId: p.id, quantity: 1 }] }, NOW), /余额不足/);
  bankDayday(s, { direction: 'deposit', amount: '100' }, NOW);
  assert.equal(s.wallet, 190000); assert.equal(s.bank, 10000); assert.equal(availableDayday(s, NOW), 0);
});
test('return releases the hold without expense and later acceptance cannot reverse that outcome', () => {
  const s = open(), t = send(s);
  settleDaydayTransfer(s, t.id, 'returned', NOW + 1); settleDaydayTransfer(s, t.id, 'accepted', NOW + 2);
  assert.equal(t.status, 'returned'); assert.equal(s.wallet, 200000); assert.equal(availableDayday(s, NOW), 200000);
  assert.equal(s.ledger.filter((e) => e.type === 'transfer_release').length, 1);
});
test('24-hour expiry releases funds exactly once, even if a stale card requests acceptance', () => {
  const s = open(), t = send(s, '100', 'transfer');
  const before = structuredClone(s);
  assert.equal(daydaySnapshot(s, NOW + DAYDAY_TRANSFER_MS).transfers[0].status, 'expired');
  assert.equal(daydaySnapshot(s, NOW + DAYDAY_TRANSFER_MS).held, 0);
  assert.deepEqual(s, before);
  settleDayday(s, NOW + DAYDAY_TRANSFER_MS); settleDayday(s, NOW + DAYDAY_TRANSFER_MS + 1);
  settleDaydayTransfer(s, t.id, 'accepted', NOW + DAYDAY_TRANSFER_MS + 2);
  assert.equal(t.status, 'expired'); assert.equal(s.wallet, 200000);
  assert.equal(s.ledger.filter((e) => e.type === 'transfer_release').length, 1);
});
test('turning off stops new gifts but cannot trap an existing gift or let MCP accept it', () => {
  const s = open(), t = send(s);
  configureDayday(s, { enabled: false }, NOW + 1);
  assert.throws(() => send(s), /关闭/);
  assert.throws(() => daydayCommand(s, 'settle_transfer', { requestId: 'ai-accept', transferId: t.id, decision: 'accepted' }, NOW + 2), /店长/);
  daydayCommand(s, 'settle_transfer', { requestId: 'her-accept', transferId: t.id, decision: 'accepted' }, NOW + 2, true);
  assert.equal(t.status, 'accepted'); assert.equal(s.wallet, 194800);
});
test('money markers execute at most one complete block and incomplete blocks never execute', () => {
  const marker = '[dayday_money kind="redpacket" amount="52.00"]给你[/dayday_money]';
  assert.deepEqual(parseDaydayMarker('给你点小心意\n' + marker + marker), { kind: 'redpacket', amount: '52.00', message: '给你' });
  assert.equal(parseDaydayMarker(marker.slice(0, -3)), null);
  assert.equal(stripDaydayMarkers('给你点小心意\n' + marker), '给你点小心意');
  assert.equal(stripDaydayMarkers('好\n[dayday_money kind="transfer"'), '好');
});
test('hidden money instructions never flash across any streaming boundary', () => {
  const content = '好呀。[dayday_money kind="redpacket" amount="52.00"]给你[/dayday_money]收好。';
  for (let index = 0; index <= content.length; index++) {
    const filter = createVisibleReplyStream();
    assert.equal(filter.push(content.slice(0, index)) + filter.push(content.slice(index)) + filter.finish(), '好呀。收好。');
  }
  const filter = createVisibleReplyStream(); assert.equal(filter.push('好[dayday_m') + filter.finish(), '好');
});
test('recovered chat cards deduplicate by real transfer ID even if content or timestamps differ', () => {
  const a = { role: 'assistant', source: 'dayday_card', content: '红包', dayday: { id: 'gift1', ok: true, text: '红包' }, time: '08:00' };
  const b = { ...a, content: '来自后台的红包', time: '08:01' };
  assert.equal(mergeChatMessages([a], [b]).length, 1);
});
