// Pure, bounded Outpost reinforcement logic. No Phaser, no DOM. The scene feeds
// it the live aggression latch, match clock, and current enemy headcount each
// tick; this module only decides whether a single reinforcement should spawn.
// The scene owns spawning (via the existing addUnit path) and logging.
//
// Design goals (Phase 4 P1): create *pressure* on a prepared defender without
// endless spawns. Three independent bounds guarantee that:
//   1. a hard total cap (REINFORCE_MAX) — the siege is finite,
//   2. a minimum interval between spawns (no frame spam, paced pressure),
//   3. a concurrent-force ceiling — reinforcements only top the garrison back
//      up after attrition, so they never stack into a swarm.
// Reinforcement is also gated behind an *alive Outpost* and the *aggressive*
// stance (see enemyAI.js `isForceAggressive`), so it begins only once the raid
// is actually on — exactly when a defender who held the initial push would
// otherwise be safe.

/** Maximum reinforcement raiders the Outpost will ever send in a match. */
export const REINFORCE_MAX = 3;

/** Minimum ms between reinforcement spawns (paces pressure, prevents spam). */
export const REINFORCE_INTERVAL_MS = 18000;

/**
 * Spawn only while living enemy units are at or below this count, so a
 * reinforcement replaces losses rather than compounding an existing force.
 */
export const REINFORCE_CONCURRENT_MAX = 1;

/**
 * Decide whether to spawn one reinforcement this tick.
 *
 * @param {object} state
 * @param {boolean} state.aggressive        Garrison aggression latch (enemyAI).
 * @param {boolean} state.outpostAlive       The Outpost still stands.
 * @param {number}  state.elapsedMs          Match-elapsed clock.
 * @param {number}  state.spawnedCount        Reinforcements already sent.
 * @param {?number} state.lastSpawnMs         Elapsed ms of the last spawn (null = none yet).
 * @param {number}  state.livingEnemyUnits    Current living enemy unit count.
 * @param {object}  [options]                 Tuning overrides (for tests).
 * @returns {{ spawn: boolean, reason: string, wave?: number, remaining?: number }}
 */
export function reinforcementDecision({
  aggressive = false,
  outpostAlive = false,
  elapsedMs = 0,
  spawnedCount = 0,
  lastSpawnMs = null,
  livingEnemyUnits = 0,
} = {}, {
  maxTotal = REINFORCE_MAX,
  intervalMs = REINFORCE_INTERVAL_MS,
  concurrentMax = REINFORCE_CONCURRENT_MAX,
} = {}) {
  if (!outpostAlive || !aggressive) return { spawn: false, reason: 'inactive' };
  if (spawnedCount >= maxTotal) return { spawn: false, reason: 'cap-reached' };
  if (livingEnemyUnits > concurrentMax) return { spawn: false, reason: 'force-sufficient' };
  if (lastSpawnMs != null && elapsedMs - lastSpawnMs < intervalMs) {
    return { spawn: false, reason: 'cooldown' };
  }
  const wave = spawnedCount + 1;
  return { spawn: true, reason: 'reinforce', wave, remaining: maxTotal - wave };
}
