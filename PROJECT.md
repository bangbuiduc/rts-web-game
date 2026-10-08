# RTS Web Game – Isometric

`PROJECT.md` is the source of truth for this project. Update it whenever a product decision, technical decision, milestone, or meaningful implementation status changes. A new session should read this file first and continue from its current status.

## Product

- **Genre:** real-time strategy game inspired by classic Age of Empires.
- **Target:** browser, desktop first; keep the structure compatible with later mobile support.
- **Current goal:** build a playable foundation on an isometric map, then add units, resources, buildings, and RTS systems incrementally.
- **Backend:** none for the initial prototype. Keep gameplay local to the browser.

## Technical decisions

- **Engine:** Phaser 3.
- **Language:** JavaScript (ES modules).
- **Build/dev server:** Vite.
- **Map:** 32 × 32 tiles (1,024 tiles).
- **Tile footprint:** 64 × 32 pixels.
- **Isometric projection:** `screenX = (tileX - tileY) × 32`, `screenY = (tileX + tileY) × 16`, plus a map-origin offset for rendering.
- **Initial art:** programmatically drawn placeholder terrain; replace with authored art later without changing game rules.

## Controls in the prototype

- Move the pointer over the map to inspect a tile and its coordinates.
- The three starting Villagers begin selected so the slice is immediately playable.
- **Left-click** a unit or your Town Center / Barracks to select it; hold **Shift** to add to the selection.
- **Left-drag** on open map to draw a marquee and select multiple units at once.
- **Right-click** issues a context command to the selected units: open ground = move, a tree/berry bush = gather, an enemy unit/building = attack.
- **Right-drag** pans the camera; the **mouse wheel** zooms.
- Press **Escape** to clear the selection (and cancel a pending build placement).
- Use the bottom command bar buttons to train/build; buttons are context-sensitive to the current selection and disable (with a feedback message) when a command is invalid.
- With a Town Center or Barracks selected, **right-click** the map to set its **rally point**: newly trained units walk to that spot, or auto-gather if it is a tree/berry bush. A line and flag mark the active rally point for the selected building.

## Milestones

1. **Isometric map foundation** — render the 32 × 32 grass map, inspect tiles, and support camera pan/zoom. *(Complete.)*
2. **Villager movement** — a placeholder Villager, click-to-move, and grid pathfinding. *(Complete.)*
3. **Resource loop** — chop trees and return Wood to a Town Center. *(Playable prototype complete; polish and edge cases remain.)*
4. **Core RTS systems** — buildings, resource economy, more units, combat, and basic AI. *(Playable vertical slice complete: Food + Wood economy, training, construction, multi-unit control, melee combat, and an enemy objective. Balance and polish remain.)*
5. **Expansion** — polish and evaluate multiplayer after the single-player loop is established.

## Current implementation status

- Created the initial Vite + Phaser app scaffold.
- Implemented the 32 × 32 placeholder grass map, pointer tile coordinates, click selection, drag-to-pan, and wheel zoom.
- Added a placeholder Villager, click-to-move commands, A* pathfinding over the four adjacent grid directions, and a visible route line.
- Added click selection for the Villager, an in-world selection ring, Escape deselection, and command gating so ground movement and tree harvesting only happen while the Villager is selected. Selecting the Villager does not click through into a movement command.
- Added tile-space line-of-sight routing and waypoint smoothing over the existing four-way A* fallback. The Villager now moves directly to unobstructed destinations, detours around blocked tree/Town Center tiles, and uses an inflated obstacle clearance matching its movement radius to avoid corner clipping.
- Retargeting now plans from the Villager's live tile-space position while moving, keeps the visible route anchored to the sprite, and chooses tree/Town Center approach tiles by actual travel distance rather than waypoint count. The route search evaluates nearby starting anchors rather than the entire map on each command.
- Automated tests were previously absent; `npm test` now runs 13 focused Node tests covering pathfinding, unobstructed diagonals, clearance-aware detours, mid-route retargeting, travel distance, and resource-loop transitions.
- `npm install` and `npm run build` complete successfully.
- Vite initially reported a single ~1.22–1.24 MB minified JavaScript bundle; this has since been optimised with a slim custom Phaser build and vendor code splitting (see the "Performance / bundle optimization" entry below).
- The workspace contains a pre-created read-only `.git` directory, so `git init` cannot initialize repository metadata here.
- Added two placeholder trees, a Town Center, Villager carry capacity, automatic return and delivery, HUD counts for stored/carried Wood, a carried-wood cue on the Villager, and stump/depletion cues for harvested trees.
- Browser loopback smoke test passed on localhost: clicking the tree at tile `(21, 13)` raised stored Wood to `3`, and the Villager continued chopping after delivery.
- **Stone Age vertical slice (current):** implemented a cohesive, AoE1-inspired playable loop on top of the existing map/pathfinding/camera:
  - **Economy:** Food and Wood resources with a live HUD (`Food · Wood · Dân số`). Villagers gather Wood from trees and Food from berry bushes using one shared, resource-agnostic gather loop, then auto-return to the nearest valid drop-off (the Town Center accepts both).
  - **Production:** the Town Center trains Villagers (50 Food); a Villager places a Barracks foundation (125 Wood) and builds it on site; the finished Barracks trains Clubmen (50 Food). Training and construction are gated by resource cost and population cap, with user-facing feedback when a command is invalid.
  - **Units & control:** multiple units are selectable by click, Shift-click, or left-drag marquee, and accept shared right-click commands (move / gather / attack). Command feedback includes a selection ring, a route line, a coloured command marker, and a transient message line.
  - **Combat & objective:** Clubmen and Villagers can attack; enemy raiders guard the Outpost and engage nearby player units/buildings (within six tiles), then attack on cooldown. The objective is to destroy the Enemy Outpost (victory banner); losing the Town Center is a defeat. The guard radius leaves time to establish a Stone Age economy before combat.
- **Architecture:** pure, framework-free logic was extracted into `economy.js`, `combat.js`, `enemyAI.js`, `selection.js`, and a generalized `resourceLoop.js`; unit/building/resource stats live in `rules.js`; the static starting layout lives in `world.js`; all Phaser drawing lives in `visuals.js`; the DOM command bar lives in `ui/commandPanel.js`. `scenes/MapScene.js` orchestrates these.
- **Building rally points (current):** Town Centers and Barracks now carry an optional rally point. Right-clicking the map while a production building is selected sets it; trained units then auto-move there, or auto-gather when the rally point is a live tree/berry bush (falling back to a plain move if that node is depleted or the unit cannot gather). A connecting line and flag render for the selected building. Pure rally logic lives in `src/game/rally.js`; `scenes/MapScene.js` sets the point from right-click and dispatches the order in `spawnTrainedUnit`.
- **Balance pass (current):** tuned the prototype numbers for an economy-to-combat arc while leaving the verified AoE1 costs untouched.
  - **Resource nodes (`world.js`):** trees `12 → 40` Wood each, berry bushes `10 → 50` Food each (map totals: 80 Wood, 100 Food). *Rationale:* the old map held only 24 Wood + 20 Food total, so the gather loop was cosmetic and could not sustain an economy past the starting bank. Starting Food is 200 and the population cap allows 5 more units (3 starting Villagers of an 8 cap), i.e. up to 250 Food of Clubmen — more than the bank alone — so topping the army off now *requires* gathering the bushes. Each node also outlasts several carry trips (capacity 5).
  - **Train/build times (`rules.js`):** Villager `6000 → 4000 ms`, Clubman `5000 → 4000 ms`, Barracks `6500 → 5000 ms`. *Rationale:* the Outpost guards are purely defensive (6-tile radius) so there is no early pressure; long sequential timers only added dead waiting before the combat payoff. A Barracks plus a full roster of Clubmen now trains in 25 s (`5000 + 5×4000`), keeping the slice immediately playable.
  - **HP / damage:** reviewed and deliberately left unchanged. The **population cap (8), not resources, bounds army size**, so the economy change does not grow the assault force; the existing values keep a 4–5 Clubman assault winnable against the Outpost (240 HP) + 2 Raiders (65 HP each) with survivors. A 5-Clubman force clears the Outpost in ~6 s of focus fire.
  - **Invariant tests (`test/balance.test.js`):** 7 new tests lock the arc in place — verified costs preserved; Barracks affordable from the starting Wood; map Food funds (but the starting bank alone does not) a full-cap Clubman army; every node outlasts one carry load; time-to-combat ≤ 40 s; Outpost time-to-kill within a 3–30 s window; the assault survives the defenders.
  - **Remaining caveats:** HP/damage/speed/radius, population cap, and Town Center/Outpost HP are still prototype values, not AoE1-accurate. (The defeat condition is now reachable — see the "Enemy AI" entry below for the aggression model that fixes the previously-unreachable Town Center.) Balance was validated by the pure invariant tests above, not by an end-to-end in-browser play-through of the new values.
- **Enemy AI (current):** replaced the nearest-target garrison with prioritized targeting and a two-stance aggression model. Pure, Phaser-free logic lives in `src/game/enemyAI.js` and is exercised by Node tests; `scenes/MapScene.js:updateEnemyAI` feeds it live entities plus a small state snapshot each tick.
  - **Target priorities:** `chooseTarget` scores candidates by tier first (`military 0 < worker 1 < building 2`), nearest-within-tier as the tie-breaker. Tiers come from `playerTargetKind`: buildings carry `isBuilding`, gatherers (Villagers, `capacity > 0`) are workers, everything else (Clubmen) is military. *Rationale:* raiders neutralise the real threat (armed units) before crippling the economy, and because buildings are a valid tier the force eventually marches on the Town Center once units are gone — which is what makes the defeat condition reachable at all.
  - **Aggression stances:** `isForceAggressive` latches the garrison from *defensive* to *aggressive* when the Outpost takes any damage (player opened hostilities), **or** after an `AGGRO_GRACE_MS = 90000` ms grace window, whichever comes first; once latched it never reverts. `engageableTargets` applies the stance: defensive engages only player entities within `GUARD_RADIUS = 6` tiles of the Outpost (unchanged early-game behaviour — no unfair rush); aggressive engages the entire living roster so raiders chase and push the base. The grace window (90 s) is well past the ~40 s time-to-combat invariant, so holding the Outpost is a player choice, not a trap.
  - **Reachable defeat condition:** if the player attacks the Outpost, the two Raiders counter-push immediately and prioritise the player's Clubmen, then Villagers, then the Town Center; if the player turtles, the garrison marches out at 90 s and grinds the undefended Town Center (480 HP vs. ~9 combined Raider DPS ≈ 50 s) to a loss. Either way `checkObjective`'s defeat branch (losing the Town Center) can now actually fire.
  - **Caveats:** only the two static starting Raiders exist — the Outpost does not reinforce, so a player who defends the push with surviving Clubmen is safe; aggression is all-or-nothing (no retreat/regroup); the 90 s grace and 6-tile guard radius are prototype tuning, not AoE1-accurate. Validated by the pure Node tests below and the build, not by an end-to-end in-browser play-through of the push to the Town Center.
- `npm test` now runs 59 Node tests (pathfinding, resource/gather loop, economy/purchase gating, combat math, enemy target priorities + aggression state machine + engagement stances, marquee geometry, rally-point orders, and balance invariants). `npm run build` passes (JS now ~716 kB across a split Phaser vendor chunk + app chunk — see the "Performance / bundle optimization" entry below).
- Browser smoke tests passed: the scene boots with `Food: 200 · Wood: 200 · Dân số: 3/8`; placing Barracks deducted 125 Wood (200 → 75), selecting the completed Barracks exposed Clubman training, training deducted 50 Food and increased population (4/8 → 5/8), and Town Center training separately deducted 50 Food and increased population (3/8 → 4/8). Full player-driven victory/defeat and gather-loop interaction are not yet end-to-end tested on this new slice; combat/economy pure logic is covered by Node tests.
- **Performance / bundle optimization (current):** replaced the stock full Phaser bundle with a slim, source-built custom entry and split the engine into its own cacheable vendor chunk. The config is `vite.config.js`; the custom entry is `src/game/phaser-slim.js`.
  - **Approach:** Vite now resolves bare `import 'phaser'` (exact match only) to `src/game/phaser-slim.js`, a hand-written entry modelled on Phaser's official `phaser-core` build. Building Phaser *from source* (not the prebuilt `dist/phaser.esm.js` the `module` field points at) lets Rollup tree-shake and lets us exclude whole subsystems the game never uses: the **Arcade + Matter physics engines** (dropped entirely — gameplay uses custom A\* pathfinding), **Sound** (`FEATURE_SOUND=false`; `Game.js` cleanly sets `this.sound = null`), WebGL debug / Spector.js (`WEBGL_DEBUG=false`, which also removes the optional uninstalled `phaser3spectorjs` dep), and the experimental / 3D / Facebook-Instant plugins. Both renderers (Canvas + WebGL) are kept for `Phaser.AUTO`.
  - **Feature flags:** Phaser's source gates these subsystems behind `typeof FLAG` expressions that its own webpack build replaces textually. Vite's `define` can't key on a `typeof X` expression, so the flags are applied in two places sharing one map: a Rollup `transform` plugin for the production build, and an esbuild `onLoad` plugin under `optimizeDeps.esbuildOptions` for the dev dependency pre-bundle (the optimizer does not run Vite `transform` hooks).
  - **Not breaking the game:** stock `phaser-core` omits the Shape (`rectangle`/`ellipse`/`circle`/`triangle`) and `container` Game Objects — which the placeholder art uses heavily — plus `Math.Clamp` and `Math.Distance`. `phaser-slim.js` re-adds exactly those: it imports each Shape/Container class plus their Factory modules (importing a Factory self-registers `scene.add.*` as a side effect) and the two Math helpers. Loader audio file types are omitted (no audio, no asset loading). Missing default-plugins such as `LightsPlugin` are silently skipped by the PluginManager, so their absence is safe.
  - **Measured results (Vite production build, minified · gzip):**
    - *Before:* one chunk `index.js` **1,242.56 kB · 341.56 kB gzip**.
    - *After:* `phaser.js` **681.90 kB · 193.81 kB gzip** (vendor) + `index.js` **33.86 kB · 11.42 kB gzip** (app) = **715.76 kB · 205.23 kB gzip** total JS.
    - *Delta:* **−526.8 kB minified (−42.4%)**, **−136.3 kB gzip (−39.9%)**. Reproduce with `npm run build`; sizes are deterministic across runs.
  - **Initial-load / caching benefit:** the engine now lives in a content-hashed `phaser` chunk separate from the ~34 kB app chunk, so iterating on game logic only invalidates the small app chunk while the ~682 kB engine stays cached across deploys. The HTML shell + CSS + app chunk (~36 kB) also parse before the large engine chunk.
  - **Verification:** 59/59 Node tests pass; `npm run build` succeeds. Headless-Chrome smoke tests of **both** the production preview (`vite preview`) and the dev server (`vite dev`) booted Phaser v3.90.0 with no console errors and rendered the full scene (isometric map, 3 selected Villagers, Town Center, trees, berry bushes, Enemy Outpost + Raiders, HUD, and command bar) — confirming the Shape/Container factories and all drawing still work.
  - **Caveats:** the ~682 kB engine chunk still trips Vite's 500 kB chunk-size warning; this was **not** suppressed (the warning limit is untouched) — Phaser's core renderer/scene/input/tween systems are genuinely needed and are the floor without deeper surgery. Further wins (e.g. dropping Tweens if the Scene plugin list is trimmed, or lazy-loading the whole game behind the HTML shell via dynamic `import()`) were left for later to avoid risking the default-plugin boot path. The custom entry must be kept in sync with Phaser upgrades and with any new `scene.add.*` / `Phaser.*` usage — `phaser-slim.js` documents this. Verification was via automated tests + headless screenshots, not a full interactive play-through.
- No authored game assets, backend, save system, or multiplayer are implemented yet. All art remains programmatically drawn placeholders; no copyrighted assets are used.
- **Next:** the initial balance pass, the enemy AI pass, and the performance/bundle pass are done — see the Balance pass, Enemy AI, and "Performance / bundle optimization" entries above (the bundle is now ~716 kB JS / ~205 kB gzip, down ~42% from ~1.24 MB, via a slim custom Phaser build + vendor code splitting). Remaining: a difficulty/combat tuning pass on HP/damage, optional Outpost reinforcement so a prepared defender still faces pressure, retreat/regroup behaviour for the garrison, and optional further load wins (lazy-loading the game behind the HTML shell, or trimming more Phaser subsystems).

## Simplified mechanics and sources

The slice is *inspired by* the original Age of Empires (Stone Age) but is a heavily simplified, original reimplementation. No Age of Empires code or assets are used; all visuals are placeholder shapes drawn at runtime.

**Verified costs (match AoE1 values):**

- **Villager — 50 Food.** Standard AoE1 villager training cost.
- **Barracks — 125 Wood.** AoE1 Barracks construction cost.
- **Clubman — 50 Food.** AoE1 Clubman (Stone Age Barracks infantry) training cost.

These three costs are defined in `src/game/rules.js` and were checked against [Age of Empires Heaven's Villagers](https://aoe.heavengames.com/theacademy/unitsboatsandbuildings/villagers/), [Barracks](https://aoe.heavengames.com/theacademy/unitsboatsandbuildings/barracks/), and [Clubman](https://aoe.heavengames.com/theacademy/unitsboatsandbuildings/clubman/) pages; [Artho's original-era building guide](https://artho.com/age/buildings2.html) independently lists Barracks at 125. All other numbers (HP, attack, speed, train/build times, resource node amounts, population cap) are prototype values chosen for playability, **not** AoE1-accurate. An initial balance pass has tuned the resource node amounts and the train/build times (see the "Balance pass" entry under *Current implementation status*); HP/damage were reviewed and left as-is for now.

**Deliberate simplifications vs. AoE1:**

- Only two resources (Food, Wood); no Gold/Stone, no farming, no age advancement or tech tree.
- A single building footprint is one tile; no terrain elevation, no fog of war, no line-of-sight reveal.
- Gathering is a fixed one-unit-per-tick loop with a small carry capacity rather than per-resource gather rates; the Town Center accepts both resources so no separate Granary/Storage Pit drop-off is required in the slice.
- Combat is single-target melee with a flat damage value and cooldown; no armor, no ranged units, no projectiles, no attack-move or formations.
- Enemy AI is a reactive garrison, not a strategic opponent: it has target priorities and a two-stance aggression model (see the "Enemy AI" entry under *Current implementation status*) but still has no base-building, scouting, or resource economy.
- Population is capped by buildings that provide population (the Town Center provides 8); Houses exist in the rules data but are not part of the current slice.

## Project conventions

- Keep gameplay and map rules in `src/game` rather than in HTML.
- Prefer small, focused modules as systems are added.
- Avoid adding backend/database dependencies until an online feature requires them.
- Update this document in the same change as project decisions or milestone progress.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.
