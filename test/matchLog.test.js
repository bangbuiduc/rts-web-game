import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MATCH_LOG_VERSION,
  EVENT_TYPES,
  createMatchLog,
  serializeMatchLog,
  matchLogFilename,
  downloadMatchLog,
} from '../src/game/matchLog.js';

test('record assigns incrementing sequence numbers and stores payloads', () => {
  const log = createMatchLog({ now: () => 1000 });
  const first = log.record(EVENT_TYPES.MATCH_START, 0, { villagers: 3 });
  const second = log.record(EVENT_TYPES.ORDER, 120, { order: 'move' });

  assert.equal(first.seq, 0);
  assert.equal(second.seq, 1);
  assert.equal(first.type, 'match-start');
  assert.deepEqual(second.data, { order: 'move' });
  assert.equal(log.size(), 2);
});

test('record ignores a missing type and keeps elapsed time monotonic', () => {
  const log = createMatchLog();
  assert.equal(log.record('', 10), null);
  assert.equal(log.size(), 0);

  log.record(EVENT_TYPES.DAMAGE, 500);
  // A stale/earlier delta must never reorder the timeline.
  const late = log.record(EVENT_TYPES.DAMAGE, 200);
  assert.equal(late.elapsedMs, 500);
});

test('the ring buffer drops the oldest events once the cap is exceeded', () => {
  const log = createMatchLog({ maxEvents: 3 });
  for (let i = 0; i < 5; i += 1) log.record(EVENT_TYPES.DAMAGE, i * 10, { i });

  const events = log.getEvents();
  assert.equal(events.length, 3);
  assert.equal(log.droppedCount(), 2);
  // Oldest (seq 0,1) dropped; seq keeps counting so ids stay unique.
  assert.deepEqual(events.map((event) => event.seq), [2, 3, 4]);
});

test('snapshot is a stable, self-describing, deep-copied view', () => {
  const log = createMatchLog({ now: () => Date.parse('2026-10-08T12:00:00Z') });
  log.record(EVENT_TYPES.ORDER, 42, { tile: { x: 1, y: 2 } });

  const snapshot = log.snapshot();
  assert.equal(snapshot.version, MATCH_LOG_VERSION);
  assert.equal(snapshot.createdAt, '2026-10-08T12:00:00.000Z');
  assert.equal(snapshot.exportedAt, '2026-10-08T12:00:00.000Z');
  assert.equal(snapshot.eventCount, 1);
  assert.equal(snapshot.droppedCount, 0);

  // Mutating the snapshot must not corrupt the live log.
  snapshot.events[0].data.tile.x = 99;
  assert.equal(log.getEvents()[0].data.tile.x, 1);
});

test('serializeMatchLog produces JSON that round-trips', () => {
  const log = createMatchLog();
  log.record(EVENT_TYPES.VICTORY, 1234, { resources: { food: 10, wood: 20 } });

  const text = serializeMatchLog(log);
  const parsed = JSON.parse(text);
  assert.equal(parsed.events[0].type, 'victory');
  assert.equal(parsed.events[0].elapsedMs, 1234);
  assert.equal(parsed.events[0].data.resources.wood, 20);
  // Compact mode stays valid and smaller.
  assert.ok(serializeMatchLog(log, { pretty: false }).length < text.length);
});

test('matchLogFilename is timestamped and filesystem-safe', () => {
  const name = matchLogFilename(Date.parse('2026-10-08T12:34:56Z'));
  assert.equal(name, 'rts-match-log-2026-10-08_12-34-56.json');
  // No colons anywhere, and the only dot is the file extension.
  assert.ok(!name.includes(':'));
  assert.equal(name.split('.').length, 2);
  assert.ok(name.endsWith('.json'));
});

test('downloadMatchLog builds a Blob URL and cleans it up afterwards', () => {
  const log = createMatchLog();
  log.record(EVENT_TYPES.MATCH_START, 0, { villagers: 3 });

  const calls = [];
  const anchor = {
    click() { calls.push('click'); },
    set href(value) { this._href = value; },
    get href() { return this._href; },
  };
  const fakeDoc = {
    createElement() { return anchor; },
    body: {
      appendChild() { calls.push('append'); },
      removeChild() { calls.push('remove'); },
    },
  };
  const fakeUrl = {
    createObjectURL() { calls.push('create-url'); return 'blob:fake'; },
    revokeObjectURL(url) { calls.push(`revoke:${url}`); },
  };
  class FakeBlob {
    constructor(parts, opts) { this.parts = parts; this.type = opts.type; }
  }

  const result = downloadMatchLog(log, {
    doc: fakeDoc,
    urlApi: fakeUrl,
    BlobCtor: FakeBlob,
    now: () => Date.parse('2026-10-08T12:34:56Z'),
  });

  assert.equal(result.filename, 'rts-match-log-2026-10-08_12-34-56.json');
  assert.ok(result.bytes > 0);
  assert.equal(anchor.download, 'rts-match-log-2026-10-08_12-34-56.json');
  assert.equal(anchor.href, 'blob:fake');
  // Ordered lifecycle including cleanup of the object URL and the anchor.
  assert.deepEqual(calls, ['create-url', 'append', 'click', 'remove', 'revoke:blob:fake']);
});
