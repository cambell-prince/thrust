# Level progression and level 2

Date: 2026-11-19

## Goal

The game has one level, and completing it only restarts it. Add a second, harder
level and the progression between them: finishing level 1 leads into level 2,
finishing level 2 shows an end screen, and SPACE there starts a new game from level 1.

## Decisions

- **One scene, told which level to play.** `LevelScene` receives
  `{ levelIndex, score }` and advances with `scene.restart(...)`. No per-level scene
  classes and no global registry state.
- **What carries over:** the score carries into the next level. Fuel and life refill
  at the start of every level.
- **End of the game:** after the last level, the banner reads `ALL MISSIONS COMPLETE`
  and waits for SPACE (it has no timer). SPACE starts level 1 with score 0.
- **The ship starts above its level's habitat**, not at a hard-coded point.
- **`?level=N` in the URL** starts on level N (1-based) for map editing and tests.
- **Level 2 is drafted by Claude** from tiles-1 and refined by the user in Tiled
  afterwards. The `.tmx` is the source of truth once committed. The throwaway script
  that drafts it is not committed.

Out of scope: a game-over screen on death, more than two levels, a level-select menu,
and new art.

## Rules: `js/logic/levels.js` (no Phaser import)

```js
export const LEVELS = [
	{ key: 'level1', file: 'level1.json' },
	{ key: 'level2', file: 'level2.json' },
];
export function isLastLevel(index)        // index === LEVELS.length - 1
export function nextLevelIndex(index)     // index + 1, or 0 after the last level
export function levelIndexFromSearch(search)
	// '?level=2' → 1. A missing, non-integer or out-of-range value → 0.
export function shipStartPosition(habitat, mapWidth)
	// habitat = { x, y, width } (the Tiled rectangle). Returns
	// { x: habitat.x + habitat.width / 2, y: Math.max(SHIP_START_MIN_Y, habitat.y - SHIP_START_ABOVE) },
	// with x clamped to [SHIP_START_MARGIN, mapWidth - SHIP_START_MARGIN].
export const SHIP_START_ABOVE = 200, SHIP_START_MIN_Y = 40, SHIP_START_MARGIN = 40;
```

When a map has no habitat, the scene falls back to the old start point (50, 80).

## Scene: `LevelScene`

- `init(data)`: `this.levelIndex = data?.levelIndex ?? 0` and
  `this.carriedScore = data?.score ?? 0`. An out-of-range index falls back to 0.
- `preload()` loads every map in `LEVELS` (`tilemapTiledJSON(key, file)`). The cache
  keeps them across restarts.
- `create()`:
  - `this.status = new ShipStatus()`, then `this.status.changeScore(this.carriedScore)`.
  - It builds the map for `LEVELS[levelIndex].key`.
  - **Creation order changes:** map and tuning, then habitat, then ship, then the walls
    layer. The walls keep drawing over the ship by an explicit depth (`WALLS_DEPTH = 1`
    above the ship's 0) rather than by creation order. The background and habitat keep
    their depths below 0.
  - The ship starts at `shipStartPosition(habitat rectangle, map.widthInPixels)`, or at
    (50, 80) without a habitat.
- `completeLevel()` shows one of two banners:
  - **Not the last level:** `MISSION COMPLETE` / `SCORE n` / `PRESS SPACE FOR LEVEL <n+2>`
    (the next level's 1-based number). SPACE or `RESTART_DELAY` (5 s) runs
    `scene.restart({ levelIndex: nextLevelIndex(i), score: status.score })`.
  - **The last level:** `ALL MISSIONS COMPLETE` / `SCORE n` / `PRESS SPACE TO PLAY AGAIN`,
    with no timer. SPACE runs `scene.restart({ levelIndex: 0, score: 0 })`.
  - Both keep the existing single-shot guard and the fresh-keypress rule (a held fire
    key must not skip the banner).
- The scene exposes `levelIndex` for the tests and the console.

## Boot: `js/main.js`

The game config no longer auto-starts the scene. After `new Phaser.Game(...)`, it calls
`game.scene.add('Level', LevelScene, true, { levelIndex: levelIndexFromSearch(location.search), score: 0 })`.
`window.thrust = game` stays.

## HUD

The `MISSION` label becomes `MISSION <n>` (the 1-based level number), followed by the
existing `delivered/total` value, e.g. `MISSION 2  0/3 +1`. The Scoreboard takes the
level number as a fourth constructor argument.

## Level 2 map (`public/assets/level2.tmx` + `level2.json`)

- 64 × 96 tiles of 16 px (1024 × 1536), with the same tilesets and firstgids as level 1
  (`tiles-1` 1, `enemies` 69, `collectables` 71) and the same Tiled format as level1's
  files (CSV in the tmx; the old-style JSON with properties as an object of strings).
- Layers: `Walls`, `Enemy` (5 objects, gid 69), `Collectables` (3 objects, gid 71),
  `Habitat` (one rectangle, 48 × 48, standing on a ledge near the top right).
- Map properties: `enemyShootTime` 1800, `lifeExpense` 25, `fuelExpense` 1.
- Shape: open sky over the top-right habitat ledge, then a winding shaft descending
  to the bottom with side caverns. Each dude stands on a floor in a cavern, and each
  enemy sits on rock with a view across a passage. Rock edges use level 1's surface,
  edge and fill gids so the art matches.
- **Playable:** every passage the ship must use is at least 4 tiles (64 px) wide, more
  than the ship's 46 px body.

## Testing

- **Unit (`tests/unit/levels.test.js`):** `isLastLevel` and `nextLevelIndex`, including
  wrapping. `levelIndexFromSearch` for `?level=1`, `?level=2`, missing, `?level=0`,
  `?level=3`, `?level=abc` and `?level=1.5`. `shipStartPosition` for centring, the
  height above, `SHIP_START_MIN_Y` and clamping at both sides.
- **`tests/level.test.js`** runs over every map in `LEVELS`:
  - the required layers and gids, and numeric tuning properties
  - the Walls data size, and a habitat on solid ground in open space
  - at least one collectable
  - **reachability:** a flood fill over tiles where a 3 × 3 tile box is free of solid
    tiles, starting from the box containing the ship start (`shipStartPosition`),
    reaches a landing box for the habitat and a box overlapping every collectable. A
    landing box for the habitat is one whose bottom row sits on the habitat's ground
    row (directly above it) and whose centre is within `HABITAT_RANGE` of the habitat
    rectangle horizontally. The shared helper goes in
    `tests/helpers/`.
- **`tests/assets.test.js` / `tests/build.test.js`:** `level2.json` is loaded and
  copied into `dist/`.
- **e2e (`tests/e2e/game.spec.js`):**
  - Completing level 1 shows `PRESS SPACE FOR LEVEL 2`. SPACE starts level 2
    (`levelIndex` 1) with the score carried over and fuel and life at 100.
  - `?level=2` boots level 2 with three dudes (`MISSION 2  0/3`).
  - Completing level 2 shows `ALL MISSIONS COMPLETE` and is still showing after 6 s.
    SPACE starts level 1 with score 0.
  - The existing level-1 tests are updated for the new HUD text and the new ship start.
- Screenshots of level 2 (overview and habitat) are viewed before the PR.
