import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deliverResourceLoad,
  deliverWoodLoad,
  gatherResourceTick,
  harvestWoodTick,
} from '../src/game/resourceLoop.js';

test('harvestWoodTick moves one wood from tree to carried load', () => {
  const next = harvestWoodTick({ treeWood: 7, woodCarried: 0, carryCapacity: 3 });

  assert.deepEqual(next, {
    treeWood: 6,
    woodCarried: 1,
    harvested: true,
    treeDepleted: false,
    shouldReturn: false,
  });
});

test('harvestWoodTick marks a full load ready to return', () => {
  const next = harvestWoodTick({ treeWood: 5, woodCarried: 2, carryCapacity: 3 });

  assert.equal(next.treeWood, 4);
  assert.equal(next.woodCarried, 3);
  assert.equal(next.shouldReturn, true);
  assert.equal(next.treeDepleted, false);
});

test('harvestWoodTick marks tree depletion ready to return', () => {
  const next = harvestWoodTick({ treeWood: 1, woodCarried: 0, carryCapacity: 3 });

  assert.equal(next.treeWood, 0);
  assert.equal(next.woodCarried, 1);
  assert.equal(next.shouldReturn, true);
  assert.equal(next.treeDepleted, true);
});

test('deliverWoodLoad stores carried wood and resumes when the tree remains', () => {
  const next = deliverWoodLoad({ woodStored: 6, woodCarried: 3, treeWood: 4 });

  assert.deepEqual(next, {
    woodStored: 9,
    woodCarried: 0,
    delivered: 3,
    shouldResumeHarvest: true,
  });
});

test('deliverWoodLoad finishes the order when the tree is depleted', () => {
  const next = deliverWoodLoad({ woodStored: 2, woodCarried: 1, treeWood: 0 });

  assert.equal(next.woodStored, 3);
  assert.equal(next.woodCarried, 0);
  assert.equal(next.shouldResumeHarvest, false);
});

test('gatherResourceTick works for Food bushes the same way as Wood', () => {
  const next = gatherResourceTick({ nodeAmount: 5, carried: 0, capacity: 3 });

  assert.deepEqual(next, {
    nodeAmount: 4,
    carried: 1,
    gathered: true,
    nodeDepleted: false,
    shouldReturn: false,
  });
});

test('gatherResourceTick signals a full load ready to return', () => {
  const next = gatherResourceTick({ nodeAmount: 8, carried: 2, capacity: 3 });

  assert.equal(next.carried, 3);
  assert.equal(next.shouldReturn, true);
});

test('deliverResourceLoad banks the carried load and reports resume state', () => {
  assert.deepEqual(deliverResourceLoad({ stored: 10, carried: 3, nodeAmount: 4 }), {
    stored: 13,
    carried: 0,
    delivered: 3,
    shouldResumeGather: true,
  });
  assert.equal(deliverResourceLoad({ stored: 10, carried: 3, nodeAmount: 0 }).shouldResumeGather, false);
});
