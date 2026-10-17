import test from 'node:test';
import assert from 'node:assert/strict';
import { newDayday, configureDayday, settleDayday, saveDaydayProduct, buyDayday, refundDayday, bankDayday,
  daydayCommand, daydayInventory, daydaySlots, dueDaydaySlot, toCents, DAYDAY_ALLOWANCE, DAYDAY_REFUND_MS } from '../app/lib/dayday.ts';

const at = (day) => Date.parse(`${day}+08:00`);
const NOW = at('2026-10-15T08:00:00');
function open() { const s = newDayday(NOW); configureDayday(s, { enabled: true }, NOW); return s; }
function product(s, patch = {}) { return saveDaydayProduct(s, { name: '100g牙膏', category: '日用', price: '10.10', usage: { amount: 2, unit: 'month' }, ...patch }, NOW); }
function buy(s, p, now = NOW, quantity = 1) { return buyDayday(s, { items: [{ productId: p.id, quantity }] }, now); }

test('starts disabled and empty; cents reject imprecise, negative and nonnumeric money', () => {
  const s = newDayday(NOW);
  assert.equal(s.enabled, false); assert.equal(s.wallet, 0); assert.deepEqual(s.products, []);
  assert.equal(toCents('10.10'), 1010); assert.equal(toCents('0.29'), 29);
  for (const value of ['1.001', -1, NaN, '', '1e2', null]) assert.throws(() => toCents(value));
  assert.throws(() => buyDayday(s, { items: [] }, NOW), /关闭/);
});
test('Shanghai payday is the 15th, paid once, with previous balance carried over', () => {
  const before = at('2026-10-14T23:59:00');
  const s = newDayday(before); configureDayday(s, { enabled: true }, before);
  assert.equal(s.wallet, 0);
  settleDayday(s, at('2026-10-15T00:00:00'));
  assert.equal(s.wallet, DAYDAY_ALLOWANCE);
  const p = product(s); buy(s, p); bankDayday(s, { direction: 'deposit', amount: '500' }, NOW);
  settleDayday(s, at('2026-10-31T20:00:00'));
  assert.equal(s.wallet, DAYDAY_ALLOWANCE - 1010 - 50000);
  settleDayday(s, at('2026-11-15T00:01:00')); settleDayday(s, at('2026-11-15T12:00:00'));
  assert.equal(s.wallet, 2 * DAYDAY_ALLOWANCE - 1010 - 50000); assert.equal(s.bank, 50000);
  assert.equal(s.salaryMonths.length, 2);
});
test('disabled paydays never accrue and reopening after the 15th never backfills', () => {
  const s = open();
  configureDayday(s, { enabled: false }, at('2026-10-16T10:00:00'));
  configureDayday(s, { enabled: true }, at('2027-01-17T10:00:00'));
  assert.equal(s.wallet, DAYDAY_ALLOWANCE);
  settleDayday(s, at('2027-02-15T00:00:00'));
  assert.equal(s.wallet, 2 * DAYDAY_ALLOWANCE);
  assert.deepEqual(s.salaryMonths, ['2026-10', '2027-02']);
});
test('opening on payday pays once, including across repeated toggles', () => {
  const s = open();
  configureDayday(s, { enabled: false }, NOW + 1); configureDayday(s, { enabled: true }, NOW + 2);
  assert.equal(s.wallet, DAYDAY_ALLOWANCE); assert.equal(s.salaryMonths.length, 1);
});
test('elapsed enabled payday settles before closing even if no heartbeat ran', () => {
  const s = newDayday(at('2026-10-14T10:00:00'));
  configureDayday(s, { enabled: true }, s.salaryCheckedAt);
  configureDayday(s, { enabled: false }, at('2026-10-16T10:00:00'));
  assert.equal(s.wallet, DAYDAY_ALLOWANCE);
});
test('stock is unlimited by default, custom categories and manager consumption rules are validated', () => {
  const s = open(), p = product(s);
  assert.equal(p.stock, null); assert.deepEqual(p.usage, { amount: 2, unit: 'month' });
  const other = product(s, { category: '小收藏', usage: null }); assert.equal(other.category, '小收藏');
  assert.throws(() => product(s, { stock: -1 }), /库存/);
  assert.throws(() => product(s, { photo: 'https://elsewhere/image.png' }), /图片/);
  assert.throws(() => product(s, { usage: { amount: 0, unit: 'month' } }), /时长/);
  assert.throws(() => product(s, { photo: '/uploads/../secret.jpg' }), /图片/);
});
test('purchase merges duplicate lines, snapshots prices and decrements finite stock exactly', () => {
  const s = open(), p = product(s, { stock: 3 });
  const order = buyDayday(s, { items: [{ productId: p.id, quantity: 1 }, { productId: p.id, quantity: 2 }] }, NOW);
  assert.equal(order.lines.length, 1); assert.equal(order.total, 3030); assert.equal(p.stock, 0);
  saveDaydayProduct(s, { ...p, price: '30.00' }, NOW + 1);
  assert.equal(order.lines[0].price, 1010); assert.equal(order.total, 3030);
  assert.throws(() => buy(s, p), /库存不足/);
});
test('stale checkout totals and insufficient funds cannot charge or create an order', () => {
  const s = open(), p = product(s);
  assert.throws(() => buyDayday(s, { items: [{ productId: p.id, quantity: 1 }], expectedTotal: 1 }, NOW), /价格已变化/);
  assert.equal(s.orders.length, 0); assert.equal(s.wallet, DAYDAY_ALLOWANCE);
  s.wallet = 100;
  assert.throws(() => buy(s, p), /余额不足/); assert.equal(s.orders.length, 0); assert.equal(s.wallet, 100);
});
test('whole refund restores original payment and stock once, even after price change or shutdown', () => {
  const s = open(), p = product(s, { stock: 3 });
  const order = buy(s, p, NOW, 2);
  saveDaydayProduct(s, { ...p, price: '90' }, NOW + 1);
  configureDayday(s, { enabled: false }, NOW + 2);
  refundDayday(s, order.id, NOW + 3); refundDayday(s, order.id, NOW + 4);
  assert.equal(s.wallet, DAYDAY_ALLOWANCE); assert.equal(s.products[0].stock, 3);
  assert.equal(s.ledger.filter((e) => e.type === 'refund').length, 1); assert.deepEqual(daydayInventory(s, NOW), []);
});
test('refund is limited to ten minutes and food or mixed food orders cannot be returned', () => {
  const s = open(), p = product(s), food = product(s, { name: '午饭', category: '饮食', usage: null });
  const order = buy(s, p);
  assert.throws(() => refundDayday(s, order.id, NOW + DAYDAY_REFUND_MS + 1), /10 分钟/);
  const lunch = buyDayday(s, { items: [{ productId: p.id, quantity: 1 }, { productId: food.id, quantity: 1 }] }, NOW);
  assert.throws(() => refundDayday(s, lunch.id, NOW + 1), /饮食/);
  refundDayday(s, order.id, NOW + DAYDAY_REFUND_MS);
  assert.equal(order.status, 'refunded');
});
test('bank transfers conserve funds, cannot overdraft, and stop while disabled', () => {
  const s = open();
  bankDayday(s, { direction: 'deposit', amount: '1000.01' }, NOW);
  bankDayday(s, { direction: 'withdraw', amount: '0.01' }, NOW);
  assert.equal(s.wallet + s.bank, DAYDAY_ALLOWANCE);
  assert.throws(() => bankDayday(s, { direction: 'withdraw', amount: '1001' }, NOW), /余额不足/);
  configureDayday(s, { enabled: false }, NOW);
  assert.throws(() => bankDayday(s, { direction: 'deposit', amount: '1' }, NOW), /关闭/);
});
test('daily goods use calendar months and additional packs queue instead of expiring together', () => {
  const s = open(), p = product(s, { usage: { amount: 1, unit: 'month' } });
  const jan = at('2027-01-31T08:00:00');
  buy(s, p, jan); buy(s, p, jan + 1);
  const items = daydayInventory(s, at('2027-02-15T08:00:00'));
  assert.equal(items[0].endsAt, at('2027-02-28T08:00:00'));
  assert.equal(items[1].startsAt, items[0].endsAt);
  assert.equal(items[1].endsAt, at('2027-03-28T08:00:00'));
  assert.equal(items[1].remaining, 1);
  assert.ok(items[0].remaining > 0 && items[0].remaining < 1);
  assert.equal(daydayInventory(s, at('2027-05-01T08:00:00'))[1].remaining, 0);
});
test('consumption changes affect future purchases only; refunds recompute the queue', () => {
  const s = open(), p = product(s);
  const first = buy(s, p);
  saveDaydayProduct(s, { ...p, price: '10.10', usage: { amount: 1, unit: 'day' } }, NOW + 1);
  buy(s, p, NOW + 2);
  let items = daydayInventory(s, NOW + 3);
  assert.equal(items[0].usage.unit, 'month'); assert.equal(items[1].usage.unit, 'day');
  refundDayday(s, first.id, NOW + 4);
  items = daydayInventory(s, NOW + 5);
  assert.equal(items.length, 1); assert.equal(items[0].startsAt, NOW + 2); assert.equal(items[0].endsAt, NOW + 2 + 86400000);
});
test('idempotent commands return one original result, reject conflicting IDs, and disallow MCP management', () => {
  const s = open(), p = product(s);
  const input = { requestId: 'same-request', items: [{ productId: p.id, quantity: 1 }] };
  const first = daydayCommand(s, 'buy', input, NOW);
  const again = daydayCommand(s, 'buy', structuredClone(input), NOW + 1);
  assert.equal(first.id, again.id); assert.equal(s.orders.length, 1); assert.equal(s.wallet, DAYDAY_ALLOWANCE - 1010);
  assert.throws(() => daydayCommand(s, 'buy', { ...input, reason: 'different' }, NOW), /已用于/);
  assert.throws(() => daydayCommand(s, 'configure', { requestId: 'bad', enabled: false }, NOW), /店长/);
});
test('scheduled opportunities reserve a slot once, never catch up missed hours, and obey switches', () => {
  const s = open(); assert.equal(daydaySlots(s).length, 7);
  const due = dueDaydaySlot(s, NOW); assert.equal(due.name, '早餐');
  s.beatSlots.push(due.key); assert.equal(dueDaydaySlot(s, NOW + 30 * 60000), null);
  assert.equal(dueDaydaySlot(s, at('2026-10-15T13:00:00')), null);
  configureDayday(s, { enabled: false }, NOW); assert.equal(dueDaydaySlot(s, at('2026-10-15T12:00:00')), null);
  s.enabled = true; s.routine.meals = false;
  assert.ok(!daydaySlots(s).includes(8));
});
test('a manager editing an old stock snapshot cannot undo a purchase', () => {
  const s = open(), p = product(s, { stock: 3 });
  const old = structuredClone(p);
  buy(s, p);
  assert.throws(() => saveDaydayProduct(s, { ...old, price: '10.10', expectedUpdatedAt: old.updatedAt }, NOW + 10), /刚刚有变化/);
  assert.equal(s.products[0].stock, 2);
});
