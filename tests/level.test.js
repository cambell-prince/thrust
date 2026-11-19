// level1.json is the Tiled export the game reads; check the parts create() depends on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const map = JSON.parse(readFileSync(root + 'public/assets/level1.json', 'utf8'));
const layer = (name) => map.layers.find((l) => l.name === name);

test('has the layers create() uses', () => {
	assert.equal(layer('Walls')?.type, 'tilelayer');
	assert.equal(layer('Enemy')?.type, 'objectgroup');
	assert.equal(layer('Collectables')?.type, 'objectgroup');
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
