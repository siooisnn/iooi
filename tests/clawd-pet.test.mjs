import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actClawd, advanceClawd, clawdAgeDays, clawdRefusal, clawdState, createClawd, parseClawd,
} from '../app/lib/clawd-pet.ts';

const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 9, 12);

test('stats drift with real time and never go below zero', () => {
  const pet = createClawd(T0);
  const later = advanceClawd(pet, T0 + 10 * HOUR);
  assert.equal(later.stats.hunger, 40);
  assert.ok(later.stats.mood < pet.stats.mood);
  const weekLater = advanceClawd(pet, T0 + 7 * 24 * HOUR);
  for (const value of Object.values(weekLater.stats)) assert.equal(value, 0);
  assert.equal(clawdState(weekLater), 'hungry');
});

test('sleeping refills energy and he wakes on his own when full', () => {
  let pet = createClawd(T0);
  pet = advanceClawd(pet, T0 + 20 * HOUR);
  assert.equal(clawdRefusal(pet, 'sleep'), null);
  pet = actClawd(pet, 'sleep', T0 + 20 * HOUR);
  assert.equal(pet.asleep, true);
  assert.match(clawdRefusal(pet, 'feed'), /睡觉/);
  const napping = advanceClawd(pet, T0 + 21 * HOUR);
  assert.equal(napping.asleep, true);
  const morning = advanceClawd(pet, T0 + 25 * HOUR);
  assert.equal(morning.asleep, false);
  assert.ok(morning.stats.energy > 95);
});

test('actions nudge stats and refuse when they make no sense', () => {
  let pet = advanceClawd(createClawd(T0), T0 + 8 * HOUR);
  const fed = actClawd(pet, 'feed', pet.updatedAt);
  assert.equal(fed.stats.hunger, Math.min(100, pet.stats.hunger + 28));
  const bathed = actClawd(fed, 'bath', fed.updatedAt);
  assert.equal(bathed.stats.clean, 100);
  assert.ok(clawdRefusal(bathed, 'bath'));
  pet = { ...pet, stats: { ...pet.stats, energy: 5 } };
  assert.ok(clawdRefusal(pet, 'play'));
  assert.deepEqual(actClawd(pet, 'play', pet.updatedAt).stats, pet.stats);
});

test('stored data is validated and a clock in the future is not trusted', () => {
  assert.equal(parseClawd(null, T0).bornAt, T0);
  assert.equal(parseClawd({ stats: { hunger: 'x' } }, T0).stats.hunger, 80);
  const restored = parseClawd({ ...createClawd(T0 - 3 * 24 * HOUR), updatedAt: T0 + HOUR, name: '  ' }, T0);
  assert.equal(restored.updatedAt, T0);
  assert.equal(restored.name, 'clawd');
  assert.equal(clawdAgeDays(restored, T0), 4);
});
