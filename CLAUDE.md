# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A small 2D browser game in plain JavaScript on **Phaser 2.2.x** (the CE/v2 API, not Phaser 3). It is inspired by C64 *Thrust* and Lunar Lander. Controls: left/right rotate, up thrusts, space fires. Live demo: http://demo.saygoweb.com/thrust

## Running

Vite handles the dev server and build (Node >= 22.12). There is no linter.

- `npm install`, then `npm run dev` starts the dev server with live reload.
- `npm run build` writes `dist/`, and `npm run preview` serves it.
- `npm run package` builds and writes `thrust-<version>.tgz` from `dist/`.
- `npm test` runs `node --check js/thrust.js` and then the `node:test` suites in `tests/`. They check that every asset path in `js/thrust.js` exists under `public/`, that `level1.json` has the layers, gids and numeric properties the game uses, and that a production build (into a temp dir) has relative paths only.
- `npm run deploy` builds and rsyncs `dist/` to the public demo server via `scripts/deploy.sh`. It is outward-facing, so don't run it unless asked. By default the script logs in as `root` and runs rsync as `vu2006`. `DEPLOY_USER`, `DEPLOY_HOST`, `DEPLOY_PATH`, `DEPLOY_SUDO_USER` and `DEPLOY_SSH` override that.
- CI (`.github/workflows/ci.yml`) runs `npm test` and `npm run build` on every push and PR. A green push to `master` (or a manual run on master) then deploys the built `dist/` to aws1.saygoweb.com as `vu2006`, into `./demo/htdocs/thrust/`. The `demo` GitHub environment holds the secrets `DEPLOY_KEY` and (optionally) `DEPLOY_KNOWN_HOSTS`, and the optional vars `DEPLOY_USER`/`DEPLOY_HOST`/`DEPLOY_PATH` override those defaults.

Layout:
- `index.html` loads `js/phaser.min.js` as a classic script, so `Phaser` is a browser global. It then loads `js/thrust.js` as a **module** script, which Vite bundles. Vite logs a warning that the classic script "can't be bundled"; that's expected.
- `public/` is copied into `dist/` as-is. It holds the vendored Phaser (`public/js/`) and every runtime asset (`public/assets/`), which the game loads by relative paths like `assets/ship.png`.
- `vite.config.js` sets `base: './'` because the demo is served from a sub-path (`/thrust/`). It also sets `assetsDir: 'bundle'` so that the bundled JS doesn't mix with `assets/`.

## Architecture

All game code is in `js/thrust.js`, a single ES module (so strict mode applies) with no imports:

- `new Phaser.Game(800, 600, Phaser.CANVAS, ...)` wires the top-level functions `preload` / `create` / `update` / `render` as the one game state.
- Game state lives in **module-level variables** (`ship`, `walls`, `map`, `enemies`, `enemyBullets`, `shipBullets`, `collectables`, `explosions`, `scoreboard`, timers like `shipShootTime`, `enemyShootTime` and `fuelTimer`).
- `Game.Scoreboard` (a prototype "class" on the `Game` namespace) is the HUD: a camera-fixed group with life and fuel bars, mission text and score. Its `setLife`/`setFuel` return the clamped new value, which the callers use to detect death.
- Physics is Arcade with global gravity. Collisions and overlaps are all declared in `update()`, and their handlers are the top-level functions (`bulletHitsWall`, `bulletHitsEnemy`, `enemyBulletHitsShip`).
- Bullets and explosions are **pre-allocated pools** (`createMultiple` + `getFirstExists(false)` + `reset`). Reuse them; don't create sprites per shot. A killed enemy is `destroy()`ed, not `kill()`ed, so that `enemies.getRandom()` can't pick a dead shooter.
- Enemies only fire when `walls.getRayCastTiles` finds no wall tiles between them and the ship (line of sight).

### Levels (Tiled)

- `public/assets/level1.tmx` is the Tiled source and `public/assets/level1.json` is its export, which the game loads. Both are committed, so edit the `.tmx` in Tiled and re-export. Keep the two in sync.
- Layers: `Walls` (a tile layer; collision is set with `setCollisionByExclusion` on a list of non-solid tile indices in `create()`), `Enemy` (objects with gid 69 become `arrow` sprites) and `Collectables` (objects with gid 71 become `dude` sprites).
- Gameplay tuning comes from **map properties** (`map.properties.fuelExpense`, `lifeExpense`, `enemyShootTime`). Tiled exports them as **strings**, so parse them where a number matters. Several hard-coded constants are marked `// TODO map.properties` and are meant to move there.

### Assets

- `public/assets/` holds the runtime assets. Sprite sheet frame sizes are declared in `preload()`, e.g. `ship.png` is 70×48 with 4 frames, margin 2 and spacing 2. Ship frames: 0 = right, 1 = left, 2 = thrust, 3 = idle.
- `src/assets/` holds the source art (GIMP `.xcf`, per-frame PNGs and the TexturePacker project `ship`). It is not part of the build output.

## Conventions

- Tabs for indentation. Module-level state is declared with `var`; `Phaser` is a global (`/* global Phaser */`).
- The commit subjects are prefixed with the feature area, e.g. `feature/ship: ...`, `feature/enemy: ...`, `feature/scoreboard: ...`.
