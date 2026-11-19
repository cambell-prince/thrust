// A production build into a temp dir: the output must work from a sub-path (/thrust/).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
let outDir;
let html;

before(async () => {
	outDir = mkdtempSync(join(tmpdir(), 'thrust-build-'));
	await build({ root, logLevel: 'error', build: { outDir, emptyOutDir: true } });
	html = readFileSync(join(outDir, 'index.html'), 'utf8');
});

after(() => rmSync(outDir, { recursive: true, force: true }));

test('index.html references only relative paths', () => {
	const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
	assert.ok(refs.length > 0);
	assert.deepEqual(refs.filter((r) => r.startsWith('/')), []);
});

test('the game script is bundled into bundle/', () => {
	const bundled = html.match(/src="\.\/(bundle\/[^"]+\.js)"/);
	assert.ok(bundled, 'no bundled module script');
	assert.match(readFileSync(join(outDir, bundled[1]), 'utf8'), /Phaser\.Game/);
});

test('public/ is copied as-is', () => {
	for (const p of ['js/phaser.min.js', 'assets/level1.json', 'assets/ship.png']) {
		assert.ok(existsSync(join(outDir, p)), `dist is missing ${p}`);
	}
});
