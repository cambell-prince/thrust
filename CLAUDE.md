# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A small 2D browser game in plain JavaScript (ES modules) on **Phaser 4.2** (the `phaser` npm package). Phaser 4 keeps the Phaser 3 scene API; v2-style code (`game.add.*`, `createMultiple`, `getRayCastTiles`) does not apply. It is inspired by C64 *Thrust* and Lunar Lander. Controls: left/right rotate, up thrusts, space fires. Live demo: http://demo.saygoweb.com/thrust

## Running

Vite handles the dev server and build (Node >= 22.12). There is no linter.

- `npm install`, then `npm run dev` starts the dev server with live reload.
- `npm run build` writes `dist/`, and `npm run preview` serves it.
- `npm run package` builds and writes `thrust-<version>.tgz` from `dist/`.
- `npm test` runs Vitest on `tests/**/*.test.js`. That covers:
  - unit tests for `js/logic/`, in `tests/unit/`
  - every file `LevelScene` loads exists under `public/assets/`
  - `level1.json` has the layers, gids and numeric properties the game uses
  - a production build (into a temp dir) uses relative paths only and bundles Phaser 4.2

  To run one file: `npx vitest run tests/unit/cooldown.test.js`.
- `npm run test:e2e` runs the Playwright tests (`tests/e2e/*.spec.js`). They build the game, serve it with `vite preview` on port 4173 and play it in headless Chromium. To run one test: `npx playwright test -g "line of sight"`. Run `npx playwright install chromium` once first.
- `npm run deploy` builds and rsyncs `dist/` to the public demo server via `scripts/deploy.sh`. It is outward-facing, so don't run it unless asked. By default the script logs in as `root` and runs rsync as `vu2006`. `DEPLOY_USER`, `DEPLOY_HOST`, `DEPLOY_PATH`, `DEPLOY_SUDO_USER` and `DEPLOY_SSH` override that.
- CI (`.github/workflows/ci.yml`) runs `npm test`, `npm run build` and `npm run test:e2e` on every push and PR. A green push to `master` (or a manual run on master) then deploys the built `dist/` to aws1.saygoweb.com as `vu2006`. The `demo` GitHub environment holds the secrets `DEPLOY_KEY` and `DEPLOY_KNOWN_HOSTS` (the server's ED25519 host key). On the server, that key is limited in `~vu2006/.ssh/authorized_keys` to `restrict,command="/usr/bin/rrsync -wo /var/www/virtual/saygoweb.com/demo/htdocs/thrust"`. It can only rsync into that directory, and the deploy path is relative to it (`DEPLOY_PATH` defaults to `./`). The optional vars `DEPLOY_USER`, `DEPLOY_HOST` and `DEPLOY_PATH` override the defaults.

Layout:
- `index.html` loads `js/main.js`, which Vite bundles together with Phaser (the bundle is about 1.4 MB).
- `public/assets/` is copied into `dist/` as-is. The game loads its files by relative path (`load.setPath('assets/')`).
- `vite.config.js` sets `base: './'` because the demo is served from a sub-path (`/thrust/`). It also sets `assetsDir: 'bundle'` so that the bundled JS doesn't mix with `assets/`.

## Architecture

- `js/main.js` creates the `Phaser.Game`: `Phaser.AUTO` (WebGL; Canvas is deprecated in v4), 800×600, Arcade physics with gravity y=40, and one scene. It also sets `window.thrust = game`, which the e2e tests (and console debugging) use to reach `game.scene.getScene('Level')`.
- `js/scenes/LevelScene.js` holds the whole game: loading, building the level, colliders, input and the rules. Game state lives on the scene (`ship`, `walls`, `map`, `enemies`, `shipBullets`, `enemyBullets`, `collectables`, `explosions`, `status`, `scoreboard`).
- `js/logic/` is plain JS with no Phaser import, so it can be unit-tested in Node:
  - `ShipStatus`: fuel, life and score, clamped to 0..100
  - `Cooldown`: fire rate and fuel burn
  - `numberProperty`: Tiled map properties
  - `objectsWithGid` and `objectSpawnPosition`: Tiled object placement
  - `shouldUpright`: landing
  - `reversePatrol`: collectables turning at walls
  - `Mission` and `canUnload`: cargo, completion and landing at the habitat
  - `NON_SOLID_TILES` (in `tiled.js`): the tiles-1 indices that are scenery, not wall
  Put new rules there when they can be separated from Phaser.
- `js/hud/Scoreboard.js` draws the HUD from `ShipStatus` and `Mission` (`delivered/total`, then ` +aboard`) with `setScrollFactor(0)`. Call `scoreboard.refresh()` after changing the status or the mission.
- Picking up a dude scores nothing; it scores `SHIP_SCORE_RESCUE` when it walks into the habitat. Landing upright beside the habitat unloads the dudes aboard one at a time, and delivering every dude shows the mission-complete banner, after which SPACE (or 5 s) restarts the scene.
- Colliders and overlaps are registered once in `addColliders()`, not every frame. Arcade calls back with a lone sprite first and a group member second, whatever order they are passed in, so the code passes the sprite first.
- **An overlap against a tilemap layer tests every tile, empty ones included.** The bullet-vs-wall overlaps therefore take a process callback that returns `tile.collides`. Colliders filter tiles themselves.
- Bullets and explosions are **pools**: `group.get()`, then `enableBody(true, x, y, true, true)` to fire and `disableBody(true, true)` to kill. A bullet that leaves the world is killed in `update()`. An enemy that is hit is `destroy()`ed, not disabled, so it can't be picked as a shooter.
- Enemies fire only when `hasLineOfSight()` finds no colliding wall tiles on the line to the ship (`getTilesWithinShape`).

### Levels (Tiled)

- `public/assets/level1.tmx` is the Tiled source and `public/assets/level1.json` is its export, which the game loads. Both are committed, so edit the `.tmx` in Tiled and re-export. Keep the two in sync.
- Layers: `Walls` (a tile layer; collision is set with `setCollisionByExclusion(NON_SOLID_TILES)`, a list that must include `-1` for empty cells), `Enemy` (objects with gid 69 become `arrow` sprites) `Collectables` (objects with gid 71 become `dude` sprites) and `Habitat` (one rectangle object, no gid: the habitat image stands on its bottom edge, and the landing check measures against its sides). Objects are placed by hand with `spawnFromObjects()`, not `map.createFromObjects`, to keep Phaser 2's placement and avoid needing tileset images for the `enemies` and `collectables` tilesets.
- Gameplay tuning comes from **map properties** (`fuelExpense`, `lifeExpense`, `enemyShootTime`), read once into `scene.tuning` with `numberProperty()`. That function accepts both Tiled's old object-of-strings format and its newer array format. Several hard-coded constants are marked `// TODO map.properties` and are meant to move there.

### Assets

- `public/assets/` holds the runtime assets. Sprite sheet frame sizes are declared in `preload()`, e.g. `ship.png` is 70×48 with 4 frames, margin 2 and spacing 2. Ship frames (`SHIP_FRAME`): 0 = right, 1 = left, 2 = thrust, 3 = idle. Animations (`dude-left`, `dude-turn`, `dude-right`, `kaboom`) are global and created in `createAnimations()`.
- `src/assets/` holds the source art (GIMP `.xcf`, per-frame PNGs and the TexturePacker project `ship`). It is not part of the build output.

## Conventions

- Tabs for indentation. ES modules with `import Phaser from 'phaser'` (Phaser isn't a global). Tuning constants are named constants at the top of `LevelScene.js`; those marked `// TODO map.properties` are meant to move into the map.
- The commit subjects are prefixed with the feature area, e.g. `feature/ship: ...`, `feature/enemy: ...`, `feature/scoreboard: ...`.
