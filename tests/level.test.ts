// Each level's JSON is the Tiled export the game reads; check the parts create() depends on.
import { describe, test as baseTest } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { numberProperty, stringProperty, type TiledProperties } from '../src/logic/mapProperties.ts';
import { musicKey } from '../src/logic/audio.ts';
import { NON_SOLID_TILES } from '../src/logic/tiled.ts';
import { ENEMY_SCALE, ENEMY_TEXTURE_HEIGHT, LEVELS, shipStartPosition, SHIP_BODY_LEFT, SHIP_BODY_RIGHT } from '../src/logic/levels.ts';
import { HABITAT_RANGE } from '../src/logic/mission.ts';
import { reachableBoxes } from './helpers/reachability.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
/** The parts of a Tiled JSON export the tests read. A layer has `data` or `objects`, by its type. */
interface MapObject {
	x: number;
	y: number;
	width: number;
	height: number;
	gid?: number;
}
interface MapLayer {
	name: string;
	type: string;
	width: number;
	height: number;
	data: number[];
	objects: MapObject[];
}
interface TiledMap {
	width: number;
	height: number;
	tilewidth: number;
	tileheight: number;
	layers: MapLayer[];
	tilesets: { name: string; image: string }[];
	properties?: TiledProperties;
}
type TestBody = () => void;

const solid = (gid: number): boolean => Number.isInteger(gid) && gid > 0 && !NON_SOLID_TILES.includes(gid);

describe.each(LEVELS)('$key', ({ key, file }) => {
	const path = root + 'public/assets/' + file;
	const exists = existsSync(path);
	const map = exists ? JSON.parse(readFileSync(path, 'utf8')) as TiledMap : { layers: [] } as unknown as TiledMap;
	// A missing map is one clear failure; the other tests of that level are skipped.
	const test = (name: string, fn: TestBody) => (exists || name === 'the map file exists' ? baseTest(name, fn) : baseTest.skip(name, fn));
	const testSkipIf = (cond: boolean) => (name: string, fn: TestBody) => (cond || !exists ? baseTest.skip(name, fn) : baseTest(name, fn));
	const layer = (name: string) => map.layers.find((l) => l.name === name) as MapLayer;
	const wallGid = (row: number, col: number) => layer('Walls').data[row * layer('Walls').width + col];

	test('the map file exists', () => {
		assert.ok(existsSync(path), `missing public/assets/${file}`);
	});

	test('has the layers create() uses', () => {
		assert.equal(layer('Walls')?.type, 'tilelayer');
		assert.equal(layer('Enemy')?.type, 'objectgroup');
		assert.equal(layer('Collectables')?.type, 'objectgroup');
		assert.equal(layer('Habitat')?.type, 'objectgroup');
	});

	test('Walls layer data matches its size', () => {
		const walls = layer('Walls');
		assert.equal(walls.data.length, walls.width * walls.height);
	});

	test('Enemy and Collectables layers hold the gids the game spawns from', () => {
		assert.ok(layer('Enemy').objects.some((o) => o.gid === 69), 'no enemy (gid 69)');
		assert.ok(layer('Collectables').objects.some((o) => o.gid === 71), 'no collectable (gid 71)');
	});

	test('has at least one collectable', () => {
		assert.ok(layer('Collectables').objects.filter((o) => o.gid === 71).length >= 1);
	});

	// Read as the game reads them (numberProperty), so either Tiled export format passes.
	// Tiled stores them as strings; the game does arithmetic with them.
	const property = (name: string) => numberProperty(map.properties, name, NaN);
	test('tuning properties are present and numeric', () => {
		for (const prop of ['fuelExpense', 'lifeExpense', 'enemyShootTime']) {
			assert.ok(Number.isFinite(property(prop)), `map property ${prop} is missing or not numeric`);
		}
	});

	test('names a music track', () => {
		const music = stringProperty(map.properties, 'music', '');
		assert.ok(musicKey(music), `music property '${music}' is not a MUSIC key`);
	});

	test('the tiles-1 tileset image is shipped', () => {
		const tiles = map.tilesets.find((t) => t.name === 'tiles-1');
		assert.ok(tiles, 'no tiles-1 tileset');
		assert.ok(existsSync(root + 'public/assets/' + tiles.image));
	});

	// The game only loads tiles-1, but Tiled needs every tileset's image to show the map.
	test('every tileset image exists, so the map opens in Tiled', () => {
		const missing = map.tilesets.map((t) => t.image).filter((image) => !existsSync(root + 'public/assets/' + image));
		assert.deepEqual(missing, []);
	});

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
		const walls = layer('Walls');
		assert.ok(groundRow < walls.height, 'the habitat ground row is outside the map');
		assert.ok(firstCol >= 0 && lastCol < walls.width, 'the habitat columns are outside the map');
		for (let col = firstCol; col <= lastCol; col++) {
			assert.ok(solid(wallGid(groundRow, col)), `no solid ground under the habitat at column ${col}`);
			for (let row = Math.floor(box.y / tileheight); row < groundRow; row++) {
				assert.ok(!solid(wallGid(row, col)), `wall inside the habitat at row ${row}, column ${col}`);
			}
		}
	});

	// level1's ledge runs from the map's left edge to just past the habitat (1 tile on its right).
	testSkipIf(key === 'level1')('the habitat ledge has 5 solid tiles beyond the habitat on both sides, open above', () => {
		const walls = layer('Walls');
		const [box] = layer('Habitat').objects;
		const groundRow = (box.y + box.height) / map.tileheight;
		const first = Math.floor(box.x / map.tilewidth) - 5;
		const last = Math.floor((box.x + box.width - 1) / map.tilewidth) + 5;
		assert.ok(first >= 0 && last < walls.width, 'the ledge columns are outside the map');
		for (let col = first; col <= last; col++) {
			assert.ok(solid(walls.data[groundRow * walls.width + col]), `no ledge at column ${col}`);
			for (let row = groundRow - 3; row < groundRow; row++) {
				assert.ok(!solid(walls.data[row * walls.width + col]), `rock above the ledge at ${col},${row}`);
			}
		}
	});

	test('every enemy has room to turn: its pivot is half an enemy width from rock and the map edge', () => {
		const walls = layer('Walls');
		const { tilewidth: tw, tileheight: th } = map;
		// The arrow PNG's width, from its IHDR header, at the scale the scene draws it.
		const png = readFileSync(root + 'public/assets/longarrow2.png');
		const clearance = (png.readUInt32BE(16) * ENEMY_SCALE) / 2;
		const rockAt = (row: number, col: number) => col < 0 || col >= walls.width || solid(wallGid(row, col));
		const cramped = layer('Enemy').objects.filter((obj) => {
			// The pivot, as the scene spawns it: objectSpawnPosition() with the 32 px tall texture.
			const x = obj.x;
			const row = Math.floor((obj.y - ENEMY_TEXTURE_HEIGHT) / th);
			for (let col = Math.floor((x - clearance) / tw); col <= Math.floor((x + clearance - 1) / tw); col++) {
				if (rockAt(row, col)) return true;
			}
			return false;
		});
		assert.deepEqual(cramped.map((o) => `enemy at ${o.x},${o.y}`), []);
	});

	test('the ship starts in open space', () => {
		const walls = layer('Walls');
		const { tilewidth: tw, tileheight: th } = map;
		const [box] = layer('Habitat').objects;
		const start = shipStartPosition(box, walls.width * tw);
		// The ship's body: x - 22 .. x + 24 and y - 23 .. y + 23 (46 px square).
		const left = start.x - SHIP_BODY_LEFT, right = start.x + SHIP_BODY_RIGHT;
		const top = start.y - 23, bottom = start.y + 23;
		for (let row = Math.floor(top / th); row <= Math.floor((bottom - 1) / th); row++) {
			for (let col = Math.floor(left / tw); col <= Math.floor((right - 1) / tw); col++) {
				assert.ok(!solid(wallGid(row, col)), `rock under the ship's start body (x ${left}..${right}, y ${top}..${bottom}) at tile ${col},${row}`);
			}
		}
	});

	test('the ship can fly from its start to the habitat and to every dude', () => {
		const walls = layer('Walls');
		const { tilewidth: tw, tileheight: th } = map;
		const [box] = layer('Habitat').objects;
		const start = shipStartPosition(box, walls.width * tw);
		// level1's gaps are 3 tiles wide and are flown today; later levels keep every passage 4 wide.
		const boxSize = key === 'level1' ? 3 : 4;
		const boxes = reachableBoxes({
			data: walls.data, width: walls.width, height: walls.height, solid,
			start: { col: Math.floor(start.x / tw), row: Math.floor(start.y / th) },
			box: boxSize,
		});
		assert.ok(boxes.size > 0, 'the ship start is inside rock');
		const cells = [...boxes].map((k: string) => k.split(',').map(Number));
		const groundRow = (box.y + box.height) / th;
		const landing = cells.some(([c, r]) => {
			const centreX = (c + boxSize / 2) * tw;
			if (r + boxSize !== groundRow) {
				return false;
			}
			for (let col = c; col < c + boxSize; col++) {
				if (!solid(wallGid(groundRow, col))) {
					return false;
				}
			}
			return centreX >= box.x - HABITAT_RANGE && centreX <= box.x + box.width + HABITAT_RANGE;
		});
		assert.ok(landing, 'no room to land beside the habitat');
		for (const dude of layer('Collectables').objects.filter((o) => o.gid === 71)) {
			// The dude's physics body: 20x32 at offset (5, 16) of the 32x48 sprite placed at (x, y - 48).
			const left = dude.x + 5, right = dude.x + 25, top = dude.y - 32, bottom = dude.y;
			const touches = cells.some(([c, r]) => c * tw < right && (c + boxSize) * tw > left && r * th < bottom && (r + boxSize) * th > top);
			assert.ok(touches, `can't reach the dude at (${dude.x}, ${dude.y})`);
		}
	});

	if (key === 'level1') {
		test('the top-left ledge is wide enough for the ship beside the habitat', () => {
			for (let col = 0; col <= 11; col++) {
				assert.ok(solid(wallGid(21, col)), `ledge surface missing at column ${col}`);
			}
		});
	}

	if (key === 'level2') {
		test('level2 is the harder 64x96 map', () => {
			assert.equal(map.width, 64);
			assert.equal(map.height, 96);
			assert.equal(property('enemyShootTime'), 1800);
			assert.equal(property('lifeExpense'), 25);
			assert.equal(layer('Enemy').objects.length, 5);
			assert.equal(layer('Collectables').objects.length, 3);
		});
	}
});
