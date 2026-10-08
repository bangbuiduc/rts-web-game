export const RESOURCE_TYPES = {
  FOOD: 'food',
  WOOD: 'wood',
};

export const STARTING_RESOURCES = {
  [RESOURCE_TYPES.FOOD]: 200,
  [RESOURCE_TYPES.WOOD]: 200,
};

export const STARTING_POPULATION_CAP = 8;

export const UNIT_RULES = {
  villager: {
    label: 'Villager',
    cost: { [RESOURCE_TYPES.FOOD]: 50 },
    trainTime: 4000,
    population: 1,
    maxHp: 40,
    speed: 105,
    radius: 0.24,
    gatherCapacity: 5,
    gatherInterval: 850,
    buildRate: 1,
    attackDamage: 2,
    attackCooldown: 1000,
    attackRange: 1.15,
  },
  clubman: {
    label: 'Clubman',
    cost: { [RESOURCE_TYPES.FOOD]: 50 },
    trainTime: 4000,
    population: 1,
    maxHp: 55,
    speed: 112,
    radius: 0.24,
    attackDamage: 7,
    attackCooldown: 900,
    attackRange: 1.1,
  },
  raider: {
    label: 'Raider',
    cost: {},
    trainTime: 0,
    population: 0,
    maxHp: 65,
    speed: 96,
    radius: 0.24,
    attackDamage: 5,
    attackCooldown: 1100,
    attackRange: 1.1,
  },
};

export const BUILDING_RULES = {
  townCenter: {
    label: 'Town Center',
    cost: {},
    maxHp: 480,
    buildTime: 0,
    populationProvided: STARTING_POPULATION_CAP,
    dropOffResources: [RESOURCE_TYPES.FOOD, RESOURCE_TYPES.WOOD],
    trains: ['villager'],
  },
  house: {
    label: 'House',
    cost: { [RESOURCE_TYPES.WOOD]: 30 },
    maxHp: 120,
    buildTime: 3500,
    populationProvided: 4,
    dropOffResources: [],
    trains: [],
  },
  barracks: {
    label: 'Barracks',
    cost: { [RESOURCE_TYPES.WOOD]: 125 },
    maxHp: 260,
    buildTime: 5000,
    populationProvided: 0,
    dropOffResources: [],
    trains: ['clubman'],
  },
  granary: {
    label: 'Granary',
    cost: {},
    maxHp: 180,
    buildTime: 0,
    populationProvided: 0,
    dropOffResources: [RESOURCE_TYPES.FOOD],
    trains: [],
  },
  storagePit: {
    label: 'Storage Pit',
    cost: {},
    maxHp: 180,
    buildTime: 0,
    populationProvided: 0,
    dropOffResources: [RESOURCE_TYPES.WOOD],
    trains: [],
  },
  enemyOutpost: {
    label: 'Enemy Outpost',
    cost: {},
    maxHp: 240,
    buildTime: 0,
    populationProvided: 0,
    dropOffResources: [],
    trains: [],
  },
};

export function formatCost(cost = {}) {
  const parts = Object.entries(cost)
    .filter(([, amount]) => amount > 0)
    .map(([resource, amount]) => `${amount} ${resource[0].toUpperCase()}${resource.slice(1)}`);
  return parts.length ? parts.join(', ') : 'Free';
}
