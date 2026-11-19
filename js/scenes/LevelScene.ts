import Phaser from 'phaser';
import { Scoreboard } from '../hud/Scoreboard.ts';
import { Cooldown } from '../logic/cooldown.ts';
import { shouldUpright, UPRIGHT_ANGLE } from '../logic/landing.ts';
import { isLastLevel, LEVELS, nextLevelIndex, shipStartPosition } from '../logic/levels.ts';
import { numberProperty, type TiledProperties } from '../logic/mapProperties.ts';
import { canUnload, Mission } from '../logic/mission.ts';
import { PATROL_SPEED, reversePatrol } from '../logic/patrol.ts';
import { ShipStatus } from '../logic/shipStatus.ts';
import { NON_SOLID_TILES, objectSpawnPosition, objectsWithGid } from '../logic/tiled.ts';

type Sprite = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
/** A collectable: a sprite that remembers when it may next turn at a wall. */
type Dude = Sprite & { nextTurn?: number };
/** What Arcade passes a collide or overlap callback: a game object with a body, a body or a tile. */
type ArcadeObject = Parameters<Phaser.Types.Physics.Arcade.ArcadePhysicsCallback>[0];

/** The scene's start data: the level (0-based) and the score carried over from the last one. */
export interface LevelData {
	levelIndex?: number;
	score?: number;
}

/** Gameplay tuning read from the map's properties. */
export interface Tuning {
	fuelExpense: number;
	lifeExpense: number;
	enemyShootTime: number;
}

/** The Tiled `Habitat` rectangle. */
interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Where the habitat stands: its left edge and width, its door's x and its floor's y. */
interface HabitatZone {
	x: number;
	width: number;
	doorX: number;
	floorY: number;
}

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

const UNLOAD_INTERVAL = 600; // ms between dudes leaving the ship
const BACKGROUND_DEPTH = -2;
const HABITAT_DEPTH = -1; // above the background, below the ship and walls
const SHIP_DEPTH = -0.5; // above the habitat, below the walls (0) so the ship passes behind rock
const DEFAULT_SHIP_START = { x: 50, y: 80 }; // for a map without a habitat
const UNLOAD_WALK_SPEED = PATROL_SPEED * 2; // px/s, walking to the habitat door
const RESTART_DELAY = 5000; // ms the mission-complete banner shows before the next level starts
const BANNER_DEPTH = 200; // above the HUD (100)

export class LevelScene extends Phaser.Scene {
	// Set in init() and create(), which Phaser calls before update().
	levelIndex = 0;
	carriedScore = 0;
	status!: ShipStatus;
	shipFire!: Cooldown;
	fuelTick!: Cooldown;
	enemyFire!: Cooldown;
	unloadTick!: Cooldown;
	map!: Phaser.Tilemaps.Tilemap;
	walls!: Phaser.Tilemaps.TilemapLayer;
	tuning!: Tuning;
	habitat: Phaser.GameObjects.Image | null = null;
	habitatBox: Box | null = null;
	habitatZone: HabitatZone | null = null;
	ship!: Sprite;
	shipTween!: Phaser.Tweens.Tween;
	shipBullets!: Phaser.Physics.Arcade.Group;
	enemies!: Phaser.Physics.Arcade.Group;
	enemyBullets!: Phaser.Physics.Arcade.Group;
	collectables!: Phaser.Physics.Arcade.Group;
	explosions!: Phaser.GameObjects.Group;
	mission!: Mission;
	levelComplete = false;
	restarting = false;
	walkingDudes = 0;
	banner: Phaser.GameObjects.Container | undefined;
	scoreboard!: Scoreboard;
	keyboard!: Phaser.Input.Keyboard.KeyboardPlugin;
	cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
	fireKey!: Phaser.Input.Keyboard.Key;

	constructor() {
		super('Level');
	}

	/** `data.levelIndex` picks the level (0-based); `data.score` is carried over from the last one. */
	init(data?: LevelData): void {
		const index = data?.levelIndex ?? 0;
		this.levelIndex = Number.isInteger(index) && index >= 0 && index < LEVELS.length ? index : 0;
		this.carriedScore = data?.score ?? 0;
	}

	preload(): void {
		this.load.setPath('assets/');
		this.load.image('background', 'background2.png');
		this.load.spritesheet('ship', 'ship.png', { frameWidth: 70, frameHeight: 48, margin: 2, spacing: 2 });
		this.load.spritesheet('dude', 'dude.png', { frameWidth: 32, frameHeight: 48 });
		this.load.spritesheet('kaboom', 'explode.png', { frameWidth: 128, frameHeight: 128 });
		this.load.image('bullet', 'bullet.png');
		this.load.image('enemyBullet', 'enemy-bullet.png');
		this.load.image('arrow', 'longarrow2.png');
		this.load.image('tiles-1', 'tiles-1.png');
		this.load.image('habitat', 'habitat.png');
		for (const { key, file } of LEVELS) {
			this.load.tilemapTiledJSON(key, file);
		}
	}

	create(): void {
		this.status = new ShipStatus();
		this.status.changeScore(this.carriedScore);
		this.shipFire = new Cooldown(500); // TODO map.properties
		this.fuelTick = new Cooldown(500);
		this.enemyFire = new Cooldown(0);

		this.createAnimations();

		// Depths: background (BACKGROUND_DEPTH) < habitat (HABITAT_DEPTH) < ship (SHIP_DEPTH) < walls and everything else (0, in creation order).
		this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'background').setOrigin(0).setScrollFactor(0)
			.setDepth(BACKGROUND_DEPTH);

		// The ship starts beside the habitat, so the map and habitat come first.
		this.createLevel();
		this.createHabitat();
		this.createShip();

		this.shipBullets = this.createBulletPool('bullet');
		this.enemies = this.createEnemies();
		this.enemyBullets = this.createBulletPool('enemyBullet');
		this.collectables = this.createCollectables();
		this.mission = new Mission(this.collectables.getLength());
		this.unloadTick = new Cooldown(UNLOAD_INTERVAL);
		this.levelComplete = false;
		this.restarting = false;
		this.walkingDudes = 0;
		this.banner = undefined;
		this.explosions = this.add.group({ defaultKey: 'kaboom', maxSize: 10 });

		this.scoreboard = new Scoreboard(this, this.status, this.mission, this.levelIndex + 1);

		if (!this.input.keyboard) {
			throw new Error('The game needs keyboard input');
		}
		this.keyboard = this.input.keyboard;
		this.cursors = this.keyboard.createCursorKeys();
		this.fireKey = this.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

		this.addColliders();
	}

	createAnimations(): void {
		const add = (config: Phaser.Types.Animations.Animation): void => {
			if (config.key && !this.anims.exists(config.key)) {
				this.anims.create(config);
			}
		};
		const dudeFrames = (start: number, end: number) => this.anims.generateFrameNumbers('dude', { start, end });
		add({ key: 'dude-left', frames: dudeFrames(0, 3), frameRate: 10, repeat: -1 });
		add({ key: 'dude-turn', frames: dudeFrames(4, 4), frameRate: 20 });
		add({ key: 'dude-right', frames: dudeFrames(5, 8), frameRate: 10, repeat: -1 });
		add({ key: 'kaboom', frames: this.anims.generateFrameNumbers('kaboom'), frameRate: 30 });
	}

	createShip(): void {
		const start = this.habitatBox ? shipStartPosition(this.habitatBox, this.map.widthInPixels) : DEFAULT_SHIP_START;
		const ship = this.physics.add.sprite(start.x, start.y, 'ship', SHIP_FRAME.IDLE);
		ship.setOrigin(0.7, 0.5).setDepth(SHIP_DEPTH);
		ship.body.setSize(46, 46, false).setOffset(27, 1);
		ship.setBounce(0, 0.2);
		ship.setCollideWorldBounds(true);
		ship.setDrag(this.physics.world.gravity.y / 2);
		ship.setMaxVelocity(SHIP_MAX_SPEED);
		this.ship = ship;
		this.shipTween = this.tweens.add({ targets: ship, angle: -80, duration: 1000 });
		this.cameras.main.startFollow(ship);
	}

	createLevel(): void {
		const level = LEVELS[this.levelIndex];
		if (!level) {
			throw new Error(`No level ${this.levelIndex}`);
		}
		this.map = this.make.tilemap({ key: level.key });
		const tiles = this.map.addTilesetImage('tiles-1');
		const walls = tiles && this.map.createLayer('Walls', tiles);
		if (!(walls instanceof Phaser.Tilemaps.TilemapLayer)) {
			throw new Error(`${level.file} needs a Walls tile layer using the tiles-1 tileset`);
		}
		this.walls = walls;
		this.walls.setCollisionByExclusion(NON_SOLID_TILES);

		const { widthInPixels, heightInPixels } = this.map;
		this.physics.world.setBounds(0, 0, widthInPixels, heightInPixels);
		this.cameras.main.setBounds(0, 0, widthInPixels, heightInPixels);

		const props = this.map.properties as TiledProperties;
		this.tuning = {
			fuelExpense: numberProperty(props, 'fuelExpense', 1),
			lifeExpense: numberProperty(props, 'lifeExpense', 20),
			enemyShootTime: numberProperty(props, 'enemyShootTime', 2500),
		};
	}

	/** The habitat image, standing on the bottom edge of the Tiled `Habitat` rectangle. */
	createHabitat(): void {
		this.habitat = null;
		this.habitatZone = null;
		const [object] = this.map.getObjectLayer('Habitat')?.objects ?? [];
		this.habitatBox = object
			? { x: object.x ?? 0, y: object.y ?? 0, width: object.width ?? 0, height: object.height ?? 0 }
			: null;
		const box = this.habitatBox;
		if (!box) {
			return;
		}
		const doorX = box.x + box.width / 2;
		const floorY = box.y + box.height;
		this.habitat = this.add.image(doorX, floorY, 'habitat').setOrigin(0.5, 1).setDepth(HABITAT_DEPTH);
		this.habitatZone = { x: box.x, width: box.width, doorX, floorY };
	}

	createBulletPool(key: string): Phaser.Physics.Arcade.Group {
		return this.physics.add.group({
			defaultKey: key,
			maxSize: BULLET_POOL,
			allowGravity: false,
			createCallback: (bullet) => (bullet as Sprite).setOrigin(0.5, 1),
		});
	}

	/** Sprites for the tile objects with `gid` on a Tiled object layer, placed as Phaser 2 did. */
	spawnFromObjects(group: Phaser.Physics.Arcade.Group, layerName: string, gid: number, key: string): Sprite[] {
		const height = this.textures.getFrame(key, 0).height;
		return objectsWithGid(this.map.getObjectLayer(layerName), gid).map((obj) => {
			const { x, y } = objectSpawnPosition(obj, height);
			return (group.create(x, y, key, 0) as Sprite).setName(obj.name);
		});
	}

	createEnemies(): Phaser.Physics.Arcade.Group {
		const enemies = this.physics.add.group({ allowGravity: false, immovable: true });
		for (const enemy of this.spawnFromObjects(enemies, 'Enemy', ENEMY_GID, 'arrow')) {
			enemy.setOrigin(0.25, 0.5).setScale(0.5);
		}
		return enemies;
	}

	createCollectables(): Phaser.Physics.Arcade.Group {
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

	addColliders(): void {
		const { physics } = this;
		// Arcade passes a lone sprite first and a group member second, so sprites go first here.
		// Its callbacks take any game object, body or tile, so each one says which it gets.
		const sprite = (object: ArcadeObject) => object as Sprite;
		physics.add.collider(this.ship, this.walls, () => this.uprightIfLanded());
		physics.add.collider(this.collectables, this.walls, (dude) => this.turnAtWall(sprite(dude)));
		physics.add.overlap(this.ship, this.collectables, (_ship, dude) => this.rescue(sprite(dude)));
		// Overlaps with a tilemap layer test every tile, empty ones included, so only count walls.
		const solidTile = (_bullet: ArcadeObject, tile: ArcadeObject) => (tile as Phaser.Tilemaps.Tile).collides;
		physics.add.overlap(this.shipBullets, this.walls, (bullet) => this.bulletHitsWall(sprite(bullet)), solidTile);
		physics.add.overlap(this.enemyBullets, this.walls, (bullet) => this.bulletHitsWall(sprite(bullet)), solidTile);
		physics.add.overlap(this.shipBullets, this.enemies, (bullet, enemy) => this.bulletHitsEnemy(sprite(bullet), sprite(enemy)));
		physics.add.overlap(this.ship, this.enemyBullets, (_ship, bullet) => this.enemyBulletHitsShip(sprite(bullet)));
	}

	override update(time: number): void {
		if (this.ship.active && !this.levelComplete) {
			this.steer(time);
			if (this.fireKey.isDown && this.shipFire.ready(time)) {
				this.shipShoot(time);
			}
			if (this.enemyFire.ready(time)) {
				this.enemyShoot(time);
			}
			if (this.mission.hasCargo && this.unloadTick.ready(time) && this.landedAtHabitat()) {
				this.unloadDude();
				this.unloadTick.trigger(time);
			}
		}
		this.killStrayBullets(this.shipBullets);
		this.killStrayBullets(this.enemyBullets);
	}

	landedAtHabitat(): boolean {
		if (!this.habitatZone) {
			return false;
		}
		const { body } = this.ship;
		return canUnload({
			onFloor: body.onFloor(),
			angle: this.ship.angle,
			speed: body.speed,
			shipX: body.center.x,
			shipBottom: body.bottom,
			habitat: this.habitatZone,
		});
	}

	/** One dude climbs out, walks to the habitat door and goes in, scoring the rescue. */
	unloadDude(): void {
		if (!this.habitatZone) {
			return;
		}
		this.mission.unloadOne();
		this.scoreboard.refresh();
		const { doorX, floorY } = this.habitatZone;
		const startX = this.ship.body.center.x;
		const dude = this.add.sprite(startX, floorY, 'dude', 4).setOrigin(0.5, 1);
		dude.play(doorX >= startX ? 'dude-right' : 'dude-left');
		this.tweens.add({
			targets: dude,
			x: doorX,
			duration: (Math.abs(doorX - startX) / UNLOAD_WALK_SPEED) * 1000,
			onComplete: () => {
				dude.destroy();
				this.status.changeScore(SHIP_SCORE_RESCUE);
				this.scoreboard.refresh();
				if (this.ship.active && this.mission.isComplete && this.mission.aboard === 0 && !this.dudesWalking()) {
					this.completeLevel();
				}
			},
		});
		this.walkingDudes += 1;
		dude.once(Phaser.GameObjects.Events.DESTROY, () => { this.walkingDudes -= 1; });
	}

	dudesWalking(): boolean {
		return this.walkingDudes > 0;
	}

	/**
	 * Freeze play and show the mission-complete banner. SPACE, or RESTART_DELAY, goes on to the next
	 * level with the score; after the last level only SPACE does, and it starts a new game.
	 */
	completeLevel(): void {
		if (this.levelComplete) {
			return;
		}
		this.levelComplete = true;
		const { ship } = this;
		ship.setVelocity(0, 0).setAcceleration(0).setAngularVelocity(0);
		ship.body.setAllowGravity(false);
		ship.setFrame(SHIP_FRAME.IDLE);
		for (const bullet of [...this.activeSprites(this.enemyBullets), ...this.activeSprites(this.shipBullets)]) {
			bullet.disableBody(true, true);
		}

		const { width, height } = this.scale;
		const style = { fontFamily: 'Arial', fontSize: '32px', color: '#ffd900', align: 'center' };
		const small = { ...style, fontSize: '18px', color: '#ffffff' };
		const backdrop = this.add.rectangle(0, 0, 440, 150, 0x000000, 0.7).setStrokeStyle(2, 0xffd900);
		const last = isLastLevel(this.levelIndex);
		const lines = [
			this.add.text(0, -40, last ? 'ALL MISSIONS COMPLETE' : 'MISSION COMPLETE', style).setOrigin(0.5),
			this.add.text(0, 5, `SCORE ${this.status.score}`, small).setOrigin(0.5),
			this.add.text(0, 40, last ? 'PRESS SPACE TO PLAY AGAIN' : `PRESS SPACE FOR LEVEL ${nextLevelIndex(this.levelIndex) + 1}`, small).setOrigin(0.5),
		];
		this.banner = this.add.container(width / 2, height / 2, [backdrop, ...lines])
			.setScrollFactor(0)
			.setDepth(BANNER_DEPTH);

		// A fresh press only: a fire key already held when the level ends must not skip the banner.
		// Phaser emits no keydown-SPACE for auto-repeats of a registered key (fireKey) that is down.
		const next: LevelData = last ? { levelIndex: 0, score: 0 } : { levelIndex: nextLevelIndex(this.levelIndex), score: this.status.score };
		this.keyboard.once('keydown-SPACE', () => this.goToLevel(next));
		if (!last) {
			this.time.delayedCall(RESTART_DELAY, () => this.goToLevel(next));
		}
	}

	/** Restart the scene on the level in `data` (`{ levelIndex, score }`), once. */
	goToLevel(data: LevelData): void {
		if (this.restarting) {
			return;
		}
		this.restarting = true;
		this.scene.restart(data);
	}

	steer(time: number): void {
		const { ship, cursors } = this;
		let frame: number;
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

	uprightIfLanded(): void {
		const { ship } = this;
		const landed = shouldUpright({
			angle: ship.angle,
			onFloor: ship.body.onFloor(),
			tweenPlaying: this.shipTween.isPlaying(),
		});
		if (landed) {
			ship.setAngularVelocity(0);
			this.shipTween = this.tweens.add({ targets: ship, angle: UPRIGHT_ANGLE, duration: 400 });
		}
	}

	turnAtWall(dude: Dude): void {
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

	shipShoot(time: number): void {
		const { ship } = this;
		const bullet = this.shipBullets.get(ship.x, ship.y) as Sprite | null;
		if (!bullet) {
			return;
		}
		bullet.enableBody(true, ship.x, ship.y, true, true); // TODO start at the ship's nose
		bullet.setRotation(ship.rotation);
		this.physics.velocityFromRotation(ship.rotation, SHIP_BULLET_SPEED, bullet.body.velocity);
		this.shipFire.trigger(time);
	}

	enemyShoot(time: number): void {
		const shooters = this.enemies.getChildren() as Sprite[];
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
		const bullet = this.enemyBullets.get(shooter.body.x, shooter.body.y) as Sprite | null;
		if (!bullet) {
			return;
		}
		bullet.enableBody(true, shooter.body.x, shooter.body.y, true, true);
		this.physics.moveToObject(bullet, ship, ENEMY_BULLET_SPEED);
		this.enemyFire.trigger(time, this.tuning.enemyShootTime);
	}

	/** True when no wall tile lies on the straight line between two points. */
	hasLineOfSight(from: Phaser.Types.Math.Vector2Like, to: Phaser.Types.Math.Vector2Like): boolean {
		const ray = new Phaser.Geom.Line(from.x, from.y, to.x, to.y);
		return this.walls.getTilesWithinShape(ray, { isColliding: true }).length === 0;
	}

	/** The pool's sprites in play. */
	activeSprites(pool: Phaser.GameObjects.Group): Sprite[] {
		return pool.getMatching('active', true) as Sprite[];
	}

	killStrayBullets(pool: Phaser.Physics.Arcade.Group): void {
		const bounds = this.physics.world.bounds;
		for (const bullet of this.activeSprites(pool)) {
			if (!bounds.contains(bullet.x, bullet.y)) {
				bullet.disableBody(true, true);
			}
		}
	}

	explosion(x: number, y: number): void {
		const boom = this.explosions.get(x, y) as Phaser.GameObjects.Sprite | null;
		if (!boom) {
			return;
		}
		boom.setActive(true).setVisible(true).play('kaboom');
		boom.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.explosions.killAndHide(boom));
	}

	bulletHitsWall(bullet: Sprite): void {
		bullet.disableBody(true, true);
		this.explosion(bullet.body.x, bullet.body.y);
	}

	bulletHitsEnemy(bullet: Sprite, enemy: Sprite): void {
		this.bulletHitsWall(bullet);
		this.status.changeScore(SHIP_SCORE_ENEMY);
		this.scoreboard.refresh();
		// Destroyed rather than disabled so a dead enemy can never be chosen to shoot.
		enemy.destroy(); // TODO damage the enemy instead
	}

	enemyBulletHitsShip(bullet: Sprite): void {
		this.bulletHitsWall(bullet);
		this.status.setLife(this.status.life - this.tuning.lifeExpense);
		this.scoreboard.refresh();
		if (this.status.isDead) {
			this.ship.disableBody(true, true);
		}
	}

	/** Take a dude aboard. They score when they walk into the habitat. */
	rescue(dude: Sprite): void {
		dude.disableBody(true, true);
		this.mission.pickUp();
		this.scoreboard.refresh();
	}
}
