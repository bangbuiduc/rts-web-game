import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chooseNearestTarget,
  chooseTarget,
  engageableTargets,
  isForceAggressive,
  playerTargetKind,
  targetPriority,
  GUARD_RADIUS,
  AGGRO_GRACE_MS,
} from '../src/game/enemyAI.js';

test('chooseNearestTarget returns the closest living target', () => {
  const targets = [
    { id: 'far', tile: { x: 10, y: 10 }, hp: 40 },
    { id: 'near', tile: { x: 1, y: 0 }, hp: 40 },
  ];
  const chosen = chooseNearestTarget({ x: 0, y: 0 }, targets);
  assert.equal(chosen.id, 'near');
});

test('chooseNearestTarget skips dead targets', () => {
  const targets = [
    { id: 'dead', tile: { x: 1, y: 0 }, hp: 0 },
    { id: 'alive', tile: { x: 5, y: 0 }, hp: 20 },
  ];
  const chosen = chooseNearestTarget({ x: 0, y: 0 }, targets);
  assert.equal(chosen.id, 'alive');
});

test('chooseNearestTarget returns null when nothing is alive', () => {
  assert.equal(chooseNearestTarget({ x: 0, y: 0 }, []), null);
  assert.equal(chooseNearestTarget({ x: 0, y: 0 }, [{ tile: { x: 1, y: 1 }, hp: 0 }]), null);
});

// --- Target classification ---------------------------------------------------

test('playerTargetKind classifies buildings, workers, and military', () => {
  assert.equal(playerTargetKind({ isBuilding: true, hp: 480 }), 'building');
  assert.equal(playerTargetKind({ capacity: 5, hp: 40 }), 'worker');
  assert.equal(playerTargetKind({ capacity: 0, hp: 55 }), 'military');
  assert.equal(playerTargetKind({ hp: 55 }), 'military');
});

test('targetPriority ranks military over workers over buildings', () => {
  const military = targetPriority({ capacity: 0, hp: 55 });
  const worker = targetPriority({ capacity: 5, hp: 40 });
  const building = targetPriority({ isBuilding: true, hp: 480 });
  assert.ok(military < worker, 'military outranks workers');
  assert.ok(worker < building, 'workers outrank buildings');
});

// --- Priority target selection ----------------------------------------------

test('chooseTarget prefers a far military unit over a near worker', () => {
  const targets = [
    { id: 'worker', tile: { x: 1, y: 0 }, hp: 40, capacity: 5 },
    { id: 'clubman', tile: { x: 6, y: 0 }, hp: 55, capacity: 0 },
  ];
  assert.equal(chooseTarget({ x: 0, y: 0 }, targets).id, 'clubman');
});

test('chooseTarget prefers a worker over the Town Center building', () => {
  const targets = [
    { id: 'tc', tile: { x: 1, y: 0 }, hp: 480, isBuilding: true },
    { id: 'villager', tile: { x: 8, y: 0 }, hp: 40, capacity: 5 },
  ];
  assert.equal(chooseTarget({ x: 0, y: 0 }, targets).id, 'villager');
});

test('chooseTarget falls back to the building once units are gone', () => {
  const targets = [{ id: 'tc', tile: { x: 10, y: 0 }, hp: 480, isBuilding: true }];
  assert.equal(chooseTarget({ x: 0, y: 0 }, targets).id, 'tc');
});

test('chooseTarget breaks ties within a tier by distance', () => {
  const targets = [
    { id: 'far', tile: { x: 9, y: 0 }, hp: 55, capacity: 0 },
    { id: 'near', tile: { x: 2, y: 0 }, hp: 55, capacity: 0 },
  ];
  assert.equal(chooseTarget({ x: 0, y: 0 }, targets).id, 'near');
});

test('chooseTarget skips the dead and returns null when empty', () => {
  assert.equal(chooseTarget({ x: 0, y: 0 }, [{ tile: { x: 1, y: 0 }, hp: 0, capacity: 0 }]), null);
  assert.equal(chooseTarget({ x: 0, y: 0 }, []), null);
});

// --- Aggression state machine -----------------------------------------------

test('isForceAggressive holds while young, undamaged, and unlatched', () => {
  assert.equal(isForceAggressive({ latched: false, outpostDamaged: false, elapsedMs: 1000 }), false);
});

test('isForceAggressive triggers when the Outpost takes damage', () => {
  assert.equal(isForceAggressive({ outpostDamaged: true, elapsedMs: 0 }), true);
});

test('isForceAggressive triggers once the grace period elapses', () => {
  assert.equal(isForceAggressive({ elapsedMs: AGGRO_GRACE_MS }), true);
  assert.equal(isForceAggressive({ elapsedMs: AGGRO_GRACE_MS - 1 }), false);
});

test('isForceAggressive stays latched once provoked', () => {
  assert.equal(isForceAggressive({ latched: true, outpostDamaged: false, elapsedMs: 0 }), true);
});

// --- Engagement set by stance -----------------------------------------------

const anchor = { x: 26, y: 26 };

test('engageableTargets defends only within the guard radius while passive', () => {
  const candidates = [
    { id: 'near', tile: { x: 26, y: 26 + GUARD_RADIUS }, hp: 40 },
    { id: 'far', tile: { x: 26, y: 26 + GUARD_RADIUS + 2 }, hp: 40 },
  ];
  const engaged = engageableTargets(candidates, { aggressive: false, anchor });
  assert.deepEqual(engaged.map((c) => c.id), ['near']);
});

test('engageableTargets chases the whole roster once aggressive', () => {
  const candidates = [
    { id: 'near', tile: { x: 26, y: 26 }, hp: 40 },
    { id: 'base', tile: { x: 15, y: 15 }, hp: 480 },
  ];
  const engaged = engageableTargets(candidates, { aggressive: true, anchor });
  assert.deepEqual(engaged.map((c) => c.id), ['near', 'base']);
});

test('engageableTargets always drops the dead', () => {
  const candidates = [{ id: 'dead', tile: { x: 26, y: 26 }, hp: 0 }];
  assert.equal(engageableTargets(candidates, { aggressive: true, anchor }).length, 0);
  assert.equal(engageableTargets(candidates, { aggressive: false, anchor }).length, 0);
});
