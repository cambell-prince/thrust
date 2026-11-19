// Each level's JSON is the Tiled export the game reads; check the parts create() depends on.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NON_SOLID_TILES } from '../js/logic/tiled.js';
import { LEVELS, shipStartPosition } from '../js/logic/levels.js';
import { HABITAT_RANGE } from '../js/logic/mission.js';
import { reachableBoxes } from './helpers/reachability.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const solid = (gid) => Number.isInteger(gid) && gid > 0 && !NON_SOLID_TILES.includes(gid);

describe.each(LEVELS)('$key', ({ key, file }) => {
	const path = root + 'public/assets/' + file;
	const map = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { layers: [] };
	const layer = (name) => map.layers.find((l) => l.name === name);
	const wallGid = (row, col) => layer('Walls').data[row * layer('Walls').width + col];

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

	// Tiled exports these as strings; the game does arithmetic with them.
	test('tuning properties are present and numeric', () => {
		for (const prop of ['fuelExpense', 'lifeExpense', 'enemyShootTime']) {
			const value = map.properties?.[prop];
			assert.ok(value !== undefined, `missing map property ${prop}`);
			assert.ok(Number.isFinite(Number(value)), `${prop} is not numeric: ${value}`);
		}
	});

	test('the tiles-1 tileset image is shipped', () => {
		const tiles = map.tilesets.find((t) => t.name === 'tiles-1');
		assert.ok(tiles, 'no tiles-1 tileset');
		assert.ok(existsSync(root + 'public/assets/' + tiles.image));
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
	test.skipIf(key === 'level1')('the habitat ledge has 5 solid tiles beyond the habitat on both sides, open above', () => {
		const walls = layer('Walls');
		const [box] = layer('Habitat').objects;
		const groundRow = (box.y + box.height) / map.tileheight;
		const first = Math.floor(box.x / map.tilewidth) - 5;
		const last = Math.floor((box.x + box.width - 1) / map.tilewidth) + 5;
		for (let col = first; col <= last; col++) {
			assert.ok(solid(walls.data[groundRow * walls.width + col]), `no ledge at column ${col}`);
			for (let row = groundRow - 3; row < groundRow; row++) {
				assert.ok(!solid(walls.data[row * walls.width + col]), `rock above the ledge at ${col},${row}`);
			}
		}
	});

	test('the ship can fly from its start to the habitat and to every dude', () => {
		const walls = layer('Walls');
		const { tilewidth: tw, tileheight: th } = map;
		const [box] = layer('Habitat').objects;
		const start = shipStartPosition(box, walls.width * tw);
		const boxes = reachableBoxes({
			data: walls.data, width: walls.width, height: walls.height, solid,
			start: { col: Math.floor(start.x / tw), row: Math.floor(start.y / th) },
		});
		assert.ok(boxes.size > 0, 'the ship start is inside rock');
		const cells = [...boxes].map((k) => k.split(',').map(Number));
		const groundRow = (box.y + box.height) / th;
		const landing = cells.some(([c, r]) => {
			const centreX = (c + 1.5) * tw;
			return r + 3 === groundRow && centreX >= box.x - HABITAT_RANGE && centreX <= box.x + box.width + HABITAT_RANGE;
		});
		assert.ok(landing, 'no room to land beside the habitat');
		for (const dude of layer('Collectables').objects.filter((o) => o.gid === 71)) {
			const left = dude.x, right = dude.x + 32, top = dude.y - 48, bottom = dude.y;
			const touches = cells.some(([c, r]) => c * tw < right && (c + 3) * tw > left && r * th < bottom && (r + 3) * th > top);
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
			assert.equal(Number(map.properties.enemyShootTime), 1800);
			assert.equal(Number(map.properties.lifeExpense), 25);
			assert.equal(layer('Enemy').objects.length, 5);
			assert.equal(layer('Collectables').objects.length, 3);
		});
	}
});
