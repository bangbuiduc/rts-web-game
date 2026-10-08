// Pure onboarding + raid-warning logic. No Phaser, no DOM. The scene feeds it
// the live match clock and the garrison's aggression latch — the SAME state the
// enemy AI acts on (see enemyAI.js `isForceAggressive`) — so the warning can
// never drift out of sync with the actual raid trigger. This module only
// derives the current phase and its message; the scene owns announcing the
// transitions and drawing the DOM.

import { AGGRO_GRACE_MS } from './enemyAI.js';

/**
 * Lead time before the grace deadline that the player is warned. Long enough to
 * reposition units and brace the base, short enough to stay tense. Expressed as
 * a fraction of the grace window so retuning the grace period keeps the lead
 * proportional, but never shorter than a hard floor.
 */
export const WARN_LEAD_MS = 15000;

export const RAID_PHASE = {
  CALM: 'calm',
  WARNING: 'warning',
  ACTIVE: 'active',
};

/**
 * Derive the current raid phase from live game state.
 * - `active`  : the garrison is aggressive now (grace elapsed OR player provoked
 *               the Outpost). Reading the live latch means an early provoke
 *               short-circuits straight past the warning, exactly as the AI does.
 * - `warning` : the raid is still pending but within the lead window.
 * - `calm`    : the raid is still pending and outside the lead window.
 * `remainingMs` is the clamped time left until the automatic (grace) raid.
 */
export function raidWarningState({
  elapsedMs = 0,
  aggressive = false,
  graceMs = AGGRO_GRACE_MS,
  warnLeadMs = WARN_LEAD_MS,
} = {}) {
  if (aggressive) {
    return { phase: RAID_PHASE.ACTIVE, remainingMs: 0 };
  }
  const remainingMs = Math.max(0, graceMs - elapsedMs);
  const phase = remainingMs <= warnLeadMs ? RAID_PHASE.WARNING : RAID_PHASE.CALM;
  return { phase, remainingMs };
}

/**
 * Whole seconds remaining, rounded up so the countdown never shows 0 while the
 * raid is still pending.
 */
export function countdownSeconds(remainingMs = 0) {
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

/**
 * Was aggression latched before the grace deadline? If so the player opened
 * hostilities on the Outpost (an early provoke) rather than being ground down by
 * the automatic raid. Lets the active message explain *why* the raid started.
 */
export function isEarlyProvoke({ elapsedMs = 0, graceMs = AGGRO_GRACE_MS } = {}) {
  return elapsedMs < graceMs;
}

/**
 * User-facing message for the current phase, or `null` when nothing should be
 * shown (calm). Strings are Vietnamese to match the rest of the UI.
 */
export function raidWarningMessage({ phase, remainingMs = 0, earlyProvoke = false } = {}) {
  if (phase === RAID_PHASE.WARNING) {
    return `⚠ Raider sắp tấn công trong ${countdownSeconds(remainingMs)}s! Chuẩn bị phòng thủ.`;
  }
  if (phase === RAID_PHASE.ACTIVE) {
    return earlyProvoke
      ? '⚔ Raider phản công! Bạn đã khiêu chiến Outpost.'
      : '⚔ Raider bắt đầu tấn công! Bảo vệ Town Center.';
  }
  return null;
}
