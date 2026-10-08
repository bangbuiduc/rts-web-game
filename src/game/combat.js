// Pure combat math shared by the player units and the enemy AI.

/** Straight-line distance between two tile-space points. */
export function tileDistance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** True when `b` sits within `range` tiles of `a`. */
export function isWithinRange(a, b, range) {
  return tileDistance(a, b) <= range;
}

/** Apply `damage` to `hp`, clamped at zero. Returns the new hp and a kill flag. */
export function applyDamage(hp, damage) {
  const next = Math.max(0, hp - damage);
  return { hp: next, dead: next <= 0 };
}
