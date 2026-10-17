import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-typescript.mjs';
import { newDayday, configureDayday, initialDaydayGrant, saveDaydayProduct, buyDayday, refundDayday, daydayRefundable } from '../app/lib/dayday.ts';
const { parseDaydayRefund, parseDaydayBank, stripDaydayMarkers, daydayRefundCard, daydayBankCard, DAYDAY_CHAT_BRIDGE } = await import('../app/lib/dayday-chat.ts');
import { createVisibleReplyStream } from '../app/lib/visible-reply-stream.ts';

const NOW = Date.parse('2026-10-17T12:00:00+08:00');
function open() { const s = newDayday(NOW); configureDayday(s, { enabled: true }, NOW); initialDaydayGrant(s, NOW); return s; }

test('chat refund and bank markers parse and stay hidden while streaming', () => {
  assert.deepEqual(parseDaydayRefund('退掉吧[dayday_refund id="o-1"][/dayday_refund]'), { orderId: 'o-1' });
  assert.deepEqual(parseDaydayRefund("[dayday_refund id='o-2'][/dayday_refund]"), { orderId: 'o-2' });
  assert.equal(parseDaydayRefund('普通聊天'), null);
  assert.deepEqual(parseDaydayBank('[dayday_bank direction="deposit" amount="100.00"][/dayday_bank]'), { direction: 'deposit', amount: '100.00' });
  assert.equal(parseDaydayBank('没有'), null);
  assert.equal(stripDaydayMarkers('好\n[dayday_refund id="o-1"][/dayday_refund]\n[dayday_bank direction="withdraw" amount="5"][/dayday_bank]'), '好');
  assert.equal(stripDaydayMarkers('好\n[dayday_bank direction="dep'), '好');
  const block = '[dayday_refund id="o-1"][/dayday_refund][dayday_bank direction="deposit" amount="1"][/dayday_bank]';
  for (let size = 1; size <= block.length; size++) {
    const filter = createVisibleReplyStream();
    let out = '';
    const text = '退了' + block + '嗯';
    for (let i = 0; i < text.length; i += size) out += filter.push(text.slice(i, i + size));
    assert.equal(out + filter.finish(), '退了嗯');
  }
  assert.match(DAYDAY_CHAT_BRIDGE, /\[dayday_refund id=/);
  assert.match(DAYDAY_CHAT_BRIDGE, /\[dayday_bank direction=/);
});

test('refundable mirrors refundDayday and slips never reuse the order id', () => {
  const s = open();
  const soap = saveDaydayProduct(s, { name: '洗衣液', category: '日用', price: '25' }, NOW);
  const rice = saveDaydayProduct(s, { name: '拌面', category: '饮食', price: '10' }, NOW);
  const order = buyDayday(s, { items: [{ productId: soap.id, quantity: 1 }] }, NOW);
  const meal = buyDayday(s, { items: [{ productId: rice.id, quantity: 1 }] }, NOW);
  const gift = buyDayday(s, { items: [{ productId: soap.id, quantity: 1 }] }, NOW, true);
  assert.equal(daydayRefundable(order, NOW + 60_000), true);
  assert.equal(daydayRefundable(order, NOW + 11 * 60_000), false);
  assert.equal(daydayRefundable(meal, NOW), false);
  assert.equal(daydayRefundable(gift, NOW), false);
  assert.equal(daydayRefundable(gift, NOW, true), true);
  const refunded = refundDayday(s, order.id, NOW + 60_000);
  assert.equal(daydayRefundable(refunded, NOW + 60_000), false);
  const card = daydayRefundCard(refunded);
  assert.equal(card.id, undefined);
  assert.equal(card.notice.ref, order.id);
  assert.equal(card.notice.amount, 2500);
  assert.match(card.text, /整单退款 ¥25\.00（洗衣液×1）/);
  const bank = daydayBankCard('deposit', 10000, { wallet: 5000, bank: 10000 });
  assert.equal(bank.id, undefined);
  assert.equal(bank.notice.title, '酥酥存入银行');
});
