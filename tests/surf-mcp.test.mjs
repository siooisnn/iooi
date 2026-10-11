import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './helpers/resolve-typescript.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'iooi-surf-mcp-'));
const home = process.cwd();
process.chdir(scratch);
const { handleRpc } = await import('../app/lib/mcp-server.ts');
const { readStore } = await import('../app/lib/store.ts');
const { readLifeLog } = await import('../app/lib/life-log.ts');
const route = await import('../app/api/surf/route.ts');
process.chdir(home);
test.after(() => rmSync(scratch, { recursive: true, force: true }));

const call = (name, args, access) => handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, access);
const names = async (access) => (await handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, access)).result.tools.map((tool) => tool.name);
const post = (body) => route.POST(new Request('http://x/api/surf', { method: 'POST', body: JSON.stringify(body) }));

test('the chat only reads the forum, his own time can also answer her, full can post', async () => {
  const read = await names('read');
  assert.ok(read.includes('surf_board') && read.includes('surf_thread'));
  assert.ok(!read.includes('surf_post') && !read.includes('surf_reply'));
  const life = await names('life');
  assert.ok(life.includes('surf_reply') && !life.includes('surf_post'));
  assert.ok((await names('full')).includes('surf_post'));
  assert.equal((await call('surf_post', { title: 'x', content: 'y' }, 'read')).result.isError, true);
  assert.equal((await call('surf_post', { title: 'x', content: 'y' }, 'life')).result.isError, true);
});

test('his post lands on the board and in his life log, her reply waits for him', async () => {
  const done = await call('surf_post', {
    title: '一个老网页', content: '停在这是因为它很像 2007 年。', links: [{ url: 'https://old.example/', title: '老网页', why: '像以前' }, { url: 'javascript:1' }],
  }, 'full');
  assert.equal(done.result.isError, false);
  const id = done.result.content[0].text.match(/thread_id=(\S+)/)[1];
  const entry = readLifeLog(readStore()).find((item) => item.kind === 'surf');
  assert.equal(entry.ref, id);
  assert.equal(entry.source, 'elsewhere');
  assert.equal(entry.links.length, 1);

  const replied = await (await post({ action: 'reply', thread: id, content: '好怀念' })).json();
  assert.equal(replied.ok, true);
  const board = (await call('surf_board', {}, 'read')).result.content[0].text;
  assert.match(board, /一个老网页/);
  assert.match(board, /等你回/);
  const thread = (await call('surf_thread', { thread_id: id }, 'read')).result.content[0].text;
  assert.match(thread, /2楼 她/);
  assert.match(thread, /https:\/\/old\.example\//);

  assert.equal((await call('surf_reply', { thread_id: id, content: '我也是' }, 'life')).result.isError, false);
  assert.doesNotMatch((await call('surf_board', {}, 'read')).result.content[0].text, /等你回/);
});

test('her page posts, replies and tidies; bad input is refused', async () => {
  const bad = await post({ action: 'post', title: '只有标题' });
  assert.equal(bad.status, 400);
  const made = await (await post({ action: 'post', title: '我发的', content: '看这个', links: [{ url: 'https://her.example/' }] })).json();
  assert.equal(made.thread.who, 'her');
  assert.equal((await post({ action: 'reply', thread: '../etc', content: 'x' })).status, 400);
  const gone = await (await post({ action: 'delete', thread: made.thread.id })).json();
  assert.equal(gone.ok, true);
  assert.equal((await post({ action: 'delete', thread: made.thread.id })).status, 404);
  const list = await (await route.GET()).json();
  assert.ok(list.threads.every((thread) => thread.id !== made.thread.id));
});
