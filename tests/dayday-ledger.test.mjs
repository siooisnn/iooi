import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDayday, cycleOf, DaydayError, dayKey, emptyBook, fixedDueKey, ledgerView, parseBook, settleBook,
} from '../app/lib/dayday-ledger.ts';

const at = (key, time = '12:00') => new Date(`${key}T${time}:00+08:00`);
const run = (book, action, input = {}, now = at('2026-10-19'), bySusu) => applyDayday(book, action, input, { now, bySusu });
function startedBook(now = at('2026-10-19')) {
  const book = emptyBook();
  run(book, 'settings.set', { payday: 15, startAmount: 200000 }, now);
  return book;
}

test('a cycle runs from payday to the day before the next payday, in Beijing time', () => {
  const cycle = cycleOf(15, '2026-10-19');
  assert.equal(cycle.startKey, '2026-10-15');
  assert.equal(cycle.endKey, '2026-11-15');
  assert.equal(cycle.label, '10.15 – 11.14');
  assert.equal(cycle.passed, 5);
  assert.equal(cycle.left, 27);
  assert.equal(cycleOf(15, '2026-10-14').startKey, '2026-09-15');
  assert.equal(cycleOf(15, '2026-01-03').startKey, '2025-12-15');
  // 16:30 UTC on the 14th is already the 15th in Beijing.
  assert.equal(dayKey(new Date('2026-10-14T16:30:00Z')), '2026-10-15');
  assert.equal(fixedDueKey(5, cycle), '2026-11-05');
  assert.equal(fixedDueKey(16, cycle), '2026-10-16');
  // A charge on the 31st lands on the last day of a short month.
  assert.equal(fixedDueKey(31, cycleOf(15, '2026-11-20')), '2026-11-30');
});

test('remaining counts transit orders and the piggy bank, spent counts only what arrived', () => {
  const book = startedBook();
  run(book, 'entry.add', { kind: 'expense', cat: 'food', amount: 1800, note: '午饭', at: at('2026-10-19', '12:20').toISOString() });
  run(book, 'entry.add', { kind: 'income', cat: 'parttime', amount: 12000, note: '家教' });
  run(book, 'shelf.add', { label: '包包' });
  const product = run(book, 'product.add', { name: '开衫', price: 15900, shelf: 'top', reason: '好看' });
  run(book, 'product.toggle', { id: product.id, key: 'carted' });
  assert.equal(book.products[0].carted, true);
  const [order] = run(book, 'order.place', { lines: [{ id: product.id, paid: 12900 }] });
  assert.equal(book.products.length, 0);
  run(book, 'bank.move', { direction: 'in', amount: 30000 });
  run(book, 'fixed.add', { name: '话费', amount: 3000, day: 25 });

  let view = ledgerView(book, '2026-10-19');
  assert.equal(view.remaining, 200000 + 12000 - 1800 - 12900 - 30000);
  assert.equal(view.transit, 12900);
  assert.equal(view.spent, 1800);
  assert.equal(view.todaySpent, 1800);
  assert.equal(view.reserved, 3000);
  assert.equal(view.perDay, Math.floor((view.remaining - 3000) / 27));
  assert.deepEqual(view.due, []);

  const item = run(book, 'order.receive', { id: order.id });
  assert.equal(item.fromShop, true);
  assert.equal(item.paid, 12900);
  assert.equal(book.items.length, 1);
  view = ledgerView(book, '2026-10-19');
  assert.equal(view.transit, 0);
  assert.equal(view.spent, 1800 + 12900);
  assert.deepEqual(view.cats.map((c) => c.cat), ['clothes', 'food']);
});

test('returning an order refunds it and drops the expense', () => {
  const book = startedBook();
  const product = run(book, 'product.add', { name: '袜子', price: 2290, shelf: 'shoes', reason: '' });
  const [order] = run(book, 'order.place', { lines: [{ id: product.id, paid: 2000 }] });
  assert.throws(() => run(book, 'entry.remove', { id: order.entryId }), /运输中/);
  run(book, 'order.return', { id: order.id });
  assert.equal(book.entries.length, 0);
  assert.equal(ledgerView(book, '2026-10-19').remaining, 200000);
});

test('monthly charges wait for her to confirm, once per cycle', () => {
  const book = startedBook();
  const fixed = run(book, 'fixed.add', { name: '音乐会员', amount: 1500, day: 18 });
  assert.equal(ledgerView(book, '2026-10-19').due.length, 1);
  run(book, 'fixed.pay', { id: fixed.id });
  assert.equal(ledgerView(book, '2026-10-19').due.length, 0);
  assert.equal(book.entries[0].cat, 'phone');
  assert.throws(() => run(book, 'fixed.pay', { id: fixed.id }), /处理过/);
  // Next cycle it comes back.
  assert.equal(ledgerView(book, '2026-11-18').due.length, 1);
});

test('old cycles fold into summaries after the grace days, and the balance survives', () => {
  const book = startedBook(at('2026-10-15'));
  run(book, 'entry.add', { kind: 'expense', cat: 'food', amount: 5000, at: at('2026-10-20').toISOString() }, at('2026-10-20'));
  run(book, 'entry.add', { kind: 'income', cat: 'allowance', amount: 200000, at: at('2026-10-15').toISOString() }, at('2026-10-20'));
  run(book, 'bank.move', { direction: 'in', amount: 10000 }, at('2026-10-21'));
  const product = run(book, 'product.add', { name: '鞋', price: 19900, shelf: 'shoes', reason: '' }, at('2026-11-10'));
  run(book, 'order.place', { lines: [{ id: product.id, paid: 19900 }] }, at('2026-11-10'));
  const before = ledgerView(book, '2026-11-16').remaining;

  assert.equal(settleBook(book, '2026-11-16'), false, 'last cycle stays during the grace days');
  assert.equal(ledgerView(book, '2026-11-16').prev.entries.length, 2);
  assert.equal(ledgerView(book, '2026-11-16').prev.foldsOn, '2026-11-18');

  assert.equal(settleBook(book, '2026-11-18'), true);
  assert.equal(book.entries.length, 1, 'only the order still in transit stays');
  assert.equal(book.bankMoves.length, 0);
  const [summary] = book.summaries;
  assert.equal(summary.range, '10.15 – 11.14');
  assert.equal(summary.income, 200000);
  assert.equal(summary.expense, 5000);
  assert.equal(summary.saved, 10000);
  assert.deepEqual(summary.cats, [{ cat: 'food', amount: 5000 }]);
  assert.equal(ledgerView(book, '2026-11-18').remaining, before);
  assert.equal(settleBook(book, '2026-11-18'), false);

  // The late parcel joins the summary of the cycle it was ordered in.
  run(book, 'order.receive', { id: book.orders[0].id }, at('2026-11-19'));
  settleBook(book, '2026-11-19');
  assert.equal(book.summaries[0].expense, 5000 + 19900);
  assert.equal(ledgerView(book, '2026-11-19').remaining, before);
});

test('bad input is refused with a message and leaves nothing behind', () => {
  const book = startedBook();
  const now = at('2026-10-19');
  assert.throws(() => run(book, 'entry.add', { kind: 'expense', cat: 'allowance', amount: 100 }), DaydayError);
  assert.throws(() => run(book, 'entry.add', { kind: 'expense', cat: 'food', amount: 1.5 }), /金额/);
  assert.throws(() => run(book, 'entry.add', { kind: 'expense', cat: 'food', amount: 100, at: new Date(now.getTime() + 5 * 86400000).toISOString() }), /时间/);
  assert.throws(() => run(book, 'product.add', { name: 'x', price: 100, shelf: 'top', image: 'https://evil.example/a.png' }), /图片/);
  assert.throws(() => run(book, 'product.add', { name: 'x', price: 100, shelf: 'top', link: 'javascript:alert(1)' }), /链接/);
  assert.throws(() => run(book, 'product.add', { name: 'x', price: 100, shelf: 'nope' }), /分类/);
  assert.throws(() => run(book, 'bank.move', { direction: 'out', amount: 100 }), /存钱罐/);
  assert.throws(() => run(book, 'bank.move', { direction: 'in', amount: 300000 }), /剩余/);
  const product = run(book, 'product.add', { name: 'x', price: 100, shelf: 'top' });
  assert.throws(() => run(book, 'order.place', { lines: [{ id: product.id, paid: 100 }, { id: product.id, paid: 100 }] }), /两次/);
  assert.throws(() => run(book, 'product.say', { id: product.id, text: '好看' }), /酥酥/);
  assert.throws(() => run(book, 'settings.set', { payday: 15, startAmount: 0 }, now, true), /她/);
  assert.throws(() => run(book, 'nope'), /不认识/);
  assert.equal(book.entries.length, 0);
});

test('his entries carry the 酥酥记 tag and he can leave a note on a product', () => {
  const book = startedBook();
  const entry = run(book, 'entry.add', { kind: 'expense', cat: 'food', amount: 1800, note: '午饭' }, at('2026-10-19'), true);
  assert.equal(entry.bySusu, true);
  const product = run(book, 'product.add', { name: '开衫', price: 15900, shelf: 'top' });
  run(book, 'product.say', { id: product.id, text: '你已经有一件灰的了' }, at('2026-10-19'), true);
  assert.equal(book.products[0].susuSays, '你已经有一件灰的了');
});

test('a saved book is read back with its base shelves and defaults', () => {
  assert.deepEqual(parseBook(null), emptyBook());
  const book = parseBook({ payday: 10, shelves: [{ id: 'cbag', label: '包包' }, { id: 'top', label: '上衣' }], entries: 'x' });
  assert.equal(book.payday, 10);
  assert.deepEqual(book.entries, []);
  assert.deepEqual(book.shelves.map((s) => s.label), ['乱七八糟', '上衣', '下衣', '鞋袜', '包包']);
});
