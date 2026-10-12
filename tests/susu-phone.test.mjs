import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './helpers/resolve-typescript.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'iooi-susu-phone-'));
const previous = process.cwd();
process.chdir(scratch);
const { buildPhoneSnapshot, decoratePhone, parsePhoneSettings } = await import('../app/lib/susu-phone.ts');
const stores = await import('../app/lib/store.ts');
const { handleRpc, callTool } = await import('../app/lib/mcp-server.ts');
const route = await import('../app/api/phone/route.ts');
const { setHisMotto } = await import('../app/lib/blog-tools.ts');
const { addBook, markBook } = await import('../app/lib/reading-shelf.ts');
const { recordReading } = await import('../app/lib/life-log.ts');
const { createSessionSyncHandlers } = await import('../app/lib/session-sync.ts');
process.chdir(previous);
test.after(() => rmSync(scratch, { recursive: true, force: true }));

const call = (name, args = {}, access = 'full') => handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, access);
const names = async (access) => (await handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, access)).result.tools.map((tool) => tool.name);
const now = new Date('2026-10-12T16:10:00Z'); // 00:10 the next day in Shanghai.
const stamp = now.getTime();

test('today follows Shanghai midnight and actual latest activity, in time order, with safe links', () => {
  const main = { lifeLog: [
    { at: stamp - 12 * 60_000, lastAt: stamp - 2 * 60_000, time: '2026/10/12 23:58', kind: 'read', text: '读完这一段', ref: 'crime' },
    { at: stamp - 4 * 60_000, time: '2026/10/13 00:06', kind: 'surf', text: '逛网页', links: [{ title: '好链接', url: 'https://example.com/' }, { title: '坏链接', url: 'javascript:alert(1)' }] },
    { at: stamp - 15 * 60_000, time: '2026/10/12 23:55', kind: 'post', text: '昨天写的' },
    { at: stamp, time: '2026/10/13 00:10', kind: 'care', text: '聊天里的消息' },
  ] };
  const before = JSON.stringify(main);
  const phone = buildPhoneSnapshot(main, null, null, null, now);
  assert.equal(phone.day, '2026/10/13');
  assert.deepEqual(phone.today.map((entry) => entry.clock), ['00:06', '00:08']);
  assert.deepEqual(phone.today[0].links, [{ title: '好链接', url: 'https://example.com/' }]);
  assert.deepEqual(phone.today[1].target, { app: 'reading' }); // Removed book falls back to its shelf.
  assert.equal(JSON.stringify(main), before);
});

test('phone decoration validates the entire patch and keeps a complete dock', () => {
  const defaults = parsePhoneSettings(null);
  const changed = decoratePhone(defaults, { wallpaper: 'moon-mist', icon_order: ['chat', 'blog', 'surf', 'reading'], ornaments: { cat: false } }, 42);
  assert.equal(changed.updatedAt, 42);
  assert.equal(changed.ornaments.cat, false);
  assert.equal(changed.ornaments.moon, true);
  assert.equal(defaults.ornaments.cat, true);
  for (const input of [
    { wallpaper: 'https://example.com/secret' }, { icon_order: ['chat', 'chat', 'reading', 'blog'] },
    { widgets: { today: 'yes' } }, { signature: 'another field' }, { ornaments: { album: true } }, {},
  ]) assert.throws(() => decoratePhone(defaults, input));
});

test('read, life and full MCP scopes see the phone; only full can decorate, including direct calls', async () => {
  for (const access of ['read', 'life', 'full']) {
    assert.ok((await names(access)).includes('phone_read'));
    assert.equal((await names(access)).includes('phone_decorate'), access === 'full');
    assert.equal((await call('phone_read', {}, access)).result.isError, false);
  }
  for (const access of ['read', 'life']) {
    assert.equal((await call('phone_decorate', { wallpaper: 'deep-sea' }, access)).result.isError, true);
    assert.equal((await callTool('phone_decorate', { wallpaper: 'deep-sea' }, access)).isError, true);
  }
  assert.equal(stores.readPhoneSettingsStore(), null);
  assert.equal(route.POST, undefined);
  assert.equal(route.PUT, undefined);
  assert.equal(route.PATCH, undefined);
});

test('reading and shared blog motto appear directly; read-only snapshots and decoration preserve all source stores', async () => {
  await stores.withStore((store) => Object.assign(store, {
    settings: { aiName: '酥酥' }, sessions: [], fragments: [{ id: 'her-post', content: '她的正文' }],
    blog: { him: { motto: '原签名', posts: [{ id: 'his-post', title: '一篇日志', content: '原来的正文', createdAt: now.toISOString() }] } },
  }));
  await stores.withWardrobeStore((store) => Object.assign(store, { items: [{ id: 'her-clothes', note: '保留' }], outfit: { top: 'her-clothes' } }));
  await stores.withSurfStore((store) => Object.assign(store, { threads: [
    { id: 'susu-thread', at: stamp, lastAt: stamp, who: 'him', title: '酥酥的帖', content: '正文不复制', links: [], replies: [] },
    { id: 'her-thread', at: stamp + 1, lastAt: stamp + 1, who: 'her', title: '她的帖', content: '保留', links: [], replies: [] },
  ] }));
  const book = await addBook({ id: 'crime', title: '罪与罚', shelf: 'reading', chapters: [{ id: 'chapter-1', title: '第一章', paragraphs: ['一段', '二段', '三段'] }] });
  await markBook(book.id, 'him', { chapterId: 'chapter-1', paragraphIndex: 1 });
  await stores.withStore((store) => recordReading(store, { bookId: book.id, title: book.title, progress: '第 1 章第 2 段（50%）', source: 'life' }));
  const dataDir = join(scratch, 'data');
  const originals = Object.fromEntries(readdirSync(dataDir).map((name) => [name, readFileSync(join(dataDir, name), 'utf8')]));
  const response = await route.GET();
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const phone = (await response.json()).phone;
  assert.equal(phone.signature, '原签名');
  assert.equal(phone.collection.reading[0].detail, '第 1 章 · 第 2 段 · 50%');
  assert.deepEqual(phone.collection.reading[0].target, { app: 'reading', id: 'crime' });
  assert.deepEqual(phone.collection.surf.map((item) => item.id), ['susu-thread']);
  assert.equal(JSON.stringify(phone).includes('正文不复制'), false);
  assert.equal(JSON.stringify(phone).includes('原来的正文'), false);
  assert.equal((await call('phone_decorate', { wallpaper: 'deep-sea', icon_order: ['blog', 'chat', 'reading', 'surf'] })).result.isError, false);
  for (const [name, raw] of Object.entries(originals)) assert.equal(readFileSync(join(dataDir, name), 'utf8'), raw, `${name} preserved`);
  assert.deepEqual(readdirSync(dataDir).filter((name) => !(name in originals)), ['phone_settings.json']);
  const decorated = readFileSync(join(dataDir, 'phone_settings.json'), 'utf8');
  assert.equal((await call('phone_decorate', { wallpaper: 'night-blue', widgets: { today: 'no' } })).result.isError, true);
  assert.equal(readFileSync(join(dataDir, 'phone_settings.json'), 'utf8'), decorated);
  await setHisMotto('在这里等你。');
  assert.equal((await route.GET().then((res) => res.json())).phone.signature, '在这里等你。');
  assert.equal(readFileSync(join(dataDir, 'phone_settings.json'), 'utf8'), decorated);
  const sync = createSessionSyncHandlers({ read: stores.readStore, write: stores.withStore });
  await sync.POST(new Request('http://x/api/sync', { method: 'POST', body: JSON.stringify({ sessions: [], phone_settings: { wallpaper: 'bad' }, phone: { signature: 'bad' } }) }));
  assert.equal(readFileSync(join(dataDir, 'phone_settings.json'), 'utf8'), decorated);
});
