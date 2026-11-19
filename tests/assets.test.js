// Every runtime asset the game loads must be in public/, where Vite copies it into dist/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = readFileSync(root + 'js/thrust.js', 'utf8');

test('js/thrust.js loads the core assets', () => {
	for (const key of ['ship', 'tiles-1', 'level1']) {
		assert.match(source, new RegExp(`game\\.load\\.\\w+\\('${key}'`), `no load for '${key}'`);
	}
});

test('every asset path in js/thrust.js exists under public/', () => {
	const paths = [...source.matchAll(/['"](assets\/[^'"]+)['"]/g)].map((m) => m[1]);
	assert.ok(paths.length > 0, 'found no asset paths');
	const missing = paths.filter((p) => !existsSync(root + 'public/' + p));
	assert.deepEqual(missing, []);
});

test('index.html loads the vendored Phaser that public/ provides', () => {
	const html = readFileSync(root + 'index.html', 'utf8');
	assert.match(html, /src="js\/phaser\.min\.js"/);
	assert.ok(existsSync(root + 'public/js/phaser.min.js'));
});
