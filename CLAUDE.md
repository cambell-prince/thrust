# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A small 2D browser game in TypeScript (ES modules) on **Phaser 4.2** (the `phaser` npm package). Phaser 4 keeps the Phaser 3 scene API; v2-style code (`game.add.*`, `createMultiple`, `getRayCastTiles`) does not apply. It is inspired by C64 *Thrust* and Lunar Lander. Controls: left/right rotate, up thrusts, space fires. Live demo: http://demo.saygoweb.com/thrust

## Running

Vite handles the dev server and build (Node >= 22.12). Vite only strips types and never checks them, so the type check is a separate step.

- `npm run typecheck` runs `tsc -b`, which checks two projects. `tsconfig.app.json` covers the game (`js/`, DOM only). `tsconfig.node.json` covers the tests and `vite.config.ts`/`playwright.config.ts` (Node + DOM, since the e2e tests run code in the page). Both extend `tsconfig.base.json` (strict, `noEmit`, `verbatimModuleSyntax`, `allowImportingTsExtensions`).
- `npm run lint` runs ESLint (`eslint.config.js`) with typescript-eslint's type-aware `recommendedTypeChecked` rules.

- `npm install`, then `npm run dev` starts the dev server with live reload.
- `npm run build` writes `dist/`, and `npm run preview` serves it.
- `npm run package` builds and writes `thrust-<version>.tgz` from `dist/`.
- `npm test` runs Vitest on `tests/**/*.test.ts`. That covers:
  - unit tests for `js/logic/`, in `tests/unit/`
  - every file `LevelScene` loads (including every map in `LEVELS`) exists under `public/assets/`
  - every level's map has the layers, gids and numeric properties the game uses, and can be flown (`tests/level.test.ts`)
  - a production build (into a temp dir) uses relative paths only and bundles Phaser 4.2

  To run one file: `npx vitest run tests/unit/cooldown.test.ts`.
- `npm run test:e2e` runs the Playwright tests (`tests/e2e/*.spec.ts`). They build the game, serve it with `vite preview` on port 4173 and play it in headless Chromium. To run one test: `npx playwright test -g "line of sight"`. Run `npx playwright install chromium` once first.
- `npm run deploy` builds and rsyncs `dist/` to the public demo server via `scripts/deploy.sh`. It is outward-facing, so don't run it unless asked. By default the script logs in as `root` and runs rsync as `vu2006`. `DEPLOY_USER`, `DEPLOY_HOST`, `DEPLOY_PATH`, `DEPLOY_SUDO_USER` and `DEPLOY_SSH` override that.
- CI (`.github/workflows/ci.yml`) runs `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run test:e2e` on every push and PR. A green push to `master` (or a manual run on master) then deploys the built `dist/` to aws1.saygoweb.com as `vu2006`. The `demo` GitHub environment holds the secrets `DEPLOY_KEY` and `DEPLOY_KNOWN_HOSTS` (the server's ED25519 host key). On the server, that key is limited in `~vu2006/.ssh/authorized_keys` to `restrict,command="/usr/bin/rrsync -wo /var/www/virtual/saygoweb.com/demo/htdocs/thrust"`. It can only rsync into that directory, and the deploy path is relative to it (`DEPLOY_PATH` defaults to `./`). The optional vars `DEPLOY_USER`, `DEPLOY_HOST` and `DEPLOY_PATH` override the defaults.

Layout:
- `index.html` loads `js/main.ts`, which Vite bundles together with Phaser (the bundle is about 1.4 MB).
- `public/assets/` is copied into `dist/` as-is. The game loads its files by relative path (`load.setPath('assets/')`).
- `vite.config.ts` sets `base: './'` because the demo is served from a sub-path (`/thrust/`). It also sets `assetsDir: 'bundle'` so that the bundled JS doesn't mix with `assets/`.

## Architecture

- `js/main.ts` creates the `Phaser.Game`: `Phaser.AUTO` (WebGL; Canvas is deprecated in v4), 800×600, Arcade physics with gravity y=40. It adds the one scene, `Level`, with `{ levelIndex }` from `?level=N` (1-based; missing or invalid means level 1). It also sets `window.thrust = game`, which the e2e tests (and console debugging) use to reach `game.scene.getScene('Level')`.
- `js/scenes/LevelScene.ts` holds the whole game: loading, building the level, colliders, input and the rules. The scene takes `{ levelIndex, score }` in `init(data)` and plays `LEVELS[levelIndex]`, carrying `score` over (fuel and life start full). Game state lives on the scene (`levelIndex`, `ship`, `walls`, `map`, `enemies`, `shipBullets`, `enemyBullets`, `collectables`, `explosions`, `status`, `scoreboard`).
- `js/logic/` is plain TypeScript with no Phaser import, so it can be unit-tested in Node:
  - `ShipStatus`: fuel, life and score, clamped to 0..100
  - `Cooldown`: fire rate and fuel burn
  - `numberProperty`: Tiled map properties
  - `objectsWithGid` and `objectSpawnPosition`: Tiled object placement
  - `shouldUpright`: landing
  - `reversePatrol`: collectables turning at walls
  - `Mission` and `canUnload`: cargo, completion and landing at the habitat
  - `levels`: `LEVELS` (play order), progression (`isLastLevel`, `nextLevelIndex`), `levelIndexFromSearch` and `shipStartPosition`
  - `NON_SOLID_TILES` (in `tiled.ts`): the tiles-1 indices that are scenery, not wall
  Put new rules there when they can be separated from Phaser.
- `js/hud/Scoreboard.ts` draws the HUD from `ShipStatus` and `Mission` (`MISSION <level number>`, `delivered/total`, then ` +aboard`) with `setScrollFactor(0)`. Call `scoreboard.refresh()` after changing the status or the mission.
- Picking up a dude scores nothing; it scores `SHIP_SCORE_RESCUE` when it walks into the habitat. Landing upright beside the habitat unloads the dudes aboard one at a time, and delivering every dude shows the mission-complete banner. SPACE (or 5 s) then restarts the scene on the next level with the score (`goToLevel()`). After the last level the banner reads ALL MISSIONS COMPLETE and waits for SPACE, which starts a new game on level 1 with a score of 0.
- Colliders and overlaps are registered once in `addColliders()`, not every frame. Arcade calls back with a lone sprite first and a group member second, whatever order they are passed in, so the code passes the sprite first.
- **An overlap against a tilemap layer tests every tile, empty ones included.** The bullet-vs-wall overlaps therefore take a process callback that returns `tile.collides`. Colliders filter tiles themselves.
- Bullets and explosions are **pools**: `group.get()`, then `enableBody(true, x, y, true, true)` to fire and `disableBody(true, true)` to kill. A bullet that leaves the world is killed in `update()`. An enemy that is hit is `destroy()`ed, not disabled, so it can't be picked as a shooter.
- Enemies fire only when `hasLineOfSight()` finds no colliding wall tiles on the line to the ship (`getTilesWithinShape`).

### Levels (Tiled)

- There are two levels, `level1` and `level2`, listed in play order in `LEVELS` (`js/logic/levels.ts`). Each has a Tiled source `public/assets/levelN.tmx` and its export `levelN.json`, which the game loads. Both are committed, so edit the `.tmx` in Tiled and re-export. Keep the two in sync.
- To add a level, add its `.tmx` and `.json` and a `LEVELS` entry. Every level needs the layers below, and `tests/level.test.ts` checks each one, including that the dudes and habitat can be reached from the start (`tests/helpers/reachability.ts`).
- The ship starts beside the habitat (`shipStartPosition()`: left of it, or right when the left is near the map edge, and above it).
- Layers (all required): `Walls` (a tile layer; collision is set with `setCollisionByExclusion(NON_SOLID_TILES)`, a list that must include `-1` for empty cells), `Enemy` (objects with gid 69 become `arrow` sprites) `Collectables` (objects with gid 71 become `dude` sprites) and `Habitat` (one rectangle object, no gid: the habitat image stands on its bottom edge, and the landing check measures against its sides). Objects are placed by hand with `spawnFromObjects()`, not `map.createFromObjects`, to keep Phaser 2's placement and avoid needing tileset images for the `enemies` and `collectables` tilesets.
- Gameplay tuning comes from **map properties** (`fuelExpense`, `lifeExpense`, `enemyShootTime`), read once into `scene.tuning` with `numberProperty()`. That function accepts both Tiled's old object-of-strings format and its newer array format. Several hard-coded constants are marked `// TODO map.properties` and are meant to move there.

### Assets

- `public/assets/` holds the runtime assets. Sprite sheet frame sizes are declared in `preload()`, e.g. `ship.png` is 70×48 with 4 frames, margin 2 and spacing 2. Ship frames (`SHIP_FRAME`): 0 = right, 1 = left, 2 = thrust, 3 = idle. Animations (`dude-left`, `dude-turn`, `dude-right`, `kaboom`) are global and created in `createAnimations()`.
- `src/assets/` holds the source art (GIMP `.xcf`, per-frame PNGs and the TexturePacker project `ship`). It is not part of the build output.

## Conventions

- TypeScript, strict. Relative imports name the `.ts` file (`'../logic/levels.ts'`), and type-only imports use `import type`. `js/globals.d.ts` declares `window.thrust`. Scene state set in `create()` is declared on the class with `!`. Phaser's group and collider APIs hand back `any` or loose unions, so cast at the call site (for example `as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody`).
- Tabs for indentation. ES modules with `import Phaser from 'phaser'` (Phaser isn't a global). Tuning constants are named constants at the top of `LevelScene.ts`; those marked `// TODO map.properties` are meant to move into the map.
- The commit subjects are prefixed with the feature area, e.g. `feature/ship: ...`, `feature/enemy: ...`, `feature/scoreboard: ...`.
