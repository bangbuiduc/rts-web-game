import assert from 'node:assert/strict';
import test from 'node:test';

import { createRallyPoint, rallyOrderForUnit } from '../src/game/rally.js';

test('createRallyPoint copies the tile and defaults to a plain move target', () => {
  const tile = { x: 4, y: 7 };
  const rally = createRallyPoint(tile);

  assert.deepEqual(rally, { tile: { x: 4, y: 7 }, nodeId: null, resource: null });
  tile.x = 99; // mutating the source must not change the stored rally point
  assert.equal(rally.tile.x, 4);
});

test('createRallyPoint records a resource node when given one', () => {
  const rally = createRallyPoint({ x: 1, y: 2 }, { nodeId: 'oak-east', resource: 'wood' });

  assert.equal(rally.nodeId, 'oak-east');
  assert.equal(rally.resource, 'wood');
});

test('createRallyPoint returns null without a tile', () => {
  assert.equal(createRallyPoint(null), null);
});

test('rallyOrderForUnit returns a move order for a ground rally point', () => {
  const rally = createRallyPoint({ x: 10, y: 12 });
  const order = rallyOrderForUnit(rally, { capacity: 5 });

  assert.deepEqual(order, { type: 'move', tile: { x: 10, y: 12 } });
});

test('rallyOrderForUnit sends a gatherer to a live resource node', () => {
  const rally = createRallyPoint({ x: 21, y: 13 }, { nodeId: 'oak-east', resource: 'wood' });
  const order = rallyOrderForUnit(rally, { capacity: 5 }, { nodeAmount: 12 });

  assert.deepEqual(order, { type: 'gather', nodeId: 'oak-east' });
});

test('rallyOrderForUnit falls back to a move when the node is depleted', () => {
  const rally = createRallyPoint({ x: 21, y: 13 }, { nodeId: 'oak-east', resource: 'wood' });
  const order = rallyOrderForUnit(rally, { capacity: 5 }, { nodeAmount: 0 });

  assert.deepEqual(order, { type: 'move', tile: { x: 21, y: 13 } });
});

test('rallyOrderForUnit moves non-gatherers even onto a resource node', () => {
  const rally = createRallyPoint({ x: 21, y: 13 }, { nodeId: 'oak-east', resource: 'wood' });
  const order = rallyOrderForUnit(rally, { capacity: 0 }, { nodeAmount: 12 });

  assert.deepEqual(order, { type: 'move', tile: { x: 21, y: 13 } });
});

test('rallyOrderForUnit returns null when there is no rally point', () => {
  assert.equal(rallyOrderForUnit(null, { capacity: 5 }), null);
});
