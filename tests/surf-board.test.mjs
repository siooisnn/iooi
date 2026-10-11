import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SURF_LIMITS, addThread, boardLinks, cleanSurfLinks, readBoard, removeFromBoard, replyThread, safeSurfUrl, surfHost, waitingForHim,
} from '../app/lib/surf-board.ts';

test('only plain web links get through, deduped and capped', () => {
  assert.equal(safeSurfUrl('javascript:alert(1)'), '');
  assert.equal(safeSurfUrl('data:text/html,hi'), '');
  assert.equal(safeSurfUrl('https://a.com/x"><script>'), '');
  assert.equal(safeSurfUrl(' https://example.com/a?b=1 '), 'https://example.com/a?b=1');
  assert.equal(surfHost('https://www.example.com/a'), 'example.com');
  const links = cleanSurfLinks([
    { url: 'https://a.com', title: 'A', why: '  好看  ' },
    { url: 'https://a.com', title: 'A again' },
    { url: 'ftp://b.com' },
    { url: 'http://c.com' },
    ...Array.from({ length: 8 }, (_, i) => ({ url: `https://d${i}.com` })),
  ]);
  assert.equal(links.length, SURF_LIMITS.links);
  assert.deepEqual(links[0], { title: 'A', url: 'https://a.com', why: '好看' });
  assert.equal(links[1].title, 'c.com');
});

test('a thread needs a title and something in it; the title falls back to the link', () => {
  const store = {};
  assert.throws(() => addThread(store, { who: 'her', title: '空的' }), /写点什么/);
  const thread = addThread(store, { who: 'him', source: 'life', links: [{ url: 'https://moon.example/', title: '月亮' }] }, 1000);
  assert.equal(thread.title, '月亮');
  assert.equal(thread.source, 'life');
  // Her threads never carry a source.
  assert.equal(addThread(store, { who: 'her', title: '我的', content: '嗯', source: 'life' }, 2000).source, undefined);
  assert.equal(readBoard(store).length, 2);
});

test('floors keep order, bump the thread, and only her own can be tidied when asked', () => {
  const store = {};
  const older = addThread(store, { who: 'him', title: '旧的', content: '先发' }, 1000);
  const newer = addThread(store, { who: 'him', title: '新的', content: '后发' }, 2000);
  assert.deepEqual(readBoard(store).map((t) => t.id), [newer.id, older.id]);
  assert.throws(() => replyThread(store, older.id, 'her', '   '), /空/);
  const { reply } = replyThread(store, older.id, 'her', '这个好', 3000);
  assert.deepEqual(readBoard(store).map((t) => t.id), [older.id, newer.id]);
  assert.deepEqual(waitingForHim(readBoard(store)).map((t) => t.id), [older.id]);
  replyThread(store, older.id, 'him', '是吧', 4000);
  assert.deepEqual(waitingForHim(readBoard(store)), []);
  // His hands can't take down her floor; her page can.
  assert.equal(removeFromBoard(store, older.id, reply.id, 'him'), false);
  assert.equal(removeFromBoard(store, older.id, reply.id), true);
  assert.equal(readBoard(store).find((t) => t.id === older.id).replies.length, 1);
  assert.equal(removeFromBoard(store, newer.id), true);
  assert.equal(readBoard(store).length, 1);
});

test('favourites list every kept page, newest thread first', () => {
  const store = {};
  addThread(store, { who: 'him', title: 'a', links: [{ url: 'https://a.com' }] }, 1000);
  addThread(store, { who: 'her', title: 'b', links: [{ url: 'https://b.com' }, { url: 'https://c.com' }] }, 2000);
  const threads = readBoard(store);
  assert.deepEqual(boardLinks(threads).map((l) => l.url), ['https://b.com', 'https://c.com', 'https://a.com']);
  assert.deepEqual(boardLinks(threads, 'him').map((l) => l.url), ['https://a.com']);
});

test('broken stored entries are skipped, not fatal', () => {
  const board = readBoard({ threads: [null, { id: 'x' }, { id: 'abcdefgh', at: 1, who: 'him', title: 't', replies: [{ id: 'bad' }], links: [{ url: 'javascript:1' }] }] });
  assert.equal(board.length, 1);
  assert.deepEqual(board[0].replies, []);
  assert.deepEqual(board[0].links, []);
  assert.equal(board[0].lastAt, 1);
});
