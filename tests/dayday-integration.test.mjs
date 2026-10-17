import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import './helpers/resolve-typescript.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'iooi-dayday-tests-'));
const home = process.cwd(); process.chdir(scratch);
const { executeDayday, readDayday } = await import('../app/lib/dayday-store.ts');
const { readStore, withStore } = await import('../app/lib/store.ts');
const { newDayday, saveDaydayProduct } = await import('../app/lib/dayday.ts');
const { handleRpc, callTool } = await import('../app/lib/mcp-server.ts');
const { createSessionSyncHandlers } = await import('../app/lib/session-sync.ts');
const { daydayHeartbeat } = await import('../app/lib/dayday-beat.ts');
const { runDaydayChatMarker } = await import('../app/lib/dayday-chat-actions.ts');
const daydayApi = await import('../app/api/dayday/route.ts');
process.chdir(home);
test.after(() => {
  assert.ok(resolve(scratch).startsWith(resolve(tmpdir()) + sep));
  rmSync(scratch, { recursive: true, force: true });
});
let productId;
test.beforeEach(async () => {
  await withStore((store) => {
    const now = Date.now(), s = newDayday(now);
    s.enabled = true; s.wallet = 10000; s.routine.notify = false;
    const p = saveDaydayProduct(s, { name: '牙膏', category: '日用', price: '10', stock: 1, usage: { amount: 2, unit: 'month' } }, now);
    productId = p.id; store.dayday = s; store.lifeLog = [];
    store.sessions = [{ id: 'private', name: '酥酥', messages: [{ role: 'user', content: '早安', date: '2026/10/17', time: '08:00' }] }];
  });
});
test('concurrent retries create one order, debit once, and record exactly one real activity', async () => {
  const input = { requestId: 'same', items: [{ productId, quantity: 1 }] };
  const results = await Promise.all(Array.from({ length: 10 }, () => executeDayday('buy', input)));
  assert.ok(results.every((r) => r.ok));
  assert.equal(new Set(results.map((r) => r.result.id)).size, 1);
  const s = readDayday();
  assert.equal(s.wallet, 9000); assert.equal(s.products[0].stock, 0); assert.equal(s.orders.length, 1);
  assert.equal(readStore().lifeLog.filter((e) => e.kind === 'dayday').length, 1);
});
test('concurrent distinct buyers cannot oversell; rejected orders leave no half-transaction', async () => {
  const results = await Promise.all(['one', 'two'].map((requestId) => executeDayday('buy', { requestId, items: [{ productId, quantity: 1 }] })));
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(readDayday().wallet, 9000); assert.equal(readDayday().orders.length, 1); assert.equal(readDayday().products[0].stock, 0);
});
test('failed configuration is rolled back and cannot partially change the switch or allowance', async () => {
  const result = await executeDayday('configure', { requestId: 'bad-config', enabled: false, routine: { times: 99 } }, true);
  assert.equal(result.ok, false); assert.equal(readDayday().enabled, true); assert.equal(readDayday().wallet, 10000);
});
test('browser sync cannot replace server money or orders', async () => {
  const sync = createSessionSyncHandlers({ read: readStore, write: withStore });
  await sync.POST(new Request('http://localhost/api/sync', { method: 'POST', body: JSON.stringify({ dayday: { wallet: 999999 }, settings: { userName: '测试' } }) }));
  assert.equal(readDayday().wallet, 10000); assert.equal(readStore().settings.userName, '测试');
});
test('MCP exposes read separately, never exposes shop management, and rejects writes for read/life keys', async () => {
  const names = async (access) => (await handleRpc({ id: 1, method: 'tools/list' }, access)).result.tools.map((t) => t.name);
  assert.ok((await names('read')).includes('dayday_read'));
  assert.ok(!(await names('read')).includes('dayday_buy'));
  assert.ok((await names('full')).includes('dayday_buy'));
  assert.ok(!(await names('full')).includes('dayday_configure'));
  for (const access of ['read', 'life']) assert.equal((await callTool('dayday_buy', { request_id: 'mcp', items: [{ productId, quantity: 1 }] }, access)).isError, true);
  assert.equal(readDayday().orders.length, 0);
});
test('disabled MCP cannot browse catalog or spend and disabled heartbeat never creates an activity', async () => {
  await executeDayday('configure', { requestId: 'off', enabled: false }, true);
  const response = await callTool('dayday_read', {}, 'full');
  assert.match(response.content[0].text, /还没开放/); assert.doesNotMatch(response.content[0].text, /牙膏/);
  assert.equal((await callTool('dayday_buy', { request_id: 'buy-off', items: [{ productId, quantity: 1 }] }, 'full')).isError, true);
  const before = readFileSync(join(scratch, 'data', 'store.json'), 'utf8');
  await daydayHeartbeat();
  assert.equal(readFileSync(join(scratch, 'data', 'store.json'), 'utf8'), before);
});
test('closing and reopening cancels an in-flight decision using the old switch epoch', async () => {
  const epoch = readDayday().epoch;
  await executeDayday('configure', { requestId: 'close', enabled: false }, true);
  await executeDayday('configure', { requestId: 'reopen', enabled: true }, true);
  const result = await executeDayday('buy', { requestId: 'old-beat', items: [{ productId, quantity: 1 }] }, false, epoch);
  assert.equal(result.ok, false); assert.equal(readDayday().orders.length, 0);
});
test('low balance logs one notification-worthy failure without creating or debiting an order', async () => {
  await withStore((store) => { store.dayday.wallet = 0; });
  for (const requestId of ['fail-1', 'fail-2']) assert.equal((await executeDayday('buy', { requestId, items: [{ productId, quantity: 1 }] })).ok, false);
  assert.equal(readDayday().orders.length, 0); assert.equal(readDayday().wallet, 0);
  assert.equal(readDayday().events.length, 1);
});
test('replayed refund credits only once and old orders remain refundable while disabled', async () => {
  const order = await executeDayday('buy', { requestId: 'buy', items: [{ productId, quantity: 1 }] });
  await executeDayday('configure', { requestId: 'off', enabled: false }, true);
  const results = await Promise.all(['refund-1', 'refund-2'].map((requestId) => executeDayday('refund', { requestId, orderId: order.result.id })));
  assert.ok(results.every((r) => r.ok)); assert.equal(readDayday().wallet, 10000); assert.equal(readDayday().products[0].stock, 1);
});
test('push delivery failure is recorded without rolling back the payment', async () => {
  await withStore((store) => { store.dayday.routine.notify = true; });
  const result = await executeDayday('buy', { requestId: 'notify-buy', items: [{ productId, quantity: 1 }] });
  assert.equal(result.ok, true); assert.equal(readDayday().wallet, 9000);
  assert.match(readDayday().events[0].push, /推送未发出/);
  assert.match(readStore().lifeLog[0].note, /推送未发出/);
});
test('corrupt main data cannot be replaced by an empty financial journal', async () => {
  const path = join(scratch, 'data', 'store.json'), before = readFileSync(path, 'utf8');
  try {
    writeFileSync(path, '{broken', 'utf8');
    await assert.rejects(executeDayday('tick'), /停止写入/);
    assert.equal(readFileSync(path, 'utf8'), '{broken');
  } finally { writeFileSync(path, before, 'utf8'); }
});
test('management API is uncached, rejects malformed commands, and saves price and consumption rules', async () => {
  const before = readFileSync(join(scratch, 'data', 'store.json'), 'utf8');
  const response = await daydayApi.GET();
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).state.wallet, 10000);
  assert.equal(readFileSync(join(scratch, 'data', 'store.json'), 'utf8'), before);
  const post = (body) => daydayApi.POST(new Request('http://localhost/api/dayday', { method: 'POST', body: JSON.stringify(body) }));
  assert.equal((await post({ action: 'tick' })).status, 400);
  assert.equal((await post({ action: 'save_product', name: 'missing request id' })).status, 400);
  const saved = await post({ action: 'save_product', requestId: 'api-product', name: '一提卫生纸', category: '日用', price: '20.50', stock: null, usage: { amount: 1, unit: 'month' } });
  assert.equal(saved.status, 200);
  const data = await saved.json();
  assert.equal(data.result.price, 2050); assert.equal(data.result.stock, null); assert.deepEqual(data.result.usage, { amount: 1, unit: 'month' });
});
test('chat markers atomically save one money card with its hold and survive duplicate completion', async () => {
  const text = '[dayday_money kind="redpacket" amount="52.00"]给你买奶茶[/dayday_money]';
  const a = await runDaydayChatMarker(text, 'private', 'round-1', readDayday().epoch);
  const b = await runDaydayChatMarker(text, 'private', 'round-1', readDayday().epoch);
  assert.equal(a[0].id, b[0].id); assert.equal(readDayday().held, 5200); assert.equal(readDayday().wallet, 10000);
  const cards = readStore().sessions[0].messages.filter((m) => m.source === 'dayday_card');
  assert.equal(cards.length, 1); assert.equal(cards[0].dayday.id, a[0].id);
  const response = await daydayApi.GET(new Request('http://localhost/api/dayday?transfer=' + a[0].id));
  assert.equal((await response.json()).transfer.status, 'pending');
});
test('missing/private-vs-group chat validation cannot leave frozen money without a card', async () => {
  const result = await executeDayday('send_transfer', { requestId: 'missing', sessionId: 'missing', kind: 'transfer', amount: '10' });
  assert.equal(result.ok, false); assert.equal(readDayday().held, 0); assert.equal(readDayday().transfers.length, 0);
  await withStore((store) => { store.sessions.push({ id: 'group', kind: 'group', messages: [] }); });
  assert.equal((await executeDayday('send_transfer', { requestId: 'group', sessionId: 'group', kind: 'transfer', amount: '10' })).ok, false);
});
test('competing accept/return requests settle once; stale history sync cannot change financial status', async () => {
  const sent = await executeDayday('send_transfer', { requestId: 'send', sessionId: 'private', kind: 'transfer', amount: '20' });
  const outcomes = await Promise.all(['accepted', 'returned'].map((decision) => executeDayday('settle_transfer', { requestId: decision, transferId: sent.result.id, decision }, true)));
  assert.ok(outcomes.every((r) => r.ok));
  const tx = readDayday().transfers[0]; assert.equal(tx.status, 'accepted'); assert.equal(readDayday().wallet, 8000); assert.equal(readDayday().held, 0);
  const sync = createSessionSyncHandlers({ read: readStore, write: withStore });
  await sync.POST(new Request('http://localhost/api/sync', { method: 'POST', body: JSON.stringify({ dayday: { wallet: 100000 }, sessions: readStore().sessions }) }));
  assert.equal(readDayday().transfers[0].status, 'accepted'); assert.equal(readDayday().wallet, 8000);
});
test('MCP can send a card but has no first-grant or recipient settlement privilege', async () => {
  const result = await callTool('dayday_send', { request_id: 'mcp-send', amount: '10', kind: 'redpacket' }, 'full');
  assert.equal(result.isError, false); assert.equal(readDayday().held, 1000);
  assert.equal(readStore().sessions[0].messages.at(-1).source, 'dayday_card');
  assert.equal((await callTool('dayday_send', { request_id: 'read-send', amount: '10', kind: 'redpacket' }, 'read')).isError, true);
  assert.equal((await callTool('dayday_initial_grant', {}, 'full')).isError, true);
  assert.equal((await callTool('dayday_settle_transfer', {}, 'full')).isError, true);
});
test('human sends an atomic user-side card and Claude reply marker receives it once', async () => {
  const sent = await executeDayday('human_send', { requestId: 'human-card', kind: 'redpacket', amount: '52', sessionId: 'private', roundId: 'human-round' }, true);
  assert.equal(sent.ok, true); assert.equal(readDayday().human.held, 5200);
  const card = readStore().sessions[0].messages.at(-1); assert.equal(card.role, 'user'); assert.equal(card.dayday.id, sent.result.id);
  const block = `[dayday_receive id="${sent.result.id}" decision="accepted"][/dayday_receive]`;
  await runDaydayChatMarker(block, 'private', 'human-round', readDayday().epoch);
  await runDaydayChatMarker(block, 'private', 'human-round', readDayday().epoch);
  assert.equal(readDayday().human.wallet, 44800); assert.equal(readDayday().wallet, 15200);
});
test('a new empty private chat can send a human card without losing the payment or draft', async () => {
  const sent = await executeDayday('human_send', { requestId: 'new-chat', sessionId: 'new-private', kind: 'transfer', amount: '5' }, true);
  assert.equal(sent.ok, true); const session = readStore().sessions.find((s) => s.id === 'new-private');
  assert.equal(session.messages.length, 1); assert.equal(session.messages[0].role, 'user'); assert.equal(readDayday().human.held, 500);
});
test('MCP receipt is limited to incoming transfers and cannot buy gifts using human money', async () => {
  const sent = await executeDayday('human_send', { requestId: 'mcp-incoming', kind: 'transfer', amount: '10', sessionId: 'private' }, true);
  const got = await callTool('dayday_receive', { request_id: 'mcp-receive', transfer_id: sent.result.id, decision: 'accepted' }, 'full');
  assert.equal(got.isError, false); assert.equal(readDayday().human.wallet, 49000); assert.equal(readDayday().wallet, 11000);
  assert.equal((await callTool('dayday_human_buy_gift', {}, 'full')).isError, true);
});
test('concurrent human transfers cannot overcommit the initial 500', async () => {
  const results = await Promise.all(['h1', 'h2'].map((requestId) => executeDayday('human_send', { requestId, kind: 'transfer', amount: '400', sessionId: 'private' }, true)));
  assert.equal(results.filter((r) => r.ok).length, 1); assert.equal(readDayday().human.held, 40000); assert.equal(readDayday().wallet, 10000);
});
