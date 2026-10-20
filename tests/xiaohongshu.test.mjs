import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-typescript.mjs';
const { xiaohongshuTools, XIAOHONGSHU_MCP_URL, XIAOHONGSHU_READ_TOOLS } = await import('../app/lib/xiaohongshu.ts');

test('Xiaohongshu stays unavailable when disabled or outside authorized chat and surfing', () => {
  assert.deepEqual(xiaohongshuTools({ chat: true, life: false, surf: true, selected: true }, false), []);
  assert.deepEqual(xiaohongshuTools({ chat: false, life: false, surf: true, selected: true }, true), []);
  assert.deepEqual(xiaohongshuTools({ chat: true, life: true, surf: false, selected: true }, true), []);
});

test('missing or disabled user setting removes Xiaohongshu from chat and heartbeat', () => {
  for (const options of [{ chat: true, life: false, surf: true }, { chat: false, life: true, surf: true }]) {
    assert.deepEqual(xiaohongshuTools(options, true), []);
    assert.deepEqual(xiaohongshuTools({ ...options, selected: false }, true), []);
    assert.equal(xiaohongshuTools({ ...options, selected: true }, true).length, 5);
    assert.deepEqual(xiaohongshuTools({ ...options, selected: false }, true), []);
  }
});

test('ordinary chat and surfing receive only the five browsing tools', () => {
  for (const options of [{ chat: true, life: false, surf: false }, { chat: false, life: true, surf: true }]) {
    assert.deepEqual(xiaohongshuTools({ ...options, selected: true }, true), XIAOHONGSHU_READ_TOOLS);
  }
  assert.equal(XIAOHONGSHU_READ_TOOLS.length, 5);
  assert.ok(XIAOHONGSHU_READ_TOOLS.every(name => !/publish|comment|like|favorite|login_qrcode|delete/.test(name)));
  assert.equal(new URL(XIAOHONGSHU_MCP_URL).hostname, '127.0.0.1');
});
