import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './helpers/resolve-typescript.mjs';

const original = process.cwd();
const sandbox = mkdtempSync(join(tmpdir(), 'iooi-dayday-life-'));
process.chdir(sandbox);
after(() => { process.chdir(original); rmSync(sandbox, { recursive: true, force: true }); });
const { withStore, readStore } = await import('../app/lib/store.ts');
const { runDayday, readBook } = await import('../app/lib/dayday-store.ts');
const { ledgerView } = await import('../app/lib/dayday-ledger.ts');
const { callDaydayTool } = await import('../app/lib/dayday-mcp.ts');
const { saveDaydayReviews } = await import('../app/lib/dayday-life.ts');
const { readLifeLog, todayLifeLines } = await import('../app/lib/life-log.ts');
const setOn = (value) => withStore((store) => { store.settings = { lifeDayday: value }; });
const addProduct = async (name) => (await runDayday('product.add', { name, price: 1500, shelf: 'top' })).result;

test('turning off dayday blocks autonomous browsing but preserves explicit chat reads', async () => {
  await setOn(false);
  await assert.rejects(() => callDaydayTool('dayday_shop', {}, 'life'), /已关闭/);
  assert.equal((await callDaydayTool('dayday_shop', {}, 'read')).isError, false);
  assert.equal(readLifeLog(readStore()).length, 0);
});

test('a real shop read is required; saving a review logs its content and push result, once', async () => {
  await setOn(true);
  await runDayday('settings.set', { payday: 15, startAmount: 100000 });
  const product = await addProduct('蓝色上衣');
  const since = Date.now();
  assert.deepEqual(await saveDaydayReviews([{ id: product.id, text: '还没有看过，不许写' }], since), []);
  assert.equal((await readBook()).products[0].susuSays, undefined);
  await callDaydayTool('dayday_shop', { id: product.id }, 'life');
  await callDaydayTool('dayday_items', {}, 'life');
  const before = await readBook();
  const saved = await saveDaydayReviews([{ id: product.id, text: '蓝色挺适合你，先看看衣柜里那件。' }], since);
  assert.equal(saved.length, 1);
  const after = await readBook();
  assert.equal(after.products.find((p) => p.id === product.id).susuSays, saved[0].text);
  assert.equal(ledgerView(after).remaining, ledgerView(before).remaining);
  assert.deepEqual(after.entries, before.entries);
  const log = readLifeLog(readStore()).filter((e) => e.kind === 'dayday');
  assert.equal(log.length, 2, 'one browse and one actual review');
  const review = log.find((e) => e.ref === product.id);
  assert.match(review.note, /蓝色挺适合你/);
  assert.match(review.note, /推送未发出/, 'scratch data has no push credentials; the failure is visible');
  assert.ok(todayLifeLines(readStore()).some((line) => line.includes('蓝色上衣')));
  assert.deepEqual(await saveDaydayReviews([{ id: product.id, text: '重复改写' }], since), []);
  assert.equal(readLifeLog(readStore()).filter((e) => e.ref === product.id).length, 1);
  assert.equal((await readBook()).products.find((p) => p.id === product.id).susuSays, saved[0].text);
});

test('a switch turned off while waiting for the ledger lock prevents the late write', async () => {
  await setOn(true);
  const product = await addProduct('新外套');
  const since = Date.now();
  await callDaydayTool('dayday_shop', { id: product.id }, 'life');
  const locks = globalThis.__iooiStoreLocks;
  let release;
  locks.set(join(sandbox, 'data', 'dayday.json'), new Promise((resolve) => { release = resolve; }));
  const pending = saveDaydayReviews([{ id: product.id, text: '关掉后不该落盘' }], since);
  await setOn(false);
  release();
  assert.deepEqual(await pending, []);
  assert.equal((await readBook()).products.find((p) => p.id === product.id).susuSays, undefined);
  await assert.rejects(() => callDaydayTool('dayday_items', {}, 'life'), /已关闭/);
});
