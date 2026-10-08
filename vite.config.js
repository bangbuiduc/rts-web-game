import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

// Resolve bare `import 'phaser'` to our custom slim build (see
// src/game/phaser-slim.js). Building Phaser from source lets us drop the
// physics engines, sound, and debug/experimental code the game never uses.
const phaserSlim = fileURLToPath(new URL('./src/game/phaser-slim.js', import.meta.url));

// Phaser's source gates optional subsystems behind `typeof FLAG` checks that
// its own webpack build replaces textually at compile time. Vite's `define`
// can't key on a `typeof X` expression, so we do the same replacement by hand.
// Mirror Phaser's dist config, but with FEATURE_SOUND disabled (the game has
// no audio) so the whole Sound subsystem drops out. WEBGL_DEBUG=false also
// removes the optional `phaser3spectorjs` debug dependency (not installed).
// Values must be the literal `true`/`false` so the whole expression is replaced.
const PHASER_FLAGS = {
  'typeof CANVAS_RENDERER': 'true',
  'typeof WEBGL_RENDERER': 'true',
  'typeof WEBGL_DEBUG': 'false',
  'typeof EXPERIMENTAL': 'false',
  'typeof PLUGIN_3D': 'false',
  'typeof PLUGIN_CAMERA3D': 'false',
  'typeof PLUGIN_FBINSTANT': 'false',
  'typeof FEATURE_SOUND': 'false',
};

const isPhaserModule = (id) => id.includes('/phaser/src/') || id.includes('phaser-slim');

function applyFlags(code) {
  let out = code;
  for (const [expr, value] of Object.entries(PHASER_FLAGS)) {
    out = out.split(expr).join(value);
  }
  return out;
}

// Production build (Rollup): replace flags before bundling/tree-shaking.
function phaserBuildFlags() {
  return {
    name: 'phaser-build-flags',
    enforce: 'pre',
    transform(code, id) {
      if (!isPhaserModule(id)) return null;
      const out = applyFlags(code);
      return out === code ? null : { code: out, map: null };
    },
  };
}

// Dev dependency pre-bundle (esbuild): the optimizer does NOT run Vite's
// `transform` hooks, so apply the same replacement via an esbuild onLoad hook.
// Without this, `typeof WEBGL_DEBUG` stays truthy and esbuild tries to resolve
// the optional (uninstalled) `phaser3spectorjs` debug dependency.
const phaserFlagsEsbuild = {
  name: 'phaser-flags-esbuild',
  setup(build) {
    build.onLoad({ filter: /[\\/]phaser[\\/]src[\\/].*\.js$/ }, async (args) => {
      const code = await readFile(args.path, 'utf8');
      return { contents: applyFlags(code), loader: 'js' };
    });
  },
};

export default defineConfig({
  plugins: [phaserBuildFlags()],
  resolve: {
    // Exact match only: rewrite bare `import 'phaser'` to the slim build, while
    // leaving the deep `phaser/src/...` imports inside phaser-slim.js untouched.
    alias: [{ find: /^phaser$/, replacement: phaserSlim }],
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [phaserFlagsEsbuild],
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the Phaser engine into its own chunk so it caches independently
        // of game code across deploys (game logic changes far more often).
        manualChunks(id) {
          if (isPhaserModule(id)) {
            return 'phaser';
          }
          return undefined;
        },
      },
    },
  },
});
