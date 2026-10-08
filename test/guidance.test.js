import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RAID_PHASE,
  WARN_LEAD_MS,
  countdownSeconds,
  isEarlyProvoke,
  raidWarningMessage,
  raidWarningState,
} from '../src/game/guidance.js';
import { AGGRO_GRACE_MS } from '../src/game/enemyAI.js';

// --- Phase derivation --------------------------------------------------------

test('raidWarningState is calm well before the grace deadline', () => {
  const state = raidWarningState({ elapsedMs: 10000 });
  assert.equal(state.phase, RAID_PHASE.CALM);
  assert.equal(state.remainingMs, AGGRO_GRACE_MS - 10000);
});

test('raidWarningState warns once inside the lead window', () => {
  const justInside = AGGRO_GRACE_MS - WARN_LEAD_MS + 1;
  assert.equal(raidWarningState({ elapsedMs: justInside }).phase, RAID_PHASE.WARNING);
});

test('raidWarningState flips to warning exactly at the lead boundary', () => {
  const atBoundary = AGGRO_GRACE_MS - WARN_LEAD_MS;
  assert.equal(raidWarningState({ elapsedMs: atBoundary }).phase, RAID_PHASE.WARNING);
  assert.equal(raidWarningState({ elapsedMs: atBoundary - 1 }).phase, RAID_PHASE.CALM);
});

test('raidWarningState is active the instant aggression latches, skipping the warning', () => {
  // Player provokes the Outpost early: aggressive is true well before grace.
  const state = raidWarningState({ elapsedMs: 5000, aggressive: true });
  assert.equal(state.phase, RAID_PHASE.ACTIVE);
  assert.equal(state.remainingMs, 0);
});

test('raidWarningState is active once the grace deadline passes', () => {
  assert.equal(raidWarningState({ elapsedMs: AGGRO_GRACE_MS, aggressive: true }).phase, RAID_PHASE.ACTIVE);
});

test('raidWarningState clamps remaining time at zero and respects custom tuning', () => {
  assert.equal(raidWarningState({ elapsedMs: AGGRO_GRACE_MS + 9999 }).remainingMs, 0);
  const custom = raidWarningState({ elapsedMs: 40000, graceMs: 50000, warnLeadMs: 20000 });
  assert.equal(custom.phase, RAID_PHASE.WARNING);
  assert.equal(custom.remainingMs, 10000);
});

// --- Countdown ---------------------------------------------------------------

test('countdownSeconds rounds up and never drops below zero', () => {
  assert.equal(countdownSeconds(15000), 15);
  assert.equal(countdownSeconds(14001), 15);
  assert.equal(countdownSeconds(1), 1);
  assert.equal(countdownSeconds(0), 0);
  assert.equal(countdownSeconds(-500), 0);
});

// --- Early-provoke classification -------------------------------------------

test('isEarlyProvoke is true before grace and false at/after it', () => {
  assert.equal(isEarlyProvoke({ elapsedMs: 5000 }), true);
  assert.equal(isEarlyProvoke({ elapsedMs: AGGRO_GRACE_MS }), false);
  assert.equal(isEarlyProvoke({ elapsedMs: AGGRO_GRACE_MS + 1 }), false);
});

// --- Messages ----------------------------------------------------------------

test('raidWarningMessage is null while calm', () => {
  assert.equal(raidWarningMessage({ phase: RAID_PHASE.CALM }), null);
  assert.equal(raidWarningMessage({}), null);
});

test('raidWarningMessage embeds the live countdown in the warning', () => {
  const message = raidWarningMessage({ phase: RAID_PHASE.WARNING, remainingMs: 12300 });
  assert.match(message, /13s/);
  assert.match(message, /Raider/);
});

test('raidWarningMessage distinguishes a player provoke from the timed raid', () => {
  const provoked = raidWarningMessage({ phase: RAID_PHASE.ACTIVE, earlyProvoke: true });
  const timed = raidWarningMessage({ phase: RAID_PHASE.ACTIVE, earlyProvoke: false });
  assert.match(provoked, /khiêu chiến/);
  assert.match(timed, /bắt đầu tấn công/);
  assert.notEqual(provoked, timed);
});
