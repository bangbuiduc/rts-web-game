import assert from 'node:assert/strict';
import test from 'node:test';

import { applyDamage, isWithinRange, tileDistance } from '../src/game/combat.js';

test('tileDistance measures straight-line tile distance', () => {
  assert.equal(tileDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(tileDistance({ x: 2, y: 2 }, { x: 2, y: 2 }), 0);
});

test('isWithinRange respects the melee reach', () => {
  assert.equal(isWithinRange({ x: 0, y: 0 }, { x: 1, y: 0 }, 1.1), true);
  assert.equal(isWithinRange({ x: 0, y: 0 }, { x: 2, y: 0 }, 1.1), false);
});

test('applyDamage clamps at zero and flags a kill', () => {
  assert.deepEqual(applyDamage(40, 7), { hp: 33, dead: false });
  assert.deepEqual(applyDamage(5, 7), { hp: 0, dead: true });
  assert.deepEqual(applyDamage(7, 7), { hp: 0, dead: true });
});
