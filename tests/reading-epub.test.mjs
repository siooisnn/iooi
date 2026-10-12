import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

nodeModule.registerHooks?.({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts') && !specifier.endsWith('.ts')) {
    const url = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
} });

const { parseEpub, looksLikeZip } = await import('../app/lib/reading-epub.ts');

/** A minimal zip writer: stored or deflated entries, central directory, end record. */
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content, store] of files) {
    const raw = Buffer.from(content);
    const data = store ? raw : deflateRawSync(raw);
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(store ? 0 : 8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

const container = '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
const page = (body) => `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>书名</title><style>p{}</style></head><body>${body}</body></html>`;

function book({ pages, nav, ncx, metadata = '<dc:title>海边的卡夫卡</dc:title><dc:creator>村上春树</dc:creator>' }) {
  const manifest = pages.map(([name], i) => `<item id="p${i}" href="${name}" media-type="application/xhtml+xml"/>`).join('');
  const spine = pages.map((_, i) => `<itemref idref="p${i}"/>`).join('');
  const files = [
    ['mimetype', 'application/epub+zip', true],
    ['META-INF/container.xml', container],
    ['OEBPS/content.opf', `<package><metadata>${metadata}</metadata><manifest>${manifest}`
      + (nav ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' : '')
      + (ncx ? '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' : '')
      + `</manifest><spine${ncx ? ' toc="ncx"' : ''}>${spine}</spine></package>`],
    ...pages.map(([name, body]) => [`OEBPS/${name}`, page(body)]),
  ];
  if (nav) files.push(['OEBPS/nav.xhtml', page(`<nav epub:type="toc"><ol>${nav}</ol></nav>`)]);
  if (ncx) files.push(['OEBPS/toc.ncx', `<ncx><navMap>${ncx}</navMap></ncx>`]);
  return zip(files);
}

test('chapters follow the EPUB 3 table of contents, even inside one page', () => {
  const bytes = book({
    pages: [
      ['cover.xhtml', '<div><img src="cover.jpg"/></div>'],
      ['text/one.xhtml', '<h2 id="c1">第一章<br/>窗边</h2><p>　　第一段&amp;一些<ruby>字<rt>zi</rt></ruby>，\n硬换行。</p><p>第二段<br/>换行</p>'
        + '<h2 id="c2">第二章 明天</h2><p>最后一段。</p>'],
    ],
    nav: '<li><a href="text/one.xhtml#c1">第一章 窗边</a></li><li><a href="text/one.xhtml#c2">第二章 明天</a></li>',
  });
  assert.equal(looksLikeZip(bytes), true);
  const parsed = parseEpub(bytes);
  assert.equal(parsed.title, '海边的卡夫卡');
  assert.equal(parsed.author, '村上春树');
  assert.deepEqual(parsed.chapters.map((c) => [c.id, c.title, c.paragraphs]), [
    ['chapter-1', '第一章 窗边', ['第一段&一些字，硬换行。', '第二段', '换行']],
    ['chapter-2', '第二章 明天', ['最后一段。']],
  ]);
});

test('NCX books: front matter stands alone and a bare part page joins the next title', () => {
  const bytes = book({
    pages: [
      ['title.xhtml', '<p>版权信息</p><p>本书由某某出版</p>'],
      ['part1.xhtml', '<h1>第一部</h1>'],
      ['ch1.xhtml', '<h2>第一章</h2><p>甲。</p>'],
      ['ch2.xhtml', '<h2>第二章</h2><p>乙。</p>'],
    ],
    ncx: '<navPoint><navLabel><text>第一部</text></navLabel><content src="part1.xhtml"/>'
      + '<navPoint><navLabel><text>第一章</text></navLabel><content src="ch1.xhtml"/></navPoint></navPoint>'
      + '<navPoint><navLabel><text>第二章</text></navLabel><content src="ch2.xhtml"/></navPoint>',
  });
  assert.deepEqual(parseEpub(bytes).chapters.map((c) => [c.title, c.paragraphs]), [
    ['版权信息', ['版权信息', '本书由某某出版']],
    ['第一部 · 第一章', ['甲。']],
    ['第二章', ['乙。']],
  ]);
});

test('without a usable TOC, headings or "第X章" lines split the text', () => {
  const bytes = book({
    pages: [['all.xhtml', '<p>开场白</p><p>第一章 风</p><p>一。</p><p>第二章 雨</p><p>二。</p>']],
  });
  assert.deepEqual(parseEpub(bytes).chapters.map((c) => [c.title, c.paragraphs]), [
    ['开头', ['开场白']], ['第一章 风', ['一。']], ['第二章 雨', ['二。']],
  ]);
  const plain = parseEpub(book({ pages: [['a.xhtml', '<p>甲</p>'], ['b.xhtml', '<p>乙</p>']] }));
  assert.deepEqual(plain.chapters.map((c) => c.title), ['第 1 部分', '第 2 部分']);
});

test('broken or empty EPUBs are rejected with a readable message', () => {
  assert.throws(() => parseEpub(new TextEncoder().encode('just text')), /不像 EPUB/);
  const whole = book({ pages: [['a.xhtml', '<p>甲</p>']] });
  assert.throws(() => parseEpub(whole.subarray(0, whole.length - 30)), /不完整/);
  assert.throws(() => parseEpub(book({ pages: [['a.xhtml', '<div><img src="x.jpg"/></div>']] })), /没有读得出来的文字/);
});
