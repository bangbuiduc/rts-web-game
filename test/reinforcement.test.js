import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REINFORCE_CONCURRENT_MAX,
  REINFORCE_INTERVAL_MS,
  REINFORCE_MAX,
  reinforcementDecision,
} from '../src/game/reinforcement.js';
import { makeCombatant, runSkirmish } from '../src/game/skirmish.js';

// Pure, deterministic coverage of the bounded Outpost reinforcement rule plus a
// combat scenario regression proving the mechanic creates real pressure on a
// prepared defender while staying finite (no endless spawns).

// --- Gating ------------------------------------------------------------------

test('no reinforcement while the garrison is calm', () => {
  const decision = reinforcementDecision({
    aggressive: false,
    outpostAlive: true,
    elapsedMs: 120000,
    spawnedCount: 0,
    lastSpawnMs: null,
    livingEnemyUnits: 0,
  });
  assert.equal(decision.spawn, false);
  assert.equal(decision.reason, 'inactive');
});

test('no reinforcement once the Outpost is destroyed', () => {
  const decision = reinforcementDecision({
    aggressive: true,
    outpostAlive: false,
    elapsedMs: 120000,
    spawnedCount: 0,
    lastSpawnMs: null,
    livingEnemyUnits: 0,
  });
  assert.equal(decision.spawn, false);
  assert.equal(decision.reason, 'inactive');
});

test('no reinforcement while the garrison still has enough forces on the field', () => {
  // The two starting raiders are alive: reinforcement waits for attrition so it
  // tops up losses rather than stacking into a swarm.
  const decision = reinforcementDecision({
    aggressive: true,
    outpostAlive: true,
    elapsedMs: 120000,
    spawnedCount: 0,
    lastSpawnMs: null,
    livingEnemyUnits: REINFORCE_CONCURRENT_MAX + 1,
  });
  assert.equal(decision.spawn, false);
  assert.equal(decision.reason, 'force-sufficient');
});

// --- Pacing + caps -----------------------------------------------------------

test('the first reinforcement spawns as soon as forces run low (no initial cooldown)', () => {
  const decision = reinforcementDecision({
    aggressive: true,
    outpostAlive: true,
    elapsedMs: 95000,
    spawnedCount: 0,
    lastSpawnMs: null,
    livingEnemyUnits: 0,
  });
  assert.equal(decision.spawn, true);
  assert.equal(decision.wave, 1);
  assert.equal(decision.remaining, REINFORCE_MAX - 1);
});

test('reinforcements are spaced by the interval (no frame spam)', () => {
  const base = {
    aggressive: true,
    outpostAlive: true,
    spawnedCount: 1,
    lastSpawnMs: 100000,
    livingEnemyUnits: 0,
  };
  // One tick after a spawn: still cooling down.
  const tooSoon = reinforcementDecision({ ...base, elapsedMs: 100000 + 16 });
  assert.equal(tooSoon.spawn, false);
  assert.equal(tooSoon.reason, 'cooldown');
  // Just short of the interval.
  assert.equal(reinforcementDecision({ ...base, elapsedMs: 100000 + REINFORCE_INTERVAL_MS - 1 }).spawn, false);
  // At the interval it is allowed again.
  assert.equal(reinforcementDecision({ ...base, elapsedMs: 100000 + REINFORCE_INTERVAL_MS }).spawn, true);
});

test('the total cap stops reinforcement for good', () => {
  const decision = reinforcementDecision({
    aggressive: true,
    outpostAlive: true,
    elapsedMs: 300000,
    spawnedCount: REINFORCE_MAX,
    lastSpawnMs: 0,
    livingEnemyUnits: 0,
  });
  assert.equal(decision.spawn, false);
  assert.equal(decision.reason, 'cap-reached');
});

// --- Scenario: a long aggressive siege is bounded ----------------------------

test('a 5-minute aggressive siege spawns exactly REINFORCE_MAX raiders, correctly spaced', () => {
  // Model a relentless defender who clears every raider immediately, so the
  // concurrent ceiling never blocks and only the interval + total cap gate.
  const spawns = [];
  let spawnedCount = 0;
  let lastSpawnMs = null;
  let livingEnemyUnits = 2; // the two starting raiders are still up at aggression

  for (let t = 0; t <= 300000; t += 1000) {
    const decision = reinforcementDecision({
      aggressive: true,
      outpostAlive: true,
      elapsedMs: t,
      spawnedCount,
      lastSpawnMs,
      livingEnemyUnits,
    });
    if (decision.spawn) {
      spawns.push(t);
      spawnedCount += 1;
      lastSpawnMs = t;
    }
    // The defender clears the field each tick (worst case for spawn frequency).
    livingEnemyUnits = 0;
  }

  assert.equal(spawns.length, REINFORCE_MAX, 'endless spawns would overshoot the cap');
  for (let i = 1; i < spawns.length; i += 1) {
    assert.ok(
      spawns[i] - spawns[i - 1] >= REINFORCE_INTERVAL_MS,
      `spawn ${i} at ${spawns[i]}ms too close to ${spawns[i - 1]}ms`,
    );
  }
});

// --- Scenario regression: bounded reinforcement pressures a lone defender -----

// Fight a defending force through consecutive raider waves, carrying each
// survivor's remaining hp into the next engagement (fresh raider ids re-prime a
// clean engagement in the harness). Returns the final living defenders.
function defendAgainstWaves(defenderCount, waveCount) {
  const defenders = Array.from({ length: defenderCount }, (_, i) =>
    makeCombatant({ id: `c${i}`, faction: 'player', type: 'clubman', tile: { x: 10, y: 10 } }));
  let alive = defenders;
  for (let w = 0; w < waveCount && alive.length; w += 1) {
    const raider = makeCombatant({ id: `r${w}`, faction: 'enemy', type: 'raider', tile: { x: 10, y: 10 }, targeting: 'nearest' });
    const combatants = [...alive, raider];
    runSkirmish(combatants);
    alive = combatants.filter((c) => c.faction === 'player' && c.hp > 0);
  }
  return alive;
}

test('a lone defender survives one raider but the bounded reinforcement overwhelms it', () => {
  // One raider: the single Clubman holds (this is the "prepared defender is safe"
  // baseline the old static garrison allowed).
  assert.equal(defendAgainstWaves(1, 1).length, 1);
  // The full bounded reinforcement set is still finite, but a lone defender can
  // no longer coast — it is worn down and lost. Pressure, not an endless swarm.
  assert.equal(defendAgainstWaves(1, REINFORCE_MAX).length, 0);
});
