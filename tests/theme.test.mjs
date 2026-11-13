import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import './helpers/resolve-typescript.mjs';

const { DEFAULT_THEME, THEME_INIT_SCRIPT, THEME_OPTIONS, THEME_STORAGE_KEY, isTheme } = await import('../app/lib/theme.ts');

test('theme options include the default and reject unknown stored values', () => {
  assert.equal(DEFAULT_THEME, 'white-pink');
  assert.deepEqual(THEME_OPTIONS.map((option) => option.id), ['white-pink', 'white-wedding']);
  assert.equal(isTheme('white-pink'), true);
  assert.equal(isTheme('white-wedding'), true);
  assert.equal(isTheme('unknown'), false);
  assert.equal(isTheme(null), false);
});

test('the early theme script restores only a valid saved theme', () => {
  for (const [stored, expected] of [['white-wedding', 'white-wedding'], ['white-pink', 'white-pink'], ['unknown', 'white-pink']]) {
    const context = {
      document: { documentElement: { dataset: { theme: 'white-pink' } } },
      localStorage: { getItem: (key) => {
        assert.equal(key, THEME_STORAGE_KEY);
        return stored;
      } },
    };
    vm.runInNewContext(THEME_INIT_SCRIPT, context);
    assert.equal(context.document.documentElement.dataset.theme, expected);
  }
});

test('the early theme script keeps the default when storage is unavailable', () => {
  const context = {
    document: { documentElement: { dataset: { theme: 'white-pink' } } },
    localStorage: { getItem: () => { throw new Error('storage denied'); } },
  };
  vm.runInNewContext(THEME_INIT_SCRIPT, context);
  assert.equal(context.document.documentElement.dataset.theme, 'white-pink');
});
