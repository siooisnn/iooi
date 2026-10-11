import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSummerLight } from '../app/lib/summer-light.ts';

const data = {
  results: [
    { layer: 'lixia', content: '  我们是谁  ' },
    { layer: 'xiaoshu', items: [
      { date: '2026-10-10', title: '周五', content: 'a'.repeat(1600) },
      { date: '2026-10-09', title: '周四', content: '加班' },
      { date: '2026-10-08', title: '周三', content: '看电影' },
    ] },
  ],
};

test('立夏 always, and only as many 小暑 as asked, long ones cut', () => {
  assert.equal(renderSummerLight(data, 0), '## 立夏：我们是谁\n我们是谁');
  const two = renderSummerLight(data, 2);
  assert.match(two, /## 小暑：最近 2 篇/);
  assert.match(two, /### 2026-10-10｜周五\na{1500}……/);
  assert.match(two, /### 2026-10-09｜周四\n加班/);
  assert.doesNotMatch(two, /看电影/);
});

test('nothing readable gives nothing', () => {
  assert.equal(renderSummerLight({}, 3), '');
});
