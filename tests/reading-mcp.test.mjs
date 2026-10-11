import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addShelfBook, markShelfBook, noteShelfBook, unnoteShelfBook, notesToday, readShelf, NOTE_LIMITS,
} from '../app/lib/reading-books.ts';
import { bookDigest, passageText, shelfDigest } from '../app/lib/reading-digest.ts';

const NOW = Date.UTC(2026, 9, 11, 6, 0); // 14:00 CST
const chapters = [
  { id: 'c1', title: '第一章 消息', paragraphs: ['雨下起来了。', '他们听见钟声。', '没有人说话。'] },
  { id: 'c2', title: '第二章 复活', paragraphs: ['伊里米亚什回来了。'] },
];

function shelfWithBook() {
  const store = {};
  addShelfBook(store, { id: 'tango', title: '撒旦探戈', author: '克拉斯诺霍尔卡伊', chapters }, NOW - 5000);
  addShelfBook(store, { id: 'paper', title: '纸书', shelf: 'want', wantedBy: 'her' }, NOW - 4000);
  return store;
}

test('a note sits on one paragraph, quotes it, and rewriting keeps the same note', () => {
  const store = shelfWithBook();
  const first = noteShelfBook(store, 'tango', { chapterId: 'c1', paragraphIndex: 1, content: '  钟声这里我想到你。 ' }, chapters, NOW);
  assert.deepEqual([first.note.quote, first.note.content, first.rewritten], ['他们听见钟声。', '钟声这里我想到你。', false]);
  const again = noteShelfBook(store, 'tango', { chapterId: 'c1', paragraphIndex: 1, content: '改一下' }, chapters, NOW + 1);
  assert.equal(again.rewritten, true);
  assert.equal(again.note.id, first.note.id);
  assert.equal(readShelf(store).find((b) => b.id === 'tango').notes.length, 1);
  assert.throws(() => noteShelfBook(store, 'tango', { chapterId: 'c1', paragraphIndex: 3, content: 'x' }, chapters, NOW), /只有 3 段/);
  assert.throws(() => noteShelfBook(store, 'tango', { chapterId: 'c1', paragraphIndex: 0, content: ' ' }, chapters, NOW), /空/);
  assert.throws(() => noteShelfBook(store, 'tango', { chapterId: 'c1', paragraphIndex: 0, content: 'x'.repeat(NOTE_LIMITS.content + 1) }, chapters, NOW), /最多/);
  assert.equal(unnoteShelfBook(store, 'tango', first.note.id), true);
  assert.equal(unnoteShelfBook(store, 'tango', first.note.id), false);
});

test('notes per day are capped on the CST calendar day', () => {
  const store = shelfWithBook();
  const many = Array.from({ length: 40 }, (_, i) => `段${i}`);
  const long = [{ id: 'c1', title: '一', paragraphs: many }];
  addShelfBook(store, { id: 'long', title: '长书', chapters: long }, NOW);
  for (let i = 0; i < NOTE_LIMITS.perDay; i += 1) noteShelfBook(store, 'long', { chapterId: 'c1', paragraphIndex: i, content: `第${i}条` }, long, NOW + i);
  assert.equal(notesToday(readShelf(store), NOW), NOTE_LIMITS.perDay);
  assert.throws(() => noteShelfBook(store, 'long', { chapterId: 'c1', paragraphIndex: 30, content: '再一条' }, long, NOW), /明天/);
  const tomorrow = Date.UTC(2026, 9, 11, 16, 0); // 00:00 CST on the 12th
  assert.doesNotThrow(() => noteShelfBook(store, 'long', { chapterId: 'c1', paragraphIndex: 30, content: '第二天' }, long, tomorrow));
});

test('the shelf and one book read as text for him', () => {
  const store = shelfWithBook();
  markShelfBook(store, 'tango', 'her', { chapterId: 'c1', paragraphIndex: 2 }, chapters, NOW);
  markShelfBook(store, 'tango', 'him', { chapterId: 'c1', paragraphIndex: 1 }, chapters, NOW);
  noteShelfBook(store, 'tango', { chapterId: 'c1', paragraphIndex: 1, content: '钟声' }, chapters, NOW);
  const books = readShelf(store);
  const shelf = shelfDigest(books);
  assert.match(shelf, /## 在读（1）\n- 《撒旦探戈》 克拉斯诺霍尔卡伊 id=tango/);
  assert.match(shelf, /有正文，2 章 · 她 67% · 你 33% · 你的批注 1 条/);
  assert.match(shelf, /## 想读（1）\n- 《纸书》 id=paper · 她想读\n  没有正文 · 她 没开始 · 你 没开始/);
  const page = bookDigest(books.find((b) => b.id === 'tango'), chapters);
  assert.match(page, /她读到：67%（第 1 章第 3 段）/);
  assert.match(page, /1\. 第一章 消息（3 段） ← 她在这、你在这/);
  assert.match(page, /\[第 1 章第 2 段\] note_id=\S+ 2026-10-11「他们听见钟声。」→ 钟声/);
  assert.match(bookDigest(books.find((b) => b.id === 'paper'), null), /还没有正文/);
  assert.equal(shelfDigest([]), '书架还是空的。');
});

test('reading picks up at his spot, flags both of us, and says where to go next', () => {
  const store = shelfWithBook();
  markShelfBook(store, 'tango', 'her', { chapterId: 'c1', paragraphIndex: 2 }, chapters, NOW);
  markShelfBook(store, 'tango', 'him', { chapterId: 'c1', paragraphIndex: 1 }, chapters, NOW);
  noteShelfBook(store, 'tango', { chapterId: 'c1', paragraphIndex: 1, content: '钟声' }, chapters, NOW);
  const book = readShelf(store).find((b) => b.id === 'tango');
  const text = passageText(book, chapters);
  assert.match(text, /^《撒旦探戈》第 1\/2 章「第一章 消息」/);
  assert.ok(!text.includes('雨下起来了'), 'starts at his spot, not the top');
  assert.match(text, /\[2\]（你上次读到这里） 他们听见钟声。\n    ↳ 你的批注 note_id=\S+：钟声/);
  assert.match(text, /\[3\]（她读到这里） 没有人说话。/);
  assert.match(text, /这一章读完了（共 3 段）。下一章：chapter=2「第二章 复活」/);
  assert.match(passageText(book, chapters, { chapter: 2 }), /全书到这里读完了/);
  assert.throws(() => passageText(book, chapters, { chapter: 3 }), /只有 2 章/);
  assert.throws(() => passageText(book, chapters, { chapter: 1, paragraph: 9 }), /只有 3 段/);
});

test('a passage stops at the size budget but always shows at least one paragraph', () => {
  const big = [{ id: 'c1', title: '长', paragraphs: Array.from({ length: 10 }, (_, i) => `${i}`.padEnd(800, '字')) }];
  const book = { id: 'b', title: '长书', notes: [], her: null, him: null };
  const text = passageText(book, big, { maxChars: 1000 });
  assert.equal((text.match(/^\[\d+\]/gm) || []).length, 1);
  assert.match(text, /接着读：chapter=1, paragraph=2/);
  const fresh = passageText(book, big, { maxChars: 3000 });
  assert.equal((fresh.match(/^\[\d+\]/gm) || []).length, 3);
  assert.match(fresh, /reading_mark 记下你读到哪（比如 chapter=1, paragraph=3）/);
});
