import test from 'node:test';
import assert from 'node:assert/strict';
import { newDayday, daydayState, configureDayday, daydayCommand, initialDaydayGrant, daydaySnapshot,
  sendDaydayTransfer, settleDaydayTransfer, saveDaydayProduct, buyDayday, refundDayday, settleDayday, DAYDAY_TRANSFER_MS } from '../app/lib/dayday.ts';
import './helpers/resolve-typescript.mjs';
const { parseDaydayReceive, stripDaydayMarkers } = await import('../app/lib/dayday-chat.ts');
const { createVisibleReplyStream } = await import('../app/lib/visible-reply-stream.ts');
const NOW = Date.parse('2026-10-17T09:00:00+08:00');
function account() { const s = newDayday(NOW); configureDayday(s, { enabled: true }, NOW); initialDaydayGrant(s, NOW); return s; }
function send(s, requestId = 'human-send', amount = '52.00') { return daydayCommand(s, 'human_send', { requestId, kind: 'redpacket', amount, sessionId: 'private' }, NOW, true); }

test('human starts with 500 once, existing balances including zero never reset, no monthly human top-up', () => {
  const s = account(); assert.equal(s.human.wallet, 50000); s.human.wallet = 0;
  assert.equal(daydayState(s, NOW + 1).human.wallet, 0);
  settleDayday(s, Date.parse('2026-11-15T08:00:00+08:00')); assert.equal(s.human.wallet, 0);
  daydayCommand(s, 'human_initialize', { requestId: 'init' }, NOW, true); assert.equal(s.human.wallet, 0);
});
test('legacy accepted Susu gifts migrate into human balance and history exactly once', () => {
  const s = account(), t = sendDaydayTransfer(s, { kind: 'transfer', amount: '20', sessionId: 'private' }, NOW);
  settleDaydayTransfer(s, t.id, 'accepted', NOW + 1);
  delete s.human;
  const migrated = daydayState(s, NOW + 2);
  assert.equal(migrated.human.wallet, 52000); assert.equal(migrated.wallet, 198000);
  daydayState(migrated, NOW + 3); assert.equal(migrated.human.wallet, 52000);
  assert.equal(migrated.human.ledger.filter((e) => e.ref === t.id).length, 1);
});
test('human gift holds only human funds, AI receipt conserves combined money and settles once', () => {
  const s = account(), total = s.wallet + s.human.wallet, t = send(s);
  let snapshot = daydaySnapshot(s, NOW); assert.equal(snapshot.human.available, 44800); assert.equal(snapshot.held, 0); assert.equal(s.wallet, 200000);
  daydayCommand(s, 'receive_transfer', { requestId: 'receive', transferId: t.id, decision: 'accepted' }, NOW + 1);
  daydayCommand(s, 'receive_transfer', { requestId: 'receive-again', transferId: t.id, decision: 'accepted' }, NOW + 2);
  assert.equal(s.wallet, 205200); assert.equal(s.human.wallet, 44800); assert.equal(s.wallet + s.human.wallet, total);
  assert.equal(daydaySnapshot(s, NOW + 3).human.held, 0);
});
test('return and expiry release human holds without moving either balance', () => {
  const s = account(), a = send(s);
  daydayCommand(s, 'receive_transfer', { requestId: 'return', transferId: a.id, decision: 'returned' }, NOW + 1);
  assert.equal(s.human.wallet, 50000); assert.equal(s.wallet, 200000);
  send(s, 'expire'); settleDayday(s, NOW + DAYDAY_TRANSFER_MS);
  assert.equal(daydaySnapshot(s, NOW + DAYDAY_TRANSFER_MS).human.held, 0); assert.equal(s.human.wallet, 50000);
});
test('human cannot claim on AI behalf; MCP cannot spend human money or claim its own outgoing transfers', () => {
  const s = account(), t = send(s);
  assert.throws(() => daydayCommand(s, 'settle_transfer', { requestId: 'bad1', transferId: t.id, decision: 'accepted' }, NOW, true), /他自己/);
  assert.throws(() => daydayCommand(s, 'receive_transfer', { requestId: 'bad2', transferId: t.id, decision: 'accepted' }, NOW, true), /自己操作/);
  assert.throws(() => daydayCommand(s, 'human_send', { requestId: 'bad3', kind: 'redpacket', amount: '1', sessionId: 'private' }, NOW), /店长/);
  assert.throws(() => daydayCommand(s, 'human_buy_gift', { requestId: 'bad4', items: [] }, NOW), /店长/);
  const outgoing = sendDaydayTransfer(s, { kind: 'transfer', amount: '1', sessionId: 'private' }, NOW);
  assert.throws(() => daydayCommand(s, 'receive_transfer', { requestId: 'bad5', transferId: outgoing.id, decision: 'accepted' }, NOW), /只能处理/);
});
test('collecting Susu money credits human funds while returns do not, no money disappears', () => {
  const s = account(), t = sendDaydayTransfer(s, { kind: 'redpacket', amount: '30', sessionId: 'private' }, NOW);
  settleDaydayTransfer(s, t.id, 'accepted', NOW + 1);
  assert.equal(s.human.wallet, 53000); assert.equal(s.wallet, 197000);
  const b = sendDaydayTransfer(s, { kind: 'transfer', amount: '20', sessionId: 'private' }, NOW);
  settleDaydayTransfer(s, b.id, 'returned', NOW + 2);
  assert.equal(s.human.wallet, 53000); assert.equal(s.human.wallet + s.wallet, 250000);
});
test('human purchase gifts enter Susu inventory but refunds return to the human payer only', () => {
  const s = account(), p = saveDaydayProduct(s, { name: '牙膏', category: '日用', price: '10', stock: 2, usage: { amount: 2, unit: 'month' } }, NOW);
  const order = daydayCommand(s, 'human_buy_gift', { requestId: 'gift', items: [{ productId: p.id, quantity: 1 }] }, NOW, true);
  assert.equal(s.wallet, 200000); assert.equal(s.human.wallet, 49000); assert.equal(p.stock, 1);
  assert.equal(daydaySnapshot(s, NOW).inventory[0].giftedByHuman, true); assert.equal(daydaySnapshot(s, NOW).monthlySpent, 0);
  assert.throws(() => refundDayday(s, order.id, NOW + 1), /她操作/);
  refundDayday(s, order.id, NOW + 1, true); refundDayday(s, order.id, NOW + 2, true);
  assert.equal(s.human.wallet, 50000); assert.equal(s.wallet, 200000); assert.equal(p.stock, 2);
});
test('frozen human money cannot buy gifts or be sent twice; Susu money is untouched', () => {
  const s = account(); send(s, 'hold', '490');
  assert.throws(() => send(s, 'too-much', '11'), /不足/);
  const p = saveDaydayProduct(s, { name: '书', category: '书籍', price: '11' }, NOW);
  assert.throws(() => buyDayday(s, { items: [{ productId: p.id, quantity: 1 }] }, NOW, true), /不足/);
  assert.equal(s.human.wallet, 50000); assert.equal(s.wallet, 200000);
});
test('incoming decision blocks are hidden at every stream split and parsed only when complete', () => {
  const block = '[dayday_receive id="gift" decision="accepted"][/dayday_receive]';
  assert.deepEqual(parseDaydayReceive(block), { transferId: 'gift', decision: 'accepted' });
  assert.equal(parseDaydayReceive(block.slice(0, -1)), null); assert.equal(stripDaydayMarkers('谢谢\n' + block), '谢谢');
  for (let i = 0; i <= block.length; i++) { const filter = createVisibleReplyStream(); assert.equal(filter.push(block.slice(0, i)) + filter.push(block.slice(i)) + filter.finish(), ''); }
});
