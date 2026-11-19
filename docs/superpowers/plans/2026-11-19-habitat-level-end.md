# Habitat and Level Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use cjp:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task, wave by wave per the Execution Schedule. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the player win level1: carry every rescued dude back to a habitat on the top-left ledge, land beside it, watch the dudes walk in, and see a "MISSION COMPLETE" banner, after which the level restarts.

**Architecture:** The pure rules (cargo counts, completion, the "can unload here" test) go in a new `js/logic/mission.js`, unit-tested in Node. The map gains a wider ledge and a `Habitat` rectangle object in Tiled. `LevelScene` reads the rectangle, draws a new `habitat.png`, and runs the unload, scoring and banner/restart flow. `Scoreboard` shows the mission count.

**Tech Stack:** Plain JS ES modules, Phaser 4.2 (Arcade physics), Vite 8, Vitest 5, Playwright, Tiled map files (`.tmx` XML + `.json` export), Python 3 + Pillow (art generation only).

**Spec:** `docs/superpowers/specs/2026-11-19-habitat-level-end-design.md`

## Global Constraints

- Tabs for indentation; ES modules; `import Phaser from 'phaser'`, and only in scene/HUD code, never in `js/logic/`.
- Commit subjects are prefixed with the feature area: `feature/habitat: ...`, `feature/mission: ...`, `feature/level: ...`, `feature/scoreboard: ...`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `level1.tmx` and `level1.json` must stay in sync, and both must still open in Tiled.
- The test runners are `npm test` (Vitest, already `--maxWorkers=4`) and `npm run test:e2e` (Playwright, 1 worker, port 4173). Run only one e2e run at a time across the session.
- Machine load: check `cat /proc/loadavg` before builds or e2e runs, and keep the 1-minute figure below 10.0.
- Points: `SHIP_SCORE_RESCUE = 500` per dude **delivered**. A pickup scores nothing.
- Banner text lines: `MISSION COMPLETE`, `SCORE <n>`, `PRESS SPACE`. SPACE or 5 s restarts the level.
- HUD mission value: `delivered/total`, plus ` +aboard` when aboard > 0 (e.g. `0/2 +1`).

## Review Focus

1. **Landing at the habitat with nothing aboard** (e.g. the ship's first landing at the start). Nothing should unload and the level must not complete. Pinned by the e2e "falls, lands" test (Task 4).
2. **Taking off mid-unload.** Dudes still aboard stay aboard, and a dude already walking finishes and scores. Pinned by the e2e partial-delivery test (Task 4).
3. **Enemy bullets in flight when the level completes.** They must not hurt the ship on the banner screen: completion kills active enemy bullets and stops enemy fire. Pinned in the e2e completion test (Task 4).
4. **Restart firing twice** (SPACE and the 5 s timer). There must be exactly one restart, with a fresh status and mission afterwards. A `restarting` guard handles it, pinned by the e2e completion test checking `0/2` and score 0 after restart (Task 4).
5. **Holding SPACE (fire) at the moment of completion.** The banner must not be skipped: the restart listens for a fresh `keydown-SPACE` registered at completion, not `isDown`. Pinned in the e2e completion test, which holds SPACE through completion (Task 4).

## Execution Schedule

| Wave | Tasks | Model | Notes |
|------|-------|-------|-------|
| 1 | Task 1, Task 2, Task 3 | sonnet, sonnet, sonnet | Parallel: disjoint files. Tasks 1 and 2 run Vitest only (no shared port). |
| CP1 | — | — | base..end of wave 1 — code-review medium + spec check (spec §Rules, §Map, §Art). May run concurrently with wave 2: wave 2 edits none of wave 1's files. |
| 2 | Task 4 | opus | Integrates everything. Needs mission.js, the map layer and habitat.png. The only e2e user. |
| CP2 | — | — | base..end of wave 2 — code-review medium + spec check (full spec) |
| 3 | Controller | — | Full gates (`npm test`, `npm run build`, `npm run test:e2e`), push, draft PR, CI, browser demo for the user |

---

### Task 1: Mission rules

**Files:**
- Create: `js/logic/mission.js`
- Test: `tests/unit/mission.test.js`

**Interfaces:**
- Consumes: `UPRIGHT_ANGLE` (−90) from `js/logic/landing.js`.
- Produces:
  - `class Mission { constructor(total: number); total; aboard; delivered; pickUp(): void; unloadOne(): boolean; get hasCargo(): boolean; get isComplete(): boolean }`
  - `HABITAT_RANGE = 64`, `LANDED_SPEED = 5`, `UPRIGHT_TOLERANCE = 5`
  - `canUnload({ onFloor: boolean, angle: number, speed: number, shipX: number, habitat: { x: number, width: number } }): boolean`

- [ ] **Step 1: Write the failing test** at `tests/unit/mission.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { canUnload, HABITAT_RANGE, LANDED_SPEED, Mission, UPRIGHT_TOLERANCE } from '../../js/logic/mission.js';

describe('Mission', () => {
	it('starts with nothing aboard or delivered', () => {
		const mission = new Mission(2);
		expect(mission).toMatchObject({ total: 2, aboard: 0, delivered: 0 });
		expect(mission.hasCargo).toBe(false);
		expect(mission.isComplete).toBe(false);
	});

	it('counts pickups as cargo', () => {
		const mission = new Mission(2);
		mission.pickUp();
		mission.pickUp();
		expect(mission.aboard).toBe(2);
		expect(mission.hasCargo).toBe(true);
	});

	it('moves one dude from aboard to delivered per unload', () => {
		const mission = new Mission(2);
		mission.pickUp();
		mission.pickUp();
		expect(mission.unloadOne()).toBe(true);
		expect(mission).toMatchObject({ aboard: 1, delivered: 1 });
		expect(mission.isComplete).toBe(false);
		expect(mission.unloadOne()).toBe(true);
		expect(mission).toMatchObject({ aboard: 0, delivered: 2 });
		expect(mission.isComplete).toBe(true);
	});

	it('cannot unload with nothing aboard', () => {
		const mission = new Mission(1);
		expect(mission.unloadOne()).toBe(false);
		expect(mission).toMatchObject({ aboard: 0, delivered: 0 });
	});

	it('is not complete while some dudes are still in the cave', () => {
		const mission = new Mission(2);
		mission.pickUp();
		mission.unloadOne();
		expect(mission.isComplete).toBe(false);
	});

	it('is never complete for a level with no dudes', () => {
		expect(new Mission(0).isComplete).toBe(false);
	});
});

describe('canUnload', () => {
	const habitat = { x: 128, width: 48 };
	const landed = { onFloor: true, angle: -90, speed: 0, shipX: 100, habitat };

	it('allows a ship landed upright and still beside the habitat', () => {
		expect(canUnload(landed)).toBe(true);
	});

	it('refuses a ship in the air', () => {
		expect(canUnload({ ...landed, onFloor: false })).toBe(false);
	});

	it('refuses a ship that is not upright', () => {
		expect(canUnload({ ...landed, angle: -90 + UPRIGHT_TOLERANCE + 1 })).toBe(false);
		expect(canUnload({ ...landed, angle: -90 - UPRIGHT_TOLERANCE - 1 })).toBe(false);
		expect(canUnload({ ...landed, angle: -90 + UPRIGHT_TOLERANCE })).toBe(true);
	});

	it('refuses a ship that is still moving', () => {
		expect(canUnload({ ...landed, speed: LANDED_SPEED + 1 })).toBe(false);
		expect(canUnload({ ...landed, speed: LANDED_SPEED })).toBe(true);
	});

	it('refuses a ship too far to the left or right', () => {
		expect(canUnload({ ...landed, shipX: habitat.x - HABITAT_RANGE - 1 })).toBe(false);
		expect(canUnload({ ...landed, shipX: habitat.x + habitat.width + HABITAT_RANGE + 1 })).toBe(false);
	});

	it('allows the edges of the range and over the habitat itself', () => {
		expect(canUnload({ ...landed, shipX: habitat.x - HABITAT_RANGE })).toBe(true);
		expect(canUnload({ ...landed, shipX: habitat.x + habitat.width + HABITAT_RANGE })).toBe(true);
		expect(canUnload({ ...landed, shipX: habitat.x + 10 })).toBe(true);
	});
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/mission.test.js`
Expected: FAIL, unable to resolve `../../js/logic/mission.js`.

- [ ] **Step 3: Implement** `js/logic/mission.js`:

```js
import { UPRIGHT_ANGLE } from './landing.js';

/** How far (px) either side of the habitat a landed ship may be and still unload. */
export const HABITAT_RANGE = 64;
/** The fastest (px/s) a ship can be moving and still count as landed. */
export const LANDED_SPEED = 5;
/** How far (degrees) from upright a landed ship may lean and still unload. */
export const UPRIGHT_TOLERANCE = 5;

/** The rescue mission: how many dudes the level holds, how many are aboard and how many are home. */
export class Mission {
	constructor(total) {
		this.total = total;
		this.aboard = 0;
		this.delivered = 0;
	}

	pickUp() {
		this.aboard += 1;
	}

	/** Move one dude from the ship to the habitat. False when nobody is aboard. */
	unloadOne() {
		if (this.aboard === 0) {
			return false;
		}
		this.aboard -= 1;
		this.delivered += 1;
		return true;
	}

	get hasCargo() {
		return this.aboard > 0;
	}

	get isComplete() {
		return this.total > 0 && this.delivered === this.total;
	}
}

/**
 * Whether a ship can unload at the habitat: on the floor, upright, nearly still,
 * and within HABITAT_RANGE of the habitat's left or right edge.
 * `habitat` is the habitat rectangle's left edge `x` and `width`.
 */
export function canUnload({ onFloor, angle, speed, shipX, habitat }) {
	if (!onFloor || speed > LANDED_SPEED) {
		return false;
	}
	if (Math.abs(angle - UPRIGHT_ANGLE) > UPRIGHT_TOLERANCE) {
		return false;
	}
	return shipX >= habitat.x - HABITAT_RANGE && shipX <= habitat.x + habitat.width + HABITAT_RANGE;
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run tests/unit/mission.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add js/logic/mission.js tests/unit/mission.test.js
git commit -m "feature/mission: cargo counts, completion and the unload rule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Wider ledge and Habitat object in level1

**Files:**
- Modify: `public/assets/level1.tmx` (Walls CSV rows 21–24 are file lines 40–43; add a `Habitat` objectgroup before `</map>`)
- Modify: `public/assets/level1.json` (Walls `data` array; add a `Habitat` layer object to `layers`)
- Modify: `js/logic/tiled.js` (export `NON_SOLID_TILES`)
- Test: `tests/level.test.js`, `tests/unit/tiled.test.js` (unchanged, must still pass)

**Interfaces:**
- Produces:
  - `export const NON_SOLID_TILES = [-1, 13, 14, 15, 16, 46, 47, 48, 49, 50, 51];` in `js/logic/tiled.js`. This is the same list `LevelScene.js` holds today. Task 4 switches the scene to import it. **Do not edit `LevelScene.js` in this task.**
  - Map object layer `Habitat` with exactly one rectangle object: `name: "habitat"`, `x: 128, y: 288, width: 48, height: 48`, no `gid`. Its bottom edge (y 336) rests on the ledge top (Walls row 21).
  - Walls: the ledge occupies columns 0–11 of rows 21–24 (x 0–192).

Background: the Walls data is row-major, 64 × 64, with `index = row * 64 + col`. Today rows 21–24 hold, in columns 0–4:

```
row 21:  6,  2,  3,  6,  7
row 22: 36, 19, 22, 23, 24
row 23: 19, 19, 39, 40, 41
row 24: 20, 54, 55, 57, 60
```

Columns 5–11 of those rows are 0, and so is everything above row 21 in columns 0–11. The widened ledge keeps column 0 (the left edge), repeats the column 1/2 pair across columns 1–9, and moves columns 3/4 (the right edge) to columns 10/11:

```
row 21:  6,  2,  3,  2,  3,  2,  3,  2,  3,  2,  6,  7
row 22: 36, 19, 22, 19, 22, 19, 22, 19, 22, 19, 23, 24
row 23: 19, 19, 39, 19, 39, 19, 39, 19, 39, 19, 40, 41
row 24: 20, 54, 55, 54, 55, 54, 55, 54, 55, 54, 57, 60
```

These gids are a starting point. Open `public/assets/tiles-1.png` (17 tiles × 4 rows of 16 px; gid g is at column `(g-1) % 17`, row `floor((g-1) / 17)`) and adjust the fill if the seams look wrong. Keep every ledge cell a gid that is not in `NON_SOLID_TILES`, so the whole ledge collides, and keep the top row's surface flat.

- [ ] **Step 1: Write the failing tests.** Append to `tests/level.test.js`:

```js
import { NON_SOLID_TILES } from '../js/logic/tiled.js';

const wallGid = (row, col) => layer('Walls').data[row * layer('Walls').width + col];
const solid = (gid) => gid !== 0 && !NON_SOLID_TILES.includes(gid);

test('has a Habitat object layer with one rectangle', () => {
	const habitat = layer('Habitat');
	assert.equal(habitat?.type, 'objectgroup');
	assert.equal(habitat.objects.length, 1);
	const [box] = habitat.objects;
	assert.equal(box.gid, undefined, 'the habitat is a rectangle, not a tile object');
	assert.ok(box.width > 0 && box.height > 0, 'the habitat rectangle has no size');
});

test('the habitat stands on solid ground, in open space', () => {
	const { tilewidth, tileheight } = map;
	const [box] = layer('Habitat').objects;
	const firstCol = Math.floor(box.x / tilewidth);
	const lastCol = Math.floor((box.x + box.width - 1) / tilewidth);
	const groundRow = (box.y + box.height) / tileheight;
	assert.ok(Number.isInteger(groundRow), 'the habitat bottom is not on a tile boundary');
	for (let col = firstCol; col <= lastCol; col++) {
		assert.ok(solid(wallGid(groundRow, col)), `no solid ground under the habitat at column ${col}`);
		for (let row = box.y / tileheight; row < groundRow; row++) {
			assert.ok(!solid(wallGid(row, col)), `wall inside the habitat at row ${row}, column ${col}`);
		}
	}
});

test('the top-left ledge is wide enough for the ship beside the habitat', () => {
	for (let col = 0; col <= 11; col++) {
		assert.ok(solid(wallGid(21, col)), `ledge surface missing at column ${col}`);
	}
});
```

Put the `import` at the top of the file with the other imports. Also add `'Habitat'` to the existing `has the layers create() uses` test:

```js
	assert.equal(layer('Habitat')?.type, 'objectgroup');
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/level.test.js`
Expected: FAIL. `NON_SOLID_TILES` is not exported (imports as undefined, so `.includes` throws), and `Habitat` is missing.

- [ ] **Step 3: Export the tile list.** Add at the top of `js/logic/tiled.js`:

```js
/** Tile gids in tiles-1 that are scenery rather than wall (-1 is an empty cell). */
export const NON_SOLID_TILES = [-1, 13, 14, 15, 16, 46, 47, 48, 49, 50, 51];
```

- [ ] **Step 4: Edit both map files** with a one-off script. Keep it in `$CLAUDE_JOB_DIR/tmp` (or another directory outside the repo) and don't commit it. It must preserve each file's existing formatting: the `.tmx` CSV is one map row per line, starting at line 19 for row 0. The `.json` `data` array is a single line of `", "`-separated numbers. Edit them as text, don't re-serialise the whole JSON. Sketch:

```python
import json, re, sys
LEDGE = {
    21: [6, 2, 3, 2, 3, 2, 3, 2, 3, 2, 6, 7],
    22: [36, 19, 22, 19, 22, 19, 22, 19, 22, 19, 23, 24],
    23: [19, 19, 39, 19, 39, 19, 39, 19, 39, 19, 40, 41],
    24: [20, 54, 55, 54, 55, 54, 55, 54, 55, 54, 57, 60],
}
W = 64
root = sys.argv[1]

# .tmx: rows are lines 19.. (1-based); each line is 64 comma-separated gids plus a trailing comma, except the last row.
tmx_path = f'{root}/public/assets/level1.tmx'
lines = open(tmx_path).read().split('\n')
for row, gids in LEDGE.items():
    i = 18 + row  # 0-based line index
    cells = lines[i].rstrip(',').split(',')
    assert len(cells) == W, (row, len(cells))
    cells[:len(gids)] = [str(g) for g in gids]
    lines[i] = ','.join(cells) + (',' if lines[i].endswith(',') else '')
text = '\n'.join(lines)
habitat_xml = ' <objectgroup name="Habitat" width="64" height="64">\n  <object name="habitat" x="128" y="288" width="48" height="48"/>\n </objectgroup>\n</map>'
text = text.replace('</map>', habitat_xml, 1)
open(tmx_path, 'w').write(text)

# .json: replace the data array text in place, then add the layer after the Collectables layer.
json_path = f'{root}/public/assets/level1.json'
src = open(json_path).read()
m = re.search(r'"data":\[([^\]]*)\]', src)
data = [int(v) for v in m.group(1).split(',')]
for row, gids in LEDGE.items():
    data[row * W: row * W + len(gids)] = gids
src = src[:m.start(1)] + ', '.join(str(v) for v in data) + src[m.end(1):]
open(json_path, 'w').write(src)
```

Then add the `Habitat` layer to the JSON `layers` array (after the `Collectables` layer, in the file's existing indentation style) by hand or by a text insert:

```json
        {
         "height":64,
         "name":"Habitat",
         "objects":[
                {
                 "height":48,
                 "name":"habitat",
                 "properties":
                    {

                    },
                 "type":"",
                 "visible":true,
                 "width":48,
                 "x":128,
                 "y":288
                }],
         "opacity":1,
         "type":"objectgroup",
         "visible":true,
         "width":64,
         "x":0,
         "y":0
        }
```

Check the result: `python3 -c "import json; json.load(open('public/assets/level1.json'))"` parses, `python3 -c "import xml.dom.minidom as d; d.parse('public/assets/level1.tmx')"` parses, and both files give the same 64×64 Walls grid. Run this to compare:

```bash
python3 - <<'EOF'
import json, xml.etree.ElementTree as ET
j = json.load(open('public/assets/level1.json'))
jd = next(l for l in j['layers'] if l['name'] == 'Walls')['data']
t = ET.parse('public/assets/level1.tmx').getroot()
td = [int(v) for v in t.find("layer[@name='Walls']/data").text.replace('\n', '').split(',') if v.strip()]
assert jd == td, 'tmx and json Walls differ'
assert len(jd) == 64 * 64
print('in sync')
EOF
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `npm test`
Expected: all PASS, including the existing `Walls layer data matches its size` and the `tests/unit/tiled.test.js` suite.

- [ ] **Step 6: Commit**

```bash
git add public/assets/level1.tmx public/assets/level1.json js/logic/tiled.js tests/level.test.js
git commit -m "feature/level: widen the top-left ledge and place the habitat in Tiled

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Habitat art

**Files:**
- Create: `src/assets/habitat/make_habitat.py`
- Create: `public/assets/habitat.png` (generated, 48 × 48 RGBA)

**Interfaces:**
- Produces: `public/assets/habitat.png`, 48 × 48 px, transparent background. The base sits on the bottom row of pixels and the door opening is centred horizontally on the bottom edge (x 20–27, the bottom 14 px). Task 4 loads it as key `habitat` with origin (0.5, 1).

- [ ] **Step 1: Write the generator** `src/assets/habitat/make_habitat.py`. It's pixel art drawn with Pillow: a domed habitat on a rectangular base, a door at the bottom centre, a couple of lit windows, and a small antenna. Use muted greys/blues with a warm window light so it reads against `background2.png` and next to `tiles-1`. Write it with `Image.new('RGBA', (48, 48), (0, 0, 0, 0))`. Reference layout:

```python
#!/usr/bin/env python3
"""Draws public/assets/habitat.png: a 48x48 pixel-art dome habitat with a door at the bottom centre.

Run from the repo root:  python3 src/assets/habitat/make_habitat.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

SIZE = 48
OUT = Path(__file__).resolve().parents[3] / 'public' / 'assets' / 'habitat.png'

HULL = (150, 160, 175, 255)
HULL_SHADE = (95, 105, 125, 255)
DOME = (120, 170, 210, 255)
DOME_SHINE = (190, 225, 245, 255)
OUTLINE = (30, 35, 45, 255)
DOOR = (25, 25, 30, 255)
LIGHT = (255, 210, 90, 255)

img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Antenna
d.line([(24, 4), (24, 12)], fill=OUTLINE)
d.point((24, 3), fill=LIGHT)
# Dome: upper half of an ellipse
d.pieslice([6, 10, 41, 45], 180, 360, fill=DOME, outline=OUTLINE)
d.arc([11, 14, 30, 36], 200, 260, fill=DOME_SHINE)
# Base
d.rectangle([3, 28, 44, 47], fill=HULL, outline=OUTLINE)
d.rectangle([4, 41, 43, 46], fill=HULL_SHADE)
# Windows
for x in (8, 34):
    d.rectangle([x, 32, x + 5, 36], fill=LIGHT, outline=OUTLINE)
# Door, bottom centre (x 20..27, bottom 14 px)
d.rectangle([20, 34, 27, 47], fill=DOOR, outline=OUTLINE)

OUT.parent.mkdir(parents=True, exist_ok=True)
img.save(OUT)
print(f'wrote {OUT}')
```

You may refine the drawing, but keep the size, the transparent background, the bottom-centre door and the base on the bottom pixel row.

- [ ] **Step 2: Generate and check it**

Run: `python3 src/assets/habitat/make_habitat.py && python3 -c "from PIL import Image; im=Image.open('public/assets/habitat.png'); print(im.size, im.mode, im.getpixel((0,0)))"`
Expected: `(48, 48) RGBA (0, 0, 0, 0)`. Then view `public/assets/habitat.png` with the Read tool and check it reads as a habitat with a door.

- [ ] **Step 3: Commit**

```bash
git add src/assets/habitat/make_habitat.py public/assets/habitat.png
git commit -m "feature/habitat: pixel-art habitat sprite and its generator

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Habitat, unloading and level completion in the scene

**Files:**
- Modify: `js/scenes/LevelScene.js`
- Modify: `js/hud/Scoreboard.js`
- Test: `tests/e2e/game.spec.js`

**Interfaces:**
- Consumes:
  - `Mission`, `canUnload` from `js/logic/mission.js` (Task 1)
  - `NON_SOLID_TILES` from `js/logic/tiled.js` (Task 2)
  - `PATROL_SPEED` from `js/logic/patrol.js` (existing; 30)
  - `Cooldown` from `js/logic/cooldown.js` (existing: `ready(now)`, `trigger(now, interval?)`)
  - Map object layer `Habitat`: one rectangle `{ x: 128, y: 288, width: 48, height: 48 }` (Task 2)
  - `public/assets/habitat.png`, 48 × 48, door at the bottom centre (Task 3)
- Produces (used by e2e tests and console debugging, through `window.thrust.scene.getScene('Level')`):
  - `scene.mission: Mission`, `scene.habitat: Phaser.GameObjects.Image`, `scene.habitatZone: { x, width, doorX, floorY }`
  - `scene.levelComplete: boolean`, `scene.banner: Phaser.GameObjects.Container | undefined`
  - `scene.scoreboard.missionText: Phaser.GameObjects.Text`
  - Methods `rescue(dude)`, `unloadDude()`, `completeLevel()`
  - `new Scoreboard(scene, status, mission)`

- [ ] **Step 1: Update and write the e2e tests (failing).** In `tests/e2e/game.spec.js`:

(a) Add a helper below `parkShip`:

```js
/** Put the ship just above the top-left ledge beside the habitat, upright, and let it settle there. */
async function landBesideHabitat(page) {
	await inScene(page, (scene) => {
		scene.shipTween.stop();
		scene.ship.setAngle(-90);
		const { x, floorY } = scene.habitatZone;
		scene.ship.body.reset(x - 40, floorY - 40);
	});
	await page.waitForFunction(() => {
		const { ship } = window.thrust.scene.getScene('Level');
		return ship.body.onFloor() && ship.body.speed < 5;
	}, null, { timeout: 10_000 });
}

/** Take every dude on board without flying to them. */
function rescueAll(page) {
	return inScene(page, (scene) => scene.collectables.getMatching('active', true).forEach((dude) => scene.rescue(dude)));
}
```

(b) In `boots Phaser 4 and builds the level from the Tiled map`, also collect `mission: scene.scoreboard.missionText.text` and `habitat: Boolean(scene.habitat)`, and expect `level.mission` to be `'0/2'` and `level.habitat` to be `true`.

(c) Extend `the ship falls, lands and is turned upright` (Review Focus 1). After the existing `waitForFunction`, add:

```js
	await page.waitForTimeout(1000);
	const after = await inScene(page, (scene) => ({ complete: scene.levelComplete, mission: scene.scoreboard.missionText.text }));
	expect(after).toEqual({ complete: false, mission: '0/2' });
```

(d) Replace `flying into a stranded dude rescues them for points` with:

```js
test('flying into a stranded dude takes them aboard, without points yet', async ({ page }) => {
	await openGame(page);
	await parkShip(page);
	await inScene(page, (scene) => {
		const dude = scene.collectables.getChildren()[0];
		dude.body.reset(scene.ship.body.x, scene.ship.body.y);
		dude.body.setAllowGravity(false);
	});

	await expect.poll(() => inScene(page, (scene) => scene.collectables.countActive(true))).toBe(1);
	expect(await inScene(page, (scene) => scene.status.score)).toBe(0);
	expect(await inScene(page, (scene) => scene.mission.aboard)).toBe(1);
	expect(await inScene(page, (scene) => scene.scoreboard.missionText.text)).toBe('0/2 +1');
});
```

(e) Add (Review Focus 3, 4 and 5):

```js
test('landing beside the habitat with every dude aboard completes the level, and SPACE restarts it', async ({ page }) => {
	const errors = await openGame(page);
	await rescueAll(page);
	expect(await inScene(page, (scene) => scene.mission.aboard)).toBe(2);

	// Hold fire through completion: the banner must not be skipped by a key already down.
	await page.keyboard.down('Space');
	await landBesideHabitat(page);
	await expect.poll(() => inScene(page, (scene) => scene.levelComplete), { timeout: 15_000 }).toBe(true);
	await page.waitForTimeout(300);
	await page.keyboard.up('Space');

	const done = await inScene(page, (scene) => ({
		score: scene.status.score,
		mission: scene.scoreboard.missionText.text,
		banner: scene.banner?.list.filter((o) => o.type === 'Text').map((t) => t.text),
		enemyBullets: scene.enemyBullets.countActive(true),
	}));
	expect(done.score).toBe(1000);
	expect(done.mission).toBe('2/2');
	expect(done.banner).toEqual(['MISSION COMPLETE', 'SCORE 1000', 'PRESS SPACE']);
	expect(done.enemyBullets).toBe(0);

	await page.keyboard.press('Space');
	await page.waitForFunction(() => {
		const scene = window.thrust.scene.getScene('Level');
		return scene.scoreboard && !scene.levelComplete && scene.mission?.delivered === 0 && scene.status.score === 0;
	}, null, { timeout: 5_000 });
	await page.waitForTimeout(500);
	expect(await inScene(page, (scene) => scene.scoreboard.missionText.text)).toBe('0/2');
	expect(errors).toEqual([]);
});

test('delivering only some dudes scores them but does not complete the level', async ({ page }) => {
	await openGame(page);
	await inScene(page, (scene) => scene.rescue(scene.collectables.getChildren()[0]));
	await landBesideHabitat(page);

	await expect.poll(() => inScene(page, (scene) => scene.status.score), { timeout: 10_000 }).toBe(500);
	await page.waitForTimeout(500);
	expect(await inScene(page, (scene) => ({ complete: scene.levelComplete, mission: scene.scoreboard.missionText.text })))
		.toEqual({ complete: false, mission: '1/2' });
});

test('taking off mid-unload keeps the remaining dudes aboard', async ({ page }) => {
	await openGame(page);
	await rescueAll(page);
	// Space the dudes out so the second can't leave before the ship lifts off.
	await inScene(page, (scene) => { scene.unloadTick.interval = 5000; });
	await landBesideHabitat(page);
	await expect.poll(() => inScene(page, (scene) => scene.mission.delivered), { timeout: 10_000 }).toBe(1);

	// Lift off at once, before the next dude's turn.
	await inScene(page, (scene) => {
		scene.ship.body.setAllowGravity(false);
		scene.ship.body.reset(scene.ship.x, scene.habitatZone.floorY - 200);
	});
	await page.waitForTimeout(1500);
	const state = await inScene(page, (scene) => ({
		aboard: scene.mission.aboard,
		delivered: scene.mission.delivered,
		score: scene.status.score,
		complete: scene.levelComplete,
	}));
	expect(state).toEqual({ aboard: 1, delivered: 1, score: 500, complete: false });
});
```

Run: `cat /proc/loadavg` (1-min < 10), then `npm run test:e2e`
Expected: the new and updated tests FAIL (`missionText`/`habitatZone`/`mission` undefined, score 500 on pickup). The other existing tests still PASS.

- [ ] **Step 2: Scoreboard shows the mission.** In `js/hud/Scoreboard.js`, change the constructor to take `mission`, add a `missionText` value next to the `MISSION` label, include it in the scroll-factor/depth loop, and update it in `refresh()`:

```js
	constructor(scene, status, mission) {
		this.status = status;
		this.mission = mission;
		...
		this.missionText = scene.add.text(445, 7, '', TEXT_STYLE);
		this.scoreText = scene.add.text(630, 7, '0', TEXT_STYLE);
		for (const item of [this.graphics, ...labels, this.missionText, this.scoreText]) {
```

```js
	/** Redraw from the current status and mission. Call after changing fuel, life, score or cargo. */
	refresh() {
		this.graphics.clear();
		this.drawGauge(GAUGES.life, this.status.life);
		this.drawGauge(GAUGES.fuel, this.status.fuel);
		const { delivered, total, aboard } = this.mission;
		this.missionText.setText(`${delivered}/${total}` + (aboard > 0 ? ` +${aboard}` : ''));
		this.scoreText.setText(String(this.status.score));
	}
```

Update the class doc comment to mention the mission count.

- [ ] **Step 3: Scene constants, imports and preload.** In `js/scenes/LevelScene.js`:
  - Replace the local `NON_SOLID_TILES` constant with an import: `import { NON_SOLID_TILES, objectSpawnPosition, objectsWithGid } from '../logic/tiled.js';`
  - Add `import { canUnload, Mission } from '../logic/mission.js';` and import `PATROL_SPEED` (already imported).
  - Add constants with the others:

```js
const UNLOAD_INTERVAL = 600; // ms between dudes leaving the ship
const UNLOAD_WALK_SPEED = PATROL_SPEED * 2; // px/s, walking to the habitat door
const RESTART_DELAY = 5000; // ms the mission-complete banner shows before restarting
const BANNER_DEPTH = 200; // above the HUD (100)
```

  - In `preload()`: `this.load.image('habitat', 'habitat.png');`

- [ ] **Step 4: Build the habitat and mission in `create()`.** After `this.createLevel();` add `this.createHabitat();`. After `this.collectables = this.createCollectables();` add:

```js
		this.mission = new Mission(this.collectables.getLength());
		this.unloadTick = new Cooldown(UNLOAD_INTERVAL);
		this.levelComplete = false;
		this.restarting = false;
		this.walkingDudes = 0;
		this.banner = undefined;
```

Change `new Scoreboard(this, this.status)` to `new Scoreboard(this, this.status, this.mission)`. Add the method:

```js
	/** The habitat image, standing on the bottom edge of the Tiled `Habitat` rectangle. */
	createHabitat() {
		const [box] = this.map.getObjectLayer('Habitat').objects;
		const doorX = box.x + box.width / 2;
		const floorY = box.y + box.height;
		this.habitat = this.add.image(doorX, floorY, 'habitat').setOrigin(0.5, 1);
		this.habitatZone = { x: box.x, width: box.width, doorX, floorY };
	}
```

- [ ] **Step 5: Pickup no longer scores.** Replace `rescue(dude)`:

```js
	/** Take a dude aboard. They score when they walk into the habitat. */
	rescue(dude) {
		dude.disableBody(true, true);
		this.mission.pickUp();
		this.scoreboard.refresh();
	}
```

- [ ] **Step 6: Unloading in `update()`.** Replace the body of `update(time)` with:

```js
	update(time) {
		if (this.ship.active && !this.levelComplete) {
			this.steer(time);
			if (this.fireKey.isDown && this.shipFire.ready(time)) {
				this.shipShoot(time);
			}
			if (this.enemyFire.ready(time)) {
				this.enemyShoot(time);
			}
			if (this.mission.hasCargo && this.unloadTick.ready(time) && this.landedAtHabitat()) {
				this.unloadDude();
				this.unloadTick.trigger(time);
			}
		}
		this.killStrayBullets(this.shipBullets);
		this.killStrayBullets(this.enemyBullets);
	}

	landedAtHabitat() {
		const { body } = this.ship;
		return canUnload({
			onFloor: body.onFloor(),
			angle: this.ship.angle,
			speed: body.speed,
			shipX: body.center.x,
			habitat: this.habitatZone,
		});
	}

	/** One dude climbs out, walks to the habitat door and goes in, scoring the rescue. */
	unloadDude() {
		this.mission.unloadOne();
		this.scoreboard.refresh();
		const { doorX, floorY } = this.habitatZone;
		const startX = this.ship.body.center.x;
		const dude = this.add.sprite(startX, floorY, 'dude', 4).setOrigin(0.5, 1);
		dude.play(doorX >= startX ? 'dude-right' : 'dude-left');
		this.tweens.add({
			targets: dude,
			x: doorX,
			duration: (Math.abs(doorX - startX) / UNLOAD_WALK_SPEED) * 1000,
			onComplete: () => {
				dude.destroy();
				this.status.changeScore(SHIP_SCORE_RESCUE);
				this.scoreboard.refresh();
				if (this.mission.isComplete && this.mission.aboard === 0 && !this.dudesWalking()) {
					this.completeLevel();
				}
			},
		});
		this.walkingDudes += 1;
		dude.once(Phaser.GameObjects.Events.DESTROY, () => { this.walkingDudes -= 1; });
	}

	dudesWalking() {
		return this.walkingDudes > 0;
	}
```

Note on `dudesWalking()`: the DESTROY handler runs inside `dude.destroy()`, before the score line, so by the time the last dude's `onComplete` checks, `walkingDudes` already counts only the others. The level completes when the last walker arrives, not when the last one leaves the ship. `create()` resets `walkingDudes` to 0 (Step 4), because `scene.restart()` destroys any walkers left over.

- [ ] **Step 7: Completion banner and restart.**

```js
	/** Freeze play, show the mission-complete banner, and restart on SPACE or after RESTART_DELAY. */
	completeLevel() {
		if (this.levelComplete) {
			return;
		}
		this.levelComplete = true;
		const { ship } = this;
		ship.setVelocity(0, 0).setAcceleration(0).setAngularVelocity(0);
		ship.setFrame(SHIP_FRAME.IDLE);
		for (const bullet of this.enemyBullets.getMatching('active', true)) {
			bullet.disableBody(true, true);
		}

		const { width, height } = this.scale;
		const style = { fontFamily: 'Arial', fontSize: '32px', color: '#ffd900', align: 'center' };
		const small = { ...style, fontSize: '18px', color: '#ffffff' };
		const backdrop = this.add.rectangle(0, 0, 360, 150, 0x000000, 0.7).setStrokeStyle(2, 0xffd900);
		const lines = [
			this.add.text(0, -40, 'MISSION COMPLETE', style).setOrigin(0.5),
			this.add.text(0, 5, `SCORE ${this.status.score}`, small).setOrigin(0.5),
			this.add.text(0, 40, 'PRESS SPACE', small).setOrigin(0.5),
		];
		this.banner = this.add.container(width / 2, height / 2, [backdrop, ...lines])
			.setScrollFactor(0)
			.setDepth(BANNER_DEPTH);

		// A fresh press only: a fire key already held when the level ends must not skip the banner.
		this.input.keyboard.once('keydown-SPACE', () => this.restartLevel());
		this.time.delayedCall(RESTART_DELAY, () => this.restartLevel());
	}

	restartLevel() {
		if (this.restarting) {
			return;
		}
		this.restarting = true;
		this.scene.restart();
	}
```

Check `keydown-SPACE` semantics: Phaser's keyboard plugin emits `keydown-SPACE` on every native `keydown`, including OS auto-repeat while the key is held. If the e2e "hold SPACE through completion" test shows the banner being skipped, ignore repeats: register `this.input.keyboard.on('keydown-SPACE', (event) => { if (!event.repeat) this.restartLevel(); })` instead (`restartLevel` is already guarded, and listeners are removed on restart because the keyboard plugin is scene-owned). Make sure the listener doesn't leak across restarts: on `scene.restart()`, `this.input.keyboard` listeners registered with `on`/`once` are cleared at shutdown. Verify that in the restart e2e by checking there are no errors and only one restart.

- [ ] **Step 8: Run the e2e tests and see them pass**

Run: `cat /proc/loadavg` (1-min < 10), then `npm run test:e2e`
Expected: all PASS. If a test flakes on timing (settling or tween duration), fix the cause (e.g. wait on the condition), not the timeout. Then run `npm test` (Vitest): all PASS.

- [ ] **Step 9: Look at it.** Run `npm run build`, then write a short Playwright script in `$CLAUDE_JOB_DIR/tmp` (not committed). It should open `http://localhost:4173/` via `npx vite preview --port 4173 --strictPort`, call `rescueAll` and land beside the habitat (the same steps as the e2e helper), and save screenshots: the ledge with the habitat at the start, a dude walking to the door, and the banner. View them with the Read tool and check that the ledge tiles look continuous, the habitat sits on the ledge without floating or sinking, and the banner is centred. Fix anything that looks wrong (ledge tile choice in Task 2's files is fair game here, as long as both map files stay in sync and `npm test` still passes). Stop the preview server.

- [ ] **Step 10: Commit**

```bash
git add js/scenes/LevelScene.js js/hud/Scoreboard.js tests/e2e/game.spec.js
git commit -m "feature/habitat: unload dudes at the habitat and complete the level

Landing upright beside the habitat unloads the dudes aboard; each scores
as it walks in. Delivering every dude shows a mission-complete banner and
SPACE (or 5 s) restarts the level. The HUD shows delivered/total.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Also update `CLAUDE.md`: add `mission` to the `js/logic/` list (`Mission` and `canUnload`: cargo, completion and landing at the habitat), add `Habitat` (one rectangle object, no gid) to the Levels layer list, mention `NON_SOLID_TILES` now lives in `js/logic/tiled.js`, and note that a pickup scores nothing until delivery. Commit it with the code above or as `docs: ...`.
