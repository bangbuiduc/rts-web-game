// Pure helpers for marquee (drag-box) selection. Screen-space maths only, so
// the scene can stay focused on wiring Phaser input to these results.

/** Build an axis-aligned rect from two corner points. */
export function normalizeRect(ax, ay, bx, by) {
  return {
    minX: Math.min(ax, bx),
    minY: Math.min(ay, by),
    maxX: Math.max(ax, bx),
    maxY: Math.max(ay, by),
  };
}

/** True when `(px, py)` falls inside (or on the edge of) `rect`. */
export function rectContainsPoint(rect, px, py) {
  return px >= rect.minX && px <= rect.maxX && py >= rect.minY && py <= rect.maxY;
}

/** True when the drag covered enough distance to count as a marquee, not a click. */
export function isDragSelection(rect, threshold = 6) {
  return rect.maxX - rect.minX >= threshold || rect.maxY - rect.minY >= threshold;
}
