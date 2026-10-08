import assert from 'node:assert/strict';
import test from 'node:test';

import { CUES, createAudioCues } from '../src/game/audio.js';

// A minimal AudioContext stand-in that records how many oscillators/gains were
// built so we can assert that cues actually synthesize (or stay silent).
function fakeContext(initialState = 'running') {
  const node = () => ({
    type: 'sine',
    frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    connect() {},
    start() {},
    stop() {},
  });
  return {
    state: initialState,
    currentTime: 0,
    resumeCount: 0,
    oscillators: 0,
    resume() {
      this.resumeCount += 1;
      this.state = 'running';
      return Promise.resolve();
    },
    createOscillator() {
      this.oscillators += 1;
      return node();
    },
    createGain() {
      return node();
    },
    destination: {},
  };
}

test('audio is opt-in: disabled by default and silent until enabled', () => {
  const ctx = fakeContext();
  let built = 0;
  const audio = createAudioCues({
    contextFactory: () => {
      built += 1;
      return ctx;
    },
  });

  assert.equal(audio.isEnabled(), false);
  assert.equal(audio.play('select'), false);
  // No context is even constructed before the user enables sound.
  assert.equal(built, 0);
});

test('enabling creates the context and resumes it when suspended (gesture unlock)', () => {
  const ctx = fakeContext('suspended');
  const audio = createAudioCues({ contextFactory: () => ctx });

  audio.setEnabled(true);
  assert.equal(audio.isEnabled(), true);
  assert.equal(ctx.resumeCount, 1, 'a suspended context is resumed on enable');
});

test('playing a known cue while enabled synthesizes oscillators', () => {
  const ctx = fakeContext();
  const audio = createAudioCues({ contextFactory: () => ctx });
  audio.setEnabled(true);

  assert.equal(audio.play('select'), true);
  assert.equal(ctx.oscillators, 1);
});

test('arpeggio cues synthesize one oscillator per note', () => {
  const ctx = fakeContext();
  const audio = createAudioCues({ contextFactory: () => ctx });
  audio.setEnabled(true);

  assert.equal(audio.play('victory'), true);
  assert.equal(ctx.oscillators, CUES.victory.arpeggio.length);
});

test('unknown cues are ignored', () => {
  const ctx = fakeContext();
  const audio = createAudioCues({ contextFactory: () => ctx });
  audio.setEnabled(true);
  assert.equal(audio.play('does-not-exist'), false);
  assert.equal(ctx.oscillators, 0);
});

test('the same cue is throttled so rapid events do not stack into a buzz', () => {
  const ctx = fakeContext();
  let clock = 1000;
  const audio = createAudioCues({ contextFactory: () => ctx, now: () => clock });
  audio.setEnabled(true);

  assert.equal(audio.play('attack'), true);
  assert.equal(audio.play('attack'), false, 'second hit within the window is dropped');
  clock += 100;
  assert.equal(audio.play('attack'), true, 'plays again once the window passes');
  assert.equal(ctx.oscillators, 2);
});

test('toggle flips the enabled state and muting stops playback', () => {
  const ctx = fakeContext();
  const audio = createAudioCues({ contextFactory: () => ctx });

  assert.equal(audio.toggle(), true);
  assert.equal(audio.play('command'), true);
  assert.equal(audio.toggle(), false);
  assert.equal(audio.play('command'), false);
});

test('a missing Web Audio implementation degrades to a silent no-op', () => {
  const audio = createAudioCues({ contextFactory: () => null });
  audio.setEnabled(true);
  assert.equal(audio.play('select'), false);
});
