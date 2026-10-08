import { TILE_HEIGHT, TILE_WIDTH } from './map.js';
import { UNIT_RULES, BUILDING_RULES } from './rules.js';
import { applyDamage, tileDistance } from './combat.js';
import { chooseNearestTarget, chooseTarget, engageableTargets, isForceAggressive } from './enemyAI.js';

// Deterministic, Phaser-free melee skirmish simulator. It reproduces the exact
// combat loop MapScene runs each frame so scenario tests can quantify
// time-to-kill and casualties from the *real* rules, not paper DPS math:
//   - units approach until within attackRange (tileDistance),
//   - a fresh engagement is primed to strike with no wind-up (MapScene sets
//     attackElapsed = attackCooldown in onArrive/commandAttack),
//   - thereafter damage lands once attackElapsed accumulates past the cooldown
//     (one hit per tick, like progressAttack),
//   - applyDamage/kill/prune and the garrison target-priority + aggression
//     stances come from the shipped combat.js / enemyAI.js modules.
//
// Limitation: MapScene moves sprites in screen-pixel space (speed is px/s) while
// range checks are in tile space. Isometric projection makes tile speed
// direction-dependent; the harness approximates it with one constant derived
// from a cardinal tile step. Approach distance therefore carries ~isometric
// error — keep scenarios in contact (distance <= range) when measuring pure
// combat TTK, and treat approach-phase numbers as indicative, not exact.

/** Screen px spanned by one cardinal (axis-aligned) tile step. */
export const SCREEN_PX_PER_TILE = Math.hypot(TILE_WIDTH / 2, TILE_HEIGHT / 2);

const FRAME_MS = 1000 / 60;

/** Build a combatant from the shipped rules. `type` is a unit or building key. */
export function makeCombatant({ id, faction, type, tile, targeting }) {
  const rule = UNIT_RULES[type] ?? BUILDING_RULES[type];
  if (!rule) throw new Error(`Unknown combatant type: ${type}`);
  return {
    id,
    faction,
    type,
    isBuilding: type in BUILDING_RULES,
    tile: { x: tile.x, y: tile.y },
    hp: rule.maxHp,
    maxHp: rule.maxHp,
    capacity: rule.gatherCapacity ?? 0,
    attackDamage: rule.attackDamage ?? 0,
    attackCooldown: rule.attackCooldown ?? 1000,
    attackRange: rule.attackRange ?? 1,
    speed: rule.speed ?? 0,
    attackElapsed: 0,
    targetId: null,
    engagedId: null,
    // 'focus' = disciplined focus fire (lowest id, commit until dead),
    // 'nearest' = proximity, 'priority' = garrison tier priority.
    targeting: targeting ?? (faction === 'enemy' ? 'nearest' : 'focus'),
  };
}

function livingEnemies(combatants, self) {
  return combatants.filter((c) => c.faction !== self.faction && c.hp > 0);
}

function selectTarget(self, pool) {
  if (!pool.length) return null;
  if (self.targeting === 'priority') return chooseTarget(self.tile, pool);
  if (self.targeting === 'nearest') return chooseNearestTarget(self.tile, pool);
  // focus: lowest id, deterministic.
  return pool.reduce((best, c) => (best && best.id <= c.id ? best : c), null);
}

function moveToward(self, goal, dtMs) {
  const dx = goal.x - self.tile.x;
  const dy = goal.y - self.tile.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return;
  const step = (self.speed / SCREEN_PX_PER_TILE) * (dtMs / 1000);
  if (step >= distance) {
    self.tile = { x: goal.x, y: goal.y };
  } else {
    self.tile = { x: self.tile.x + (dx / distance) * step, y: self.tile.y + (dy / distance) * step };
  }
}

/**
 * Run a skirmish to completion. Returns measured outcome: winner, duration,
 * survivors (with remaining hp), casualties, per-faction damage, and a kill
 * timeline. Deterministic for a given input (fixed dt, stable tie-breaks).
 */
export function runSkirmish(combatants, { dtMs = FRAME_MS, maxMs = 180000, garrison = null } = {}) {
  const byId = (id) => combatants.find((c) => c.id === id) ?? null;
  const kills = [];
  const damageDealt = {};
  let elapsed = 0;
  let aggressive = false;

  const sideAlive = (faction) => combatants.some((c) => c.faction === faction && c.hp > 0);
  const factions = [...new Set(combatants.map((c) => c.faction))];

  while (elapsed < maxMs && factions.every(sideAlive)) {
    elapsed += dtMs;

    if (garrison) {
      const outpostDamaged = combatants.some((c) => c.faction === 'enemy' && c.isBuilding && c.hp < c.maxHp);
      aggressive = isForceAggressive(
        { latched: aggressive, outpostDamaged, elapsedMs: elapsed },
        { graceMs: garrison.graceMs },
      );
    }

    for (const self of combatants) {
      if (self.hp <= 0 || self.attackDamage <= 0) continue;

      let pool = livingEnemies(combatants, self);
      if (garrison && self.faction === 'enemy') {
        pool = engageableTargets(pool, {
          aggressive,
          anchor: garrison.anchor,
          guardRadius: garrison.guardRadius,
        });
      }

      let target = byId(self.targetId);
      const committed = target && target.hp > 0 && pool.includes(target);
      if (!committed) {
        target = selectTarget(self, pool);
        self.targetId = target?.id ?? null;
        self.engagedId = null;
      }
      if (!target) continue;

      const distance = tileDistance(self.tile, target.tile);
      if (distance > self.attackRange + 0.05) {
        moveToward(self, target.tile, dtMs);
        self.engagedId = null;
        continue;
      }

      if (self.engagedId !== target.id) {
        // Fresh engagement strikes without wind-up (matches MapScene).
        self.attackElapsed = self.attackCooldown;
        self.engagedId = target.id;
      }
      self.attackElapsed += dtMs;
      if (self.attackElapsed >= self.attackCooldown) {
        self.attackElapsed -= self.attackCooldown;
        const result = applyDamage(target.hp, self.attackDamage);
        target.hp = result.hp;
        damageDealt[self.faction] = (damageDealt[self.faction] ?? 0) + self.attackDamage;
        if (result.dead) {
          kills.push({ ms: elapsed, id: target.id, type: target.type, faction: target.faction });
        }
      }
    }
  }

  const survivorsOf = (faction) =>
    combatants
      .filter((c) => c.faction === faction && c.hp > 0)
      .map((c) => ({ id: c.id, type: c.type, hp: c.hp, maxHp: c.maxHp }));
  const survivors = Object.fromEntries(factions.map((f) => [f, survivorsOf(f)]));
  const casualties = Object.fromEntries(
    factions.map((f) => [f, combatants.filter((c) => c.faction === f).length - survivors[f].length]),
  );

  const alive = factions.filter(sideAlive);
  let winner = 'draw';
  if (elapsed >= maxMs && alive.length > 1) winner = 'timeout';
  else if (alive.length === 1) [winner] = alive;

  return { winner, elapsedMs: elapsed, survivors, casualties, kills, damageDealt };
}

/** Elapsed ms of the first kill against `faction` (null if none died). */
export function firstDeathMs(result, faction) {
  const death = result.kills.find((k) => k.faction === faction);
  return death ? death.ms : null;
}

/** Elapsed ms at which every member of `faction` was dead (null if any survived). */
export function wipeMs(result, faction) {
  const deaths = result.kills.filter((k) => k.faction === faction);
  if (!deaths.length || result.survivors[faction]?.length) return null;
  return Math.max(...deaths.map((k) => k.ms));
}
