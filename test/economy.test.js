import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addResource,
  canAfford,
  checkPurchase,
  hasPopulationRoom,
  populationUsed,
  subtractCost,
} from '../src/game/economy.js';

test('canAfford checks every resource in the cost', () => {
  assert.equal(canAfford({ food: 50, wood: 200 }, { food: 50 }), true);
  assert.equal(canAfford({ food: 49, wood: 200 }, { food: 50 }), false);
  assert.equal(canAfford({ food: 10, wood: 100 }, { wood: 125 }), false);
  assert.equal(canAfford({ food: 10 }, {}), true);
});

test('subtractCost returns a new map without mutating the original', () => {
  const resources = { food: 100, wood: 200 };
  const next = subtractCost(resources, { food: 50 });

  assert.deepEqual(next, { food: 50, wood: 200 });
  assert.deepEqual(resources, { food: 100, wood: 200 });
});

test('addResource accumulates onto an existing balance', () => {
  assert.deepEqual(addResource({ food: 10 }, 'food', 5), { food: 15 });
  assert.deepEqual(addResource({ food: 10 }, 'wood', 3), { food: 10, wood: 3 });
});

test('populationUsed and hasPopulationRoom respect the cap', () => {
  const units = [{ population: 1 }, { population: 1 }, { population: 0 }];
  assert.equal(populationUsed(units), 2);
  assert.equal(hasPopulationRoom(units, 4, 1), true);
  assert.equal(hasPopulationRoom(units, 2, 1), false);
});

test('checkPurchase reports the specific failure reason', () => {
  const units = [{ population: 1 }];

  assert.deepEqual(
    checkPurchase({ resources: { food: 50 }, cost: { food: 50 }, units, cap: 8, unitPopulation: 1 }),
    { ok: true, reason: null },
  );
  assert.deepEqual(
    checkPurchase({ resources: { food: 10 }, cost: { food: 50 }, units, cap: 8, unitPopulation: 1 }),
    { ok: false, reason: 'not-enough-resources' },
  );
  assert.deepEqual(
    checkPurchase({ resources: { food: 50 }, cost: { food: 50 }, units, cap: 1, unitPopulation: 1 }),
    { ok: false, reason: 'population-full' },
  );
});
