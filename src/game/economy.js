// Pure resource-economy helpers. No Phaser or DOM dependencies so the rules
// that gate training and construction can be unit-tested in isolation.

/** True when `resources` covers every entry in `cost`. */
export function canAfford(resources, cost = {}) {
  return Object.entries(cost).every(([resource, amount]) => (resources[resource] ?? 0) >= amount);
}

/** Return a new resource map with `cost` subtracted (never mutates the input). */
export function subtractCost(resources, cost = {}) {
  const next = { ...resources };
  for (const [resource, amount] of Object.entries(cost)) {
    next[resource] = (next[resource] ?? 0) - amount;
  }
  return next;
}

/** Return a new resource map with `amount` of `resource` added. */
export function addResource(resources, resource, amount) {
  return { ...resources, [resource]: (resources[resource] ?? 0) + amount };
}

/** Total population consumed by the supplied units. */
export function populationUsed(units = []) {
  return units.reduce((sum, unit) => sum + (unit.population ?? 0), 0);
}

/** True when adding `unitPopulation` keeps the live total within `cap`. */
export function hasPopulationRoom(units, cap, unitPopulation = 1) {
  return populationUsed(units) + unitPopulation <= cap;
}

/**
 * Validate a purchase against resources and population in one call.
 * Returns `{ ok, reason }` where `reason` is a short, user-facing string.
 */
export function checkPurchase({ resources, cost = {}, units = [], cap = Infinity, unitPopulation = 0 }) {
  if (!canAfford(resources, cost)) return { ok: false, reason: 'not-enough-resources' };
  if (unitPopulation > 0 && !hasPopulationRoom(units, cap, unitPopulation)) {
    return { ok: false, reason: 'population-full' };
  }
  return { ok: true, reason: null };
}
