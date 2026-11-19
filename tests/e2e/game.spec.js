import { expect, test } from '@playwright/test';

// All game state is read through window.thrust (the Phaser.Game) in the page.

/** Open the game and wait for the level scene to finish creating. */
async function openGame(page) {
	const errors = [];
	page.on('pageerror', (err) => errors.push(err.message));
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(msg.text());
	});
	await page.goto('./');
	await page.waitForFunction(() => window.thrust?.scene.getScene('Level')?.scoreboard);
	return errors;
}

/** Run a function against the level scene in the page. */
function inScene(page, fn, arg) {
	return page.evaluate(
		([source, value]) => {
			const scene = window.thrust.scene.getScene('Level');
			return new Function('scene', 'arg', `return (${source})(scene, arg);`)(scene, value);
		},
		[fn.toString(), arg],
	);
}

/** Wait for the game to render (and so step physics) a few more frames. */
function frames(page, count = 3) {
	return page.evaluate(
		(n) => new Promise((resolve) => {
			const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step));
			requestAnimationFrame(step);
		}),
		count,
	);
}

/** Park the ship in open air, still and pointing straight up. */
async function parkShip(page) {
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
async function landBesideHabitat(page) {
	await inScene(page, (scene) => {
		scene.shipTween.stop();
		scene.ship.setAngle(-90);
		const { x, floorY } = scene.habitatZone;
		scene.ship.body.reset(x - 40, floorY - 40);
	});
	await page.waitForFunction(() => {
		const { ship } = window.thrust.scene.getScene('Level');
		return ship.body.onFloor() && ship.body.speed < 5;
	}, null, { timeout: 10_000 });
}

/** Take every dude on board without flying to them. */
function rescueAll(page) {
	return inScene(page, (scene) => scene.collectables.getMatching('active', true).forEach((dude) => scene.rescue(dude)));
}

test('boots Phaser 4 and builds the level from the Tiled map', async ({ page }) => {
	const errors = await openGame(page);

	const level = await inScene(page, (scene) => ({
		enemies: scene.enemies.getChildren().map((e) => e.name),
		collectables: scene.collectables.getChildren().map((c) => c.anims.getName()),
		tuning: scene.tuning,
		wallCollision: scene.walls.layer.data.flat().some((tile) => tile.collides),
		hud: scene.scoreboard.scoreText.text,
		mission: scene.scoreboard.missionText.text,
		habitat: Boolean(scene.habitat),
	}));

	expect(level.enemies).toEqual(['1', '2', '3']);
	expect(level.collectables).toEqual(['dude-right', 'dude-right']);
	expect(level.tuning).toEqual({ fuelExpense: 1, lifeExpense: 20, enemyShootTime: 2500 });
	expect(level.wallCollision).toBe(true);
	expect(level.hud).toBe('0');
	expect(level.mission).toBe('0/2');
	expect(level.habitat).toBe(true);
	expect(errors).toEqual([]);
});

test('the ship falls, lands and is turned upright', async ({ page }) => {
	await openGame(page);
	await page.waitForFunction(() => {
		const { ship } = window.thrust.scene.getScene('Level');
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
		const enemy = scene.enemies.getChildren()[2];
		const bullet = scene.shipBullets.get();
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
			const bullet = scene.enemyBullets.get();
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
		const dude = scene.collectables.getChildren()[0];
		dude.body.reset(scene.ship.body.x, scene.ship.body.y);
		dude.body.setAllowGravity(false);
	});

	await expect.poll(() => inScene(page, (scene) => scene.collectables.countActive(true))).toBe(1);
	expect(await inScene(page, (scene) => scene.status.score)).toBe(0);
	expect(await inScene(page, (scene) => scene.mission.aboard)).toBe(1);
	expect(await inScene(page, (scene) => scene.scoreboard.missionText.text)).toBe('0/2 +1');
});

test('landing beside the habitat with every dude aboard completes the level, and SPACE restarts it', async ({ page }) => {
	const errors = await openGame(page);
	await rescueAll(page);
	expect(await inScene(page, (scene) => scene.mission.aboard)).toBe(2);

	// Hold fire through completion: the banner must not be skipped by a key already down.
	await page.keyboard.down('Space');
	await landBesideHabitat(page);
	await expect.poll(() => inScene(page, (scene) => scene.levelComplete), { timeout: 15_000 }).toBe(true);
	// A second down() while held is sent as an auto-repeat (event.repeat), as the OS does.
	await page.keyboard.down('Space');
	await page.waitForTimeout(300);
	await page.keyboard.up('Space');
	expect(await inScene(page, (scene) => scene.levelComplete)).toBe(true);

	const done = await inScene(page, (scene) => ({
		score: scene.status.score,
		mission: scene.scoreboard.missionText.text,
		banner: scene.banner?.list.filter((o) => o.type === 'Text').map((t) => t.text),
		enemyBullets: scene.enemyBullets.countActive(true),
	}));
	expect(done.score).toBe(1000);
	expect(done.mission).toBe('2/2');
	expect(done.banner).toEqual(['MISSION COMPLETE', 'SCORE 1000', 'PRESS SPACE']);
	expect(done.enemyBullets).toBe(0);

	await page.keyboard.press('Space');
	await page.waitForFunction(() => {
		const scene = window.thrust.scene.getScene('Level');
		return scene.scoreboard && !scene.levelComplete && scene.mission?.delivered === 0 && scene.status.score === 0;
	}, null, { timeout: 5_000 });
	await page.waitForTimeout(500);
	expect(await inScene(page, (scene) => scene.scoreboard.missionText.text)).toBe('0/2');
	expect(errors).toEqual([]);
});

test('delivering only some dudes scores them but does not complete the level', async ({ page }) => {
	await openGame(page);
	await inScene(page, (scene) => scene.rescue(scene.collectables.getChildren()[0]));
	await landBesideHabitat(page);

	await expect.poll(() => inScene(page, (scene) => scene.status.score), { timeout: 10_000 }).toBe(500);
	await page.waitForTimeout(500);
	expect(await inScene(page, (scene) => ({ complete: scene.levelComplete, mission: scene.scoreboard.missionText.text })))
		.toEqual({ complete: false, mission: '1/2' });
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
		scene.ship.body.reset(scene.ship.x, scene.habitatZone.floorY - 200);
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
		const shooter = scene.enemies.getChildren()[2];
		scene.enemies.getChildren().filter((e) => e !== shooter).forEach((e) => e.destroy());
		scene.enemyFire.trigger(scene.time.now, 1e9);

		// Search the area around the shooter for one blocked spot and one open spot.
		let blocked = null;
		let open = null;
		for (let dx = -240; dx <= 240 && !(blocked && open); dx += 16) {
			for (let dy = -240; dy <= 240 && !(blocked && open); dy += 16) {
				const spot = { x: shooter.x + dx, y: shooter.y + dy };
				const clear = scene.hasLineOfSight(shooter, spot);
				if (clear && !open && Math.hypot(dx, dy) > 64) open = spot;
				if (!clear && !blocked) blocked = spot;
			}
		}

		const shotsFrom = (spot) => {
			scene.enemyBullets.getChildren().forEach((b) => b.disableBody(true, true));
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
