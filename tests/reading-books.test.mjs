import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReadingText, readingProgress, createReadingDemo, MAX_READING_BYTES } from '../app/lib/reading-books.ts';

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
test('demo annotations reference actual text and reading progress survives invalid old positions', () => {
  const book = createReadingDemo('claude');
  assert.equal(readingProgress(book), 0);
  for (const note of book.annotations) {
    assert.ok(book.chapters.find(c => c.id === note.chapterId).paragraphs[note.paragraphIndex].includes(note.quote));
  }
  book.lastReadAt = Date.now();
  book.position = { chapterId: 'demo-2', paragraphIndex: 500 };
  assert.equal(readingProgress(book), 100);
  book.position.chapterId = 'missing';
  assert.equal(readingProgress(book), 0);
});
