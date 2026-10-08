import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BUILDING_RULES,
  RESOURCE_TYPES,
  STARTING_POPULATION_CAP,
  STARTING_RESOURCES,
  UNIT_RULES,
} from '../src/game/rules.js';
import { ENEMY_UNITS, RESOURCE_NODES, STARTING_VILLAGERS } from '../src/game/world.js';

// These are balance *invariants*: they encode the economy-to-combat pace the
// vertical slice is tuned for, so a future tuning pass that breaks the arc
// (locks the player out, starves the economy, or makes the objective
// unwinnable) fails loudly instead of silently.

const dps = (rule) => rule.attackDamage / (rule.attackCooldown / 1000);
const sumNodeAmount = (resource) =>
  RESOURCE_NODES.filter((n) => n.resource === resource).reduce((s, n) => s + n.amount, 0);

// How many units the player can still add before hitting the population cap.
const availableSlots = STARTING_POPULATION_CAP - STARTING_VILLAGERS.length;

test('verified AoE1 costs are preserved by the balance pass', () => {
  // Guardrail for the one requirement that must never be "balanced" away.
  assert.equal(UNIT_RULES.villager.cost[RESOURCE_TYPES.FOOD], 50);
  assert.equal(UNIT_RULES.clubman.cost[RESOURCE_TYPES.FOOD], 50);
  assert.equal(BUILDING_RULES.barracks.cost[RESOURCE_TYPES.WOOD], 125);
});

test('the player can always afford the military path from the starting bank', () => {
  // Wood must cover a Barracks up front; otherwise the combat path is
  // unreachable unless trees happen to exist and get chopped first.
  assert.ok(
    STARTING_RESOURCES[RESOURCE_TYPES.WOOD] >= BUILDING_RULES.barracks.cost[RESOURCE_TYPES.WOOD],
    'starting wood should cover a Barracks',
  );
});

test('map food funds a full-population army beyond the starting bank', () => {
  // The economy phase must *matter*: the starting food bank alone should not
  // fill the population cap with Clubmen — gathering the bushes must be what
  // tops the army off.
  const clubmanFood = UNIT_RULES.clubman.cost[RESOURCE_TYPES.FOOD];
  const armyFood = availableSlots * clubmanFood;
  const startFood = STARTING_RESOURCES[RESOURCE_TYPES.FOOD];
  const mapFood = sumNodeAmount(RESOURCE_TYPES.FOOD);

  assert.ok(startFood < armyFood, 'starting food alone should not fund a full army');
  assert.ok(startFood + mapFood >= armyFood, 'bushes should top the army off to the cap');
});

test('every resource node is worth more than one villager trip', () => {
  // If a node held <= carry capacity the gather loop would be a single trip —
  // cosmetic rather than an economy. Each node should sustain several trips.
  const capacity = UNIT_RULES.villager.gatherCapacity;
  for (const node of RESOURCE_NODES) {
    assert.ok(node.amount > capacity, `${node.id} should outlast a single carry load`);
  }
});

test('reaching the combat phase stays snappy with no early enemy pressure', () => {
  // Barracks + a full roster of Clubmen should train in well under a minute so
  // the slice is immediately playable rather than a waiting simulator.
  const toCombatMs = BUILDING_RULES.barracks.buildTime + availableSlots * UNIT_RULES.clubman.trainTime;
  assert.ok(toCombatMs <= 40000, `reaching combat took ${toCombatMs}ms`);
});

test('a full Clubman army can clear the Outpost within a readable window', () => {
  const army = availableSlots; // player fills remaining slots with Clubmen
  const armyDps = army * dps(UNIT_RULES.clubman);
  const outpostHp = BUILDING_RULES.enemyOutpost.maxHp;
  const ttk = outpostHp / armyDps;

  // Not an instant pop, not a slog.
  assert.ok(ttk >= 3 && ttk <= 30, `Outpost time-to-kill was ${ttk.toFixed(1)}s`);
});

test('the Outpost assault is winnable and leaves survivors', () => {
  const army = availableSlots;
  const armyDps = army * dps(UNIT_RULES.clubman);
  const armyHp = army * UNIT_RULES.clubman.maxHp;

  const enemyHp =
    BUILDING_RULES.enemyOutpost.maxHp +
    ENEMY_UNITS.reduce((s, u) => s + UNIT_RULES[u.type].maxHp, 0);
  const raiderDps = ENEMY_UNITS.reduce((s, u) => s + dps(UNIT_RULES[u.type]), 0);

  // Time for the army to grind through the Outpost + raiders, and the damage
  // the raiders deal back over that window.
  const fightSeconds = enemyHp / armyDps;
  const damageTaken = raiderDps * fightSeconds;

  assert.ok(damageTaken < armyHp, 'the assault should survive the defenders');
});
