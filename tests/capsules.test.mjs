import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './helpers/resolve-typescript.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'iooi-capsule-'));
const previous = process.cwd();
process.chdir(scratch);
const capsules = await import('../app/lib/capsules.ts');
const store = await import('../app/lib/capsule-store.ts');
const { handleRpc } = await import('../app/lib/mcp-server.ts');
const route = await import('../app/api/capsule/route.ts');
const { CHAT_TOOLS } = await import('../app/lib/claude-code.ts');
test.after(() => { process.chdir(previous); rmSync(scratch, { recursive: true, force: true }); });

const { capsuleDay, daysUntil, sealLetter, openLetter, viewLetter, parseCapsules, CAPSULE_LIMITS } = capsules;
const call = async (name, args = {}, access = 'full') => (await handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, access)).result;
const names = async (access) => (await handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, access)).result.tools.map((t) => t.name);
const post = (body) => route.POST(new Request('http://x/api/capsule', { method: 'POST', body: JSON.stringify(body) }));
const late = new Date('2026-10-24T15:59:00Z'); // 23:59 in Shanghai.
// Real-clock calls need days that stay in the future.
const ahead = (n) => new Date(Date.UTC(...capsuleDay().split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0))) + n * 86_400_000).toISOString().slice(0, 10);

test('days follow the Shanghai calendar', () => {
  assert.equal(capsuleDay(late), '2026-10-24');
  assert.equal(capsuleDay(new Date('2026-10-24T16:00:00Z')), '2026-10-25');
  assert.equal(daysUntil('2026-10-25', late), 1);
  assert.equal(daysUntil('2026-10-25', new Date('2026-10-24T16:00:00Z')), 0);
  assert.equal(daysUntil('2027-01-01', late), 69);
});

test('sealing checks the paper, the envelope and the day', () => {
  const list = [];
  assert.throws(() => sealLetter(list, 'her', { body: '  ', openOn: '2026-10-30' }, 'a', late), /空着/);
  assert.throws(() => sealLetter(list, 'her', { body: '嗨', openOn: '2026-10-24' }, 'a', late), /明天/);
  assert.throws(() => sealLetter(list, 'her', { body: '嗨', openOn: '2026-02-30' }, 'a', late), /YYYY-MM-DD/);
  assert.throws(() => sealLetter(list, 'her', { body: '嗨', openOn: '2040-01-01' }, 'a', late), /十年/);
  assert.throws(() => sealLetter(list, 'her', { body: 'x'.repeat(CAPSULE_LIMITS.body + 1), openOn: '2026-10-30' }, 'a', late), /最多/);
  assert.throws(() => sealLetter(list, 'her', { title: 'x'.repeat(CAPSULE_LIMITS.title + 1), body: '嗨', openOn: '2026-10-30' }, 'a', late), /信封/);
  const letter = sealLetter(list, 'her', { title: ' 给你 ', body: '第一行\r\n第二行 ', openOn: '2026-10-25' }, 'a', late);
  assert.deepEqual({ ...letter, sealedAt: 0 }, { id: 'a', from: 'her', to: 'him', title: '给你', body: '第一行\n第二行', openOn: '2026-10-25', sealedAt: 0 });
});

test('nobody reads a sealed letter; only the receiver opens it on the day', () => {
  const list = [];
  sealLetter(list, 'him', { body: '秘密', openOn: '2026-10-25' }, 'l1', late);
  const sealed = viewLetter(list[0], late);
  assert.equal(sealed.state, 'sealed');
  assert.equal(sealed.body, undefined);
  assert.throws(() => openLetter(list, 'her', 'l1', late), /还剩 1 天/);
  const midnight = new Date('2026-10-24T16:00:00Z');
  assert.equal(viewLetter(list[0], midnight).state, 'ready');
  assert.equal(viewLetter(list[0], midnight).body, undefined);
  assert.throws(() => openLetter(list, 'him', 'l1', midnight), /没有找到/);
  openLetter(list, 'her', 'l1', midnight);
  const first = list[0].openedAt;
  openLetter(list, 'her', 'l1', new Date(midnight.getTime() + 60_000));
  assert.equal(list[0].openedAt, first);
  assert.equal(viewLetter(list[0], midnight).body, '秘密');
});

test('a damaged file stops writes instead of being replaced', () => {
  assert.deepEqual(parseCapsules(null), []);
  assert.throws(() => parseCapsules({ letters: [{ id: 'x', from: 'her', to: 'her' }] }), /格式异常/);
});

test('her window never receives a sealed body, and she can seal and open', async () => {
  const sealed = await (await post({ action: 'seal', title: '一年后的我们', body: '她的秘密', openOn: ahead(60) })).json();
  assert.equal(sealed.ok, true);
  assert.equal(sealed.letter.body, undefined);
  const listed = await (await route.GET()).json();
  assert.ok(listed.letters.length >= 1);
  assert.ok(!JSON.stringify(listed).includes('她的秘密'));
  const early = await post({ action: 'open', id: sealed.letter.id });
  assert.equal(early.status, 400);
  assert.match((await post({ action: 'peek' }).then((r) => r.json())).error, /不认识/);
});

test('his tools: read without bodies, seal secretly, open hers on the day, see when she opened his', async () => {
  const read = await call('capsule_read');
  assert.match(read.content[0].text, /她寄给你的（1）/);
  assert.match(read.content[0].text, /一年后的我们/);
  assert.ok(!read.content[0].text.includes('她的秘密'));

  const sealed = await call('capsule_seal', { title: '第一封', content: '他的秘密', open_on: ahead(300) });
  assert.equal(sealed.isError, false);
  assert.match(sealed.content[0].text, /封好了：《第一封》/);
  const herView = await (await route.GET()).json();
  assert.ok(!JSON.stringify(herView).includes('他的秘密'));
  const his = herView.letters.find((l) => l.from === 'him');
  assert.equal((await call('capsule_open', { letter_id: his.id })).isError, true);
  const hers = herView.letters.find((l) => l.from === 'her');
  assert.match((await call('capsule_open', { letter_id: hers.id })).content[0].text, /还没到日子/);

  // Move both letters' days into the past, as if time had passed.
  const file = join(scratch, 'data', 'capsules.json');
  const raw = JSON.parse(readFileSync(file, 'utf-8'));
  for (const l of raw.letters) l.openOn = '2026-01-01';
  writeFileSync(file, JSON.stringify(raw));
  const opened = await call('capsule_open', { letter_id: hers.id });
  assert.equal(opened.isError, false);
  assert.match(opened.content[0].text, /她的秘密/);
  assert.match(opened.content[0].text, /你 .* 拆开/);
  assert.match((await call('capsule_open', { letter_id: his.id })).content[0].text, /她还没拆/);
  await store.openCapsule('her', his.id);
  assert.match((await call('capsule_read')).content[0].text, /\[她拆了\] 《第一封》/);
  assert.match((await call('capsule_open', { letter_id: his.id })).content[0].text, /他的秘密/);
});

test('his own time may only look; the private chat can seal and open', async () => {
  assert.ok((await names('life')).includes('capsule_read'));
  assert.ok(!(await names('life')).includes('capsule_seal'));
  assert.equal((await call('capsule_seal', { content: '嗨', open_on: ahead(30) }, 'life')).isError, true);
  for (const name of ['capsule_read', 'capsule_seal', 'capsule_open']) {
    assert.ok((await names('read')).includes(name));
    assert.ok(CHAT_TOOLS.includes(`mcp__iooi__${name}`));
  }
});

test('he can seal at most seven a day', async () => {
  for (let i = 0; i < CAPSULE_LIMITS.hisPerDay - 1; i += 1) await store.sealCapsule('him', { body: `第${i + 2}封`, openOn: ahead(30) });
  await assert.rejects(store.sealCapsule('him', { body: '第八封', openOn: ahead(30) }), /明天再封/);
  await store.sealCapsule('her', { body: '她不限', openOn: ahead(30) });
});
