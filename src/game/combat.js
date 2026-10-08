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

/**
 * Should a melee unit be primed to strike immediately when an attack command is
 * issued while already in range?
 *
 * A *fresh* engagement strikes without wind-up (the unit has been walking/idle,
 * so a full cooldown has effectively already elapsed). But re-issuing the attack
 * against the SAME target the unit is already meleeing must NOT re-prime the
 * cooldown — otherwise click-spamming the attack order resets `attackElapsed`
 * every click and the unit fires every frame, bypassing `attackCooldown`.
 *
 * `prevOrder` is the unit's order *before* the new command is applied.
 */
export function readyToStrikeOnCommand(prevOrder, targetId) {
  const continuing = prevOrder?.type === 'attack'
    && prevOrder.targetId === targetId
    && prevOrder.phase === 'attacking';
  return !continuing;
}
