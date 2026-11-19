// Every runtime asset the game loads must be in public/, where Vite copies it into dist/.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MUSIC, SOUNDS } from '../src/logic/audio.ts';
import { LEVELS } from '../src/logic/levels.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = readFileSync(root + 'src/scenes/LevelScene.ts', 'utf8');
// this.load.image('key', 'file.png') etc., relative to load.setPath('assets/').
const literalLoads = [...source.matchAll(/this\.load\.\w+\('([^']+)',\s*'([^']+)'/g)].map((m) => ({ key: m[1], file: m[2] }));
const loads = literalLoads;

test('the level scene loads the core assets from assets/', () => {
	assert.match(source, /this\.load\.setPath\('assets\/'\)/);
	for (const key of ['ship', 'tiles-1']) {
		assert.ok(loads.some((l) => l.key === key), `no load for '${key}'`);
	}
});

test('every map in LEVELS exists under public/assets/ and the scene loads maps', () => {
	assert.ok(LEVELS.length >= 2);
	const missing = LEVELS.map((l) => l.file).filter((file) => !existsSync(root + 'public/assets/' + file));
	assert.deepEqual(missing, []);
	assert.match(source, /tilemapTiledJSON\(/);
});

test('every file the level scene loads exists under public/assets/', () => {
	assert.ok(loads.length > 0, 'found no asset loads');
	const missing = loads.map((l) => l.file).filter((file) => !existsSync(root + 'public/assets/' + file));
	assert.deepEqual(missing, []);
});

test('every sound and music file exists under public/assets/, as WAV or MP3', () => {
	for (const { key, file } of [...SOUNDS, ...MUSIC]) {
		const path = root + 'public/assets/' + file;
		assert.ok(existsSync(path), `${key}: missing public/assets/${file}`);
		const head = readFileSync(path).subarray(0, 12);
		if (file.endsWith('.wav')) {
			assert.equal(head.toString('latin1', 0, 4) + head.toString('latin1', 8, 12), 'RIFFWAVE', `${file} is not a WAV`);
		} else {
			const id3 = head.toString('latin1', 0, 3) === 'ID3';
			const frameSync = head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0;
			assert.ok(id3 || frameSync, `${file} is not an MP3`);
		}
	}
});

test('the level scene loads every sound and track', () => {
	assert.match(source, /for \(const \{ key, file \} of \[\.\.\.SOUNDS, \.\.\.MUSIC\]\)/);
	assert.match(source, /this\.load\.audio\(key, file\)/);
});

test('audio/CREDITS.md credits every music file', () => {
	const credits = readFileSync(root + 'public/assets/audio/CREDITS.md', 'utf8');
	for (const { file } of MUSIC) {
		assert.ok(credits.includes(file.replace('audio/', '')), `${file} is not credited`);
	}
	assert.match(credits, /CC0/);
});

test('index.html loads the game module, with Phaser bundled from npm rather than vendored', () => {
	const html = readFileSync(root + 'index.html', 'utf8');
	assert.match(html, /<script type="module" src="src\/main\.ts">/);
	assert.doesNotMatch(html, /phaser\.min\.js/);
	assert.ok(!existsSync(root + 'public/js/phaser.min.js'));
});
