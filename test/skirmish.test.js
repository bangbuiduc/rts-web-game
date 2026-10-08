import assert from 'node:assert/strict';
import test from 'node:test';

import { readyToStrikeOnCommand } from '../src/game/combat.js';
import { engageableTargets, isForceAggressive } from '../src/game/enemyAI.js';
import {
  firstDeathMs,
  makeCombatant,
  runSkirmish,
  wipeMs,
} from '../src/game/skirmish.js';
import { ENEMY_OUTPOST_TILE } from '../src/game/world.js';

// Scenario-driven analysis of the real combat loop (see skirmish.js). These are
// both documentation of measured behaviour and regression guards: numbers are
// deterministic for the fixed 60 fps dt, so a rules/loop change that shifts
// time-to-kill or casualties fails loudly.

const clubman = (faction, id, tile = { x: 10, y: 10 }, targeting = 'focus') =>
  makeCombatant({ id: `${faction}-${id}`, faction, type: 'clubman', tile, targeting });

const blob = (faction, n, targeting = 'focus') =>
  Array.from({ length: n }, (_, i) => clubman(faction, i, { x: 10, y: 10 }, targeting));

// --- The cooldown-bypass fix (verified bug) ---------------------------------

test('readyToStrikeOnCommand only primes a fresh engagement, not a re-click', () => {
  // A new / idle unit commanded onto a target strikes without wind-up.
  assert.equal(readyToStrikeOnCommand(null, 7), true);
  assert.equal(readyToStrikeOnCommand({ type: 'move' }, 7), true);
  assert.equal(readyToStrikeOnCommand({ type: 'attack', targetId: 9, phase: 'attacking' }, 7), true);
  // Re-issuing the SAME target the unit is already meleeing must NOT re-prime
  // (otherwise click-spam resets attackElapsed and bypasses the cooldown).
  assert.equal(readyToStrikeOnCommand({ type: 'attack', targetId: 7, phase: 'attacking' }, 7), false);
  // Still approaching the same target: not yet meleeing, priming is fine.
  assert.equal(readyToStrikeOnCommand({ type: 'attack', targetId: 7, phase: 'approaching' }, 7), true);
});

test('focus fire respects the attack cooldown (no per-frame damage)', () => {
  // 1 Clubman vs a lone Outpost: damage must track the 900 ms cooldown, not the
  // 60 fps tick. Over ~1 s it can land at most 2 hits (primed t0 + one cooldown).
  const result = runSkirmish([
    clubman('player', 0, { x: 26, y: 26 }),
    makeCombatant({ id: 'outpost', faction: 'enemy', type: 'enemyOutpost', tile: { x: 26, y: 26 } }),
  ], { maxMs: 1000 });
  // 7 dmg * 2 hits = 14; a cooldown bypass would deal 7 * ~60 = hundreds.
  assert.equal(result.damageDealt.player, 14);
});

// --- Representative matchups: 2–3 vs 4 Clubmen ------------------------------

test('2 vs 4 Clubmen: the pair is wiped without trading a single kill', () => {
  const result = runSkirmish([...blob('player', 2), ...blob('enemy', 4)]);
  assert.equal(result.winner, 'enemy');
  assert.equal(result.casualties.player, 2);
  assert.equal(result.casualties.enemy, 0);
  // Fast, decisive: the pair falls in under 2.5 s.
  assert.ok(wipeMs(result, 'player') < 2500, `player wipe ${wipeMs(result, 'player')}ms`);
});

test('3 vs 4 Clubmen: three attackers trade for exactly one defender', () => {
  const result = runSkirmish([...blob('player', 3), ...blob('enemy', 4)]);
  assert.equal(result.winner, 'enemy');
  assert.equal(result.casualties.player, 3);
  assert.equal(result.casualties.enemy, 1);
  // The extra body stretches the fight out well past the 2v4 case.
  assert.ok(wipeMs(result, 'player') > 3500, `player wipe ${wipeMs(result, 'player')}ms`);
});

test('an even 4 vs 4 is decided by update order, not stats (first-strike artifact)', () => {
  // MapScene processes units in array order; a unit killed earlier in a tick
  // never retaliates that tick, so in a true mirror the first-listed side wins.
  // Documented as a determinism nuance, not a crash. In the live game enemy
  // raiders are spawned before player-trained Clubmen, so the tie-break favours
  // the garrison on simultaneous exchanges.
  const playerFirst = runSkirmish([...blob('player', 4), ...blob('enemy', 4)]);
  const enemyFirst = runSkirmish([...blob('enemy', 4), ...blob('player', 4)]);
  assert.equal(playerFirst.winner, 'player');
  assert.equal(enemyFirst.winner, 'enemy');
  assert.equal(playerFirst.casualties.enemy, 4);
  assert.equal(enemyFirst.casualties.player, 4);
});

// --- Faithfulness check against the archived victory log --------------------

test('4 Clubmen focus-firing one Raider kills it in ~1.8 s with no losses', () => {
  // Archived 2026-10-08-victory.json: from first contact (88878 ms) to the
  // Raider's death (90691 ms) was 1.81 s. The harness should land in that band.
  const result = runSkirmish([
    ...blob('player', 4),
    makeCombatant({ id: 'raider', faction: 'enemy', type: 'raider', tile: { x: 10, y: 10 }, targeting: 'nearest' }),
  ]);
  assert.equal(result.winner, 'player');
  assert.equal(result.casualties.player, 0);
  const ttk = wipeMs(result, 'enemy');
  assert.ok(ttk >= 1600 && ttk <= 2100, `raider TTK ${ttk}ms (log measured 1810ms)`);
});

// --- Outpost assault --------------------------------------------------------

test('5 Clubmen clear the Outpost + 2 Raiders and leave survivors', () => {
  const result = runSkirmish([
    ...Array.from({ length: 5 }, (_, i) => clubman('player', i, { x: 26, y: 26 })),
    makeCombatant({ id: 'outpost', faction: 'enemy', type: 'enemyOutpost', tile: { x: 26, y: 26 } }),
    makeCombatant({ id: 'r1', faction: 'enemy', type: 'raider', tile: { x: 26, y: 26 }, targeting: 'nearest' }),
    makeCombatant({ id: 'r2', faction: 'enemy', type: 'raider', tile: { x: 26, y: 26 }, targeting: 'nearest' }),
  ]);
  assert.equal(result.winner, 'player');
  assert.ok(result.survivors.player.length >= 3, `survivors ${result.survivors.player.length}`);
  assert.equal(result.casualties.enemy, 3);
  // A readable, decisive window, not an instant pop or a slog.
  assert.ok(result.elapsedMs >= 6000 && result.elapsedMs <= 14000, `assault ${result.elapsedMs}ms`);
});

// --- Delayed / defensive garrison response ----------------------------------

test('garrison stays defensive until provoked or the grace window elapses', () => {
  // A player force loitering outside the 6-tile guard radius is ignored while
  // calm, chased once the Outpost is hit (provoke) or the grace timer fires.
  const farAway = [{ tile: { x: 18, y: 18 }, hp: 55 }]; // ~11 tiles from the Outpost
  const defensive = engageableTargets(farAway, {
    aggressive: isForceAggressive({ elapsedMs: 10000 }),
    anchor: ENEMY_OUTPOST_TILE,
    guardRadius: 6,
  });
  assert.equal(defensive.length, 0, 'calm garrison ignores a distant force');

  const provoked = engageableTargets(farAway, {
    aggressive: isForceAggressive({ outpostDamaged: true, elapsedMs: 10000 }),
    anchor: ENEMY_OUTPOST_TILE,
    guardRadius: 6,
  });
  assert.equal(provoked.length, 1, 'a hit Outpost latches aggression and the force is chased');

  const timedOut = isForceAggressive({ elapsedMs: 90000 });
  assert.equal(timedOut, true, 'the 90 s grace window latches aggression on its own');
});

test('a 4-Clubman assault beats the defensive garrison but the counter-push bites', () => {
  // Player marches in from the economy side; raiders use the shipped garrison
  // priority + aggression stances. The player wins the objective, but the
  // counter-push is lethal — defending it matters (2 of 4 Clubmen fall).
  const combatants = [
    ...Array.from({ length: 4 }, (_, i) =>
      makeCombatant({ id: `c${i}`, faction: 'player', type: 'clubman', tile: { x: 20, y: 20 + i * 0.1 }, targeting: 'focus' })),
    makeCombatant({ id: 'outpost', faction: 'enemy', type: 'enemyOutpost', tile: { x: 26, y: 26 } }),
    makeCombatant({ id: 'r1', faction: 'enemy', type: 'raider', tile: { x: 25, y: 24 }, targeting: 'priority' }),
    makeCombatant({ id: 'r2', faction: 'enemy', type: 'raider', tile: { x: 27, y: 25 }, targeting: 'priority' }),
  ];
  const result = runSkirmish(combatants, {
    garrison: { anchor: ENEMY_OUTPOST_TILE, guardRadius: 6, graceMs: 90000 },
  });
  assert.equal(result.winner, 'player');
  assert.equal(result.casualties.enemy, 3, 'both Raiders and the Outpost fall');
  assert.ok(result.casualties.player >= 1, 'the counter-push costs the player at least one Clubman');
  assert.ok(firstDeathMs(result, 'player') !== null, 'the garrison fights back');
});
