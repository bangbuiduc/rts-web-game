import {
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_HEIGHT,
  TILE_WIDTH,
  tileColor,
  tileToScreen,
} from './map.js';

// All Phaser drawing lives here so the scene can focus on game logic. Every
// factory returns the parts the scene needs to position, re-colour, or update.
//
// Art note: these are original, authored vector sprites drawn at runtime from
// Phaser Shapes + Graphics (no image files, no copyrighted assets, no network).
// They keep the game's billboard-on-isometric-ground style: figures and
// buildings face the camera over the iso grass grid, with light/shade faces,
// faction colours, and silhouette cues (workers are slim; military units are
// broader, helmeted, and armed) so the two sides read apart at a glance.

const HALF_W = TILE_WIDTH / 2;
const HALF_H = TILE_HEIGHT / 2;

/** Draw the whole isometric grass grid onto one graphics object. */
export function createTerrain(scene, originX, originY) {
  const terrain = scene.add.graphics().setDepth(0);
  for (let diagonal = 0; diagonal < MAP_WIDTH + MAP_HEIGHT - 1; diagonal += 1) {
    const minX = Math.max(0, diagonal - MAP_HEIGHT + 1);
    const maxX = Math.min(MAP_WIDTH - 1, diagonal);
    for (let tileX = minX; tileX <= maxX; tileX += 1) {
      const tileY = diagonal - tileX;
      const point = tileToScreen(tileX, tileY);
      const cx = point.x + originX;
      const cy = point.y + originY;
      terrain.fillStyle(tileColor(tileX, tileY), 1);
      terrain.lineStyle(1, 0x314c2c, 0.5);
      diamondPath(terrain, cx, cy);
      terrain.fillPath();
      terrain.strokePath();
      // Authored lighting + ground detail so the grass is not a flat colour.
      terrain.lineStyle(1, 0x9ec077, 0.22);
      terrain.beginPath();
      terrain.moveTo(cx - HALF_W, cy);
      terrain.lineTo(cx, cy - HALF_H);
      terrain.lineTo(cx + HALF_W, cy);
      terrain.strokePath();
      tileDecoration(terrain, cx, cy, tileX, tileY);
    }
  }
  return terrain;
}

// Deterministic, cheap per-tile scatter (grass tufts / pebbles) hashed from the
// tile coordinate so the ground reads as authored texture, not a flat fill.
function tileDecoration(g, cx, cy, x, y) {
  const hash = Math.abs((x * 73856093) ^ (y * 19349663));
  const roll = hash % 100;
  if (roll < 15) {
    const bx = cx + (((hash >> 3) % 9) - 4);
    const by = cy + (((hash >> 6) % 5) - 2);
    g.lineStyle(1, 0x37612c, 0.55);
    g.beginPath();
    g.moveTo(bx - 2, by + 2); g.lineTo(bx - 2, by - 2);
    g.moveTo(bx, by + 2); g.lineTo(bx, by - 4);
    g.moveTo(bx + 2, by + 2); g.lineTo(bx + 2, by - 2);
    g.strokePath();
  } else if (roll < 21) {
    g.fillStyle(0x9a9478, 0.5);
    g.fillCircle(cx + (((hash >> 4) % 10) - 5), cy + (((hash >> 7) % 4) - 1), 1.6);
  }
}

function diamondPath(graphic, cx, cy, halfW = HALF_W, halfH = HALF_H) {
  graphic.beginPath();
  graphic.moveTo(cx, cy - halfH);
  graphic.lineTo(cx + halfW, cy);
  graphic.lineTo(cx, cy + halfH);
  graphic.lineTo(cx - halfW, cy);
  graphic.closePath();
}

/** Fill one tile diamond (used for hover, command, and placement markers). */
export function drawTileMarker(graphic, cx, cy, color, alpha, fillAlpha = 0.18) {
  graphic.clear();
  graphic.fillStyle(color, fillAlpha);
  graphic.lineStyle(2, color, alpha);
  diamondPath(graphic, cx, cy);
  graphic.fillPath();
  graphic.strokePath();
}

function makeHpBar(scene, width) {
  const bg = scene.add.rectangle(0, -40, width, 4, 0x1b1b1b, 0.9);
  const fill = scene.add.rectangle(-width / 2, -40, width, 4, 0x6fcf5f, 1).setOrigin(0, 0.5);
  bg.setVisible(false);
  fill.setVisible(false);
  return { bg, fill, width };
}

/** Update an hp bar's width and colour; hides it while at full health. */
export function updateHpBar(hpBar, hp, maxHp) {
  if (!hpBar) return;
  const ratio = maxHp > 0 ? Math.max(0, hp / maxHp) : 0;
  const show = ratio < 1 && hp > 0;
  hpBar.bg.setVisible(show);
  hpBar.fill.setVisible(show);
  hpBar.fill.width = hpBar.width * ratio;
  hpBar.fill.fillColor = ratio > 0.5 ? 0x6fcf5f : ratio > 0.25 ? 0xe0c84a : 0xd45b4a;
}

// --- Units -----------------------------------------------------------------

function unitPalette(type, friendly) {
  if (type === 'villager') {
    return friendly
      ? { body: 0x4a74c8, trim: 0x6a93df, legs: 0x3b5a92, skin: 0xe8bd91, cap: 0xd8a24b, crest: 0xffe08a, outline: 0x24324d }
      : { body: 0x9a5bb0, trim: 0xb57bcb, legs: 0x6e4080, skin: 0xcf9f78, cap: 0x7a4a8c, crest: 0xd9a7e8, outline: 0x3a2447 };
  }
  return friendly
    ? { body: 0x3f8d58, trim: 0x5fae74, legs: 0x2c6440, skin: 0xe8bd91, cap: 0xb9c0c7, crest: 0xffe08a, outline: 0x1d3d2a }
    : { body: 0xc14b38, trim: 0xd96f55, legs: 0x7f2f22, skin: 0xcf9f78, cap: 0x6a3a32, crest: 0xf0b7a0, outline: 0x3c1714 };
}

/**
 * Build a unit sprite (villager / clubman / enemy raider).
 * Returns the container plus the pieces the scene toggles each frame.
 */
export function createUnitSprite(scene, type, faction) {
  const friendly = faction === 'player';
  const military = type === 'clubman' || type === 'raider';
  const c = unitPalette(type, friendly);

  const selectionRing = scene.add.ellipse(0, 0, military ? 32 : 28, 14, 0xfff1a1, 0.12)
    .setStrokeStyle(2, friendly ? 0xfff1a1 : 0xff9c8a, 0.95)
    .setVisible(false);
  const shadow = scene.add.ellipse(0, 0, military ? 24 : 20, 9, 0x101a0e, 0.5);
  const parts = [selectionRing, shadow];

  // Legs give a planted stance and a readable base.
  parts.push(scene.add.rectangle(-4, -3, 5, 9, c.legs, 1).setStrokeStyle(1, c.outline));
  parts.push(scene.add.rectangle(4, -3, 5, 9, c.legs, 1).setStrokeStyle(1, c.outline));

  // Torso — military units are broader for a clearly different silhouette.
  const torsoW = military ? 19 : 14;
  parts.push(scene.add.ellipse(0, -12, torsoW, 18, c.body, 1).setStrokeStyle(2, c.outline));

  let carryCue = null;
  if (military) {
    // Pauldrons widen the shoulders; a club marks the combat role.
    parts.push(scene.add.circle(-9, -16, 4, c.trim, 1).setStrokeStyle(1, c.outline));
    parts.push(scene.add.circle(9, -16, 4, c.trim, 1).setStrokeStyle(1, c.outline));
    parts.push(scene.add.rectangle(12, -18, 4, 16, 0x7a5330, 1).setStrokeStyle(1, 0x3e2a17).setRotation(0.5));
    parts.push(scene.add.circle(16, -25, 4, 0x8a6a40, 1).setStrokeStyle(1, 0x3e2a17));
  } else {
    // A tool slung on the back reads as a worker; the carry crate toggles on.
    parts.push(scene.add.rectangle(-10, -16, 3, 14, 0x6d4a2c, 1).setStrokeStyle(1, 0x3e2a17).setRotation(-0.4));
    carryCue = scene.add.rectangle(10, -14, 14, 8, 0xa46934, 1).setStrokeStyle(1, 0x4a2b17).setRotation(-0.28).setVisible(false);
    parts.push(carryCue);
  }

  parts.push(scene.add.circle(0, -24, 6, c.skin, 1).setStrokeStyle(1, 0x4f382a));
  if (military) {
    parts.push(scene.add.ellipse(0, -27, 13, 8, c.cap, 1).setStrokeStyle(1, c.outline));
    parts.push(scene.add.triangle(0, -33, -3, 5, 3, 5, 0, -5, c.crest, 1));
  } else {
    parts.push(scene.add.ellipse(0, -27, 12, 6, c.cap, 1).setStrokeStyle(1, c.outline));
  }

  const hpBar = makeHpBar(scene, military ? 24 : 22);
  parts.push(hpBar.bg, hpBar.fill);

  const container = scene.add.container(0, 0, parts);
  return { container, selectionRing, carryCue, hpBar };
}

// --- Buildings --------------------------------------------------------------

function makeBuilding(scene, draw, opts = {}) {
  const {
    selectable = true,
    ringW = 70, ringH = 34, ringY = -6,
    shadowW = 52, shadowH = 18,
    hpWidth = 42, hpY = -54,
  } = opts;
  const parts = [];
  let selectionRing = null;
  if (selectable) {
    selectionRing = scene.add.ellipse(0, ringY, ringW, ringH, 0xfff1a1, 0.08)
      .setStrokeStyle(2, 0xfff1a1, 0.95).setVisible(false);
    parts.push(selectionRing);
  }
  parts.push(scene.add.ellipse(0, 3, shadowW, shadowH, 0x0f170c, 0.45));
  const g = scene.add.graphics();
  draw(g);
  parts.push(g);
  const hpBar = makeHpBar(scene, hpWidth);
  hpBar.bg.y = hpY;
  hpBar.fill.y = hpY;
  parts.push(hpBar.bg, hpBar.fill);
  return { container: scene.add.container(0, 0, parts), selectionRing, hpBar };
}

function courses(g, left, right, top, bottom, step, color, alpha) {
  g.lineStyle(1, color, alpha);
  for (let yy = top + step; yy < bottom; yy += step) {
    g.beginPath();
    g.moveTo(left, yy);
    g.lineTo(right, yy);
    g.strokePath();
  }
}

/** Player Town Center: a stone hall with a timber roof and a gold pennant. */
function drawTownCenter(g) {
  g.fillStyle(0x7d6a48, 1);
  g.fillPoints([{ x: -26, y: 2 }, { x: 0, y: 12 }, { x: 26, y: 2 }, { x: 0, y: -8 }], true);
  g.fillStyle(0xbfa775, 1);
  g.fillRect(-22, -28, 44, 28);
  g.fillStyle(0x9c875c, 1);
  g.fillRect(-22, -28, 13, 28);
  g.lineStyle(2, 0x5c4a30, 1);
  g.strokeRect(-22, -28, 44, 28);
  courses(g, -22, 22, -28, 0, 7, 0x5c4a30, 0.32);
  const roof = [{ x: -27, y: -28 }, { x: 27, y: -28 }, { x: 17, y: -46 }, { x: -17, y: -46 }];
  g.fillStyle(0x9a5b36, 1);
  g.fillPoints(roof, true);
  g.lineStyle(2, 0x4a2b17, 1);
  g.strokePoints(roof, true);
  g.fillStyle(0x7a4527, 1);
  g.fillRect(-17, -46, 34, 3);
  g.fillStyle(0x6f5a86, 1);
  g.fillRect(-16, -22, 6, 6);
  g.fillRect(10, -22, 6, 6);
  g.fillStyle(0x4a3120, 1);
  g.fillRect(-6, -14, 12, 14);
  g.lineStyle(1, 0x2c1c10, 1);
  g.strokeRect(-6, -14, 12, 14);
  g.lineStyle(2, 0x3a2a18, 1);
  g.beginPath();
  g.moveTo(18, -28);
  g.lineTo(18, -52);
  g.strokePath();
  g.fillStyle(0xe7c66a, 1);
  g.fillPoints([{ x: 18, y: -52 }, { x: 31, y: -48 }, { x: 18, y: -44 }], true);
}

/** Player Barracks: a timber hut with a red war-shield emblem over the door. */
function drawBarracks(g) {
  g.fillStyle(0x6f5e3f, 1);
  g.fillPoints([{ x: -22, y: 2 }, { x: 0, y: 11 }, { x: 22, y: 2 }, { x: 0, y: -7 }], true);
  g.fillStyle(0xa07b4c, 1);
  g.fillRect(-19, -24, 38, 24);
  g.fillStyle(0x82623a, 1);
  g.fillRect(-19, -24, 11, 24);
  g.lineStyle(2, 0x543a20, 1);
  g.strokeRect(-19, -24, 38, 24);
  g.lineStyle(1, 0x543a20, 0.4);
  for (let xx = -11; xx < 19; xx += 8) {
    g.beginPath();
    g.moveTo(xx, -24);
    g.lineTo(xx, 0);
    g.strokePath();
  }
  const roof = [{ x: -23, y: -24 }, { x: 23, y: -24 }, { x: 14, y: -39 }, { x: -14, y: -39 }];
  g.fillStyle(0x6d4a2c, 1);
  g.fillPoints(roof, true);
  g.lineStyle(2, 0x3e2a17, 1);
  g.strokePoints(roof, true);
  g.fillStyle(0x4a3120, 1);
  g.fillRect(-5, -12, 10, 12);
  g.fillStyle(0x8a3b32, 1);
  g.fillPoints([{ x: 0, y: -23 }, { x: 6, y: -20 }, { x: 6, y: -15 }, { x: 0, y: -12 }, { x: -6, y: -15 }, { x: -6, y: -20 }], true);
  g.lineStyle(1.5, 0xe9e0c4, 0.95);
  g.beginPath();
  g.moveTo(-4, -21); g.lineTo(4, -14);
  g.moveTo(4, -21); g.lineTo(-4, -14);
  g.strokePath();
}

/** Enemy Outpost (the objective): a dark-red watchtower with a red war flag. */
function drawOutpost(g) {
  g.fillStyle(0x3f2422, 1);
  g.fillPoints([{ x: -20, y: 2 }, { x: 0, y: 10 }, { x: 20, y: 2 }, { x: 0, y: -6 }], true);
  g.fillStyle(0x8a4a46, 1);
  g.fillRect(-15, -40, 30, 40);
  g.fillStyle(0x6a3734, 1);
  g.fillRect(-15, -40, 9, 40);
  g.lineStyle(2, 0x3f1f1f, 1);
  g.strokeRect(-15, -40, 30, 40);
  courses(g, -15, 15, -40, 0, 8, 0x3f1f1f, 0.4);
  g.fillStyle(0x7d4340, 1);
  g.lineStyle(1, 0x3f1f1f, 1);
  for (let bx = -15; bx < 15; bx += 10) {
    g.fillRect(bx, -46, 6, 8);
    g.strokeRect(bx, -46, 6, 8);
  }
  g.fillStyle(0x201010, 1);
  g.fillRect(-4, -30, 8, 12);
  g.lineStyle(2, 0x2a1414, 1);
  g.beginPath();
  g.moveTo(0, -46);
  g.lineTo(0, -64);
  g.strokePath();
  g.fillStyle(0xd45b4a, 1);
  g.fillPoints([{ x: 0, y: -64 }, { x: 17, y: -59 }, { x: 0, y: -54 }], true);
}

/** Town Center sprite + selection ring (player can select it to train). */
export function createTownCenter(scene) {
  return makeBuilding(scene, drawTownCenter, { ringW: 72, ringH: 36, ringY: -8, shadowW: 54, shadowH: 19, hpWidth: 44, hpY: -54 });
}

/**
 * Barracks sprite. The scene dims the whole container while it is still a
 * foundation (via container.setAlpha) and restores it to full on completion.
 */
export function createBarracks(scene) {
  return makeBuilding(scene, drawBarracks, { ringW: 60, ringH: 30, ringY: -4, shadowW: 46, shadowH: 17, hpWidth: 38, hpY: -46 });
}

/** Enemy outpost (the objective). */
export function createOutpost(scene) {
  return makeBuilding(scene, drawOutpost, { selectable: false, shadowW: 42, shadowH: 16, hpWidth: 34, hpY: -54 });
}

// --- Resource nodes ---------------------------------------------------------

/** Tree (Wood node). */
export function createTree(scene) {
  const shadow = scene.add.ellipse(0, 0, 30, 12, 0x24351d, 0.55);
  const trunk = scene.add.rectangle(0, -15, 9, 24, 0x79502d, 1).setStrokeStyle(1, 0x4a341f);
  const stump = scene.add.rectangle(0, -6, 16, 9, 0x79502d, 1).setStrokeStyle(1, 0x4a341f).setVisible(false);
  const canopy = [
    scene.add.circle(-9, -33, 13, 0x3b6531, 1).setStrokeStyle(2, 0x294b27),
    scene.add.circle(9, -35, 14, 0x4c7d3b, 1).setStrokeStyle(2, 0x294b27),
    scene.add.circle(0, -47, 14, 0x5b8a45, 1).setStrokeStyle(2, 0x315b2d),
    scene.add.circle(-3, -42, 6, 0x6fa052, 1),
    scene.add.circle(5, -40, 5, 0x6fa052, 1),
  ];
  const container = scene.add.container(0, 0, [shadow, trunk, stump, ...canopy]);
  return { container, shadow, trunk, stump, canopy };
}

/** Berry bush (Food node). */
export function createBerryBush(scene) {
  const shadow = scene.add.ellipse(0, 0, 26, 11, 0x24351d, 0.5);
  const foliage = scene.add.ellipse(0, -11, 28, 22, 0x3f6b3a, 1).setStrokeStyle(2, 0x274a24);
  const stump = scene.add.ellipse(0, -5, 18, 10, 0x4a5a38, 1).setVisible(false);
  const berries = [
    scene.add.circle(-6, -12, 2.6, 0xc0405a, 1),
    scene.add.circle(5, -9, 2.6, 0xc0405a, 1),
    scene.add.circle(0, -16, 2.6, 0xd4556e, 1),
    scene.add.circle(7, -16, 2.6, 0xc0405a, 1),
    scene.add.circle(-7, -5, 2.6, 0xd4556e, 1),
  ];
  const container = scene.add.container(0, 0, [shadow, foliage, stump, ...berries]);
  return { container, shadow, foliage, stump, berries };
}
