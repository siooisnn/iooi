import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseReadingText, percentAt, paceLine, validChapters, MAX_READING_BYTES,
  addShelfBook, editShelfBook, markShelfBook, attachShelfText, removeShelfBook, readShelf,
} from '../app/lib/reading-books.ts';

test('TXT import preserves preface and chapter text in reading order', () => {
  const chapters = parseReadingText(new TextEncoder().encode('\uFEFF开场白\r\n\r\n第一章 窗边\r\n第一段。\r\n第二段。\r\n第二章 明天\r\n最后一段。'));
  assert.deepEqual(chapters.map(c => [c.title, c.paragraphs]), [
    ['正文', ['开场白']], ['第一章 窗边', ['第一段。', '第二段。']], ['第二章 明天', ['最后一段。']],
  ]);
});
test('legacy Chinese encoding is decoded and unsafe or empty input is rejected', () => {
  assert.equal(parseReadingText(Uint8Array.from([0xc4, 0xe3, 0xba, 0xc3]))[0].paragraphs[0], '你好');
  assert.throws(() => parseReadingText(new TextEncoder().encode('  \n')), /正文/);
  assert.throws(() => parseReadingText(Uint8Array.from([0, 1, 2])), /TXT/);
  assert.throws(() => parseReadingText(new Uint8Array(MAX_READING_BYTES + 1)), /10MB/);
});
test('large unstructured TXT is bounded for rendering without dropping paragraphs', () => {
  const paragraphs = Array.from({length: 501}, (_, i) => `这一段是第 ${i} 段。`);
  const chapters = parseReadingText(new TextEncoder().encode(paragraphs.join('\n')));
  assert.equal(chapters.length, 3);
  assert.deepEqual(chapters.flatMap(c => c.paragraphs), paragraphs);
});
test('progress follows the spot in the text and survives a missing chapter', () => {
  const chapters = [{ id: 'c1', title: '一', paragraphs: ['a', 'b', 'c'] }, { id: 'c2', title: '二', paragraphs: ['d', 'e'] }];
  assert.equal(percentAt(chapters, 'c1', 0), 0);
  assert.equal(percentAt(chapters, 'c2', 0), 75);
  assert.equal(percentAt(chapters, 'c2', 500), 100);
  assert.equal(percentAt(chapters, 'missing', 1), 0);
});

test('old on-device chapters are checked before they move to the server', () => {
  assert.equal(validChapters([]), null);
  assert.equal(validChapters([{ id: 'c1', title: '一', paragraphs: [1] }]), null);
  assert.deepEqual(validChapters([{ id: 'c1', title: '一', paragraphs: ['a'] }]), [{ id: 'c1', title: '一', paragraphs: ['a'] }]);
});

test('a title alone goes to 想读; starting it moves it to 在读', () => {
  const store = {};
  const book = addShelfBook(store, { id: 'b1', title: '  海边的卡夫卡 ', wantedBy: 'her', blurb: '她说想看' }, 1000);
  assert.equal(book.title, '海边的卡夫卡');
  assert.equal(book.shelf, 'want');
  assert.equal(book.wantedBy, 'her');
  assert.equal(book.hasText, false);
  assert.throws(() => addShelfBook(store, { id: 'b1', title: '又一本' }), /已经在书架/);
  assert.throws(() => addShelfBook(store, { title: '   ' }), /书名/);
  const marked = markShelfBook(store, 'b1', 'her', { percent: 12.4 }, null, 2000);
  assert.equal(marked.her.percent, 12);
  assert.equal(marked.shelf, 'reading');
  assert.equal(readShelf(store)[0].shelf, 'reading');
  assert.throws(() => markShelfBook(store, 'b1', 'her', { percent: 'abc' }, null), /0 到 100/);
});

test('with text, each of us keeps a separate spot, and the gap is spelled out', () => {
  const store = {};
  const chapters = [{ id: 'c1', title: '一', paragraphs: Array.from({ length: 101 }, (_, i) => `第${i}段`) }];
  addShelfBook(store, { id: 'b2', title: '书', chapters }, 1000);
  assert.equal(readShelf(store)[0].shelf, 'reading');
  markShelfBook(store, 'b2', 'him', { chapterId: 'c1', paragraphIndex: 50 }, chapters, 2000);
  const book = markShelfBook(store, 'b2', 'her', { chapterId: 'c1', paragraphIndex: 999 }, chapters, 3000);
  assert.deepEqual([book.her.percent, book.her.paragraphIndex, book.him.percent], [100, 100, 50]);
  assert.equal(paceLine(book, '酥酥'), '你领先酥酥 50%，催他快点读');
  assert.equal(paceLine({ ...book, her: null }, '酥酥'), '酥酥领先你 50%，等你追上来');
  assert.throws(() => markShelfBook(store, 'b2', 'her', { chapterId: 'nope' }, chapters), /这一章/);
});

test('editing, new text and removing', () => {
  const store = {};
  addShelfBook(store, { id: 'b3', title: '旧名', shelf: 'want', wantedBy: 'him' }, 1000);
  const edited = editShelfBook(store, 'b3', { title: '新名', shelf: 'done', wantedBy: '' }, 2000);
  assert.deepEqual([edited.title, edited.shelf, edited.wantedBy], ['新名', 'done', undefined]);
  assert.throws(() => editShelfBook(store, 'b3', { shelf: 'attic' }), /书架/);
  markShelfBook(store, 'b3', 'her', { percent: 40 }, null, 3000);
  const withText = attachShelfText(store, 'b3', [{ id: 'c1', title: '一', paragraphs: ['a'] }], 4000);
  assert.deepEqual([withText.hasText, withText.chapterCount, withText.her.percent], [true, 1, 40]);
  assert.equal(removeShelfBook(store, 'b3'), true);
  assert.equal(removeShelfBook(store, 'b3'), false);
  assert.throws(() => editShelfBook(store, 'b3', { title: 'x' }), /没有这本书/);
});
