// Every runtime asset the game loads must be in public/, where Vite copies it into dist/.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = readFileSync(root + 'js/scenes/LevelScene.js', 'utf8');
// this.load.image('key', 'file.png') etc., relative to load.setPath('assets/').
const loads = [...source.matchAll(/this\.load\.\w+\('([^']+)',\s*'([^']+)'/g)].map((m) => ({ key: m[1], file: m[2] }));

test('the level scene loads the core assets from assets/', () => {
	assert.match(source, /this\.load\.setPath\('assets\/'\)/);
	for (const key of ['ship', 'tiles-1', 'level1']) {
		assert.ok(loads.some((l) => l.key === key), `no load for '${key}'`);
	}
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
