import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './helpers/resolve-typescript.mjs';

const original = process.cwd();
const sandbox = mkdtempSync(join(tmpdir(), 'iooi-artworks-'));
process.chdir(sandbox);
after(() => { process.chdir(original); rmSync(sandbox, { recursive: true, force: true }); });
const { artworkChunks, artworkDocument, ARTWORK_CSP, ARTWORK_LIMITS, splitChatReply } = await import('../app/lib/artworks.ts');
const { listArtworks, updateArtwork } = await import('../app/lib/artwork-store.ts');
const html = '<!doctype html><html><head><title>小小计数器</title></head><body><button onclick="this.textContent=Number(this.textContent)+1">0</button></body></html>';

test('completed HTML gets a preview while other code, ordinary text and unfinished streams do not', () => {
  const chunks = artworkChunks(`送你一个。\n\n\`\`\`html\n${html}\n\`\`\`\n点点试试。`);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[1].artwork.title, '小小计数器');
  assert.equal(chunks[1].artwork.html.trim(), html);
  assert.deepEqual(artworkChunks('正常 **聊天**'), [{ kind: 'text', text: '正常 **聊天**' }]);
  assert.ok(!artworkChunks('```html\n<button>还没写完').some((c) => c.artwork));
  assert.ok(!artworkChunks('```python\nprint(1)\n```').some((c) => c.artwork));
  assert.ok(!artworkChunks(`\`\`\`html\n${'x'.repeat(ARTWORK_LIMITS.source + 1)}\n\`\`\``).some((c) => c.artwork));
});

test('one HTML block can use CSS and JavaScript companions without attaching them to multiple pages', () => {
  const source = '```html\n<button id="go">点我</button>\n```\n```css\nbutton{color:pink}\n```\n```javascript\ngo.onclick=()=>go.textContent="好啦"\n```';
  const single = artworkChunks(source).find((c) => c.artwork).artwork;
  assert.match(single.html, /<style>[\s\S]*color:pink/);
  assert.match(single.html, /<script>[\s\S]*go.onclick/);
  const multiple = artworkChunks(source + '\n```html\n<p>另一件作品</p>\n```').filter((c) => c.artwork);
  assert.equal(multiple.length, 2);
  assert.ok(multiple.every((c) => !c.artwork.html.includes('go.onclick')));
});

test('normal chat still splits paragraphs while code survives blank lines and reload persistence', () => {
  assert.deepEqual(splitChatReply('第一句。\n\n第二句。'), ['第一句。', '第二句。']);
  const reply = `送你一个。\n\n\`\`\`html\n${html}\n\n<!-- 代码中的空行 -->\n\`\`\`\n\n点点试试。`;
  assert.deepEqual(splitChatReply(reply), [reply]);
  assert.equal(artworkChunks(splitChatReply(reply)[0]).filter((c) => c.artwork).length, 1);
});

test('preview document puts restrictive CSP before untrusted markup without changing downloadable source', () => {
  const doc = artworkDocument(html);
  assert.ok(doc.indexOf('Content-Security-Policy') < doc.indexOf(html));
  assert.match(ARTWORK_CSP, /default-src 'none'/);
  assert.match(ARTWORK_CSP, /connect-src 'none'/);
  assert.match(ARTWORK_CSP, /frame-src 'none'/);
  assert.ok(!ARTWORK_CSP.includes('unsafe-eval'));
  assert.ok(doc.includes(html));
});

test('save is durable, concurrent repeats deduplicate, and rename/archive/restore preserve source', async () => {
  const results = await Promise.all(Array.from({ length: 5 }, () => updateArtwork('save', { title: '计数器', html })));
  assert.equal(new Set(results.map((a) => a.id)).size, 1);
  assert.equal(listArtworks().length, 1);
  const id = results[0].id;
  await updateArtwork('rename', { id, title: '酥酥的小计数器' });
  await updateArtwork('remove', { id });
  assert.ok(listArtworks()[0].removedAt);
  await updateArtwork('restore', { id });
  assert.equal(listArtworks()[0].removedAt, undefined);
  assert.equal(listArtworks()[0].title, '酥酥的小计数器');
  assert.equal(listArtworks()[0].html, html);
  assert.equal(JSON.parse(readFileSync(join(sandbox, 'data', 'artworks.json'), 'utf8')).items[0].html, html);
});

test('invalid actions and corrupt data never replace saved works; API returns no-store', async () => {
  await assert.rejects(() => updateArtwork('save', { title: '', html }));
  await assert.rejects(() => updateArtwork('save', { title: 'too big', html: 'x'.repeat(ARTWORK_LIMITS.source + 1) }));
  await assert.rejects(() => updateArtwork('rename', { id: 'missing', title: 'x' }));
  const { GET, POST } = await import('../app/api/artworks/route.ts');
  const response = GET();
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).items.length, 1);
  const bad = await POST(new Request('http://localhost/api/artworks', { method: 'POST', body: 'null' }));
  assert.equal(bad.status, 400);
  const file = join(sandbox, 'data', 'artworks.json');
  for (const broken of ['{', '{"items":"broken"}']) {
    writeFileSync(file, broken);
    await assert.rejects(() => updateArtwork('save', { title: '测试', html }));
    assert.equal(readFileSync(file, 'utf8'), broken);
  }
});
