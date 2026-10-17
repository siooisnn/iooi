import test from 'node:test';
import assert from 'node:assert/strict';
import { newDayday, configureDayday, saveDaydayProduct, buyDayday, refundDayday, daydayCommand, daydayInventory,
  daydayHoldings, daydayMonthStats, daydaySnapshot, sendDaydayTransfer, settleDaydayTransfer, DAYDAY_ALLOWANCE } from '../app/lib/dayday.ts';

const at = (day) => Date.parse(`${day}+08:00`);
const NOW = at('2026-10-17T08:00:00');
function open() { const s = newDayday(NOW); configureDayday(s, { enabled: true }, NOW); daydayCommand(s, 'initial_grant', { requestId: 'grant' }, NOW, true); return s; }
const item = (s, name, category, patch = {}) => saveDaydayProduct(s, { name, category, price: '10.00', ...patch }, NOW);
const buy = (s, p, now, quantity = 1) => buyDayday(s, { items: [{ productId: p.id, quantity }] }, now);

test('holdings: only today\'s meals with Beijing times, days left per daily good, clothes and books merged', () => {
  const s = open();
  const soy = item(s, '豆浆油条', '饮食'), rice = item(s, '番茄牛腩饭', '饮食');
  const paste = item(s, '牙膏', '日用', { usage: { amount: 10, unit: 'day' } });
  const tee = item(s, '白T恤', '衣物'), book = item(s, '罪与罚', '书籍');
  buy(s, rice, at('2026-10-16T23:30:00'));          // last night's late meal
  buy(s, soy, at('2026-10-17T09:12:00'));
  buy(s, rice, at('2026-10-17T12:40:00'));
  buy(s, paste, at('2026-10-17T09:00:00'), 2);       // 20 days from 09:00 today
  buy(s, tee, at('2026-10-17T09:00:00')); buy(s, tee, at('2026-10-17T10:00:00')); buy(s, book, at('2026-10-17T10:00:00'));
  const now = at('2026-10-17T13:00:00');
  const have = daydayHoldings(daydayInventory(s, now), now);
  assert.deepEqual(have.todayMeals, [{ time: '09:12', name: '豆浆油条', quantity: 1 }, { time: '12:40', name: '番茄牛腩饭', quantity: 1 }]);
  assert.deepEqual(have.daily, [{ name: '牙膏', quantity: 2, daysLeft: 20 }]);
  assert.deepEqual(have.goods.map((g) => `${g.name}×${g.quantity}`).sort(), ['白T恤×2', '罪与罚×1']);
  // After midnight the meals clear; orders and the rest stay.
  const tomorrow = at('2026-10-18T00:05:00');
  const next = daydayHoldings(daydayInventory(s, tomorrow), tomorrow);
  assert.deepEqual(next.todayMeals, []);
  assert.equal(next.goods.length, 2);
  assert.equal(s.orders.filter((o) => o.lines[0].category === '饮食').length, 3);
  // Finished daily goods drop off.
  const later = at('2026-11-10T09:00:00');
  assert.deepEqual(daydayHoldings(daydayInventory(s, later), later).daily, []);
});

test('month stats split spending by category, take refunds back, and count transfers and income sources', () => {
  const s = open();
  const meal = item(s, '午饭', '饮食', { price: '25.00' }), paste = item(s, '牙膏', '日用', { price: '12.00', usage: { amount: 1, unit: 'month' } });
  const coat = item(s, '外套', '衣物', { price: '300.00' }), brick = item(s, '小砖的玩具', '小砖专属', { price: '40.00' });
  buy(s, meal, NOW); buy(s, paste, NOW); buy(s, brick, NOW);
  const refunded = buy(s, coat, NOW); refundDayday(s, refunded.id, NOW + 60_000);
  const sent = sendDaydayTransfer(s, { kind: 'redpacket', amount: '52.00' }, NOW, 'chat');
  settleDaydayTransfer(s, sent.id, 'accepted', NOW + 1000);
  const hers = sendDaydayTransfer(s, { kind: 'transfer', amount: '88.00' }, NOW, 'chat', true);
  settleDaydayTransfer(s, hers.id, 'accepted', NOW + 2000);
  buyDayday(s, { items: [{ productId: coat.id, quantity: 1 }] }, NOW, true); // her gift
  const [october] = daydayMonthStats(s);
  assert.equal(october.month, '2026-10');
  assert.deepEqual(october.spending, [{ category: '饮食', amount: 2500 }, { category: '日用', amount: 1200 }, { category: '小砖专属', amount: 4000 }]);
  assert.deepEqual(october.transfers, { amount: 5200, count: 1 });
  assert.deepEqual(october.income, { allowance: 0, initialGrant: DAYDAY_ALLOWANCE, fromHer: 8800, fromHerCount: 1 });
  assert.deepEqual(october.gifts, { amount: 30000, count: 1 });
  // The categories add up to the page's 本月净支出.
  const snap = daydaySnapshot(s, NOW + 3000);
  assert.equal(october.spending.reduce((sum, c) => sum + c.amount, 0) + october.transfers.amount, snap.monthlySpent);
  assert.deepEqual(snap.monthStats[0], october);
});

test('the manager deletes a product for good; old orders, inventory and stats keep their snapshot', () => {
  const s = open();
  const tee = item(s, '白T恤', '衣物');
  buy(s, tee, NOW);
  assert.throws(() => daydayCommand(s, 'delete_product', { requestId: 'd0', id: tee.id }, NOW, false), /店长/);
  assert.deepEqual(daydayCommand(s, 'delete_product', { requestId: 'd1', id: tee.id }, NOW, true), { id: tee.id, name: '白T恤' });
  assert.equal(s.products.length, 0);
  assert.equal(s.orders[0].lines[0].name, '白T恤');
  assert.deepEqual(daydayHoldings(daydayInventory(s, NOW), NOW).goods.map((g) => g.name), ['白T恤']);
  assert.deepEqual(daydayMonthStats(s)[0].spending, [{ category: '衣物', amount: 1000 }]);
  assert.throws(() => buy(s, tee, NOW), /下架或不存在/);
  assert.throws(() => daydayCommand(s, 'delete_product', { requestId: 'd2', id: tee.id }, NOW, true), /不存在/);
});
