// Local match logger. Pure JS, no Phaser and no network: it records a bounded,
// time-stamped stream of meaningful gameplay events (orders, resource flow,
// construction, training, combat, end-game) so a match can be reviewed or
// exported to JSON entirely in the browser.
//
// The log is the authority for sequence numbers and wall-clock `createdAt`;
// callers supply the match-elapsed time so event timing stays coherent with the
// scene's own game clock instead of drifting against Date.now during pauses.

export const MATCH_LOG_VERSION = 1;
export const DEFAULT_MAX_EVENTS = 2000;

/**
 * Create a bounded match log.
 * @param {object} [options]
 * @param {number} [options.maxEvents] Ring-buffer cap; oldest events drop first.
 * @param {() => number} [options.now] Wall-clock source (epoch ms), injectable for tests.
 */
export function createMatchLog({ maxEvents = DEFAULT_MAX_EVENTS, now = () => Date.now() } = {}) {
  const cap = Math.max(1, Math.floor(maxEvents));
  const createdAt = now();
  const events = [];
  let seq = 0;
  let dropped = 0;
  let lastElapsedMs = 0;

  /**
   * Append one event. Returns the stored record, or null when `type` is missing.
   * @param {string} type Stable event name (see EVENT_TYPES).
   * @param {number} elapsedMs Match-elapsed time in ms (clamped monotonic).
   * @param {object} [data] Serializable payload (ids, positions, snapshots).
   */
  function record(type, elapsedMs, data = {}) {
    if (!type) return null;
    // Clamp monotonic so a stray negative/stale delta can never reorder time.
    const t = Math.max(lastElapsedMs, Math.round(Number(elapsedMs) || 0));
    lastElapsedMs = t;
    const event = { seq: seq++, type, elapsedMs: t, data };
    events.push(event);
    if (events.length > cap) {
      events.shift();
      dropped += 1;
    }
    return event;
  }

  /** Immutable point-in-time view suitable for JSON export. */
  function snapshot() {
    return {
      version: MATCH_LOG_VERSION,
      createdAt: new Date(createdAt).toISOString(),
      exportedAt: new Date(now()).toISOString(),
      maxEvents: cap,
      eventCount: events.length,
      droppedCount: dropped,
      // Deep clone so callers can mutate the snapshot without touching live state.
      events: structuredClone(events),
    };
  }

  return {
    get createdAt() {
      return createdAt;
    },
    record,
    snapshot,
    size: () => events.length,
    droppedCount: () => dropped,
    getEvents: () => events.map((event) => ({ ...event })),
    clear() {
      events.length = 0;
      seq = 0;
      dropped = 0;
      lastElapsedMs = 0;
    },
  };
}

/** Stable event names so exported logs keep a predictable schema. */
export const EVENT_TYPES = Object.freeze({
  MATCH_START: 'match-start',
  ORDER: 'order',
  RESOURCE_DELIVERED: 'resource-delivered',
  NODE_DEPLETED: 'node-depleted',
  TRAIN_QUEUED: 'train-queued',
  UNIT_TRAINED: 'unit-trained',
  BUILD_STARTED: 'build-started',
  BUILD_COMPLETED: 'build-completed',
  ENEMY_REINFORCED: 'enemy-reinforced',
  DAMAGE: 'damage',
  ENTITY_KILLED: 'entity-killed',
  VICTORY: 'victory',
  DEFEAT: 'defeat',
});

/** Serialize a log snapshot to JSON text. */
export function serializeMatchLog(log, { pretty = true } = {}) {
  return JSON.stringify(log.snapshot(), null, pretty ? 2 : 0);
}

/**
 * Build a filesystem-safe, timestamped export filename.
 * @param {number} [timestamp] Epoch ms; defaults to now.
 */
export function matchLogFilename(timestamp = Date.now()) {
  const stamp = new Date(timestamp)
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  return `rts-match-log-${stamp}.json`;
}

/**
 * Download the log as a JSON file via a Blob object URL, cleaning up the URL and
 * the temporary anchor afterwards. Dependencies are injectable so the browser
 * glue can be exercised in Node tests with fakes.
 * @returns {{ filename: string, bytes: number }}
 */
export function downloadMatchLog(log, {
  doc = globalThis.document,
  urlApi = globalThis.URL,
  BlobCtor = globalThis.Blob,
  now = () => Date.now(),
} = {}) {
  const text = serializeMatchLog(log);
  const filename = matchLogFilename(now());
  const blob = new BlobCtor([text], { type: 'application/json' });
  const url = urlApi.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  doc.body.appendChild(anchor);
  anchor.click();
  doc.body.removeChild(anchor);
  urlApi.revokeObjectURL(url);
  return { filename, bytes: text.length };
}
