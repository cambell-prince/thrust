// level1.json is the Tiled export the game reads; check the parts create() depends on.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NON_SOLID_TILES } from '../js/logic/tiled.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const map = JSON.parse(readFileSync(root + 'public/assets/level1.json', 'utf8'));
const layer = (name) => map.layers.find((l) => l.name === name);

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

// Tiled exports these as strings; the game does arithmetic with them.
test('tuning properties are present and numeric', () => {
	for (const key of ['fuelExpense', 'lifeExpense', 'enemyShootTime']) {
		const value = map.properties?.[key];
		assert.ok(value !== undefined, `missing map property ${key}`);
		assert.ok(Number.isFinite(Number(value)), `${key} is not numeric: ${value}`);
	}
});

test('the tiles-1 tileset image is shipped', () => {
	const tiles = map.tilesets.find((t) => t.name === 'tiles-1');
	assert.ok(tiles, 'no tiles-1 tileset');
	assert.ok(existsSync(root + 'public/assets/' + tiles.image));
});

const wallGid = (row, col) => layer('Walls').data[row * layer('Walls').width + col];
const solid = (gid) => Number.isInteger(gid) && gid > 0 && !NON_SOLID_TILES.includes(gid);

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

test('the top-left ledge is wide enough for the ship beside the habitat', () => {
	for (let col = 0; col <= 11; col++) {
		assert.ok(solid(wallGid(21, col)), `ledge surface missing at column ${col}`);
	}
});
