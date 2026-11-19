import { expect, test, type Page } from '@playwright/test';
// Types only: the functions below run in the page, where the game is window.thrust.
import type { LevelScene } from '../../src/scenes/LevelScene.ts';

// The helpers are copied from game.spec.ts (which doesn't export them) to keep the specs independent.

/** Open the game and wait for the level scene to finish creating. */
async function openGame(page: Page, search = ''): Promise<string[]> {
	const errors: string[] = [];
	page.on('pageerror', (err) => errors.push(err.message));
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(msg.text());
	});
	await page.goto('./' + search);
	await page.waitForFunction(() => window.thrust?.scene.getScene<LevelScene>('Level')?.scoreboard);
	return errors;
}

/**
 * Run a function against the level scene in the page. It is sent as source, so it can use
 * only `scene`, `arg` and page globals, and must return something serialisable.
 */
function inScene<R, A = undefined>(page: Page, fn: (scene: LevelScene, arg: A) => R, arg?: A): Promise<Awaited<R>> {
	return page.evaluate(
		([source, value]) => {
			const scene = window.thrust.scene.getScene<LevelScene>('Level');
			// fn was sent as source; rebuild it in the page.
			// eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
			return new Function('scene', 'arg', `return (${source})(scene, arg);`)(scene, value) as Awaited<R>;
		},
		[fn.toString(), arg] as const,
	);
}

/** Wait for the game to render (and so step physics) a few more frames. */
function frames(page: Page, count = 3): Promise<void> {
	return page.evaluate(
		(n) => new Promise<void>((resolve) => {
			const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step));
			requestAnimationFrame(step);
		}),
		count,
	);
}

/**
 * The game's mute state and the HUD's MUTED marker, then the sound manager's own `mute`. Phaser's
 * WebAudio manager reads that from a gain node the audio thread updates later, so wait for it.
 */
async function expectMuted(page: Page, muted: boolean): Promise<void> {
	expect(await inScene(page, (scene) => [scene.audio.muted, scene.scoreboard.mutedText.visible])).toEqual([muted, muted]);
	await page.waitForFunction((m) => window.thrust.sound.mute === m, muted);
}

test.describe('audio', () => {
	test('a key press starts the level 1 music, once', async ({ page }) => {
		const errors = await openGame(page);
		await page.keyboard.press('ArrowLeft'); // a user gesture unlocks audio
		await page.waitForFunction(() => window.thrust.sound.getAllPlaying().some((s) => s.key === 'music-stargazer'));
		const music = await page.evaluate(() => window.thrust.sound.getAll('music-stargazer').length);
		expect(music).toBe(1);
		expect(errors).toEqual([]);
	});

	test('holding up runs the thrust loop; letting go stops it', async ({ page }) => {
		await openGame(page);
		await page.keyboard.down('ArrowUp');
		await frames(page, 5);
		expect(await inScene(page, (scene) => scene.audio.thrustLoop?.isPlaying)).toBe(true);
		await page.keyboard.up('ArrowUp');
		await frames(page, 5);
		expect(await inScene(page, (scene) => scene.audio.thrustLoop?.isPlaying)).toBe(false);
	});

	test('thrust stops when the level completes', async ({ page }) => {
		await openGame(page);
		await page.keyboard.down('ArrowUp');
		await frames(page, 5);
		expect(await inScene(page, (scene) => scene.audio.thrustLoop?.isPlaying)).toBe(true);
		await inScene(page, (scene) => scene.completeLevel());
		await frames(page, 3);
		expect(await inScene(page, (scene) => scene.audio.thrustLoop?.isPlaying)).toBe(false);
		await page.keyboard.up('ArrowUp');
	});

	test('firing plays the ship shot', async ({ page }) => {
		await openGame(page);
		// Every effect goes through GameAudio.play, so spy on that.
		await inScene(page, (scene) => {
			const played: string[] = [];
			(window as unknown as { played: string[] }).played = played;
			const play = scene.audio.play.bind(scene.audio);
			scene.audio.play = (key: string) => {
				played.push(key);
				play(key);
			};
		});
		await page.keyboard.down('Space');
		await frames(page, 5);
		await page.keyboard.up('Space');
		expect(await page.evaluate(() => (window as unknown as { played: string[] }).played)).toContain('ship-shot');
	});

	test('the next level switches to its own music, with one track playing', async ({ page }) => {
		await openGame(page);
		await page.keyboard.press('ArrowLeft');
		await page.waitForFunction(() => window.thrust.sound.getAllPlaying().some((s) => s.key === 'music-stargazer'));
		await inScene(page, (scene) => scene.goToLevel({ levelIndex: 1, score: 0 }));
		await page.waitForFunction(() => window.thrust.sound.getAllPlaying().some((s) => s.key === 'music-spaceshooter'));
		await frames(page, 3); // the manager drops destroyed sounds on its next update
		const keys = await page.evaluate(() => ['music-stargazer', 'music-spaceshooter'].flatMap((key) => window.thrust.sound.getAll(key).map((s) => s.key)));
		expect(keys).toEqual(['music-spaceshooter']);
	});

	test('restarting while audio is still locked leaves one track once it unlocks', async ({ page }) => {
		await openGame(page);
		await inScene(page, (scene) => scene.goToLevel({ levelIndex: 1, score: 0 }));
		await page.waitForFunction(() => window.thrust.scene.getScene<LevelScene>('Level').scoreboard.missionLabel.text === 'MISSION 2');
		expect(await page.evaluate(() => window.thrust.sound.locked)).toBe(true);
		await page.keyboard.press('ArrowLeft');
		await page.waitForFunction(() => window.thrust.sound.getAllPlaying().some((s) => s.key === 'music-spaceshooter'));
		await frames(page, 3);
		const keys = await page.evaluate(() => ['music-stargazer', 'music-spaceshooter'].flatMap((key) => window.thrust.sound.getAll(key).map((s) => s.key)));
		expect(keys).toEqual(['music-spaceshooter']);
	});

	test('M mutes and unmutes, and the HUD says MUTED', async ({ page }) => {
		await openGame(page);
		expect(await inScene(page, (scene) => scene.scoreboard.mutedText.visible)).toBe(false);
		await page.keyboard.press('KeyM');
		await expectMuted(page, true);
		await page.keyboard.press('KeyM');
		await expectMuted(page, false);
	});

	test('holding M toggles mute once, not on every auto-repeat', async ({ page }) => {
		await openGame(page);
		await page.keyboard.down('KeyM');
		// Downs while held are sent with repeat: true. An even count, so toggling on each would end unmuted.
		await page.keyboard.down('KeyM');
		await page.keyboard.down('KeyM');
		await page.keyboard.down('KeyM');
		await page.keyboard.up('KeyM');
		await expectMuted(page, true);
	});

	test('effects are skipped while audio is locked, and played once it unlocks', async ({ page }) => {
		await openGame(page);
		const playEffects = () => inScene(page, (scene) => {
			const sound = scene.sound as unknown as { play: (key: string, extra?: unknown) => boolean };
			const play = sound.play.bind(sound);
			const played: string[] = [];
			sound.play = (key, extra) => { played.push(key); return play(key, extra); };
			scene.audio.explosion();
			scene.audio.enemyShot();
			sound.play = play;
			return played;
		});
		expect(await inScene(page, (scene) => scene.sound.locked)).toBe(true);
		expect(await playEffects()).toEqual([]);
		await page.keyboard.press('ArrowLeft');
		await page.waitForFunction(() => window.thrust.scene.getScene<LevelScene>('Level').audio.audible);
		expect(await playEffects()).toEqual(['explosion', 'enemy-shot']);
	});

	test('missing audio leaves the game silent, not broken', async ({ page }) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (err) => pageErrors.push(err.message));
		await page.route(/\/audio\/(thrust|explosion|music-stargazer)\.(wav|mp3)$/, (route) => route.abort());
		await openGame(page); // waits for create() to finish
		expect(await inScene(page, (scene) => scene.audio.thrustLoop === undefined)).toBe(true);
		await page.keyboard.down('ArrowUp'); // also unlocks audio
		await frames(page, 5);
		await page.keyboard.up('ArrowUp');
		await inScene(page, (scene) => scene.audio.explosion());
		await frames(page, 3);
		const music = await page.evaluate(() => window.thrust.sound.getAll('music-stargazer').length);
		expect(music).toBe(0);
		expect(pageErrors).toEqual([]);
	});

	test('mute lasts into the next level', async ({ page }) => {
		await openGame(page);
		await page.keyboard.press('KeyM');
		await inScene(page, (scene) => scene.goToLevel({ levelIndex: 1, score: 0 }));
		await page.waitForFunction(() => window.thrust.scene.getScene<LevelScene>('Level').scoreboard.missionLabel.text === 'MISSION 2');
		await expectMuted(page, true);
		await page.keyboard.press('KeyM');
		await expectMuted(page, false);
	});
});
