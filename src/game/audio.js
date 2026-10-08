// Synthesized Web Audio cues. Opt-in by design: the game is silent until the
// player enables sound with the UI toggle, and that toggle click is itself the
// user gesture that unlocks/creates the AudioContext — so no audio ever plays
// before a gesture and nothing autoplays on load. All sounds are generated at
// runtime from oscillators (no audio files, no network, nothing copyrighted).

// Each cue is a tiny envelope over one oscillator; `arpeggio` plays a short
// chord sequence (used for the win/lose stingers). Volumes are intentionally
// low so cues stay as subtle feedback, never a wall of sound.
export const CUES = {
  select: { type: 'square', freq: 540, dur: 0.06, gain: 0.14 },
  command: { type: 'triangle', freq: 400, dur: 0.09, gain: 0.16, slideTo: 300 },
  train: { type: 'sine', freq: 480, dur: 0.14, gain: 0.18, slideTo: 720 },
  build: { type: 'sine', freq: 300, dur: 0.18, gain: 0.18, slideTo: 460 },
  attack: { type: 'sawtooth', freq: 190, dur: 0.05, gain: 0.1 },
  raid: { type: 'sawtooth', freq: 150, dur: 0.28, gain: 0.2, slideTo: 90 },
  victory: { type: 'triangle', dur: 0.26, gain: 0.2, arpeggio: [523, 659, 784] },
  defeat: { type: 'triangle', dur: 0.26, gain: 0.2, arpeggio: [330, 262, 196] },
};

// Minimum gap between two plays of the same cue (ms). Keeps high-frequency
// events (e.g. every melee hit) from stacking into a buzz.
const THROTTLE_MS = 55;

function defaultContextFactory() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

function defaultNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Create the audio controller.
 * @param {object} [opts]
 * @param {() => object|null} [opts.contextFactory] builds an AudioContext-like
 *   object; injected in tests. Called lazily on the first enable (the gesture).
 * @param {boolean} [opts.enabled] start enabled — defaults to false (opt-in).
 * @param {() => number} [opts.now] monotonic clock in ms (for throttling).
 */
export function createAudioCues({ contextFactory = defaultContextFactory, enabled = false, now = defaultNow } = {}) {
  let ctx = null;
  let currentlyEnabled = Boolean(enabled);
  const lastPlayedAt = Object.create(null);

  function ensureContext() {
    if (ctx) return ctx;
    try {
      ctx = contextFactory() ?? null;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function playTone(context, { type, freq, dur, gain, slideTo }, startOffset = 0) {
    const t0 = context.currentTime + startOffset;
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.type = type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    // Quick attack, smooth exponential decay to near-silence.
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp);
    amp.connect(context.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  return {
    isEnabled() {
      return currentlyEnabled;
    },

    /**
     * Enable/disable sound. Enabling lazily creates the AudioContext and, if the
     * browser suspended it until a gesture, resumes it. Because this is only ever
     * called from the UI toggle's click handler, it satisfies the gesture rule.
     */
    setEnabled(value) {
      currentlyEnabled = Boolean(value);
      if (currentlyEnabled) {
        const context = ensureContext();
        if (context?.state === 'suspended' && typeof context.resume === 'function') {
          context.resume();
        }
      }
      return currentlyEnabled;
    },

    toggle() {
      return this.setEnabled(!currentlyEnabled);
    },

    /** Play a named cue. No-op when disabled, unavailable, or throttled. */
    play(cueName) {
      if (!currentlyEnabled) return false;
      const cue = CUES[cueName];
      if (!cue) return false;
      const stamp = now();
      if (stamp - (lastPlayedAt[cueName] ?? -Infinity) < THROTTLE_MS) return false;
      const context = ensureContext();
      if (!context || typeof context.createOscillator !== 'function') return false;
      if (context.state === 'suspended' && typeof context.resume === 'function') context.resume();
      lastPlayedAt[cueName] = stamp;
      try {
        if (cue.arpeggio) {
          cue.arpeggio.forEach((freq, index) => {
            playTone(context, { ...cue, freq }, index * cue.dur * 0.9);
          });
        } else {
          playTone(context, cue);
        }
      } catch {
        return false;
      }
      return true;
    },
  };
}
