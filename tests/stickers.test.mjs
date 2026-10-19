import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import './helpers/resolve-typescript.mjs';

const original = process.cwd();
const sandbox = mkdtempSync(join(tmpdir(), 'iooi-stickers-'));
process.chdir(sandbox);
after(() => { process.chdir(original); rmSync(sandbox, { recursive: true, force: true }); });
const { addSticker, changeSticker, readStickers } = await import('../app/lib/sticker-store.ts');
const { STICKER_BYTES, STICKER_LIMIT, selectReplyStickers, stripStickerMarkers, stickerPrompt, stickerExtension } = await import('../app/lib/stickers.ts');
const { withStickerStore } = await import('../app/lib/store.ts');
const { GET, POST } = await import('../app/api/stickers/route.ts');
const { createVisibleReplyStream } = await import('../app/lib/visible-reply-stream.ts');
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

test('uploads keep original GIF bytes and a named catalog entry', async () => {
  const form = new FormData();
  form.append('file', new File([gif], '抱抱.gif', { type: 'image/gif' }));
  const response = await POST(new Request('http://localhost/api/stickers', { method: 'POST', body: form }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.sticker.name, '抱抱');
  assert.ok(data.sticker.url.endsWith('.gif'));
  assert.deepEqual(readFileSync(join(sandbox, data.sticker.url)), gif);
  assert.equal((await GET().json()).stickers.length, 1);
});

test('spoofed SVG and oversize files are refused without writing', async () => {
  const count = readdirSync(join(sandbox, 'uploads')).length;
  await assert.rejects(() => addSticker(Buffer.from('<svg onload="alert(1)"></svg>'), '伪装'), /无法识别/);
  await assert.rejects(() => addSticker(new Uint8Array(STICKER_BYTES + 1), '太大'), /5MB/);
  assert.throws(() => stickerExtension(new Uint8Array(3)), /5MB/);
  assert.equal(readdirSync(join(sandbox, 'uploads')).length, count);
  assert.equal(readStickers().length, 1);
});

test('an upload uses the name filled in before saving instead of the filename', async () => {
  const form = new FormData();
  form.append('file', new File([gif], 'random-image-123.gif', { type: 'image/gif' }));
  form.append('name', '委屈求抱抱');
  const response = await POST(new Request('http://localhost/api/stickers', { method: 'POST', body: form }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.sticker.name, '委屈求抱抱');
  assert.match(stickerPrompt(readStickers()), /委屈求抱抱/);
  await changeSticker('remove', data.sticker.id);
});

test('rename changes model choices; removing from the library preserves historical image files', async () => {
  const original = readStickers()[0];
  const text = `[sticker]${original.id}[/sticker]`;
  const snapshot = selectReplyStickers(text, readStickers())[0];
  await changeSticker('rename', original.id, '开心抱抱');
  assert.match(stickerPrompt(readStickers()), /开心抱抱/);
  assert.equal(snapshot.name, '抱抱');
  await changeSticker('remove', original.id);
  assert.deepEqual(selectReplyStickers(text, readStickers()), []);
  assert.deepEqual(readFileSync(join(sandbox, snapshot.url)), gif, 'old chat still has its image');
});

test('model markers allow one real sticker, never arbitrary URLs, and stay hidden across chunk boundaries', async () => {
  const sticker = await addSticker(gif, '贴贴');
  const marker = `[sticker]${sticker.id}[/sticker]`;
  assert.deepEqual(selectReplyStickers(`[sticker]https://evil.test/x[/sticker]${marker}${marker}`, [sticker]), [sticker]);
  assert.deepEqual(selectReplyStickers('[sticker]not_real_id[/sticker]', [sticker]), []);
  const text = `抱抱。${marker}来啦。`;
  assert.equal(stripStickerMarkers(text), '抱抱。来啦。');
  assert.equal(stripStickerMarkers('好[sticker]unfinished'), '好');
  for (let split = 0; split <= text.length; split++) {
    const stream = createVisibleReplyStream();
    assert.equal(stream.push(text.slice(0, split)) + stream.push(text.slice(split)) + stream.finish(), '抱抱。来啦。');
  }
});

test('the MCP chat can inspect the original image while autonomous life cannot access the library', async () => {
  const { handleRpc } = await import('../app/lib/mcp-server.ts');
  const sticker = readStickers()[0];
  const call = (access) => handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'sticker_read', arguments: { id: sticker.id } } }, access);
  const response = await call('read');
  assert.equal(response.result.isError, false);
  assert.equal(response.result.content[1].mimeType, 'image/gif');
  assert.equal(response.result.content[1].data, gif.toString('base64'));
  assert.equal((await call('life')).result.isError, true);
});

test('concurrent uploads respect the quota', async () => {
  await withStickerStore((store) => { store.stickers = Array.from({ length: STICKER_LIMIT - 1 }, (_, i) => ({ id: `st_old_${i}`, name: '旧表情', url: `/uploads/old_${i}.png` })); });
  const results = await Promise.allSettled([addSticker(gif, '一'), addSticker(gif, '二')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(readStickers().length, STICKER_LIMIT);
});

test('an unreadable catalog is never replaced with an empty one on the next write', async () => {
  const path = join(sandbox, 'data', 'stickers.json');
  writeFileSync(path, '{broken');
  assert.equal(GET().status, 500);
  await assert.rejects(() => addSticker(gif, '不能覆盖'), /保护现有数据/);
  assert.equal(readFileSync(path, 'utf8'), '{broken');
});
