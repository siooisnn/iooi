import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './helpers/resolve-typescript.mjs';

// The store lives in ./data of the working directory: point it at a scratch dir first.
const scratch = mkdtempSync(join(tmpdir(), 'iooi-life-mcp-'));
const home = process.cwd();
process.chdir(scratch);
const { handleRpc } = await import('../app/lib/mcp-server.ts');
const { addBook } = await import('../app/lib/reading-shelf.ts');
const { readStore } = await import('../app/lib/store.ts');
const { readLifeLog } = await import('../app/lib/life-log.ts');
process.chdir(home);
test.after(() => rmSync(scratch, { recursive: true, force: true }));

const chapters = [
  { id: 'c1', title: '第一章', paragraphs: ['雨下起来了。', '他们听见钟声。', '没有人说话。'] },
  { id: 'c2', title: '第二章', paragraphs: ['他回来了。', '天亮了。'] },
];
const book = await addBook({ id: 'tango', title: '撒旦探戈', chapters });

const call = (name, args, access) => handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, access);
const names = async (access) => (await handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, access)).result.tools.map((tool) => tool.name);

test('his own time sees the blog and the shelf, moves his bookmark and writes notes, nothing more', async () => {
  const life = await names('life');
  assert.ok(life.includes('reading_mark') && life.includes('reading_note') && life.includes('blog_read'));
  assert.ok(!life.some((name) => ['blog_write_post', 'blog_comment', 'blog_set_motto', 'reading_delete_note', 'blog_delete_post'].includes(name)));
  const refused = await call('blog_write_post', { title: 'x', content: 'y' }, 'life');
  assert.equal(refused.result.isError, true);
  assert.ok((await names('read')).every((name) => !['reading_mark', 'reading_note'].includes(name)));
  assert.ok((await names('full')).includes('reading_delete_note'));
});

test('a sitting on his own time lands in the life log as one line', async () => {
  assert.equal((await call('reading_mark', { book_id: book.id, chapter: 1, paragraph: 2 }, 'life')).result.isError, false);
  assert.equal((await call('reading_note', { book_id: book.id, chapter: 1, paragraph: 2, content: '钟声这里想到你' }, 'life')).result.isError, false);
  // Rewriting the same note doesn't count twice.
  await call('reading_note', { book_id: book.id, chapter: 1, paragraph: 2, content: '改一下' }, 'life');
  await call('reading_mark', { book_id: book.id, chapter: 2, paragraph: 1 }, 'life');
  const reads = readLifeLog(readStore()).filter((entry) => entry.kind === 'read');
  assert.equal(reads.length, 1);
  assert.equal(reads[0].source, 'life');
  assert.match(reads[0].text, /^读《撒旦探戈》，读到第 2 章第 1 段（\d+%），写了 1 条批注$/);
});

test('reading from another window is logged separately and marked as such', async () => {
  await call('reading_mark', { book_id: book.id, chapter: 2, paragraph: 2 }, 'full');
  const reads = readLifeLog(readStore()).filter((entry) => entry.kind === 'read');
  assert.equal(reads.length, 2);
  assert.equal(reads[0].source, 'elsewhere');
  assert.equal(reads[0].note, '在别的窗口里读的');
});
