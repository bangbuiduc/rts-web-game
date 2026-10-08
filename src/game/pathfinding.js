const DIRECTIONS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const keyFor = ({ x, y }) => `${x},${y}`;
const heuristic = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const DEFAULT_CLEARANCE = 0.24;
const SAME_POINT_EPSILON = 0.001;

/** Return a shortest 4-way path, excluding the starting tile. */
export function findPath(start, goal, isWalkable = () => true) {
  if (!isWalkable(goal.x, goal.y)) return null;
  if (start.x === goal.x && start.y === goal.y) return [];

  const startKey = keyFor(start);
  const goalKey = keyFor(goal);
  const frontier = [{ ...start, key: startKey }];
  const cameFrom = new Map();
  const costSoFar = new Map([[startKey, 0]]);
  const estimatedTotal = new Map([[startKey, heuristic(start, goal)]]);
  const visited = new Set();

  while (frontier.length > 0) {
    let bestIndex = 0;
    for (let i = 1; i < frontier.length; i += 1) {
      if (estimatedTotal.get(frontier[i].key) < estimatedTotal.get(frontier[bestIndex].key)) {
        bestIndex = i;
      }
    }

    const current = frontier.splice(bestIndex, 1)[0];
    if (current.key === goalKey) {
      const path = [];
      let key = goalKey;
      while (key !== startKey) {
        path.push(key.split(',').map(Number));
        key = cameFrom.get(key);
      }
      return path.reverse().map(([x, y]) => ({ x, y }));
    }
    if (visited.has(current.key)) continue;
    visited.add(current.key);

    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      if (!isWalkable(next.x, next.y)) continue;

      const nextKey = keyFor(next);
      const nextCost = costSoFar.get(current.key) + 1;
      if (nextCost >= (costSoFar.get(nextKey) ?? Infinity)) continue;

      cameFrom.set(nextKey, current.key);
      costSoFar.set(nextKey, nextCost);
      estimatedTotal.set(nextKey, nextCost + heuristic(next, goal));
      if (!visited.has(nextKey)) frontier.push({ ...next, key: nextKey });
    }
  }

  return null;
}

/**
 * Return a direct or smoothed route in tile coordinates, excluding the start.
 * A* remains the fallback, while line-of-sight checks trim unnecessary corners.
 */
export function findNavigationPath(start, goal, isWalkable = () => true, options = {}) {
  if (!isWalkable(goal.x, goal.y)) return null;
  if (start.x === goal.x && start.y === goal.y) return [];

  if (hasLineOfSight(start, goal, isWalkable, options)) return [{ ...goal }];

  const gridPath = findPath(start, goal, isWalkable);
  if (!gridPath) return null;

  return smoothPath([start, ...gridPath], isWalkable, options).slice(1);
}

/**
 * Return a smoothed route from an exact tile-space point.
 * This is useful while a unit is between tile centers: the first waypoint is
 * guaranteed to be visible from the actual current point, not a stale tile.
 */
export function findNavigationPathFromPoint(start, goal, isWalkable = () => true, options = {}) {
  if (!isWalkable(goal.x, goal.y)) return null;
  if (distanceBetween(start, goal) <= SAME_POINT_EPSILON) return [];

  if (hasLineOfSight(start, goal, isWalkable, options)) return [{ ...goal }];

  let bestPath = null;
  let bestDistance = Infinity;
  const anchors = collectStartAnchors(start, goal, isWalkable, options);

  for (const anchor of anchors) {
    if (!isWalkable(anchor.x, anchor.y)) continue;
    if (!hasLineOfSight(start, anchor, isWalkable, options)) continue;

    const tail = findNavigationPath(anchor, goal, isWalkable, options);
    if (!tail) continue;

    const waypoints = distanceBetween(start, anchor) <= SAME_POINT_EPSILON
      ? tail
      : [{ ...anchor }, ...tail];
    const smoothed = smoothPath([start, ...waypoints], isWalkable, options).slice(1);
    const travelDistance = pathTravelDistance(start, smoothed);

    if (travelDistance < bestDistance) {
      bestDistance = travelDistance;
      bestPath = smoothed;
    }
  }

  return bestPath;
}

export function smoothPath(points, isWalkable = () => true, options = {}) {
  if (points.length <= 2) return points.map((point) => ({ ...point }));

  const smoothed = [{ ...points[0] }];
  let anchorIndex = 0;

  while (anchorIndex < points.length - 1) {
    let nextIndex = anchorIndex + 1;
    for (let candidateIndex = points.length - 1; candidateIndex > anchorIndex; candidateIndex -= 1) {
      if (hasLineOfSight(points[anchorIndex], points[candidateIndex], isWalkable, options)) {
        nextIndex = candidateIndex;
        break;
      }
    }

    smoothed.push({ ...points[nextIndex] });
    anchorIndex = nextIndex;
  }

  return smoothed;
}

export function hasLineOfSight(start, goal, isWalkable = () => true, options = {}) {
  if (!isWalkable(start.x, start.y) || !isWalkable(goal.x, goal.y)) return false;

  const clearance = options.clearance ?? DEFAULT_CLEARANCE;
  const minX = Math.floor(Math.min(start.x, goal.x) - clearance - 1);
  const maxX = Math.ceil(Math.max(start.x, goal.x) + clearance + 1);
  const minY = Math.floor(Math.min(start.y, goal.y) - clearance - 1);
  const maxY = Math.ceil(Math.max(start.y, goal.y) + clearance + 1);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (isWalkable(x, y)) continue;

      const inflatedTile = {
        minX: x - 0.5 - clearance,
        maxX: x + 0.5 + clearance,
        minY: y - 0.5 - clearance,
        maxY: y + 0.5 + clearance,
      };
      if (segmentIntersectsRect(start, goal, inflatedTile)) return false;
    }
  }

  return true;
}

export function pathTravelDistance(start, path) {
  let distance = 0;
  let previous = start;
  for (const point of path) {
    distance += distanceBetween(previous, point);
    previous = point;
  }
  return distance;
}

function collectStartAnchors(start, goal, isWalkable, options) {
  const anchors = new Map();
  const addAnchor = (point) => {
    const anchor = { x: Math.round(point.x), y: Math.round(point.y) };
    anchors.set(keyFor(anchor), anchor);
  };

  addAnchor(start);
  addAnchor(goal);
  for (const candidate of options.startCandidates ?? []) addAnchor(candidate);

  // Only nearby centers can improve the first segment. Scanning every tile
  // would rerun A* hundreds of times for each click on a larger map.
  const bounds = options.bounds;
  const minX = Math.max(bounds?.minX ?? -Infinity, Math.floor(start.x) - 2);
  const maxX = Math.min(bounds?.maxX ?? Infinity, Math.ceil(start.x) + 2);
  const minY = Math.max(bounds?.minY ?? -Infinity, Math.floor(start.y) - 2);
  const maxY = Math.min(bounds?.maxY ?? Infinity, Math.ceil(start.y) + 2);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (isWalkable(x, y)) anchors.set(keyFor({ x, y }), { x, y });
    }
  }

  return [...anchors.values()];
}

function distanceBetween(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function segmentIntersectsRect(start, goal, rect) {
  let entry = 0;
  let exit = 1;
  const dx = goal.x - start.x;
  const dy = goal.y - start.y;

  const xRange = clipSegmentAxis(start.x, dx, rect.minX, rect.maxX, entry, exit);
  if (!xRange) return false;
  entry = xRange.entry;
  exit = xRange.exit;

  const yRange = clipSegmentAxis(start.y, dy, rect.minY, rect.maxY, entry, exit);
  return Boolean(yRange);
}

function clipSegmentAxis(origin, direction, min, max, entry, exit) {
  if (Math.abs(direction) < Number.EPSILON) {
    return origin >= min && origin <= max ? { entry, exit } : null;
  }

  const inverse = 1 / direction;
  let near = (min - origin) * inverse;
  let far = (max - origin) * inverse;
  if (near > far) [near, far] = [far, near];

  const nextEntry = Math.max(entry, near);
  const nextExit = Math.min(exit, far);
  if (nextEntry > nextExit) return null;
  return { entry: nextEntry, exit: nextExit };
}
