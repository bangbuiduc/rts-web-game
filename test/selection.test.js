import assert from 'node:assert/strict';
import test from 'node:test';

import { isDragSelection, normalizeRect, rectContainsPoint } from '../src/game/selection.js';

test('normalizeRect orders corners regardless of drag direction', () => {
  assert.deepEqual(normalizeRect(10, 20, 4, 6), { minX: 4, minY: 6, maxX: 10, maxY: 20 });
});

test('rectContainsPoint includes the edges', () => {
  const rect = normalizeRect(0, 0, 10, 10);
  assert.equal(rectContainsPoint(rect, 5, 5), true);
  assert.equal(rectContainsPoint(rect, 10, 10), true);
  assert.equal(rectContainsPoint(rect, 11, 5), false);
});

test('isDragSelection distinguishes a marquee from a click', () => {
  assert.equal(isDragSelection(normalizeRect(0, 0, 2, 2)), false);
  assert.equal(isDragSelection(normalizeRect(0, 0, 20, 2)), true);
});
