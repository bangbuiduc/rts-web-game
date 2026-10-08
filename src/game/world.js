import { RESOURCE_TYPES } from './rules.js';

// Static starting layout for the vertical slice. Pure data: the scene reads
// this once in create() and builds live entities from it. Tile coordinates are
// on the 32 x 32 grid defined in map.js.

export const TOWN_CENTER_TILE = { x: 15, y: 15 };
export const ENEMY_OUTPOST_TILE = { x: 26, y: 26 };

/** Wood (trees) and Food (berry bushes) nodes. */
export const RESOURCE_NODES = [
  { id: 'oak-east', kind: 'tree', resource: RESOURCE_TYPES.WOOD, x: 21, y: 13, amount: 40 },
  { id: 'oak-southwest', kind: 'tree', resource: RESOURCE_TYPES.WOOD, x: 9, y: 21, amount: 40 },
  { id: 'berry-north', kind: 'bush', resource: RESOURCE_TYPES.FOOD, x: 13, y: 11, amount: 50 },
  { id: 'berry-west', kind: 'bush', resource: RESOURCE_TYPES.FOOD, x: 11, y: 17, amount: 50 },
];

/** Starting player villagers. */
export const STARTING_VILLAGERS = [
  { x: 14, y: 16 },
  { x: 16, y: 14 },
  { x: 13, y: 15 },
];

/** Enemy melee units that defend the outpost. */
export const ENEMY_UNITS = [
  { type: 'raider', x: 25, y: 24 },
  { type: 'raider', x: 27, y: 25 },
];
