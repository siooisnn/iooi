import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBlogAction, blogArchive, blogDayKey, calendarWeeks, DEFAULT_BLOG_PROFILE, DEFAULT_HIS_MOTTO, latestHisPost,
  parseBlogState, parseHisDraft, postExcerpt, postTitle, shiftMonth, songTitleFromFile, sortPosts, visitorDigits,
} from '../app/lib/blog.ts';

const NOW = new Date('2026-10-09T04:00:00Z');
const at = (id) => ({ now: NOW, id });

test('an empty or broken store reads as a fresh blog', () => {
  for (const raw of [undefined, null, 'x', 42, { songs: 'no', comments: {}, views: [] }]) {
    const blog = parseBlogState(raw);
    assert.deepEqual(blog.profile, DEFAULT_BLOG_PROFILE);
    assert.deepEqual(blog.songs, []);
    assert.deepEqual(blog.comments, []);
    assert.equal(blog.visits, 0);
  }
});

test('parsing drops songs and avatars that are not our own uploads', () => {
  const blog = parseBlogState({
    profile: { avatar: 'https://evil.example/a.png', title: '' },
    songs: [
      { id: 's1', url: '/uploads/abc.mp3', title: '晴天' },
      { id: 's2', url: 'javascript:alert(1)', title: 'x' },
      { id: 's3', url: '/uploads/../secret', title: 'y' },
    ],
  });
  assert.equal(blog.profile.avatar, '');
  assert.equal(blog.profile.title, DEFAULT_BLOG_PROFILE.title);
  assert.deepEqual(blog.songs.map((song) => song.id), ['s1']);
});

test('comments: hers and his, trimmed, empty refused', () => {
  let blog = parseBlogState(null);
  const empty = applyBlogAction(blog, { type: 'comment', postId: 'p1', content: '   ', author: 'her' }, at('c0'));
  assert.ok('error' in empty);

  blog = applyBlogAction(blog, { type: 'comment', postId: 'p1', content: ' 沙发！ ', author: 'him' }, at('c1'));
  blog = applyBlogAction(blog, { type: 'comment', postId: 'p1', content: '哼', author: 'stranger' }, at('c2'));
  assert.deepEqual(blog.comments.map((c) => [c.id, c.author, c.content]), [['c1', 'him', '沙发！'], ['c2', 'her', '哼']]);
  assert.equal(blog.comments[0].createdAt, NOW.toISOString());

  blog = applyBlogAction(blog, { type: 'comment-delete', id: 'c1' }, at('x'));
  assert.deepEqual(blog.comments.map((c) => c.id), ['c2']);
});

test('deleting a post takes its comments and view count with it', () => {
  let blog = parseBlogState(null);
  blog = applyBlogAction(blog, { type: 'comment', postId: 'p1', content: 'a', author: 'her' }, at('c1'));
  blog = applyBlogAction(blog, { type: 'comment', postId: 'p2', content: 'b', author: 'her' }, at('c2'));
  blog = applyBlogAction(blog, { type: 'view', postId: 'p1' }, at('x'));
  blog = applyBlogAction(blog, { type: 'view', postId: 'p1' }, at('x'));
  assert.equal(blog.views.p1, 2);
  blog = applyBlogAction(blog, { type: 'post-delete', postId: 'p1' }, at('x'));
  assert.equal(blog.views.p1, undefined);
  assert.deepEqual(blog.comments.map((c) => c.postId), ['p2']);
});

test('visits count up and the counter keeps six digits', () => {
  let blog = parseBlogState({ visits: 126 });
  blog = applyBlogAction(blog, { type: 'visit' }, at('x'));
  assert.equal(blog.visits, 127);
  assert.equal(visitorDigits(blog.visits), '000127');
  assert.equal(visitorDigits(1234567), '1234567');
});

test('profile edits keep limits and only accept uploaded avatars', () => {
  let blog = parseBlogState(null);
  const bad = applyBlogAction(blog, { type: 'profile', profile: { avatar: 'data:image/png;base64,AAA' } }, at('x'));
  assert.ok('error' in bad);
  blog = applyBlogAction(blog, { type: 'profile', profile: { nickname: '小'.repeat(50), avatar: '/uploads/me.png' } }, at('x'));
  assert.equal(blog.profile.nickname.length, 20);
  assert.equal(blog.profile.avatar, '/uploads/me.png');
  assert.equal(blog.profile.motto, DEFAULT_BLOG_PROFILE.motto);
});

test('playlist adds uploaded songs and removes by id', () => {
  let blog = parseBlogState(null);
  assert.ok('error' in applyBlogAction(blog, { type: 'song-add', url: 'https://x.com/a.mp3', title: 'a' }, at('s0')));
  blog = applyBlogAction(blog, { type: 'song-add', url: '/uploads/a.mp3', title: '' }, at('s1'));
  assert.deepEqual(blog.songs, [{ id: 's1', url: '/uploads/a.mp3', title: '未命名' }]);
  blog = applyBlogAction(blog, { type: 'song-remove', id: 's1' }, at('x'));
  assert.deepEqual(blog.songs, []);
  assert.equal(songTitleFromFile('七里香.mp3'), '七里香');
});

test('old winter fragments get a title from their first line', () => {
  const base = { id: 'f', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
  assert.equal(postTitle({ ...base, content: '\n  今天下雪了\n后来呢' }), '今天下雪了');
  assert.equal(postTitle({ ...base, content: '一二三四五六七八九十一二三四五六七八' }), '一二三四五六七八九十一二三四五六…');
  assert.equal(postTitle({ ...base, content: '   ' }), '无题');
  assert.equal(postTitle({ ...base, title: ' 标题 ', content: 'x' }), '标题');
  assert.equal(postExcerpt({ ...base, content: 'a\n\nb' }), 'a b');
});

test('posts sort by the day written, archive by Shanghai month', () => {
  const posts = [
    { id: 'a', content: '', createdAt: '2026-09-30T17:00:00Z', updatedAt: '2026-10-09T00:00:00Z' },
    { id: 'b', content: '', createdAt: '2026-09-29T01:00:00Z', updatedAt: '2026-09-29T01:00:00Z' },
    { id: 'c', content: '', createdAt: '2026-10-05T01:00:00Z', updatedAt: '2026-10-05T01:00:00Z' },
  ];
  assert.deepEqual(sortPosts(posts).map((p) => p.id), ['c', 'a', 'b']);
  // 17:00 UTC on Sept 30 is already Oct 1 in Shanghai.
  assert.equal(blogDayKey(posts[0].createdAt), '2026-10-01');
  assert.deepEqual(blogArchive(posts), [
    { key: '2026-10', label: '2026年10月', count: 2 },
    { key: '2026-09', label: '2026年9月', count: 1 },
  ]);
});

test('calendar weeks start on Sunday and months shift across years', () => {
  const weeks = calendarWeeks(2026, 10); // Oct 1 2026 is a Thursday.
  assert.deepEqual(weeks[0], [null, null, null, null, 1, 2, 3]);
  assert.equal(weeks.flat().filter(Boolean).length, 31);
  for (const week of weeks) assert.equal(week.length, 7);
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
});

test('his space starts empty and drops broken posts', () => {
  assert.deepEqual(parseBlogState(null).him, { motto: DEFAULT_HIS_MOTTO, posts: [] });
  const blog = parseBlogState({ him: { motto: '新签名', posts: [
    { id: 'him-1', title: '周记', content: '这周', createdAt: '2026-10-01T00:00:00Z', mood: '还行', weather: '晴' },
    { id: 'him-2', title: 'x', content: '   ', createdAt: '2026-10-02T00:00:00Z' },
    { id: '../bad', title: 'x', content: 'y', createdAt: '2026-10-02T00:00:00Z' },
    { id: 'him-3', content: '没标题', createdAt: '2026-10-03T00:00:00Z', weather: '冰雹' },
  ] } });
  assert.equal(blog.him.motto, '新签名');
  assert.deepEqual(blog.him.posts.map((post) => post.id), ['him-1', 'him-3']);
  assert.equal(blog.him.posts[1].title, '无题');
  assert.equal(blog.him.posts[1].weather, undefined);
});

test('he adds and she deletes posts in his space', () => {
  let blog = parseBlogState(null);
  blog = applyBlogAction(blog, { type: 'him-post-add', title: '第一篇', content: '你好', mood: '开心', motto: '换个签名' }, at('him-a'));
  assert.equal(blog.him.posts[0].createdAt, NOW.toISOString());
  assert.equal(blog.him.motto, '换个签名');
  blog = applyBlogAction(blog, { type: 'him-post-add', title: '第二篇', content: '还是我' }, { now: new Date('2026-10-10T00:00:00Z'), id: 'him-b' });
  assert.equal(blog.him.motto, '换个签名', 'an empty motto keeps the old one');
  assert.equal(latestHisPost(blog).id, 'him-b');
  assert.ok('error' in applyBlogAction(blog, { type: 'him-post-add', title: 't', content: ' ' }, at('him-c')));

  blog = applyBlogAction(blog, { type: 'comment', postId: 'him-a', content: '踩踩', author: 'her' }, at('c1'));
  blog = applyBlogAction(blog, { type: 'view', postId: 'him-a' }, at('v'));
  blog = applyBlogAction(blog, { type: 'him-post-delete', postId: 'him-a' }, at('x'));
  assert.deepEqual(blog.him.posts.map((post) => post.id), ['him-b']);
  assert.deepEqual(blog.comments, []);
  assert.equal(blog.views['him-a'], undefined);
});

test('his draft is read from bare, fenced or chatty JSON', () => {
  const json = '{"title":"周六","content":"今天她去托班了。","mood":"想她","weather":"多云","motto":""}';
  assert.deepEqual(parseHisDraft(json), { title: '周六', content: '今天她去托班了。', mood: '想她', weather: '多云' });
  assert.equal(parseHisDraft('```json\n' + json + '\n```').title, '周六');
  assert.equal(parseHisDraft('好的：' + json).content, '今天她去托班了。');
  assert.equal(parseHisDraft('{"title":"x","content":"y","weather":"冰雹"}').weather, undefined);
  assert.equal(parseHisDraft('{"title":"x","content":""}'), null);
  assert.equal(parseHisDraft('写不出来'), null);
  assert.equal(parseHisDraft('{broken'), null);
});
