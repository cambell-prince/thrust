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

test('boots Phaser 4 and builds the level from the Tiled map', async ({ page }) => {
	const errors = await openGame(page);

	const level = await inScene(page, (scene) => ({
		enemies: scene.enemies.getChildren().map((e) => e.name),
		collectables: scene.collectables.getChildren().map((c) => c.anims.getName()),
		tuning: scene.tuning,
		wallCollision: scene.walls.layer.data.flat().some((tile) => tile.collides),
		hud: scene.scoreboard.scoreText.text,
	}));

	expect(level.enemies).toEqual(['1', '2', '3']);
	expect(level.collectables).toEqual(['dude-right', 'dude-right']);
	expect(level.tuning).toEqual({ fuelExpense: 1, lifeExpense: 20, enemyShootTime: 2500 });
	expect(level.wallCollision).toBe(true);
	expect(level.hud).toBe('0');
	expect(errors).toEqual([]);
});

test('the ship falls, lands and is turned upright', async ({ page }) => {
	await openGame(page);
	await page.waitForFunction(() => {
		const { ship } = window.thrust.scene.getScene('Level');
		return ship.body.onFloor() && Math.abs(ship.angle + 90) < 1;
	}, null, { timeout: 15_000 });
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

test('flying into a stranded dude rescues them for points', async ({ page }) => {
	await openGame(page);
	await parkShip(page);
	await inScene(page, (scene) => {
		const dude = scene.collectables.getChildren()[0];
		dude.body.reset(scene.ship.body.x, scene.ship.body.y);
		dude.body.setAllowGravity(false);
	});

	await expect.poll(() => inScene(page, (scene) => scene.collectables.countActive(true))).toBe(1);
	expect(await inScene(page, (scene) => scene.status.score)).toBe(500);
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
