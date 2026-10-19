import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './helpers/resolve-typescript.mjs';

const original = process.cwd();
const sandbox = mkdtempSync(join(tmpdir(), 'iooi-clawd-'));
process.chdir(sandbox);
const originalFetch = globalThis.fetch;
const oldKey = process.env.CLAWD_DEEPSEEK_API_KEY;
const oldFallback = process.env.DEEPSEEK_API_KEY;
delete process.env.CLAWD_DEEPSEEK_API_KEY;
delete process.env.DEEPSEEK_API_KEY;
after(() => {
  globalThis.fetch = originalFetch;
  if (oldKey === undefined) delete process.env.CLAWD_DEEPSEEK_API_KEY; else process.env.CLAWD_DEEPSEEK_API_KEY = oldKey;
  if (oldFallback === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = oldFallback;
  process.chdir(original); rmSync(sandbox, { recursive: true, force: true });
});
const { createClawd } = await import('../app/lib/clawd-pet.ts');
const { initializeClawd, readClawd, changeClawd } = await import('../app/lib/clawd-store.ts');
const { talkToClawd } = await import('../app/lib/clawd-chat.ts');
const { callClawdTool } = await import('../app/lib/clawd-mcp.ts');
const { handleRpc } = await import('../app/lib/mcp-server.ts');
const file = join(sandbox, 'data', 'clawd.json');

test('read never creates a new pet; first-device import preserves age, stats and visits, and never overwrites', async () => {
  assert.equal(readClawd().pet, null);
  assert.equal(existsSync(file), false);
  await assert.rejects(() => changeClawd('feed', {}, 'susu', 'before_import'), /先在小砖页面/);
  const now = Date.now();
  const pet = { ...createClawd(now), bornAt: now - 86400000 * 3, stats: { hunger: 30, mood: 40, energy: 50, clean: 60 } };
  const state = await initializeClawd(pet, [{ at: now, action: 'feed', count: 2 }]);
  assert.equal(state.pet.bornAt, pet.bornAt);
  assert.equal(state.visits[0].by, 'her');
  assert.equal(state.visits[0].count, 2);
  await initializeClawd(createClawd(now), []);
  assert.equal(readClawd().pet.bornAt, pet.bornAt);
  assert.equal(readClawd().visits.length, 1);
});

test('human and Susu actions share state, persist outfit, reject invalid pieces, and retries apply once', async () => {
  const before = readClawd();
  await Promise.all(Array.from({ length: 4 }, () => changeClawd('feed', {}, 'susu', 'same_feed_123')));
  const state = readClawd();
  assert.equal(state.visits.filter((v) => v.by === 'susu' && v.action === 'feed').length, 1);
  assert.ok(state.pet.stats.hunger > before.pet.stats.hunger + 27);
  await changeClawd('pet', {}, 'her', 'her_pet_123');
  await changeClawd('wear', { slot: 'head', id: 'beanie' }, 'susu', 'wear_beanie_123');
  assert.equal(readClawd().outfit.head, 'beanie');
  await assert.rejects(() => changeClawd('wear', { slot: 'head', id: 'flower' }, 'susu', 'wrong_piece_123'), /不在/);
  await changeClawd('wear', { slot: 'head', id: null }, 'her', 'remove_beanie_123');
  assert.equal(readClawd().outfit.head, undefined);
  await assert.rejects(() => changeClawd('reset', {}, 'susu', 'reset_not_allowed'), /不认识/);
});

test('chat without a key fails honestly and leaves the conversation unchanged', async () => {
  await assert.rejects(() => talkToClawd('你好', 'her', 'missing_key_123'), /没接好 DeepSeek/);
  assert.equal(readClawd().talks.length, 0);
});

test('DeepSeek chat serializes retries, keeps speakers and context, and never overwrites concurrent care', async () => {
  process.env.CLAWD_DEEPSEEK_API_KEY = 'test-key-not-real';
  let calls = 0;
  let sent;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    assert.equal(init.headers.Authorization, 'Bearer test-key-not-real');
    calls++;
    sent = JSON.parse(init.body);
    await changeClawd('bath', {}, 'susu', 'bath_during_chat');
    return Response.json({ choices: [{ message: { content: '嘿嘿，摸摸头～' } }] });
  };
  const results = await Promise.all([talkToClawd('小砖好', 'her', 'chat_retry_123'), talkToClawd('小砖好', 'her', 'chat_retry_123')]);
  assert.equal(calls, 1);
  assert.equal(results[0].reply, results[1].reply);
  assert.match(sent.messages.at(-1).content, /^小姿（妈妈）：/);
  assert.equal(readClawd().talks.length, 1);
  assert.equal(readClawd().pet.stats.clean, 100);
  await talkToClawd('酥酥来啦', 'susu', 'susu_chat_123');
  assert.match(sent.messages.at(-1).content, /^酥酥（爸爸）：/);
  assert.ok(sent.messages.some((m) => m.content === '嘿嘿，摸摸头～'));
  assert.equal(readClawd().talks.at(-1).by, 'susu');
  assert.ok(!JSON.stringify(readClawd()).includes('test-key-not-real'));
  globalThis.fetch = async () => new Response('', { status: 401 });
  await assert.rejects(() => talkToClawd('再聊聊', 'her', 'bad_key_chat'), /密钥需要检查/);
  assert.equal(readClawd().talks.length, 2);
});

test('MCP exposes read and care to chat and life; model talk stays out of autonomous life', async () => {
  const { CHAT_TOOLS } = await import('../app/lib/claude-code.ts');
  for (const name of ['clawd_read', 'clawd_action', 'clawd_talk']) assert.ok(CHAT_TOOLS.includes(`mcp__iooi__${name}`));
  for (const access of ['read', 'full', 'life']) {
    const list = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, access);
    const names = list.result.tools.map((t) => t.name);
    assert.ok(names.includes('clawd_read') && names.includes('clawd_action'));
    assert.equal(names.includes('clawd_talk'), access !== 'life');
  }
  await assert.rejects(() => callClawdTool('clawd_talk', { text: 'hi', requestId: 'life_talk_123' }, 'life'), /自主活动/);
  const result = await handleRpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'clawd_action', arguments: { action: 'pet', requestId: 'mcp_pet_1234' } } }, 'read');
  assert.equal(result.result.isError, false);
  assert.equal(readClawd().visits.at(-1).by, 'susu');
});

test('API fixes her identity, persists sleeping dialogue without a model request, and rejects malformed input', async () => {
  const { POST } = await import('../app/api/clawd/route.ts');
  const send = (body) => POST(new Request('http://localhost/api/clawd', { method: 'POST', body: JSON.stringify(body) }));
  const action = await send({ action: 'play', by: 'susu', requestId: 'api_her_play_123' });
  assert.equal(action.status, 200);
  assert.equal(readClawd().visits.at(-1).by, 'her');
  await changeClawd('sleep', {}, 'her', 'sleep_before_chat');
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('must not call model'); };
  const response = await send({ action: 'talk', text: '晚安', requestId: 'asleep_talk_123' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reply, '（睡着了，没听见）');
  assert.equal(calls, 0);
  assert.equal((await send({ action: 'feed', requestId: 'x' })).status, 400);
});

test('heartbeat care obeys its switch at execution time and logs successful care once', async () => {
  const { withStore, readStore } = await import('../app/lib/store.ts');
  const { readLifeLog } = await import('../app/lib/life-log.ts');
  await withStore((store) => { store.settings = { lifeClawd: false }; });
  await assert.rejects(() => callClawdTool('clawd_action', { action: 'pet', requestId: 'life_pet_123' }, 'life'), /已关闭/);
  await withStore((store) => { store.settings.lifeClawd = true; });
  for (let i = 0; i < 2; i++) await callClawdTool('clawd_action', { action: 'pet', requestId: 'life_pet_123' }, 'life');
  const entries = readLifeLog(readStore()).filter((e) => e.kind === 'clawd' && e.ref === 'clawd:life_pet_123');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].source, 'life');
  const locks = globalThis.__iooiStoreLocks;
  let release;
  locks.set(file, new Promise((resolve) => { release = resolve; }));
  const pending = callClawdTool('clawd_action', { action: 'pet', requestId: 'disabled_late_pet' }, 'life');
  const before = readFileSync(file, 'utf8');
  await withStore((store) => { store.settings.lifeClawd = false; });
  release();
  await assert.rejects(() => pending, /已关闭/);
  assert.equal(readFileSync(file, 'utf8'), before);
  assert.ok(!readLifeLog(readStore()).some((e) => e.ref === 'clawd:disabled_late_pet'));
});

test('corrupt shared storage is never replaced by initialization or care', async () => {
  const backup = readFileSync(file, 'utf8');
  for (const broken of ['{', JSON.stringify({ pet: { broken: true }, visits: [], talks: [], receipts: [], outfit: {} })]) {
    writeFileSync(file, broken);
    await assert.rejects(() => initializeClawd(null, []));
    await assert.rejects(() => changeClawd('feed', {}, 'her', 'protect_corrupt_123'));
    assert.equal(readFileSync(file, 'utf8'), broken);
  }
  writeFileSync(file, backup);
});
