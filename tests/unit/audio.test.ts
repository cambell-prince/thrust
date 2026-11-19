import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { MUSIC, musicAction, musicKey, SOUNDS, soundVolume } from '../../src/logic/audio.ts';

describe('musicAction', () => {
	test('keeps the track already playing', () => {
		assert.equal(musicAction('music-stargazer', 'music-stargazer'), 'keep');
	});
	test('starts a track when none is playing', () => {
		assert.equal(musicAction(null, 'music-stargazer'), 'start');
	});
	test('switches to a different track', () => {
		assert.equal(musicAction('music-stargazer', 'music-spaceshooter'), 'switch');
	});
	test('stops the music when the level wants none', () => {
		assert.equal(musicAction('music-stargazer', null), 'stop');
	});
	test('does nothing when none is playing or wanted', () => {
		assert.equal(musicAction(null, null), 'none');
	});
});

describe('musicKey', () => {
	test('accepts a MUSIC key', () => {
		assert.equal(musicKey('music-spaceshooter'), 'music-spaceshooter');
	});
	test('rejects an unknown or empty value', () => {
		assert.equal(musicKey('music-nope'), null);
		assert.equal(musicKey(''), null);
		assert.equal(musicKey('ship-shot'), null); // an effect is not music
	});
});

describe('sound tables', () => {
	const all = [...SOUNDS, ...MUSIC];
	test('have the effects and tracks the game plays', () => {
		assert.deepEqual(SOUNDS.map((s) => s.key).sort(), ['drop-off', 'enemy-shot', 'explosion', 'pickup', 'ship-shot', 'thrust']);
		assert.deepEqual(MUSIC.map((s) => s.key).sort(), ['music-spaceshooter', 'music-stargazer']);
	});
	test('keys are unique and files sit in audio/', () => {
		assert.equal(new Set(all.map((s) => s.key)).size, all.length);
		for (const s of all) assert.match(s.file, /^audio\/[\w-]+\.(wav|mp3)$/);
	});
	test('volumes are in 0..1', () => {
		for (const s of all) assert.ok(s.volume > 0 && s.volume <= 1, s.key);
	});
	test('music and thrust loop; one-shot effects do not', () => {
		for (const m of MUSIC) assert.equal(m.loop, true, m.key);
		for (const s of SOUNDS) assert.equal(s.loop === true, s.key === 'thrust', s.key);
	});
	test('soundVolume reads either table, 1 when unknown', () => {
		assert.equal(soundVolume('thrust'), SOUNDS.find((s) => s.key === 'thrust')?.volume);
		assert.equal(soundVolume('music-stargazer'), MUSIC.find((s) => s.key === 'music-stargazer')?.volume);
		assert.equal(soundVolume('nope'), 1);
	});
});
