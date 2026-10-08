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
      terrain.lineStyle(1, 0x314c2c, 0.55);
      diamondPath(terrain, cx, cy);
      terrain.fillPath();
      terrain.strokePath();
    }
  }
  return terrain;
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

/**
 * Build a unit sprite (villager / clubman / enemy raider).
 * Returns the container plus the pieces the scene toggles each frame.
 */
export function createUnitSprite(scene, type, faction) {
  const friendly = faction === 'player';
  const bodyColor = type === 'villager'
    ? (friendly ? 0x527cb8 : 0x8a5a9c)
    : (friendly ? 0x3f7d52 : 0xb24b3a);
  const bodyStroke = friendly ? 0x24324d : 0x3c1714;

  const selectionRing = scene.add.ellipse(0, 0, 30, 13, 0xfff1a1, 0.12)
    .setStrokeStyle(2, friendly ? 0xfff1a1 : 0xff9c8a, 0.95)
    .setVisible(false);
  const shadow = scene.add.ellipse(0, 0, 20, 8, 0x142013, 0.55);
  const body = scene.add.ellipse(0, -9, 15, 17, bodyColor, 1).setStrokeStyle(2, bodyStroke);
  const head = scene.add.circle(0, -20, 6, friendly ? 0xe8bd91 : 0xcf9f78, 1).setStrokeStyle(1, 0x4f382a);

  const parts = [selectionRing, shadow, body];
  let carryCue = null;
  if (type === 'clubman' || (type === 'raider')) {
    // A simple club to read as a combat unit.
    const club = scene.add.rectangle(10, -16, 4, 14, 0x7a5330, 1).setStrokeStyle(1, 0x3e2a17).setRotation(0.5);
    parts.push(club);
  }
  if (type === 'villager') {
    carryCue = scene.add.rectangle(10, -13, 15, 7, 0xa46934, 1).setStrokeStyle(1, 0x4a2b17).setRotation(-0.28).setVisible(false);
    parts.push(carryCue);
  }
  parts.push(head);

  const hpBar = makeHpBar(scene, 22);
  parts.push(hpBar.bg, hpBar.fill);

  const container = scene.add.container(0, 0, parts);
  return { container, selectionRing, carryCue, hpBar };
}

/** Town Center sprite + selection ring (player can select it to train). */
export function createTownCenter(scene) {
  const selectionRing = scene.add.ellipse(0, -6, 70, 34, 0xfff1a1, 0.08)
    .setStrokeStyle(2, 0xfff1a1, 0.95).setVisible(false);
  const parts = [
    selectionRing,
    scene.add.ellipse(0, 1, 54, 19, 0x26351f, 0.55),
    scene.add.rectangle(0, -13, 37, 26, 0xc5aa72, 1).setStrokeStyle(2, 0x68543a),
    scene.add.triangle(0, -34, -24, 15, 24, 15, 0, -17, 0x875b37, 1).setStrokeStyle(2, 0x583b2a),
    scene.add.rectangle(0, -15, 9, 15, 0x755039, 1),
    scene.add.rectangle(16, -19, 7, 8, 0x8ba9a0, 1).setStrokeStyle(1, 0x584b39),
  ];
  const hpBar = makeHpBar(scene, 44);
  hpBar.bg.y = -48;
  hpBar.fill.y = -48;
  parts.push(hpBar.bg, hpBar.fill);
  return { container: scene.add.container(0, 0, parts), selectionRing, hpBar };
}

/**
 * Barracks sprite. The scene dims the whole container while it is still a
 * foundation (via container.setAlpha) and restores it to full on completion.
 */
export function createBarracks(scene) {
  const selectionRing = scene.add.ellipse(0, -4, 60, 30, 0xfff1a1, 0.08)
    .setStrokeStyle(2, 0xfff1a1, 0.95).setVisible(false);
  const parts = [
    selectionRing,
    scene.add.ellipse(0, 1, 46, 17, 0x26351f, 0.5),
    scene.add.rectangle(0, -11, 34, 22, 0x9c7b4e, 1).setStrokeStyle(2, 0x5c4428),
    scene.add.triangle(0, -27, -20, 10, 20, 10, 0, -12, 0x6d4a2c, 1).setStrokeStyle(2, 0x3e2a17),
    scene.add.rectangle(-9, -24, 5, 10, 0x5a3c22, 1),
    scene.add.rectangle(9, -24, 5, 10, 0x5a3c22, 1),
  ];
  const hpBar = makeHpBar(scene, 38);
  hpBar.bg.y = -40;
  hpBar.fill.y = -40;
  parts.push(hpBar.bg, hpBar.fill);
  return { container: scene.add.container(0, 0, parts), selectionRing, hpBar };
}

/** Enemy outpost (the objective). */
export function createOutpost(scene) {
  const parts = [
    scene.add.ellipse(0, 1, 44, 17, 0x2a1414, 0.55),
    scene.add.rectangle(0, -16, 24, 34, 0x7d4a4a, 1).setStrokeStyle(2, 0x3f1f1f),
    scene.add.triangle(0, -36, -16, 6, 16, 6, 0, -10, 0x9c3b3b, 1).setStrokeStyle(2, 0x3f1f1f),
    scene.add.rectangle(0, -44, 2, 12, 0x3f1f1f, 1),
    scene.add.triangle(0, -48, 0, -6, 12, -2, 0, 2, 0xd45b4a, 1),
  ];
  const hpBar = makeHpBar(scene, 34);
  hpBar.bg.y = -54;
  hpBar.fill.y = -54;
  parts.push(hpBar.bg, hpBar.fill);
  return { container: scene.add.container(0, 0, parts), hpBar };
}

/** Tree (Wood node). */
export function createTree(scene) {
  const shadow = scene.add.ellipse(0, 0, 30, 12, 0x24351d, 0.55);
  const trunk = scene.add.rectangle(0, -15, 9, 24, 0x79502d, 1).setStrokeStyle(1, 0x4a341f);
  const stump = scene.add.rectangle(0, -6, 16, 9, 0x79502d, 1).setStrokeStyle(1, 0x4a341f).setVisible(false);
  const canopy = [
    scene.add.circle(-8, -34, 13, 0x416c36, 1).setStrokeStyle(2, 0x294b27),
    scene.add.circle(8, -36, 14, 0x4c7d3b, 1).setStrokeStyle(2, 0x294b27),
    scene.add.circle(0, -46, 13, 0x5b8a45, 1).setStrokeStyle(2, 0x315b2d),
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
    scene.add.circle(-6, -12, 2.5, 0xc0405a, 1),
    scene.add.circle(5, -9, 2.5, 0xc0405a, 1),
    scene.add.circle(0, -16, 2.5, 0xd4556e, 1),
    scene.add.circle(7, -16, 2.5, 0xc0405a, 1),
    scene.add.circle(-7, -5, 2.5, 0xd4556e, 1),
  ];
  const container = scene.add.container(0, 0, [shadow, foliage, stump, ...berries]);
  return { container, shadow, foliage, stump, berries };
}
