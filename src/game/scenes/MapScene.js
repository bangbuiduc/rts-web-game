import Phaser from 'phaser';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_HEIGHT,
  TILE_WIDTH,
  mapPixelBounds,
  screenToTile,
  tileToScreen,
} from '../map.js';
import {
  findNavigationPathFromPoint,
  pathTravelDistance,
} from '../pathfinding.js';
import { deliverResourceLoad, gatherResourceTick } from '../resourceLoop.js';
import {
  BUILDING_RULES,
  RESOURCE_TYPES,
  STARTING_RESOURCES,
  UNIT_RULES,
  formatCost,
} from '../rules.js';
import { canAfford, checkPurchase, subtractCost } from '../economy.js';
import { applyDamage, tileDistance } from '../combat.js';
import { chooseTarget, engageableTargets, isForceAggressive } from '../enemyAI.js';
import { normalizeRect, rectContainsPoint, isDragSelection } from '../selection.js';
import { createRallyPoint, rallyOrderForUnit } from '../rally.js';
import {
  ENEMY_OUTPOST_TILE,
  ENEMY_UNITS,
  RESOURCE_NODES,
  STARTING_VILLAGERS,
  TOWN_CENTER_TILE,
} from '../world.js';
import {
  createBarracks,
  createBerryBush,
  createOutpost,
  createTerrain,
  createTownCenter,
  createTree,
  createUnitSprite,
  drawTileMarker,
  updateHpBar,
} from '../visuals.js';
import { createCommandPanel } from '../ui/commandPanel.js';
import { createMatchLog, downloadMatchLog, EVENT_TYPES } from '../matchLog.js';

const DRAG_THRESHOLD = 5;

export class MapScene extends Phaser.Scene {
  constructor() {
    super('MapScene');
    this.mapOriginX = MAP_HEIGHT * (TILE_WIDTH / 2);
    this.mapOriginY = 0;
    this.units = [];
    this.buildings = [];
    this.nodes = [];
    this.selectedIds = new Set();
    this.resources = { ...STARTING_RESOURCES };
    this.pendingBuild = null;
    this.gameOver = false;
    this.nextId = 1;
    this.hoveredTile = null;
    this.elapsedMs = 0;
    this.enemyAggressive = false;
  }

  create() {
    this.matchLog = createMatchLog();
    createTerrain(this, this.mapOriginX, this.mapOriginY);
    this.hoverGraphic = this.add.graphics().setDepth(5000);
    this.commandGraphic = this.add.graphics().setDepth(5001);
    this.pathGraphic = this.add.graphics().setDepth(5002);
    this.rallyGraphic = this.add.graphics().setDepth(5003);
    this.marqueeGraphic = this.add.graphics().setDepth(6000).setScrollFactor(0);

    this.infoElement = document.querySelector('#tile-info');
    this.panel = createCommandPanel({
      onTrainVillager: () => this.trainFromSelection('villager'),
      onBuildBarracks: () => this.beginPlacement('barracks'),
      onTrainClubman: () => this.trainFromSelection('clubman'),
      onExportLog: () => this.exportMatchLog(),
    });

    this.spawnInitialWorld();
    this.logMatchStart();

    const bounds = mapPixelBounds();
    this.cameras.main.setBounds(0, 0, bounds.width, bounds.height);
    const tcPos = this.tileWorldPosition(TOWN_CENTER_TILE.x, TOWN_CENTER_TILE.y);
    this.cameras.main.centerOn(tcPos.x, tcPos.y);

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer) => this.onPointerDown(pointer));
    this.input.on('pointermove', (pointer) => this.onPointerMove(pointer));
    this.input.on('pointerup', (pointer) => this.onPointerUp(pointer));
    this.input.on('pointerupoutside', () => this.resetPointerState());
    this.input.on('wheel', (pointer, _o, _dx, deltaY) => {
      const camera = this.cameras.main;
      camera.setZoom(Phaser.Math.Clamp(camera.zoom * (deltaY > 0 ? 0.9 : 1.1), 0.45, 2.2));
    });
    this.input.keyboard?.on('keydown-ESC', () => this.clearSelection());

    this.refreshPanel();
    this.updateInfo();
  }

  // --- World setup -------------------------------------------------------

  spawnInitialWorld() {
    this.townCenter = this.addBuilding('townCenter', TOWN_CENTER_TILE, 'player');
    this.enemyOutpost = this.addBuilding('enemyOutpost', ENEMY_OUTPOST_TILE, 'enemy');

    for (const node of RESOURCE_NODES) this.addNode(node);
    for (const spot of STARTING_VILLAGERS) this.addUnit('villager', spot, 'player');
    for (const enemy of ENEMY_UNITS) this.addUnit(enemy.type, enemy, 'enemy');

    // Start with the villagers selected so the slice is immediately playable.
    this.units.filter((unit) => unit.faction === 'player').forEach((unit) => this.selectedIds.add(unit.id));
    this.refreshSelectionVisuals();
  }

  addNode(config) {
    const factory = config.kind === 'tree' ? createTree : createBerryBush;
    const visual = factory(this);
    const position = this.tileWorldPosition(config.x, config.y);
    visual.container.setPosition(position.x, position.y);
    visual.container.setDepth(1 + (config.x + config.y) * 4 + 1);
    const node = {
      id: config.id,
      kind: config.kind,
      resource: config.resource,
      tile: { x: config.x, y: config.y },
      amount: config.amount,
      initialAmount: config.amount,
      visual,
    };
    this.nodes.push(node);
    this.updateNodeVisual(node);
    return node;
  }

  addBuilding(type, tile, faction, { underConstruction = false } = {}) {
    const rule = BUILDING_RULES[type];
    const factory = type === 'townCenter'
      ? createTownCenter
      : type === 'enemyOutpost'
        ? createOutpost
        : createBarracks;
    const visual = factory(this);
    const position = this.tileWorldPosition(tile.x, tile.y);
    visual.container.setPosition(position.x, position.y);
    visual.container.setDepth(1 + (tile.x + tile.y) * 4);
    if (underConstruction) visual.container.setAlpha(0.55);
    const building = {
      id: this.nextId++,
      type,
      label: rule.label,
      faction,
      isBuilding: true,
      tile: { x: tile.x, y: tile.y },
      hp: rule.maxHp,
      maxHp: rule.maxHp,
      dropOff: rule.dropOffResources ?? [],
      trains: rule.trains ?? [],
      populationProvided: rule.populationProvided ?? 0,
      queue: [],
      rally: null,
      underConstruction,
      buildElapsed: 0,
      buildTime: rule.buildTime ?? 0,
      selectable: faction === 'player' && (rule.trains?.length > 0 || type === 'townCenter'),
      ...visual,
    };
    this.buildings.push(building);
    return building;
  }

  addUnit(type, tile, faction) {
    const rule = UNIT_RULES[type];
    const visual = createUnitSprite(this, type, faction);
    const position = this.tileWorldPosition(tile.x, tile.y);
    visual.container.setPosition(position.x, position.y);
    const unit = {
      id: this.nextId++,
      type,
      label: rule.label,
      faction,
      tile: { x: tile.x, y: tile.y },
      hp: rule.maxHp,
      maxHp: rule.maxHp,
      population: faction === 'player' ? rule.population ?? 1 : 0,
      speed: rule.speed,
      radius: rule.radius,
      attackDamage: rule.attackDamage ?? 0,
      attackCooldown: rule.attackCooldown ?? 1000,
      attackRange: rule.attackRange ?? 1,
      attackElapsed: 0,
      capacity: rule.gatherCapacity ?? 0,
      gatherInterval: rule.gatherInterval ?? 900,
      gatherElapsed: 0,
      carried: 0,
      carryResource: null,
      path: [],
      order: null,
      ...visual,
    };
    this.units.push(unit);
    this.updateDepth(unit);
    return unit;
  }

  // --- Main loop ---------------------------------------------------------

  update(_time, delta) {
    if (this.gameOver) return;
    this.elapsedMs += delta;
    for (const unit of this.units) this.updateUnit(unit, delta);
    for (const building of this.buildings) this.updateBuilding(building, delta);
    this.updateEnemyAI();
    this.pruneDead();
    this.drawPaths();
    this.drawRallyPoints();
    this.checkObjective();
  }

  updateUnit(unit, delta) {
    if (unit.hp <= 0) return;
    if (unit.path && unit.path.length) {
      this.stepAlongPath(unit, delta);
      return;
    }
    this.progressOrder(unit, delta);
  }

  stepAlongPath(unit, delta) {
    const step = unit.path[0];
    const target = this.tileWorldPosition(step.x, step.y);
    const dx = target.x - unit.container.x;
    const dy = target.y - unit.container.y;
    const distance = Math.hypot(dx, dy);
    const travel = unit.speed * (delta / 1000);

    if (distance <= travel || distance < 0.01) {
      unit.container.setPosition(target.x, target.y);
      unit.tile = { x: step.x, y: step.y };
      unit.path.shift();
      this.updateDepth(unit);
      if (!unit.path.length) this.onArrive(unit);
    } else {
      unit.container.setPosition(unit.container.x + (dx / distance) * travel, unit.container.y + (dy / distance) * travel);
      this.updateDepth(unit);
    }
  }

  onArrive(unit) {
    const order = unit.order;
    if (!order) return;
    if (order.type === 'move') {
      unit.order = null;
    } else if (order.type === 'gather') {
      if (order.phase === 'approaching') {
        order.phase = 'gathering';
        unit.gatherElapsed = 0;
      } else if (order.phase === 'returning') {
        this.deliverLoad(unit);
      }
    } else if (order.type === 'build') {
      order.phase = 'building';
    } else if (order.type === 'attack') {
      order.phase = 'attacking';
      unit.attackElapsed = unit.attackCooldown;
    }
  }

  progressOrder(unit, delta) {
    const order = unit.order;
    if (!order) return;
    if (order.type === 'gather' && order.phase === 'gathering') this.progressGather(unit, delta);
    else if (order.type === 'build' && order.phase === 'building') this.progressBuild(unit, delta);
    else if (order.type === 'attack' && order.phase === 'attacking') this.progressAttack(unit, delta);
    else if (order.type === 'move') unit.order = null;
  }

  // --- Gathering ---------------------------------------------------------

  progressGather(unit, delta) {
    const node = this.nodes.find((candidate) => candidate.id === unit.order.nodeId);
    if (!node || node.amount <= 0) {
      if (unit.carried > 0) this.startReturn(unit);
      else unit.order = null;
      return;
    }
    unit.gatherElapsed += delta;
    while (unit.gatherElapsed >= unit.gatherInterval && unit.order?.phase === 'gathering') {
      unit.gatherElapsed -= unit.gatherInterval;
      const tick = gatherResourceTick({ nodeAmount: node.amount, carried: unit.carried, capacity: unit.capacity });
      node.amount = tick.nodeAmount;
      unit.carried = tick.carried;
      unit.carryResource = node.resource;
      if (tick.nodeDepleted && !node.depletedLogged) {
        node.depletedLogged = true;
        this.logEvent(EVENT_TYPES.NODE_DEPLETED, {
          nodeId: node.id,
          kind: node.kind,
          resource: node.resource,
          tile: { ...node.tile },
        });
      }
      this.updateNodeVisual(node);
      this.updateCarryCue(unit);
      if (!tick.gathered || tick.shouldReturn) {
        this.startReturn(unit);
        return;
      }
    }
  }

  startReturn(unit) {
    if (unit.carried === 0) {
      unit.order = null;
      return;
    }
    const dropOff = this.nearestDropOff(unit.carryResource, this.liveTile(unit));
    if (!dropOff) {
      unit.order = null;
      return;
    }
    unit.order.phase = 'returning';
    unit.order.dropOffId = dropOff.id;
    this.routeUnitAdjacentTo(unit, dropOff.tile);
  }

  deliverLoad(unit) {
    const node = this.nodes.find((candidate) => candidate.id === unit.order.nodeId);
    const result = deliverResourceLoad({
      stored: this.resources[unit.carryResource] ?? 0,
      carried: unit.carried,
      nodeAmount: node?.amount ?? 0,
    });
    const resource = unit.carryResource;
    this.resources = { ...this.resources, [resource]: result.stored };
    this.logEvent(EVENT_TYPES.RESOURCE_DELIVERED, {
      unitId: unit.id,
      resource,
      amount: unit.carried,
      storedAfter: result.stored,
      dropOffId: unit.order?.dropOffId ?? null,
      nodeId: unit.order?.nodeId ?? null,
    });
    unit.carried = 0;
    this.updateCarryCue(unit);
    this.refreshPanel();
    if (node && result.shouldResumeGather) {
      unit.order.phase = 'approaching';
      this.routeUnitAdjacentTo(unit, node.tile);
    } else {
      unit.order = null;
    }
  }

  nearestDropOff(resource, fromTile) {
    const candidates = this.buildings.filter((building) => (
      building.faction === 'player'
      && !building.underConstruction
      && building.dropOff.includes(resource)
    ));
    let best = null;
    let bestDistance = Infinity;
    for (const building of candidates) {
      const distance = tileDistance(fromTile, building.tile);
      if (distance < bestDistance) {
        best = building;
        bestDistance = distance;
      }
    }
    return best;
  }

  // --- Building construction --------------------------------------------

  progressBuild(unit, delta) {
    const building = this.buildings.find((candidate) => candidate.id === unit.order.buildingId);
    if (!building || !building.underConstruction) {
      unit.order = null;
      return;
    }
    building.buildElapsed += delta;
    if (building.buildElapsed >= building.buildTime) {
      building.underConstruction = false;
      building.container.setAlpha(1);
      this.completeBuilding(building);
    }
  }

  completeBuilding(building) {
    // Any villagers that were building this now stand idle.
    for (const unit of this.units) {
      if (unit.order?.type === 'build' && unit.order.buildingId === building.id) unit.order = null;
    }
    this.logEvent(EVENT_TYPES.BUILD_COMPLETED, {
      buildingId: building.id,
      buildingType: building.type,
      tile: { ...building.tile },
    });
    this.panel.setFeedback(`${building.label} đã hoàn thành.`);
    this.refreshPanel();
  }

  // --- Combat ------------------------------------------------------------

  progressAttack(unit, delta) {
    const target = this.entityById(unit.order.targetId);
    if (!target || target.hp <= 0) {
      unit.order = null;
      return;
    }
    const distance = tileDistance(this.liveTile(unit), target.tile);
    if (distance > unit.attackRange + 0.05) {
      unit.order.phase = 'approaching';
      this.routeUnitAdjacentTo(unit, target.tile);
      return;
    }
    unit.attackElapsed += delta;
    if (unit.attackElapsed >= unit.attackCooldown) {
      unit.attackElapsed = 0;
      const result = applyDamage(target.hp, unit.attackDamage);
      target.hp = result.hp;
      updateHpBar(target.hpBar, target.hp, target.maxHp);
      this.logEvent(EVENT_TYPES.DAMAGE, {
        attackerId: unit.id,
        attackerFaction: unit.faction,
        targetId: target.id,
        targetType: target.type,
        targetFaction: target.faction,
        amount: unit.attackDamage,
        hpAfter: result.hp,
        maxHp: target.maxHp,
      });
      if (result.dead) this.killEntity(target);
    }
  }

  // --- Enemy AI ----------------------------------------------------------

  updateEnemyAI() {
    // The garrison holds the Outpost (defensive guard radius) until it is
    // provoked or the grace period elapses, then latches into an aggressive
    // push so the Town Center — and thus the defeat condition — is reachable.
    const outpostDamaged = this.enemyOutpost && this.enemyOutpost.hp < this.enemyOutpost.maxHp;
    this.enemyAggressive = isForceAggressive({
      latched: this.enemyAggressive,
      outpostDamaged,
      elapsedMs: this.elapsedMs,
    });

    const playerEntities = [
      ...this.units.filter((unit) => unit.faction === 'player' && unit.hp > 0),
      ...this.buildings.filter((building) => building.faction === 'player' && building.hp > 0),
    ];
    const targets = engageableTargets(playerEntities, {
      aggressive: this.enemyAggressive,
      anchor: ENEMY_OUTPOST_TILE,
    });

    for (const enemy of this.units) {
      if (enemy.faction !== 'enemy' || enemy.hp <= 0) continue;
      const current = this.entityById(enemy.order?.targetId);
      // Keep committing to a still-engageable target so raiders don't dither.
      if (current?.hp > 0 && targets.includes(current)) continue;
      const chosen = chooseTarget(this.liveTile(enemy), targets);
      if (chosen) this.commandAttack(enemy, chosen);
      else { enemy.order = null; enemy.path = []; }
    }
  }

  // --- Buildings tick (training) ----------------------------------------

  updateBuilding(building, delta) {
    if (building.underConstruction || !building.queue.length) return;
    const job = building.queue[0];
    job.remaining -= delta;
    if (job.remaining <= 0) {
      building.queue.shift();
      this.spawnTrainedUnit(building, job.unitType);
      this.refreshPanel();
    }
  }

  spawnTrainedUnit(building, unitType) {
    const spot = this.freeTileNear(building.tile) ?? building.tile;
    const unit = this.addUnit(unitType, spot, building.faction);
    if (building.faction === 'player') {
      this.logEvent(EVENT_TYPES.UNIT_TRAINED, {
        unitId: unit.id,
        unitType,
        buildingId: building.id,
        tile: { ...unit.tile },
      });
    }
    this.panel.setFeedback(`${unit.label} đã sẵn sàng.`);
    if (building.faction === 'player' && building.rally) this.applyRallyOrder(unit, building.rally);
    return unit;
  }

  applyRallyOrder(unit, rally) {
    const node = rally.nodeId != null
      ? this.nodes.find((candidate) => candidate.id === rally.nodeId)
      : null;
    const order = rallyOrderForUnit(rally, unit, { nodeAmount: node?.amount ?? 0 });
    if (!order) return;
    if (order.type === 'gather' && node) this.commandGather(unit, node);
    else this.moveUnitTo(unit, order.tile);
  }

  // --- Commands ----------------------------------------------------------

  trainFromSelection(unitType) {
    const building = this.selectedBuildings().find((candidate) => candidate.trains.includes(unitType));
    if (!building) return;
    const rule = UNIT_RULES[unitType];
    const check = checkPurchase({
      resources: this.resources,
      cost: rule.cost,
      units: this.playerUnits(),
      cap: this.populationCap(),
      unitPopulation: rule.population ?? 0,
    });
    if (!check.ok) {
      this.panel.setFeedback(check.reason === 'population-full'
        ? 'Dân số đã đầy – không thể huấn luyện.'
        : `Không đủ tài nguyên (cần ${formatCost(rule.cost)}).`);
      return;
    }
    this.resources = subtractCost(this.resources, rule.cost);
    building.queue.push({ unitType, remaining: rule.trainTime });
    this.logEvent(EVENT_TYPES.TRAIN_QUEUED, {
      unitType,
      buildingId: building.id,
      buildingType: building.type,
      trainTime: rule.trainTime,
      queueLength: building.queue.length,
      resources: this.resourceSnapshot(),
    });
    this.panel.setFeedback(`Đang huấn luyện ${rule.label}…`);
    this.refreshPanel();
  }

  beginPlacement(type) {
    const rule = BUILDING_RULES[type];
    if (!canAfford(this.resources, rule.cost)) {
      this.panel.setFeedback(`Không đủ tài nguyên (cần ${formatCost(rule.cost)}).`);
      return;
    }
    if (!this.selectedBuilders().length) {
      this.panel.setFeedback('Chọn ít nhất một Villager để xây.');
      return;
    }
    this.pendingBuild = { type };
    this.panel.setFeedback('Nhấp trái lên ô trống để đặt công trình.', { sticky: true });
  }

  placeBuilding(tile) {
    const { type } = this.pendingBuild;
    const rule = BUILDING_RULES[type];
    if (!this.canPlaceAt(tile)) {
      this.panel.setFeedback('Không thể đặt ở đây.');
      return;
    }
    if (!canAfford(this.resources, rule.cost)) {
      this.panel.setFeedback(`Không đủ tài nguyên (cần ${formatCost(rule.cost)}).`);
      this.pendingBuild = null;
      return;
    }
    this.resources = subtractCost(this.resources, rule.cost);
    const building = this.addBuilding(type, tile, 'player', { underConstruction: true });
    const builders = this.selectedBuilders();
    for (const builder of builders) {
      builder.order = { type: 'build', buildingId: building.id, phase: 'approaching' };
      this.routeUnitAdjacentTo(builder, building.tile);
    }
    this.pendingBuild = null;
    this.logEvent(EVENT_TYPES.BUILD_STARTED, {
      buildingId: building.id,
      buildingType: type,
      tile: { ...building.tile },
      builderIds: builders.map((builder) => builder.id),
      resources: this.resourceSnapshot(),
    });
    this.panel.setFeedback(`Đang xây ${building.label}…`);
    this.refreshPanel();
  }

  canPlaceAt(tile) {
    if (!this.isWalkable(tile.x, tile.y)) return false;
    // Keep a little breathing room from the starting Town Center.
    return tileDistance(tile, TOWN_CENTER_TILE) >= 1.2;
  }

  commandAttack(unit, target) {
    unit.order = { type: 'attack', targetId: target.id, phase: 'approaching' };
    const distance = tileDistance(this.liveTile(unit), target.tile);
    if (distance <= unit.attackRange + 0.05) {
      unit.order.phase = 'attacking';
      unit.attackElapsed = unit.attackCooldown;
      unit.path = [];
    } else {
      this.routeUnitAdjacentTo(unit, target.tile);
    }
  }

  commandGather(unit, node) {
    if (unit.capacity <= 0) {
      this.moveUnitTo(unit, node.tile);
      return;
    }
    unit.order = { type: 'gather', nodeId: node.id, phase: 'approaching' };
    unit.carryResource = node.resource;
    this.routeUnitAdjacentTo(unit, node.tile);
  }

  moveUnitTo(unit, tile) {
    unit.order = { type: 'move' };
    const path = this.unitNavTo(unit, tile);
    unit.path = path ?? [];
    if (!unit.path.length) unit.order = null;
  }

  // --- Navigation helpers ------------------------------------------------

  routeUnitAdjacentTo(unit, tile) {
    const adjacent = this.bestAdjacentRoute(unit, tile);
    if (!adjacent) {
      unit.path = [];
      this.onArrive(unit);
      return;
    }
    unit.path = adjacent.path;
    if (!unit.path.length) this.onArrive(unit);
  }

  bestAdjacentRoute(unit, tile) {
    const neighbors = [
      { x: tile.x + 1, y: tile.y },
      { x: tile.x - 1, y: tile.y },
      { x: tile.x, y: tile.y + 1 },
      { x: tile.x, y: tile.y - 1 },
    ].filter((candidate) => this.isWalkable(candidate.x, candidate.y));
    const start = this.liveTile(unit);
    let best = null;
    for (const destination of neighbors) {
      const route = this.unitNavTo(unit, destination);
      if (!route) continue;
      const travel = pathTravelDistance(start, route);
      if (!best || travel < best.travel) best = { path: route, travel };
    }
    return best;
  }

  unitNavTo(unit, goal) {
    return findNavigationPathFromPoint(this.liveTile(unit), goal, (x, y) => this.isWalkable(x, y), {
      clearance: unit.radius,
      bounds: { minX: 0, minY: 0, maxX: MAP_WIDTH - 1, maxY: MAP_HEIGHT - 1 },
      startCandidates: [unit.tile, ...unit.path],
    });
  }

  isWalkable(x, y) {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
    if (this.buildings.some((building) => building.hp > 0 && building.tile.x === x && building.tile.y === y)) return false;
    return !this.nodes.some((node) => node.amount > 0 && node.tile.x === x && node.tile.y === y);
  }

  freeTileNear(tile) {
    const ring = [
      { x: tile.x + 1, y: tile.y }, { x: tile.x - 1, y: tile.y },
      { x: tile.x, y: tile.y + 1 }, { x: tile.x, y: tile.y - 1 },
      { x: tile.x + 1, y: tile.y + 1 }, { x: tile.x - 1, y: tile.y - 1 },
      { x: tile.x + 1, y: tile.y - 1 }, { x: tile.x - 1, y: tile.y + 1 },
    ];
    return ring.find((candidate) => this.isWalkable(candidate.x, candidate.y));
  }

  // --- Pointer input -----------------------------------------------------

  onPointerDown(pointer) {
    if (this.gameOver) return;
    if (pointer.button === 2) {
      this.rightDown = true;
      this.panning = false;
    } else if (pointer.button === 0) {
      this.leftDown = true;
      this.marquee = false;
    }
    this.pointerStartX = pointer.x;
    this.pointerStartY = pointer.y;
  }

  onPointerMove(pointer) {
    const moved = Phaser.Math.Distance.Between(pointer.x, pointer.y, this.pointerStartX, this.pointerStartY);
    if (this.rightDown) {
      if (moved > DRAG_THRESHOLD) this.panning = true;
      if (this.panning) {
        const camera = this.cameras.main;
        camera.scrollX -= (pointer.x - this.pointerStartX) / camera.zoom;
        camera.scrollY -= (pointer.y - this.pointerStartY) / camera.zoom;
        this.pointerStartX = pointer.x;
        this.pointerStartY = pointer.y;
      }
      return;
    }
    if (this.leftDown && moved > DRAG_THRESHOLD) {
      this.marquee = true;
      this.drawMarquee(pointer);
      return;
    }
    this.updateHover(pointer);
  }

  onPointerUp(pointer) {
    if (pointer.button === 2) {
      if (this.rightDown && !this.panning && !this.gameOver) this.handleRightClick(pointer);
      this.rightDown = false;
      this.panning = false;
    } else if (pointer.button === 0) {
      if (this.leftDown && !this.gameOver) {
        if (this.marquee) this.finishMarquee(pointer);
        else this.handleLeftClick(pointer);
      }
      this.leftDown = false;
      this.marquee = false;
      this.marqueeGraphic.clear();
    }
  }

  resetPointerState() {
    this.leftDown = false;
    this.rightDown = false;
    this.marquee = false;
    this.panning = false;
    this.marqueeGraphic.clear();
  }

  handleLeftClick(pointer) {
    const tile = this.tileAtPointer(pointer);
    if (this.pendingBuild) {
      if (tile) this.placeBuilding(tile);
      return;
    }
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const entity = this.selectableEntityAt(world.x, world.y);
    const additive = pointer.event?.shiftKey;
    if (entity) {
      if (!additive) this.selectedIds.clear();
      this.selectedIds.add(entity.id);
    } else if (!additive) {
      this.selectedIds.clear();
    }
    this.refreshSelectionVisuals();
    this.refreshPanel();
    this.updateInfo();
  }

  handleRightClick(pointer) {
    const rallyBuildings = this.selectedRallyBuildings();
    const selected = this.selectedPlayerUnits();
    if (!selected.length && !rallyBuildings.length) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tile = this.tileAtPointer(pointer);
    if (!tile) return;

    const enemy = this.enemyEntityAt(world.x, world.y);
    const node = this.nodes.find((candidate) => candidate.amount > 0 && candidate.tile.x === tile.x && candidate.tile.y === tile.y);

    // A selected production building takes a rally point from the same click.
    if (rallyBuildings.length && !enemy) this.setRallyPoint(rallyBuildings, tile, node);

    if (selected.length) {
      if (enemy) {
        const attackers = selected.filter((unit) => unit.attackDamage > 0);
        attackers.forEach((unit) => this.commandAttack(unit, enemy));
        this.markCommand(enemy.tile, 0xff8a7a);
        this.logOrder('attack', attackers, {
          targetId: enemy.id,
          targetType: enemy.type,
          targetFaction: enemy.faction,
          tile: { ...enemy.tile },
        });
      } else if (node) {
        selected.forEach((unit) => this.commandGather(unit, node));
        this.markCommand(node.tile, 0x9fe08a);
        this.logOrder('gather', selected, {
          nodeId: node.id,
          resource: node.resource,
          tile: { ...node.tile },
        });
      } else if (this.isWalkable(tile.x, tile.y)) {
        selected.forEach((unit) => this.moveUnitTo(unit, tile));
        this.markCommand(tile, 0xfff1a1);
        this.logOrder('move', selected, { tile: { x: tile.x, y: tile.y } });
      } else {
        this.panel.setFeedback('Không thể di chuyển tới ô đó.');
      }
    }
    this.updateInfo();
  }

  setRallyPoint(buildings, tile, node) {
    if (!node && !this.isWalkable(tile.x, tile.y)) {
      this.panel.setFeedback('Không thể đặt điểm tập kết ở đó.');
      return;
    }
    const rally = createRallyPoint(tile, node ? { nodeId: node.id, resource: node.resource } : {});
    for (const building of buildings) building.rally = rally;
    this.panel.setFeedback(node ? 'Điểm tập kết: thu hoạch tài nguyên.' : 'Đã đặt điểm tập kết.');
  }

  // --- Selection ---------------------------------------------------------

  finishMarquee(pointer) {
    const startWorld = this.cameras.main.getWorldPoint(this.pointerStartX, this.pointerStartY);
    const endWorld = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const rect = normalizeRect(startWorld.x, startWorld.y, endWorld.x, endWorld.y);
    if (!pointer.event?.shiftKey) this.selectedIds.clear();
    for (const unit of this.playerUnits()) {
      if (rectContainsPoint(rect, unit.container.x, unit.container.y)) this.selectedIds.add(unit.id);
    }
    this.refreshSelectionVisuals();
    this.refreshPanel();
    this.updateInfo();
  }

  drawMarquee(pointer) {
    const rect = normalizeRect(this.pointerStartX, this.pointerStartY, pointer.x, pointer.y);
    this.marqueeGraphic.clear();
    if (!isDragSelection(rect)) return;
    this.marqueeGraphic.fillStyle(0xfff1a1, 0.12);
    this.marqueeGraphic.lineStyle(1.5, 0xfff1a1, 0.9);
    this.marqueeGraphic.fillRect(rect.minX, rect.minY, rect.maxX - rect.minX, rect.maxY - rect.minY);
    this.marqueeGraphic.strokeRect(rect.minX, rect.minY, rect.maxX - rect.minX, rect.maxY - rect.minY);
  }

  clearSelection() {
    this.pendingBuild = null;
    this.selectedIds.clear();
    this.refreshSelectionVisuals();
    this.refreshPanel();
    this.updateInfo();
  }

  selectableEntityAt(worldX, worldY) {
    for (const unit of this.playerUnits()) {
      if (this.hitsUnit(unit, worldX, worldY)) return unit;
    }
    for (const building of this.buildings) {
      if (building.selectable && building.hp > 0 && this.hitsBuilding(building, worldX, worldY)) return building;
    }
    return null;
  }

  enemyEntityAt(worldX, worldY) {
    for (const unit of this.units) {
      if (unit.faction === 'enemy' && unit.hp > 0 && this.hitsUnit(unit, worldX, worldY)) return unit;
    }
    for (const building of this.buildings) {
      if (building.faction === 'enemy' && building.hp > 0 && this.hitsBuilding(building, worldX, worldY)) return building;
    }
    return null;
  }

  hitsUnit(unit, worldX, worldY) {
    const dx = worldX - unit.container.x;
    const dy = worldY - (unit.container.y - 12);
    return (dx / 18) ** 2 + (dy / 30) ** 2 <= 1;
  }

  hitsBuilding(building, worldX, worldY) {
    const dx = worldX - building.container.x;
    const dy = worldY - (building.container.y - 16);
    return (dx / 32) ** 2 + (dy / 34) ** 2 <= 1;
  }

  // --- Rendering / HUD ---------------------------------------------------

  refreshSelectionVisuals() {
    for (const unit of this.units) unit.selectionRing?.setVisible(this.selectedIds.has(unit.id));
    for (const building of this.buildings) building.selectionRing?.setVisible(this.selectedIds.has(building.id));
  }

  refreshPanel() {
    const buildings = this.selectedBuildings();
    const hasTownCenter = buildings.some((building) => building.trains.includes('villager'));
    const hasBarracks = buildings.some((building) => building.trains.includes('clubman') && !building.underConstruction);
    const hasBuilder = this.selectedBuilders().length > 0;
    const villagerRule = UNIT_RULES.villager;
    const clubmanRule = UNIT_RULES.clubman;

    this.panel.setResources({
      food: this.resources[RESOURCE_TYPES.FOOD] ?? 0,
      wood: this.resources[RESOURCE_TYPES.WOOD] ?? 0,
      population: this.playerUnits().reduce((sum, unit) => sum + unit.population, 0),
      cap: this.populationCap(),
    });
    this.panel.setButtons({
      trainVillager: {
        visible: hasTownCenter,
        enabled: this.affordsUnit(villagerRule),
      },
      buildBarracks: {
        visible: hasBuilder,
        enabled: canAfford(this.resources, BUILDING_RULES.barracks.cost),
      },
      trainClubman: {
        visible: hasBarracks,
        enabled: this.affordsUnit(clubmanRule),
      },
    });
  }

  affordsUnit(rule) {
    return checkPurchase({
      resources: this.resources,
      cost: rule.cost,
      units: this.playerUnits(),
      cap: this.populationCap(),
      unitPopulation: rule.population ?? 0,
    }).ok;
  }

  drawPaths() {
    this.pathGraphic.clear();
    this.pathGraphic.lineStyle(3, 0xffe797, 0.75);
    for (const unit of this.units) {
      if (!this.selectedIds.has(unit.id) || !unit.path.length) continue;
      this.pathGraphic.beginPath();
      this.pathGraphic.moveTo(unit.container.x, unit.container.y);
      for (const tile of unit.path) {
        const point = this.tileWorldPosition(tile.x, tile.y);
        this.pathGraphic.lineTo(point.x, point.y);
      }
      this.pathGraphic.strokePath();
    }
  }

  drawRallyPoints() {
    this.rallyGraphic.clear();
    for (const building of this.buildings) {
      if (building.faction !== 'player' || !building.rally || !this.selectedIds.has(building.id)) continue;
      const from = this.tileWorldPosition(building.tile.x, building.tile.y);
      const to = this.tileWorldPosition(building.rally.tile.x, building.rally.tile.y);
      const color = building.rally.nodeId != null ? 0x9fe08a : 0x8ad0ff;
      this.rallyGraphic.lineStyle(2, color, 0.55);
      this.rallyGraphic.beginPath();
      this.rallyGraphic.moveTo(from.x, from.y);
      this.rallyGraphic.lineTo(to.x, to.y);
      this.rallyGraphic.strokePath();
      this.drawRallyFlag(to.x, to.y, color);
    }
  }

  drawRallyFlag(x, y, color) {
    const g = this.rallyGraphic;
    g.lineStyle(2, 0x1c2a16, 0.9);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x, y - 20);
    g.strokePath();
    g.fillStyle(color, 0.95);
    g.beginPath();
    g.moveTo(x, y - 20);
    g.lineTo(x + 12, y - 16);
    g.lineTo(x, y - 12);
    g.closePath();
    g.fillPath();
  }

  markCommand(tile, color) {
    const point = this.tileWorldPosition(tile.x, tile.y);
    drawTileMarker(this.commandGraphic, point.x, point.y, color, 1);
  }

  updateHover(pointer) {
    this.hoveredTile = this.tileAtPointer(pointer);
    if (!this.hoveredTile) {
      this.hoverGraphic.clear();
      this.updateInfo();
      return;
    }
    const color = this.pendingBuild ? (this.canPlaceAt(this.hoveredTile) ? 0x9fe08a : 0xff6b5a) : 0xf5df7b;
    const point = this.tileWorldPosition(this.hoveredTile.x, this.hoveredTile.y);
    drawTileMarker(this.hoverGraphic, point.x, point.y, color, 0.9);
    this.updateInfo();
  }

  updateInfo() {
    if (!this.infoElement) return;
    const hover = this.hoveredTile ? `Ô (${this.hoveredTile.x}, ${this.hoveredTile.y})` : 'Di chuyển chuột trên bản đồ';
    const selectedCount = this.selectedPlayerUnits().length;
    const buildingSel = this.selectedBuildings().map((building) => building.label).join(', ');
    const selection = selectedCount
      ? `Đã chọn ${selectedCount} đơn vị`
      : buildingSel
        ? `Đã chọn: ${buildingSel}`
        : 'Chưa chọn';
    const objective = 'Mục tiêu: phá hủy Enemy Outpost';
    this.infoElement.textContent = `${hover} · ${selection} · ${objective}`;
  }

  updateCarryCue(unit) {
    if (!unit.carryCue) return;
    const ratio = unit.capacity > 0 ? unit.carried / unit.capacity : 0;
    unit.carryCue.setVisible(unit.carried > 0);
    unit.carryCue.fillColor = unit.carryResource === RESOURCE_TYPES.FOOD ? 0xc0405a : 0xa46934;
    unit.carryCue.setScale(0.8 + ratio * 0.3, 0.9 + ratio * 0.2);
  }

  updateNodeVisual(node) {
    const ratio = node.initialAmount > 0 ? node.amount / node.initialAmount : 0;
    const depleted = node.amount <= 0;
    const visual = node.visual;
    if (node.kind === 'tree') {
      visual.stump.setVisible(depleted);
      visual.trunk.setVisible(!depleted);
      visual.shadow.setAlpha(depleted ? 0.25 : 0.55);
      visual.canopy.forEach((part) => {
        part.setVisible(!depleted);
        part.setAlpha(0.45 + ratio * 0.55);
        part.setScale(0.78 + ratio * 0.22);
      });
    } else {
      visual.stump.setVisible(depleted);
      visual.foliage.setVisible(!depleted);
      visual.foliage.setScale(0.7 + ratio * 0.35);
      visual.berries.forEach((berry, index) => {
        berry.setVisible(!depleted && (index + 1) / visual.berries.length <= ratio + 0.25);
      });
    }
  }

  updateDepth(unit) {
    const tile = this.liveTile(unit);
    unit.container.setDepth(1 + (tile.x + tile.y) * 4 + 2);
  }

  // --- Match logging -----------------------------------------------------

  logEvent(type, data = {}) {
    this.matchLog?.record(type, this.elapsedMs, data);
  }

  resourceSnapshot() {
    return {
      food: this.resources[RESOURCE_TYPES.FOOD] ?? 0,
      wood: this.resources[RESOURCE_TYPES.WOOD] ?? 0,
      population: this.playerUnits().reduce((sum, unit) => sum + unit.population, 0),
      cap: this.populationCap(),
    };
  }

  logMatchStart() {
    this.logEvent(EVENT_TYPES.MATCH_START, {
      townCenterTile: { ...TOWN_CENTER_TILE },
      enemyOutpostTile: { ...ENEMY_OUTPOST_TILE },
      villagers: this.playerUnits().length,
      enemyUnits: this.units.filter((unit) => unit.faction === 'enemy').length,
      resources: this.resourceSnapshot(),
    });
  }

  logOrder(orderType, units, target) {
    if (!units.length) return;
    this.logEvent(EVENT_TYPES.ORDER, {
      order: orderType,
      unitIds: units.map((unit) => unit.id),
      unitCount: units.length,
      ...target,
    });
  }

  exportMatchLog() {
    if (!this.matchLog) return;
    try {
      const { filename, bytes } = downloadMatchLog(this.matchLog);
      this.panel.setFeedback(`Đã tải nhật ký: ${filename} (${this.matchLog.size()} sự kiện).`);
      return { filename, bytes };
    } catch (error) {
      this.panel.setFeedback('Không thể tải nhật ký trận đấu.');
      return null;
    }
  }

  // --- End-game ----------------------------------------------------------

  killEntity(entity) {
    entity.hp = 0;
    entity.container?.setVisible(false);
    this.selectedIds.delete(entity.id);
    this.logEvent(EVENT_TYPES.ENTITY_KILLED, {
      id: entity.id,
      kind: entity.isBuilding ? 'building' : 'unit',
      type: entity.type,
      label: entity.label,
      faction: entity.faction,
      tile: { ...entity.tile },
    });
  }

  pruneDead() {
    const before = this.units.length + this.buildings.length;
    this.units = this.units.filter((unit) => unit.hp > 0);
    this.buildings = this.buildings.filter((building) => building.hp > 0);
    if (this.units.length + this.buildings.length !== before) {
      this.refreshSelectionVisuals();
      this.refreshPanel();
    }
  }

  checkObjective() {
    if (this.gameOver) return;
    if (!this.enemyOutpost || this.enemyOutpost.hp <= 0) {
      this.gameOver = true;
      this.logEvent(EVENT_TYPES.VICTORY, { resources: this.resourceSnapshot() });
      this.panel.showBanner('CHIẾN THẮNG! Enemy Outpost đã bị phá hủy.', 'win');
      return;
    }
    if (!this.townCenter || this.townCenter.hp <= 0) {
      this.gameOver = true;
      this.logEvent(EVENT_TYPES.DEFEAT, { resources: this.resourceSnapshot() });
      this.panel.showBanner('THẤT BẠI! Town Center đã bị phá hủy.', 'lose');
    }
  }

  // --- Small helpers -----------------------------------------------------

  playerUnits() {
    return this.units.filter((unit) => unit.faction === 'player' && unit.hp > 0);
  }

  selectedPlayerUnits() {
    return this.playerUnits().filter((unit) => this.selectedIds.has(unit.id));
  }

  selectedBuilders() {
    return this.selectedPlayerUnits().filter((unit) => unit.type === 'villager');
  }

  selectedBuildings() {
    return this.buildings.filter((building) => building.faction === 'player' && this.selectedIds.has(building.id));
  }

  selectedRallyBuildings() {
    return this.selectedBuildings().filter((building) => building.trains.length > 0);
  }

  populationCap() {
    return this.buildings
      .filter((building) => building.faction === 'player' && !building.underConstruction)
      .reduce((sum, building) => sum + (building.populationProvided ?? 0), 0);
  }

  entityById(id) {
    if (id == null) return null;
    return this.units.find((unit) => unit.id === id) ?? this.buildings.find((building) => building.id === id) ?? null;
  }

  tileWorldPosition(tileX, tileY) {
    const point = tileToScreen(tileX, tileY);
    return { x: point.x + this.mapOriginX, y: point.y + this.mapOriginY };
  }

  liveTile(unit) {
    const tile = screenToTile(unit.container.x - this.mapOriginX, unit.container.y - this.mapOriginY);
    return {
      x: Phaser.Math.Clamp(tile.x, 0, MAP_WIDTH - 1),
      y: Phaser.Math.Clamp(tile.y, 0, MAP_HEIGHT - 1),
    };
  }

  tileAtPointer(pointer) {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const approximate = screenToTile(world.x - this.mapOriginX, world.y - this.mapOriginY);
    const x = Math.round(approximate.x);
    const y = Math.round(approximate.y);
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return null;
    return { x, y };
  }
}
