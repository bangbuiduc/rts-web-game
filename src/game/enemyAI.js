import { tileDistance } from './combat.js';

// Enemy AI for the Outpost garrison. Every decision here is pure so it can be
// unit-tested without Phaser; the scene feeds it the live units/buildings and a
// small snapshot of world state each tick, then executes the returned orders.

// --- Tuning constants --------------------------------------------------------

/** Tiles from the Outpost the garrison defends while idle (no early rush). */
export const GUARD_RADIUS = 6;

/**
 * Milliseconds the garrison holds the Outpost before marching out on its own.
 * Long enough for the player to stand up a Stone Age economy and army first
 * (an assault is buildable in ~40 s), so holding is a choice, not a trap.
 */
export const AGGRO_GRACE_MS = 90000;

/**
 * Target priority tiers (lower number = engaged first). The garrison neutralises
 * the biggest threat (armed military) before crippling the economy (workers)
 * and finally razing buildings. Because buildings are a valid tier, once the
 * player army and workers are gone the force marches on the Town Center, which
 * is what makes the defeat condition actually reachable.
 */
export const TARGET_PRIORITY = {
  military: 0,
  worker: 1,
  building: 2,
};

const DEFAULT_PRIORITY = TARGET_PRIORITY.building;

/**
 * Classify a player entity into a priority tier.
 * Buildings carry `isBuilding`; gathering units expose a `capacity` > 0
 * (Villagers) and are treated as economy, everything else as military.
 */
export function playerTargetKind(entity) {
  if (entity?.isBuilding) return 'building';
  return (entity?.capacity ?? 0) > 0 ? 'worker' : 'military';
}

/** Numeric priority for an entity, derived from its tier. */
export function targetPriority(entity) {
  return TARGET_PRIORITY[playerTargetKind(entity)] ?? DEFAULT_PRIORITY;
}

/**
 * Latch the garrison into aggression. Triggers: the Outpost has taken damage
 * (the player opened hostilities), the grace period elapsed, or it was already
 * aggressive on a previous tick. Aggression never reverts — once provoked, the
 * raiders commit to the counter-push.
 */
export function isForceAggressive(state = {}, { graceMs = AGGRO_GRACE_MS } = {}) {
  const { latched = false, outpostDamaged = false, elapsedMs = 0 } = state;
  return Boolean(latched || outpostDamaged || elapsedMs >= graceMs);
}

/**
 * The player entities the garrison will engage this tick.
 * Defensive: only entities within `guardRadius` of the anchor (the Outpost).
 * Aggressive: the whole living roster, so the force can chase and march on the
 * base. Dead entities are always filtered out.
 */
export function engageableTargets(candidates = [], { aggressive = false, anchor, guardRadius = GUARD_RADIUS } = {}) {
  const alive = candidates.filter((candidate) => candidate && candidate.hp > 0);
  if (aggressive) return alive;
  return alive.filter((candidate) => tileDistance(candidate.tile ?? candidate, anchor) <= guardRadius);
}

/**
 * Pick the highest-value living target: lowest priority tier first, nearest as
 * the tie-breaker within a tier. Returns the chosen candidate or `null`.
 */
export function chooseTarget(origin, candidates = []) {
  let best = null;
  let bestPriority = Infinity;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (!candidate || candidate.hp <= 0) continue;
    const priority = targetPriority(candidate);
    const distance = tileDistance(origin, candidate.tile ?? candidate);
    if (priority < bestPriority || (priority === bestPriority && distance < bestDistance)) {
      best = candidate;
      bestPriority = priority;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Pick the nearest living target, ignoring priority tiers. Retained for callers
 * and tests that want pure proximity selection; `chooseTarget` supersedes it for
 * the garrison.
 */
export function chooseNearestTarget(origin, candidates = []) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (!candidate || candidate.hp <= 0) continue;
    const distance = tileDistance(origin, candidate.tile ?? candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
