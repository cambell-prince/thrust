import Phaser from 'phaser';
import { Scoreboard } from '../hud/Scoreboard.js';
import { Cooldown } from '../logic/cooldown.js';
import { shouldUpright, UPRIGHT_ANGLE } from '../logic/landing.js';
import { numberProperty } from '../logic/mapProperties.js';
import { PATROL_SPEED, reversePatrol } from '../logic/patrol.js';
import { ShipStatus } from '../logic/shipStatus.js';
import { objectSpawnPosition, objectsWithGid } from '../logic/tiled.js';

// Tile indices in tiles-1 that are scenery rather than wall (-1 is an empty cell).
const NON_SOLID_TILES = [-1, 13, 14, 15, 16, 46, 47, 48, 49, 50, 51];
const ENEMY_GID = 69;
const COLLECTABLE_GID = 71;

const SHIP_FRAME = { RIGHT: 0, LEFT: 1, THRUST: 2, IDLE: 3 };
const SHIP_TURN_SPEED = 300;
const SHIP_THRUST = 200;
const SHIP_MAX_SPEED = 200;
const SHIP_BULLET_SPEED = 300;
const ENEMY_BULLET_SPEED = 120; // TODO map.properties
const BULLET_POOL = 30;

const SHIP_SCORE_ENEMY = 100; // TODO map.properties
const SHIP_SCORE_RESCUE = 500;

export class LevelScene extends Phaser.Scene {
	constructor() {
		super('Level');
	}

	preload() {
		this.load.setPath('assets/');
		this.load.image('background', 'background2.png');
		this.load.spritesheet('ship', 'ship.png', { frameWidth: 70, frameHeight: 48, margin: 2, spacing: 2 });
		this.load.spritesheet('dude', 'dude.png', { frameWidth: 32, frameHeight: 48 });
		this.load.spritesheet('kaboom', 'explode.png', { frameWidth: 128, frameHeight: 128 });
		this.load.image('bullet', 'bullet.png');
		this.load.image('enemyBullet', 'enemy-bullet.png');
		this.load.image('arrow', 'longarrow2.png');
		this.load.image('tiles-1', 'tiles-1.png');
		this.load.tilemapTiledJSON('level1', 'level1.json');
	}

	create() {
		this.status = new ShipStatus();
		this.shipFire = new Cooldown(500); // TODO map.properties
		this.fuelTick = new Cooldown(500);
		this.enemyFire = new Cooldown(0);

		this.createAnimations();

		this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'background').setOrigin(0).setScrollFactor(0);

		// The ship is created before the walls so that the walls draw over it.
		this.createShip();
		this.createLevel();

		this.shipBullets = this.createBulletPool('bullet');
		this.enemies = this.createEnemies();
		this.enemyBullets = this.createBulletPool('enemyBullet');
		this.collectables = this.createCollectables();
		this.explosions = this.add.group({ defaultKey: 'kaboom', maxSize: 10 });

		this.scoreboard = new Scoreboard(this, this.status);

		this.cursors = this.input.keyboard.createCursorKeys();
		this.fireKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

		this.addColliders();
	}

	createAnimations() {
		const add = (config) => this.anims.exists(config.key) || this.anims.create(config);
		const dudeFrames = (start, end) => this.anims.generateFrameNumbers('dude', { start, end });
		add({ key: 'dude-left', frames: dudeFrames(0, 3), frameRate: 10, repeat: -1 });
		add({ key: 'dude-turn', frames: dudeFrames(4, 4), frameRate: 20 });
		add({ key: 'dude-right', frames: dudeFrames(5, 8), frameRate: 10, repeat: -1 });
		add({ key: 'kaboom', frames: this.anims.generateFrameNumbers('kaboom'), frameRate: 30 });
	}

	createShip() {
		const ship = this.physics.add.sprite(50, 80, 'ship', SHIP_FRAME.IDLE);
		ship.setOrigin(0.7, 0.5);
		ship.body.setSize(46, 46, false).setOffset(27, 1);
		ship.setBounce(0, 0.2);
		ship.setCollideWorldBounds(true);
		ship.setDrag(this.physics.world.gravity.y / 2);
		ship.setMaxVelocity(SHIP_MAX_SPEED);
		this.ship = ship;
		this.shipTween = this.tweens.add({ targets: ship, angle: -80, duration: 1000 });
		this.cameras.main.startFollow(ship);
	}

	createLevel() {
		this.map = this.make.tilemap({ key: 'level1' });
		const tiles = this.map.addTilesetImage('tiles-1');
		this.walls = this.map.createLayer('Walls', tiles);
		this.walls.setCollisionByExclusion(NON_SOLID_TILES);

		const { widthInPixels, heightInPixels } = this.map;
		this.physics.world.setBounds(0, 0, widthInPixels, heightInPixels);
		this.cameras.main.setBounds(0, 0, widthInPixels, heightInPixels);

		const props = this.map.properties;
		this.tuning = {
			fuelExpense: numberProperty(props, 'fuelExpense', 1),
			lifeExpense: numberProperty(props, 'lifeExpense', 20),
			enemyShootTime: numberProperty(props, 'enemyShootTime', 2500),
		};
	}

	createBulletPool(key) {
		return this.physics.add.group({
			defaultKey: key,
			maxSize: BULLET_POOL,
			allowGravity: false,
			createCallback: (bullet) => bullet.setOrigin(0.5, 1),
		});
	}

	/** Sprites for the tile objects with `gid` on a Tiled object layer, placed as Phaser 2 did. */
	spawnFromObjects(group, layerName, gid, key) {
		const height = this.textures.getFrame(key, 0).height;
		return objectsWithGid(this.map.getObjectLayer(layerName), gid).map((obj) => {
			const { x, y } = objectSpawnPosition(obj, height);
			return group.create(x, y, key, 0).setName(obj.name);
		});
	}

	createEnemies() {
		const enemies = this.physics.add.group({ allowGravity: false, immovable: true });
		for (const enemy of this.spawnFromObjects(enemies, 'Enemy', ENEMY_GID, 'arrow')) {
			enemy.setOrigin(0.25, 0.5).setScale(0.5);
		}
		return enemies;
	}

	createCollectables() {
		const collectables = this.physics.add.group();
		for (const dude of this.spawnFromObjects(collectables, 'Collectables', COLLECTABLE_GID, 'dude')) {
			// TODO treat other collectables (by Tiled type) differently
			dude.setOrigin(0, 0);
			dude.body.setSize(20, 32, false).setOffset(5, 16);
			dude.setBounce(0, 0.2);
			dude.setCollideWorldBounds(true);
			dude.setVelocityX(PATROL_SPEED); // TODO from the collectable's Tiled properties
			dude.play('dude-right');
		}
		return collectables;
	}

	addColliders() {
		const { physics } = this;
		// Arcade passes a lone sprite first and a group member second, so sprites go first here.
		physics.add.collider(this.ship, this.walls, () => this.uprightIfLanded());
		physics.add.collider(this.collectables, this.walls, (dude) => this.turnAtWall(dude));
		physics.add.overlap(this.ship, this.collectables, (ship, dude) => this.rescue(dude));
		// Overlaps with a tilemap layer test every tile, empty ones included, so only count walls.
		const solidTile = (bullet, tile) => tile.collides;
		physics.add.overlap(this.shipBullets, this.walls, (bullet) => this.bulletHitsWall(bullet), solidTile);
		physics.add.overlap(this.enemyBullets, this.walls, (bullet) => this.bulletHitsWall(bullet), solidTile);
		physics.add.overlap(this.shipBullets, this.enemies, (bullet, enemy) => this.bulletHitsEnemy(bullet, enemy));
		physics.add.overlap(this.ship, this.enemyBullets, (ship, bullet) => this.enemyBulletHitsShip(bullet));
	}

	update(time) {
		if (this.ship.active) {
			this.steer(time);
			if (this.fireKey.isDown && this.shipFire.ready(time)) {
				this.shipShoot(time);
			}
			if (this.enemyFire.ready(time)) {
				this.enemyShoot(time);
			}
		}
		this.killStrayBullets(this.shipBullets);
		this.killStrayBullets(this.enemyBullets);
	}

	steer(time) {
		const { ship, cursors } = this;
		let frame = ship.frame.name;
		if (cursors.left.isDown) {
			ship.setAngularVelocity(-SHIP_TURN_SPEED);
			frame = SHIP_FRAME.LEFT;
		} else if (cursors.right.isDown) {
			ship.setAngularVelocity(SHIP_TURN_SPEED);
			frame = SHIP_FRAME.RIGHT;
		} else {
			ship.setAngularVelocity(0);
			frame = SHIP_FRAME.IDLE;
		}

		if (cursors.up.isDown && this.status.fuel > 0) {
			if (this.fuelTick.ready(time)) {
				this.status.setFuel(this.status.fuel - this.tuning.fuelExpense);
				this.scoreboard.refresh();
				this.fuelTick.trigger(time);
			}
			this.physics.velocityFromRotation(ship.rotation, SHIP_THRUST, ship.body.acceleration);
			frame = SHIP_FRAME.THRUST;
		} else {
			ship.setAcceleration(0);
		}
		ship.setFrame(frame);
	}

	uprightIfLanded() {
		const { ship } = this;
		const landed = shouldUpright({
			angle: ship.angle,
			onFloor: ship.body.onFloor(),
			tweenPlaying: Boolean(this.shipTween && this.shipTween.isPlaying()),
		});
		if (landed) {
			ship.setAngularVelocity(0);
			this.shipTween = this.tweens.add({ targets: ship, angle: UPRIGHT_ANGLE, duration: 400 });
		}
	}

	turnAtWall(dude) {
		const now = this.time.now;
		// Debounce: the dude may still be touching the wall it just turned from.
		if (dude.nextTurn && now < dude.nextTurn) {
			return;
		}
		if (dude.body.onWall()) {
			const turn = reversePatrol(dude.anims.getName());
			if (turn) {
				dude.setVelocityX(turn.velocityX);
				dude.play(turn.anim);
			}
			dude.nextTurn = now + 1000;
		}
	}

	shipShoot(time) {
		const { ship } = this;
		const bullet = this.shipBullets.get(ship.x, ship.y);
		if (!bullet) {
			return;
		}
		bullet.enableBody(true, ship.x, ship.y, true, true); // TODO start at the ship's nose
		bullet.setRotation(ship.rotation);
		this.physics.velocityFromRotation(ship.rotation, SHIP_BULLET_SPEED, bullet.body.velocity);
		this.shipFire.trigger(time);
	}

	enemyShoot(time) {
		const shooters = this.enemies.getChildren();
		if (shooters.length === 0) {
			return;
		}
		const { ship } = this;
		const shooter = Phaser.Utils.Array.GetRandom(shooters);
		this.tweens.add({
			targets: shooter,
			rotation: Phaser.Math.Angle.BetweenPoints(shooter, ship),
			duration: 400,
		});
		if (!this.hasLineOfSight(shooter, ship)) {
			return;
		}
		const bullet = this.enemyBullets.get(shooter.body.x, shooter.body.y);
		if (!bullet) {
			return;
		}
		bullet.enableBody(true, shooter.body.x, shooter.body.y, true, true);
		this.physics.moveToObject(bullet, ship, ENEMY_BULLET_SPEED);
		this.enemyFire.trigger(time, this.tuning.enemyShootTime);
	}

	/** True when no wall tile lies on the straight line between two points. */
	hasLineOfSight(from, to) {
		const ray = new Phaser.Geom.Line(from.x, from.y, to.x, to.y);
		return this.walls.getTilesWithinShape(ray, { isColliding: true }).length === 0;
	}

	killStrayBullets(pool) {
		const bounds = this.physics.world.bounds;
		for (const bullet of pool.getMatching('active', true)) {
			if (!bounds.contains(bullet.x, bullet.y)) {
				bullet.disableBody(true, true);
			}
		}
	}

	explosion(x, y) {
		const boom = this.explosions.get(x, y);
		if (!boom) {
			return;
		}
		boom.setActive(true).setVisible(true).play('kaboom');
		boom.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.explosions.killAndHide(boom));
	}

	bulletHitsWall(bullet) {
		bullet.disableBody(true, true);
		this.explosion(bullet.body.x, bullet.body.y);
	}

	bulletHitsEnemy(bullet, enemy) {
		this.bulletHitsWall(bullet);
		this.status.changeScore(SHIP_SCORE_ENEMY);
		this.scoreboard.refresh();
		// Destroyed rather than disabled so a dead enemy can never be chosen to shoot.
		enemy.destroy(); // TODO damage the enemy instead
	}

	enemyBulletHitsShip(bullet) {
		this.bulletHitsWall(bullet);
		this.status.setLife(this.status.life - this.tuning.lifeExpense);
		this.scoreboard.refresh();
		if (this.status.isDead) {
			this.ship.disableBody(true, true);
		}
	}

	rescue(dude) {
		dude.disableBody(true, true); // TODO tween into the ship and tween the points
		this.status.changeScore(SHIP_SCORE_RESCUE);
		this.scoreboard.refresh();
	}
}
