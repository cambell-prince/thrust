// A production build into a temp dir: the output must work from a sub-path (/thrust/).
import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
let outDir;
let html;

beforeAll(async () => {
	outDir = mkdtempSync(join(tmpdir(), 'thrust-build-'));
	await build({ root, logLevel: 'error', build: { outDir, emptyOutDir: true } });
	html = readFileSync(join(outDir, 'index.html'), 'utf8');
}, 60_000);

afterAll(() => rmSync(outDir, { recursive: true, force: true }));

test('index.html references only relative paths', () => {
	const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
	assert.ok(refs.length > 0);
	assert.deepEqual(refs.filter((r) => r.startsWith('/')), []);
});

test('the game and Phaser 4 are bundled into bundle/', () => {
	const bundled = html.match(/src="\.\/(bundle\/[^"]+\.js)"/);
	assert.ok(bundled, 'no bundled module script');
	const bundle = readFileSync(join(outDir, bundled[1]), 'utf8');
	assert.match(bundle, /VERSION:\s*["`']4\.2\.\d+/, 'no Phaser 4.2 VERSION');
	assert.match(bundle, /assets\//, 'no asset path');
});

test('public/ is copied as-is', () => {
	for (const p of ['assets/level1.json', 'assets/ship.png']) {
		assert.ok(existsSync(join(outDir, p)), `dist is missing ${p}`);
	}
});
