export const MAP_WIDTH = 32;
export const MAP_HEIGHT = 32;
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

export function tileToScreen(tileX, tileY) {
  return {
    x: (tileX - tileY) * (TILE_WIDTH / 2),
    y: (tileX + tileY) * (TILE_HEIGHT / 2),
  };
}

export function screenToTile(screenX, screenY) {
  const halfWidth = TILE_WIDTH / 2;
  const halfHeight = TILE_HEIGHT / 2;
  return {
    x: (screenX / halfWidth + screenY / halfHeight) / 2,
    y: (screenY / halfHeight - screenX / halfWidth) / 2,
  };
}

export function mapPixelBounds() {
  return {
    width: (MAP_WIDTH + MAP_HEIGHT) * (TILE_WIDTH / 2),
    height: (MAP_WIDTH + MAP_HEIGHT) * (TILE_HEIGHT / 2),
  };
}

export function tileColor(x, y) {
  const variation = (x * 17 + y * 31 + x * y * 7) % 9;
  return variation < 3 ? 0x668c4d : variation < 6 ? 0x709553 : 0x789b58;
}
