// Every runtime asset the game loads must be in public/, where Vite copies it into dist/.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../js/logic/levels.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = readFileSync(root + 'js/scenes/LevelScene.js', 'utf8');
// this.load.image('key', 'file.png') etc., relative to load.setPath('assets/').
const literalLoads = [...source.matchAll(/this\.load\.\w+\('([^']+)',\s*'([^']+)'/g)].map((m) => ({ key: m[1], file: m[2] }));
// The level maps are loaded in a loop over LEVELS: for (const { key, file } of LEVELS) { this.load.tilemapTiledJSON(key, file); }
const loadsLevels = /for \(const \{ key, file \} of LEVELS\) \{\s*this\.load\.tilemapTiledJSON\(key, file\);/.test(source);
const loads = [...literalLoads, ...(loadsLevels ? LEVELS : [])];

test('the level scene loads the core assets from assets/', () => {
	assert.match(source, /this\.load\.setPath\('assets\/'\)/);
	for (const key of ['ship', 'tiles-1', 'level1']) {
		assert.ok(loads.some((l) => l.key === key), `no load for '${key}'`);
	}
});

test('the level scene loads every map in LEVELS', () => {
	assert.ok(loadsLevels, 'no tilemapTiledJSON loop over LEVELS');
	assert.ok(LEVELS.length >= 2);
	const missing = LEVELS.map((l) => l.file).filter((file) => !existsSync(root + 'public/assets/' + file));
	assert.deepEqual(missing, []);
});

test('every file the level scene loads exists under public/assets/', () => {
	assert.ok(loads.length > 0, 'found no asset loads');
	const missing = loads.map((l) => l.file).filter((file) => !existsSync(root + 'public/assets/' + file));
	assert.deepEqual(missing, []);
});

test('index.html loads the game module, with Phaser bundled from npm rather than vendored', () => {
	const html = readFileSync(root + 'index.html', 'utf8');
	assert.match(html, /<script type="module" src="js\/main\.js">/);
	assert.doesNotMatch(html, /phaser\.min\.js/);
	assert.ok(!existsSync(root + 'public/js/phaser.min.js'));
});
