import test from 'node:test';
import assert from 'node:assert/strict';
import { newDayday, configureDayday, saveDaydayProduct, buyDayday, refundDayday, daydayPrice,
  daydaySnapshot, bankDayday, daydayCommand, sendDaydayTransfer, settleDaydayTransfer } from '../app/lib/dayday.ts';
const NOW = Date.parse('2026-10-15T23:59:00+08:00');
function setup() {
  const s = newDayday(NOW); configureDayday(s, { enabled: true }, NOW);
  const p = saveDaydayProduct(s, { name: '牙膏', category: '日用', price: '10.01', stock: 30,
    discountTiers: [{ quantity: 3, percent: 80 }, { quantity: 2, percent: 90 }] }, NOW);
  return { s, p };
}
test('quantity tiers use best eligible discount, round line once and preserve legacy pricing', () => {
  const { p } = setup();
  assert.equal(daydayPrice(p, 1).total, 1001);
  assert.equal(daydayPrice(p, 2).total, 1802);
  assert.equal(daydayPrice(p, 3).total, 2402);
  assert.equal(daydayPrice({ price: 1001 }, 3).total, 3003);
  assert.equal(daydayPrice({ ...p, discountTiers: [{ quantity: 2, percent: 80 }, { quantity: 3, percent: 90 }] }, 3).total, 2402);
});
test('backend merges repeated products before discount; stale quote rejected; refund uses original discounted amount', () => {
  const { s, p } = setup();
  assert.throws(() => buyDayday(s, { items: [{ productId: p.id, quantity: 2 }], expectedTotal: 2002 }, NOW), /价格已变化/);
  const order = buyDayday(s, { items: [{ productId: p.id, quantity: 1 }, { productId: p.id, quantity: 1 }], expectedTotal: 1802 }, NOW);
  assert.equal(order.total, 1802); assert.equal(order.lines[0].discountPercent, 90); assert.equal(p.stock, 28);
  saveDaydayProduct(s, { ...p, price: '20', discountTiers: [] }, NOW + 1);
  refundDayday(s, order.id, NOW + 2);
  assert.equal(s.wallet, 200000); assert.equal(s.products[0].stock, 30); assert.equal(order.total, 1802);
});
test('human gift purchases use the same discounts and refund the human account', () => {
  const { s, p } = setup();
  const order = buyDayday(s, { items: [{ productId: p.id, quantity: 3 }] }, NOW, true);
  assert.equal(order.total, 2402); assert.equal(s.human.wallet, 47598); assert.equal(s.wallet, 200000);
  refundDayday(s, order.id, NOW + 1, true); assert.equal(s.human.wallet, 50000);
});
test('invalid tiers are rejected before changing product data', () => {
  const { s, p } = setup();
  for (const tiers of [[{ quantity: 1, percent: 90 }], [{ quantity: 2, percent: 0 }], [{ quantity: 2, percent: 90.5 }], [{ quantity: 2, percent: 100 }], [{ quantity: 2, percent: 90 }, { quantity: 2, percent: 80 }], null]) {
    assert.throws(() => saveDaydayProduct(s, { ...p, price: '10.01', discountTiers: tiers }, NOW + 1));
    assert.equal(s.products[0], p);
  }
});
test('Shanghai income and daily net spending exclude bank moves, pending transfers and human gift purchases', () => {
  const { s, p } = setup();
  bankDayday(s, { direction: 'deposit', amount: '10' }, NOW);
  const pending = sendDaydayTransfer(s, { sessionId: 'test', kind: 'transfer', amount: '1' }, NOW);
  let snap = daydaySnapshot(s, NOW); assert.equal(snap.monthlyIncome, 200000); assert.equal(snap.todaySpent, 0);
  const incoming = daydayCommand(s, 'human_send', { requestId: 'send', sessionId: 'test', kind: 'transfer', amount: '20' }, NOW, true);
  daydayCommand(s, 'receive_transfer', { requestId: 'accept', transferId: incoming.id, decision: 'accepted' }, NOW);
  settleDaydayTransfer(s, pending.id, 'accepted', NOW);
  const order = buyDayday(s, { items: [{ productId: p.id, quantity: 2 }] }, NOW);
  snap = daydaySnapshot(s, NOW); assert.equal(snap.monthlyIncome, 202000); assert.equal(snap.todaySpent, 1902);
  assert.equal(daydaySnapshot(s, NOW + 60001).todaySpent, 0);
  refundDayday(s, order.id, NOW + 60001);
  snap = daydaySnapshot(s, NOW + 60001); assert.equal(snap.todaySpent, -1802); assert.equal(snap.monthlySpent, 100); assert.equal(snap.monthlyIncome, 202000);
});
