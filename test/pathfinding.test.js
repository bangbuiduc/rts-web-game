import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findNavigationPath,
  findNavigationPathFromPoint,
  findPath,
  hasLineOfSight,
  pathTravelDistance,
} from '../src/game/pathfinding.js';

const boundedGrid = (width, height, blocked = new Set()) => (x, y) => (
  x >= 0 && y >= 0 && x < width && y < height && !blocked.has(`${x},${y}`)
);

test('findPath returns a shortest four-way route on open ground', () => {
  const path = findPath({ x: 0, y: 0 }, { x: 2, y: 1 }, boundedGrid(4, 4));

  assert.deepEqual(path, [
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 1 },
  ]);
});

test('findPath detours around blocked tiles', () => {
  const blocked = new Set(['1,1', '2,1', '3,1']);
  const path = findPath({ x: 0, y: 1 }, { x: 4, y: 1 }, boundedGrid(5, 3, blocked));

  assert.equal(path.length, 6);
  assert.deepEqual(path.at(-1), { x: 4, y: 1 });
  assert.equal(path.some((tile) => blocked.has(`${tile.x},${tile.y}`)), false);
});

test('findPath returns null when the goal cannot be reached', () => {
  const blocked = new Set(['1,0', '0,1', '1,1']);
  const path = findPath({ x: 0, y: 0 }, { x: 2, y: 0 }, boundedGrid(3, 3, blocked));

  assert.equal(path, null);
});

test('findNavigationPath moves directly along a clear diagonal', () => {
  const path = findNavigationPath(
    { x: 0, y: 0 },
    { x: 4, y: 3 },
    boundedGrid(6, 6),
    { clearance: 0.24 },
  );

  assert.deepEqual(path, [{ x: 4, y: 3 }]);
});

test('findNavigationPath detours around an obstacle without clipping corners', () => {
  const blocked = new Set(['2,2']);
  const isWalkable = boundedGrid(5, 5, blocked);
  const start = { x: 0, y: 0 };
  const goal = { x: 4, y: 4 };
  const options = { clearance: 0.24 };
  const path = findNavigationPath(start, goal, isWalkable, options);

  assert.ok(path.length > 1);
  assert.deepEqual(path.at(-1), goal);
  assert.equal(path.some((tile) => blocked.has(`${tile.x},${tile.y}`)), false);

  const points = [start, ...path];
  for (let index = 1; index < points.length; index += 1) {
    assert.equal(hasLineOfSight(points[index - 1], points[index], isWalkable, options), true);
  }
  assert.equal(hasLineOfSight(start, goal, isWalkable, options), false);
});

test('hasLineOfSight rejects a route that would clip an obstacle corner', () => {
  const blocked = new Set(['1,1']);
  const isWalkable = boundedGrid(4, 4, blocked);

  assert.equal(
    hasLineOfSight({ x: 1, y: 0 }, { x: 2, y: 1 }, isWalkable, { clearance: 0.24 }),
    false,
  );
});

test('findNavigationPathFromPoint avoids unsafe first segment when retargeting mid-route', () => {
  const blocked = new Set(['1,1']);
  const isWalkable = boundedGrid(4, 4, blocked);
  const options = { clearance: 0.24, bounds: { minX: 0, minY: 0, maxX: 3, maxY: 3 } };
  const actualStart = { x: 0.5, y: 0 };
  const staleTile = { x: 0, y: 0 };
  const goal = { x: 0, y: 1 };
  const stalePath = findNavigationPath(staleTile, goal, isWalkable, options);

  assert.equal(hasLineOfSight(actualStart, stalePath[0], isWalkable, options), false);

  const path = findNavigationPathFromPoint(actualStart, goal, isWalkable, {
    ...options,
    startCandidates: [staleTile],
  });

  assert.deepEqual(path, [staleTile, goal]);
  const points = [actualStart, ...path];
  for (let index = 1; index < points.length; index += 1) {
    assert.equal(hasLineOfSight(points[index - 1], points[index], isWalkable, options), true);
  }
});

test('pathTravelDistance measures actual tile-space travel length', () => {
  const start = { x: 0.5, y: 0 };
  const shortPath = [{ x: 1, y: 0 }];
  const longPath = [{ x: 0, y: 0 }, { x: 0, y: 1 }];

  assert.equal(pathTravelDistance(start, shortPath), 0.5);
  assert.ok(pathTravelDistance(start, shortPath) < pathTravelDistance(start, longPath));
});
