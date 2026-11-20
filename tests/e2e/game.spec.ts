import { expect, test, type Page } from '@playwright/test';
// Types only: the functions below run in the page, where the game is window.thrust.
import type Phaser from 'phaser';
import type { LevelScene } from '../../src/scenes/LevelScene.ts';

type Sprite = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
type Spot = { x: number; y: number };

// All game state is read through window.thrust (the Phaser.Game) in the page.

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

/** Park the ship in open air, still and pointing straight up. */
async function parkShip(page: Page) {
	await inScene(page, (scene) => {
		scene.shipTween.stop();
		scene.ship.setAngle(-90);
		scene.ship.body.reset(300, 150);
		scene.ship.body.setAllowGravity(false);
	});
	// Right after reset() the body's position doesn't yet match the rotated sprite;
	// the next physics step settles it. Tests that aim at the body need the settled one.
	await frames(page);
}

/** Put the ship just above the top-left ledge beside the habitat, upright, and let it settle there. */
async function landBesideHabitat(page: Page) {
	await inScene(page, (scene) => {
		scene.shipTween.stop();
		scene.ship.setAngle(-90);
		const { x, floorY } = scene.habitatZone!;
		scene.ship.body.reset(x - 40, floorY - 40);
	});
	await page.waitForFunction(() => {
		const { ship } = window.thrust.scene.getScene<LevelScene>('Level');
		return ship.body.onFloor() && ship.body.speed < 5;
	}, null, { timeout: 10_000 });
}

/** Drop the ship upright on the cave floor at row 40 (top y=640), under the habitat's x-range, and let it settle. */
async function landOnLowerFloor(page: Page) {
	await inScene(page, (scene) => {
		scene.shipTween.stop();
		scene.ship.setAngle(-90);
		const { x } = scene.habitatZone!;
		scene.ship.body.reset(x - 40, 560);
	});
	await page.waitForFunction(() => {
		const { ship } = window.thrust.scene.getScene<LevelScene>('Level');
		return ship.body.onFloor() && ship.body.speed < 5;
	}, null, { timeout: 10_000 });
}

/** Take every dude on board without flying to them. */
function rescueAll(page: Page) {
	return inScene(page, (scene) => (scene.collectables.getMatching('active', true) as Sprite[]).forEach((dude) => scene.rescue(dude)));
}

test('boots Phaser 4 and builds the level from the Tiled map', async ({ page }) => {
	const errors = await openGame(page);

	const level = await inScene(page, (scene) => ({
		enemies: (scene.enemies.getChildren() as Sprite[]).map((e) => e.name),
		collectables: (scene.collectables.getChildren() as Sprite[]).map((c) => c.anims.getName()),
		tuning: scene.tuning,
		wallCollision: scene.walls.layer.data.flat().some((tile) => tile.collides),
		hud: scene.scoreboard.scoreText.text,
		mission: scene.scoreboard.missionText.text,
		habitat: Boolean(scene.habitat),
		// Depth: the ship is under the walls; enemies and everything else created later draw over them.
		shipUnderWalls: scene.ship.depth < scene.walls.depth,
		enemyOverWalls: (scene.enemies.getChildren() as Sprite[])[0].depth >= scene.walls.depth,
		wallsBeforeEnemy: scene.children.getIndex(scene.walls) < scene.children.getIndex((scene.enemies.getChildren() as Sprite[])[0]),
	}));

	expect(level.shipUnderWalls).toBe(true);
	expect(level.enemyOverWalls).toBe(true);
	expect(level.wallsBeforeEnemy).toBe(true);
	expect(level.enemies).toEqual(['1', '2', '3']);
	expect(level.collectables).toEqual(['dude-right', 'dude-right']);
	expect(level.tuning).toEqual({ fuelExpense: 1, lifeExpense: 20, enemyShootTime: 2500, music: 'music-stargazer' });
	expect(level.wallCollision).toBe(true);
	expect(level.hud).toBe('0');
	expect(level.mission).toBe('0/2');
	expect(level.habitat).toBe(true);
	expect(errors).toEqual([]);
});

test('the ship falls, lands and is turned upright', async ({ page }) => {
	await openGame(page);
	await page.waitForFunction(() => {
		const { ship } = window.thrust.scene.getScene<LevelScene>('Level');
		return ship.body.onFloor() && Math.abs(ship.angle + 90) < 1;
	}, null, { timeout: 15_000 });
	await page.waitForTimeout(1000);
	const after = await inScene(page, (scene) => ({ complete: scene.levelComplete, mission: scene.scoreboard.missionText.text }));
	expect(after).toEqual({ complete: false, mission: '0/2' });
});

test('thrust lifts the ship and burns fuel', async ({ page }) => {
	await openGame(page);
	await parkShip(page);
	const startY = await inScene(page, (scene) => scene.ship.y);

	await page.keyboard.down('ArrowUp');
	await page.waitForTimeout(1200);
	await page.keyboard.up('ArrowUp');

	const after = await inScene(page, (scene) => ({ y: scene.ship.y, fuel: scene.status.fuel }));
	expect(after.y).toBeLessThan(startY);
	expect(after.fuel).toBeLessThan(100);
});

test('left and right rotate the ship', async ({ page }) => {
	await openGame(page);
	await parkShip(page);

	await page.keyboard.down('ArrowRight');
	await page.waitForTimeout(200);
	await page.keyboard.up('ArrowRight');

	const angle = await inScene(page, (scene) => scene.ship.angle);
	expect(angle).toBeGreaterThan(-90);
});

test('space fires a bullet from the pool', async ({ page }) => {
	await openGame(page);
	await parkShip(page);

	await page.keyboard.down('Space');
	await page.waitForTimeout(100);
	await page.keyboard.up('Space');

	const bullets = await inScene(page, (scene) => scene.shipBullets.countActive(true));
	expect(bullets).toBeGreaterThanOrEqual(1);
});

test('a ship bullet destroys an enemy and scores', async ({ page }) => {
	await openGame(page);
	await inScene(page, (scene) => {
		const enemy = (scene.enemies.getChildren() as Sprite[])[2];
		const bullet = scene.shipBullets.get() as Sprite;
		bullet.enableBody(true, enemy.body.center.x, enemy.body.center.y, true, true);
		bullet.body.setVelocity(0, 0);
	});

	await expect.poll(() => inScene(page, (scene) => scene.enemies.getLength())).toBe(2);
	expect(await inScene(page, (scene) => scene.status.score)).toBe(100);
	expect(await inScene(page, (scene) => scene.scoreboard.scoreText.text)).toBe('100');
});

test('an enemy bullet damages the ship, and enough of them kill it', async ({ page }) => {
	await openGame(page);
	await parkShip(page);
	const hitShip = () =>
		inScene(page, (scene) => {
			const bullet = scene.enemyBullets.get() as Sprite;
			bullet.enableBody(true, scene.ship.body.center.x, scene.ship.body.center.y, true, true);
			bullet.body.setVelocity(0, 0);
		});

	await hitShip();
	await expect.poll(() => inScene(page, (scene) => scene.status.life)).toBeLessThanOrEqual(80);

	await inScene(page, (scene) => scene.status.setLife(20));
	await hitShip();
	await expect.poll(() => inScene(page, (scene) => scene.ship.active)).toBe(false);
});

test('flying into a stranded dude takes them aboard, without points yet', async ({ page }) => {
	await openGame(page);
	await parkShip(page);
	await inScene(page, (scene) => {
		const dude = (scene.collectables.getChildren() as Sprite[])[0];
		dude.body.reset(scene.ship.body.x, scene.ship.body.y);
		dude.body.setAllowGravity(false);
	});

	await expect.poll(() => inScene(page, (scene) => scene.collectables.countActive(true))).toBe(1);
	expect(await inScene(page, (scene) => scene.status.score)).toBe(0);
	expect(await inScene(page, (scene) => scene.mission.aboard)).toBe(1);
	expect(await inScene(page, (scene) => scene.scoreboard.missionText.text)).toBe('0/2 +1');
});

test('completing level 1 leads to level 2, keeping the score and refilling fuel and life', async ({ page }) => {
	const errors = await openGame(page);
	await inScene(page, (scene) => { scene.status.setFuel(40); scene.status.setLife(60); });
	await rescueAll(page);

	// Hold fire through completion: the banner must not be skipped by a key already down.
	await page.keyboard.down('Space');
	await landBesideHabitat(page);
	await expect.poll(() => inScene(page, (scene) => scene.levelComplete), { timeout: 15_000 }).toBe(true);
	await page.keyboard.down('Space'); // an auto-repeat while held
	await page.waitForTimeout(300);
	await page.keyboard.up('Space');

	const done = await inScene(page, (scene) => ({
		banner: scene.banner?.list.filter((o) => o.type === 'Text').map((t) => (t as Phaser.GameObjects.Text).text),
		levelIndex: scene.levelIndex,
		enemyBullets: scene.enemyBullets.countActive(true),
		shipBullets: scene.shipBullets.countActive(true),
	}));
	expect(done).toEqual({
		banner: ['MISSION COMPLETE', 'SCORE 1000', 'PRESS SPACE FOR LEVEL 2'],
		levelIndex: 0, enemyBullets: 0, shipBullets: 0,
	});

	await page.keyboard.press('Space');
	await page.waitForFunction(() => {
		const scene = window.thrust.scene.getScene<LevelScene>('Level');
		return scene.levelIndex === 1 && scene.scoreboard && !scene.levelComplete;
	}, null, { timeout: 5_000 });
	await page.waitForTimeout(500);
	const level2 = await inScene(page, (scene) => ({
		score: scene.status.score, fuel: scene.status.fuel, life: scene.status.life,
		mission: scene.scoreboard.missionText.text, aboard: scene.mission.aboard,
		map: scene.map.height, walking: scene.walkingDudes, restarting: scene.restarting,
	}));
	expect(level2).toEqual({ score: 1000, fuel: 100, life: 100, mission: '0/3', aboard: 0, map: 96, walking: 0, restarting: false });
	expect(errors).toEqual([]);
});

test('?level=2 boots level 2, and a bad ?level= boots level 1', async ({ page }) => {
	await openGame(page, '?level=2');
	expect(await inScene(page, (scene) => ({ level: scene.levelIndex, mission: scene.scoreboard.missionText.text, dudes: scene.collectables.getLength() })))
		.toEqual({ level: 1, mission: '0/3', dudes: 3 });
	expect(await inScene(page, (scene) => scene.scoreboard.missionLabel.text)).toBe('MISSION 2');
	await openGame(page, '?level=abc');
	expect(await inScene(page, (scene) => scene.scoreboard.missionLabel.text)).toBe('MISSION 1');
	expect(await inScene(page, (scene) => scene.levelIndex)).toBe(0);
});

test('completing the last level shows ALL MISSIONS COMPLETE, waits, and SPACE starts a new game', async ({ page }) => {
	const errors = await openGame(page, '?level=2');
	// Hold enemy fire: on a slow runner the ship sits by the habitat long enough to be shot down.
	await inScene(page, (scene) => { scene.status.changeScore(1000); scene.enemyFire.trigger(scene.time.now, 1e9); });
	await rescueAll(page);
	await landBesideHabitat(page);
	await expect.poll(() => inScene(page, (scene) => scene.levelComplete), { timeout: 20_000 }).toBe(true);
	expect(await inScene(page, (scene) => scene.banner!.list.filter((o) => o.type === 'Text').map((t) => (t as Phaser.GameObjects.Text).text)))
		.toEqual(['ALL MISSIONS COMPLETE', 'SCORE 2500', 'PRESS SPACE TO PLAY AGAIN']);

	await page.waitForTimeout(6000);
	expect(await inScene(page, (scene) => ({ level: scene.levelIndex, complete: scene.levelComplete }))).toEqual({ level: 1, complete: true });

	await page.keyboard.press('Space');
	await page.waitForFunction(() => {
		const scene = window.thrust.scene.getScene<LevelScene>('Level');
		return scene.levelIndex === 0 && scene.scoreboard && !scene.levelComplete;
	}, null, { timeout: 5_000 });
	await page.waitForTimeout(300);
	expect(await inScene(page, (scene) => ({ score: scene.status.score, mission: scene.scoreboard.missionText.text })))
		.toEqual({ score: 0, mission: '0/2' });
	expect(errors).toEqual([]);
});

test('delivering only some dudes scores them but does not complete the level', async ({ page }) => {
	await openGame(page);
	await inScene(page, (scene) => scene.rescue((scene.collectables.getChildren() as Sprite[])[0]));
	await landBesideHabitat(page);

	await expect.poll(() => inScene(page, (scene) => scene.status.score), { timeout: 10_000 }).toBe(500);
	await page.waitForTimeout(500);
	expect(await inScene(page, (scene) => ({ complete: scene.levelComplete, mission: scene.scoreboard.missionText.text })))
		.toEqual({ complete: false, mission: '1/2' });
});

test('landing on a lower floor below the habitat does not unload', async ({ page }) => {
	await openGame(page);
	await rescueAll(page);
	await landOnLowerFloor(page);
	await page.waitForTimeout(1500);
	const state = await inScene(page, (scene) => ({
		bottom: scene.ship.body.bottom,
		floorY: scene.habitatZone!.floorY,
		aboard: scene.mission.aboard,
		delivered: scene.mission.delivered,
	}));
	expect(state.bottom).toBeGreaterThan(state.floorY + 100);
	expect(state).toMatchObject({ aboard: 2, delivered: 0 });
});

test('a ship destroyed while the last dude walks in does not complete the level', async ({ page }) => {
	await openGame(page);
	await rescueAll(page);
	await landBesideHabitat(page);
	await expect.poll(() => inScene(page, (scene) => scene.mission.aboard), { timeout: 10_000 }).toBe(0);
	await inScene(page, (scene) => {
		scene.status.setLife(0);
		scene.ship.disableBody(true, true);
	});
	await page.waitForTimeout(2000);
	const state = await inScene(page, (scene) => ({
		complete: scene.levelComplete,
		banner: scene.banner === undefined,
		score: scene.status.score,
	}));
	expect(state).toEqual({ complete: false, banner: true, score: 1000 });
});

/** The game-over banner's lines, once it shows. */
async function gameOverBanner(page: Page): Promise<string[]> {
	await page.waitForFunction(() => window.thrust.scene.getScene<LevelScene>('Level').gameOverBanner, null, { timeout: 5_000 });
	return inScene(page, (scene) => scene.gameOverBanner!.list.filter((o) => o.type === 'Text').map((t) => (t as Phaser.GameObjects.Text).text));
}

test('a destroyed ship shows GAME OVER, and R retries the level with the score it started with', async ({ page }) => {
	const errors = await openGame(page, '?level=2');
	await parkShip(page);
	await inScene(page, (scene) => {
		scene.carriedScore = 700; // as if carried over from level 1
		scene.status.changeScore(800);
		scene.status.setLife(20);
		const bullet = scene.enemyBullets.get() as Sprite;
		bullet.enableBody(true, scene.ship.body.center.x, scene.ship.body.center.y, true, true);
		bullet.body.setVelocity(0, 0);
	});

	expect(await gameOverBanner(page)).toEqual(['GAME OVER', 'SHIP DESTROYED', 'SCORE 800', 'R  RETRY MISSION 2     N  NEW GAME']);
	expect(await inScene(page, (scene) => ({ gameOver: scene.gameOver, complete: scene.levelComplete })))
		.toEqual({ gameOver: 'SHIP DESTROYED', complete: false });

	await page.keyboard.press('KeyR');
	await page.waitForFunction(() => {
		const scene = window.thrust.scene.getScene<LevelScene>('Level');
		return scene.scoreboard && !scene.gameOver && scene.ship?.active;
	}, null, { timeout: 5_000 });
	expect(await inScene(page, (scene) => ({
		level: scene.levelIndex, score: scene.status.score, life: scene.status.life, fuel: scene.status.fuel, banner: scene.gameOverBanner === undefined,
	}))).toEqual({ level: 1, score: 700, life: 100, fuel: 100, banner: true });
	expect(errors).toEqual([]);
});

test('running out of fuel ends the game once the ship comes to rest, and N starts a new game', async ({ page }) => {
	const errors = await openGame(page, '?level=2');
	await inScene(page, (scene) => { scene.status.changeScore(300); scene.status.setFuel(0); scene.enemyFire.trigger(scene.time.now, 1e9); });
	await parkShip(page);
	await page.waitForTimeout(300);
	// In the air it is not over yet: the ship may still glide down to the habitat.
	expect(await inScene(page, (scene) => scene.gameOver)).toBeNull();

	await inScene(page, (scene) => scene.ship.body.setAllowGravity(true));
	expect(await gameOverBanner(page)).toEqual(['GAME OVER', 'OUT OF FUEL', 'SCORE 300', 'R  RETRY MISSION 2     N  NEW GAME']);

	await page.keyboard.press('KeyN');
	await page.waitForFunction(() => {
		const scene = window.thrust.scene.getScene<LevelScene>('Level');
		return scene.levelIndex === 0 && scene.scoreboard && !scene.gameOver;
	}, null, { timeout: 5_000 });
	expect(await inScene(page, (scene) => ({ score: scene.status.score, fuel: scene.status.fuel, mission: scene.scoreboard.missionLabel.text })))
		.toEqual({ score: 0, fuel: 100, mission: 'MISSION 1' });
	expect(errors).toEqual([]);
});

test('a ship out of fuel landed at the habitat still delivers its dudes', async ({ page }) => {
	await openGame(page);
	await rescueAll(page);
	await inScene(page, (scene) => scene.status.setFuel(0));
	await landBesideHabitat(page);
	await expect.poll(() => inScene(page, (scene) => scene.levelComplete), { timeout: 15_000 }).toBe(true);
	expect(await inScene(page, (scene) => scene.gameOver)).toBeNull();
});

test('taking off mid-unload keeps the remaining dudes aboard', async ({ page }) => {
	await openGame(page);
	await rescueAll(page);
	// Space the dudes out so the second can't leave before the ship lifts off.
	await inScene(page, (scene) => { scene.unloadTick.interval = 5000; });
	await landBesideHabitat(page);
	await expect.poll(() => inScene(page, (scene) => scene.mission.delivered), { timeout: 10_000 }).toBe(1);

	// Lift off at once, before the next dude's turn.
	await inScene(page, (scene) => {
		scene.ship.body.setAllowGravity(false);
		scene.ship.body.reset(scene.ship.x, scene.habitatZone!.floorY - 200);
	});
	await page.waitForTimeout(1500);
	const state = await inScene(page, (scene) => ({
		aboard: scene.mission.aboard,
		delivered: scene.mission.delivered,
		score: scene.status.score,
		complete: scene.levelComplete,
	}));
	expect(state).toEqual({ aboard: 1, delivered: 1, score: 500, complete: false });
});

test('enemies only fire with a clear line of sight', async ({ page }) => {
	await openGame(page);
	await parkShip(page);

	const result = await inScene(page, (scene) => {
		// Keep a single shooter, and stop the scene firing on its own clock.
		const shooter = (scene.enemies.getChildren() as Sprite[])[2];
		(scene.enemies.getChildren() as Sprite[]).filter((e) => e !== shooter).forEach((e) => e.destroy());
		scene.enemyFire.trigger(scene.time.now, 1e9);

		// Search the area around the shooter for one blocked spot and one open spot.
		let blocked: Spot | null = null;
		let open: Spot | null = null;
		for (let dx = -240; dx <= 240 && !(blocked && open); dx += 16) {
			for (let dy = -240; dy <= 240 && !(blocked && open); dy += 16) {
				const spot = { x: shooter.x + dx, y: shooter.y + dy };
				const clear = scene.hasLineOfSight(shooter, spot);
				if (clear && !open && Math.hypot(dx, dy) > 64) open = spot;
				if (!clear && !blocked) blocked = spot;
			}
		}

		const shotsFrom = (spot: Spot | null) => {
			if (!spot) return -1;
			(scene.enemyBullets.getChildren() as Sprite[]).forEach((b) => b.disableBody(true, true));
			scene.ship.body.reset(spot.x, spot.y);
			scene.enemyShoot(scene.time.now);
			return scene.enemyBullets.countActive(true);
		};
		return { found: Boolean(blocked && open), behindWall: shotsFrom(blocked), inTheOpen: shotsFrom(open) };
	});

	expect(result.found).toBe(true);
	expect(result.behindWall).toBe(0);
	expect(result.inTheOpen).toBe(1);
});

// Enemies once fired from their body's top-left corner, off the line their line of sight is checked
// along: beside a wall that corner was inside the rock, and at the map's edge outside the world, so
// the bullet died where it started. Every enemy's shot at a ship it can see must get away from it.
for (const level of [1, 2]) {
	test(`every enemy's shot on level ${level} gets away from the enemy`, async ({ page }) => {
		await openGame(page, `?level=${level}`);
		const count = await inScene(page, (scene) => scene.enemies.getLength());
		const stuck: string[] = [];
		for (let i = 0; i < count; i++) {
			// A fresh level each time: enemyShoot() picks a random shooter, so leave only this one.
			await openGame(page, `?level=${level}`);
			await parkShip(page);
			const fired = await inScene(page, (scene, index) => {
				const enemies = scene.enemies.getChildren() as Sprite[];
				const shooter = enemies[index];
				enemies.filter((e) => e !== shooter).forEach((e) => e.destroy());
				scene.enemyFire.trigger(scene.time.now, 1e9);
				// The scene's own clock may already have fired.
				(scene.enemyBullets.getChildren() as Sprite[]).forEach((b) => b.disableBody(true, true));
				const bounds = scene.physics.world.bounds;
				// An open spot inside the map that the shooter can see, well away from it.
				for (let dx = -240; dx <= 240; dx += 16) {
					for (let dy = -240; dy <= 240; dy += 16) {
						const spot = { x: shooter.x + dx, y: shooter.y + dy };
						if (Math.hypot(dx, dy) > 96 && bounds.contains(spot.x, spot.y) && scene.hasLineOfSight(shooter, spot)) {
							scene.ship.body.reset(spot.x, spot.y);
							scene.enemyShoot(scene.time.now);
							return { name: shooter.name, x: shooter.x, y: shooter.y, shots: scene.enemyBullets.countActive(true) };
						}
					}
				}
				return { name: shooter.name, x: shooter.x, y: shooter.y, shots: -1 };
			}, i);
			if (fired.shots !== 1) {
				stuck.push(`${fired.name} (${fired.shots === -1 ? 'sees no open spot' : 'did not fire'})`);
				continue;
			}
			// Follow the shot until it dies (on rock or the ship, further on) or 40 frames pass. It must
			// first get well clear of the barrel's tip, wherever it ends up.
			const barrel = await inScene(page, (scene) => {
				const [shooter] = scene.enemies.getChildren() as Sprite[];
				return shooter.displayWidth * (1 - shooter.originX);
			});
			let farthest = 0;
			for (let f = 0; f < 40 && farthest < barrel + 24; f++) {
				await frames(page, 1);
				const flown = await inScene(page, (scene, from) => {
					const [bullet] = scene.enemyBullets.getMatching('active', true) as Sprite[];
					return bullet ? Math.hypot(bullet.x - from.x, bullet.y - from.y) : -1;
				}, fired);
				if (flown === -1) break;
				farthest = Math.max(farthest, flown);
			}
			if (farthest < barrel + 24) stuck.push(`${fired.name} (died ${farthest.toFixed(0)} px from its pivot)`);
		}
		expect(stuck).toEqual([]);
	});
}
