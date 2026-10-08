// Pure rally-point helpers: no Phaser, no scene state. A rally point tells a
// production building where freshly trained units should go. Rallying onto a
// live resource node issues a gather order (for units that can gather);
// anywhere else — or a depleted node — is a plain move.

export function createRallyPoint(tile, { nodeId = null, resource = null } = {}) {
  if (!tile) return null;
  return { tile: { x: tile.x, y: tile.y }, nodeId, resource };
}

export function rallyOrderForUnit(rally, unit, { nodeAmount = 0 } = {}) {
  if (!rally) return null;
  const canGather = (unit?.capacity ?? 0) > 0;
  if (rally.nodeId != null && canGather && nodeAmount > 0) {
    return { type: 'gather', nodeId: rally.nodeId };
  }
  return { type: 'move', tile: { x: rally.tile.x, y: rally.tile.y } };
}
