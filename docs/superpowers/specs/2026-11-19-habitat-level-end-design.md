# Habitat and level completion

Date: 2026-11-19

## Goal

Today the ship can pick up every collectable and the level never ends. Give it an
ending: the player flies the rescued dudes back up to a **habitat** at the top of the
level and lands beside it. The dudes climb out, walk into the habitat, and once every
dude in the level has gone in, the level is complete.

## Decisions

- **Win rule:** the level ends only when every collectable in the level has been
  delivered. Landing at the habitat with some of them aboard unloads (and scores)
  those, and play continues.
- **Points on delivery:** a pickup no longer scores. Each dude scores
  `SHIP_SCORE_RESCUE` (500) when it walks into the habitat, so carrying dudes is a risk.
- **After completion:** a "MISSION COMPLETE" banner with the score. SPACE, or 5
  seconds, restarts level1 (`scene.restart()`). There is no level progression yet.
- **Habitat art:** a new `public/assets/habitat.png`. Its position comes from Tiled.

Out of scope: next-level progression, a game-over screen, and the per-collectable
Tiled TODOs in `createCollectables()`.

## Map (level1.tmx and level1.json, kept in sync)

- **Widen the top-left ledge** (Walls rows 21–24, currently columns 0–4) to columns
  0–11 (x 0–192 px), extending its surface and edge tiles so it still reads as rock.
  The top surface stays at y = 336.
- **Add a `Habitat` object layer** holding one rectangle object (no gid) named
  `habitat`, standing on the ledge to the right of where the ship lands at the start:
  about x 128, y 288, 48 × 48. A rectangle needs no tileset image, which matches why
  `spawnFromObjects()` avoids `createFromObjects`. The rectangle sets where the sprite
  is drawn (bottom-centre on the rectangle's bottom edge) and the area the landing
  check measures against.
- Both files are edited directly as CSV/XML and must still open in Tiled.

## Rules: `js/logic/mission.js` (no Phaser import)

```js
export class Mission {
	constructor(total)      // total = number of collectables in the level
	total, aboard, delivered
	pickUp()                // aboard += 1
	unloadOne()             // aboard -= 1, delivered += 1; returns false if aboard is 0
	get hasCargo()          // aboard > 0
	get isComplete()        // total > 0 && delivered === total
}

export const HABITAT_RANGE = 64;      // px from the habitat rectangle's side edges
export const LANDED_SPEED = 5;        // px/s
export const UPRIGHT_TOLERANCE = 5;   // degrees from UPRIGHT_ANGLE

/** Whether a ship can unload at the habitat. */
export function canUnload({ onFloor, angle, speed, shipX, habitat })
// habitat = { x, width } (the rectangle's left edge and width).
// True when onFloor, |angle - UPRIGHT_ANGLE| <= UPRIGHT_TOLERANCE,
// speed <= LANDED_SPEED, and shipX lies within HABITAT_RANGE of [x, x + width].
```

## Scene: `LevelScene`

- `preload()` loads `habitat.png` (key `habitat`).
- `createHabitat()` reads the `Habitat` object layer and adds a static image at the
  rectangle. It keeps `this.habitatZone = { x, width, doorX, floorY }`, where `doorX` is
  the rectangle's centre and `floorY` is its bottom edge.
- `create()` makes `this.mission = new Mission(collectableCount)` and
  `this.levelComplete = false`.
- `rescue(dude)`: `disableBody(true, true)` and `mission.pickUp()`, then
  `scoreboard.refresh()`. No score.
- `update()`: while the ship is active and the level is not complete, if
  `mission.hasCargo` and `canUnload(...)` (the ship body's centre x and `body.speed`)
  and the unload cooldown is ready, run `unloadDude()`. The cooldown is a `Cooldown`
  of 600 ms, so dudes leave one at a time.
- `unloadDude()`: `mission.unloadOne()`. A dude sprite (no physics body) appears at
  the ship's base on `floorY`, plays `dude-right` or `dude-left` towards `doorX`, and
  tweens its x to `doorX` at about the patrol speed. On complete it is destroyed,
  scores `SHIP_SCORE_RESCUE`, refreshes the scoreboard, and calls `completeLevel()` if
  `mission.isComplete`. A dude that has left the ship finishes its walk even if the
  ship takes off. Dudes still aboard stay aboard.
- `completeLevel()`: sets `levelComplete`, stops the ship (zero velocity and
  acceleration, no gravity), stops enemy fire and ship input, and shows a camera-fixed
  banner (`setScrollFactor(0)`, depth above the HUD): `MISSION COMPLETE`,
  `SCORE <n>` and `PRESS SPACE`. SPACE, or a 5 s timer, calls `this.scene.restart()`.
  It runs only once.
- `scene.restart()` re-runs `create()`, so the status, mission and pools are fresh.
  `createAnimations()` is already safe to call again.

## HUD: `Scoreboard`

The existing `MISSION` label gets a value: `delivered/total`, followed by ` +aboard`
when something is aboard (e.g. `0/2 +1`). The Scoreboard takes the mission as a second
constructor argument, and `refresh()` redraws it.

## Art

`public/assets/habitat.png`, 48 × 48 with a transparent background: a pixel-style
dome on a base, with a door at the bottom centre, in colours that suit `tiles-1`. The
script that generates it, and its output, go in `src/assets/habitat/`.

## Testing

- **Unit (`tests/unit/mission.test.js`):** counting with pickUp/unloadOne; unloadOne
  when nothing is aboard; isComplete only when everything is delivered (and never for
  total 0); canUnload true in the ideal case and false for each condition broken on
  its own (in the air, tilted, moving, too far left, too far right), plus the range
  edges.
- **`tests/level.test.js`:** a `Habitat` object layer with exactly one rectangle
  object, whose bottom edge rests on a solid Walls tile and whose box is clear of
  solid tiles.
- **`tests/assets.test.js`:** already covers that `habitat.png` exists, through its
  load call.
- **e2e (`tests/e2e/game.spec.js`):**
  - Update "flying into a stranded dude rescues them": the score stays 0 and the
    mission shows one aboard.
  - New: mark every dude aboard, place the ship landed upright beside the habitat,
    then expect the dudes to unload, the score to reach 500 × total, the banner to
    appear, and SPACE to restart the level (score 0, mission `0/total`).
  - New: with only one of two aboard, landing delivers it (`1/2`) and the level is
    not complete.
  - The "falls, lands and is turned upright" test still passes on the wider ledge.
