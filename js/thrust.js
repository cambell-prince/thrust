/* global Phaser */
var game = new Phaser.Game(800, 600, Phaser.CANVAS, 'thrust', { preload: preload, create: create, update: update, render: render });

var Game = {};

Game.Scoreboard = function(game) {
	this.group = game.add.group();
	this.group.fixedToCamera = true;
	this.graphics = game.add.graphics(0, 0, this.group);

	this.fuel = 100;
	this.life = 100;
	this.score = 0;

	this._lifeRectangle = new Phaser.Rectangle(42, 10, 140, 6);

	game.add.text(10, 7, 'LIFE', { font: '11px Arial', fill: '#fff' }, this.group);
	var lifeOuter = this._lifeRectangle.clone().inflate(1, 1);
	this.graphics.lineStyle(2, 0xffd900, 1);
	this.graphics.beginFill(0x6699FF);
	this.graphics.drawShape(lifeOuter);

	this._fuelRectangle = new Phaser.Rectangle(236, 10, 140, 6);
	game.add.text(200, 7, 'FUEL', { font: '11px Arial', fill: '#fff' }, this.group);
	var fuelOuter = this._fuelRectangle.clone().inflate(1, 1);
	this.graphics.beginFill(0xFF3300);
	this.graphics.drawShape(fuelOuter);
	this.graphics.endFill();
	
	game.add.text(390, 7, 'MISSION', { font: '11px Arial', fill: '#fff' }, this.group);


	game.add.text(580, 7, 'SCORE', { font: '11px Arial', fill: '#fff' }, this.group);
	this._scoreText = game.add.text(630, 7, '0', { font: '11px Arial', fill: '#fff' }, this.group);

	this.setFuel(100);
	this.setLife(100);
	
}

Game.Scoreboard.prototype.reset = function() {
	this.setFuel(100);
	this.setLife(100);
	this.score = 0;
}

Game.Scoreboard.prototype.setFuel = function(amount) {
	if (amount < 0) {
		amount = 0;
	}
	this.fuel = amount;
	var width = this._fuelRectangle.width * amount / 100;
	this.graphics.lineStyle(0, 0xFFFFFF, 0);
	this.graphics.beginFill(0x000000);
	this.graphics.drawRect(this._fuelRectangle.x + width, this._fuelRectangle.y, this._fuelRectangle.width - width, this._fuelRectangle.height);
	this.graphics.endFill();
	return this.fuel;
}

Game.Scoreboard.prototype.setLife = function(amount) {
	if (amount < 0) {
		amount = 0;
	}
	this.life = amount;
	var width = this._lifeRectangle.width * amount / 100;
	this.graphics.lineStyle(0, 0xFFFFFF, 0);
	this.graphics.beginFill(0x000000);
	this.graphics.drawRect(this._lifeRectangle.x + width, this._lifeRectangle.y, this._lifeRectangle.width - width, this._lifeRectangle.height);
	this.graphics.endFill();
	return this.life;
}

Game.Scoreboard.prototype.changeScore = function(change) {
	this.score += change;
	this._scoreText.text = this.score;
}

function preload() {
	game.load.image('background', 'assets/background2.png');
	game.load.spritesheet('ship', 'assets/ship.png', 70, 48, 4, 2, 2);
	game.load.spritesheet('dude', 'assets/dude.png', 32, 48);
	game.load.image('bullet', 'assets/bullet.png');
	game.load.image('enemyBullet', 'assets/enemy-bullet.png');
	game.load.spritesheet('kaboom', 'assets/explode.png', 128, 128);

	game.load.tilemap('level1', 'assets/level1.json', null, Phaser.Tilemap.TILED_JSON);
	game.load.image('tiles-1', 'assets/tiles-1.png');
	game.load.image('arrow-line', 'assets/longarrow.png');
	game.load.image('arrow', 'assets/longarrow2.png');
}

// World
var bg;
var map;
var tileset;
var walls;
var scoreboard;

// Input
var cursors;
var fireButton;

// Ship
var ship;
var shipTween;
var shipBullets;
var shipShootTime = 0;
var fuelTimer = 0;

// Enemies
var enemies;
var enemyBullets;
var enemyShootTime = 0;

// Collectables
var collectables;

var explosions;

function create() {

	//  This will run in Canvas mode, so let's gain a little speed and display
	game.renderer.clearBeforeRender = false;
	game.renderer.roundPixels = true;

	game.physics.startSystem(Phaser.Physics.ARCADE);
	game.physics.arcade.gravity.y = 40;

	// Background
	game.stage.backgroundColor = '#000000';
	bg = game.add.tileSprite(0, 0, 800, 600, 'background');
	bg.fixedToCamera = true;

	// Input
	cursors = game.input.keyboard.createCursorKeys();
	fireButton = game.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR);

	// Ship
	ship = game.add.sprite(50, 80, 'ship');
	game.physics.enable(ship, Phaser.Physics.ARCADE);

	ship.body.bounce.y = 0.2;
	ship.body.collideWorldBounds = true;
	ship.body.setSize(46, 46, 10, 0);
	ship.anchor.set(0.70, 0.5);
	ship.body.drag.set(game.physics.arcade.gravity.y / 2);
	ship.body.maxVelocity.set(200);
	shipTween = game.add.tween(ship).to({ angle: -80}, 1000).start();

	game.camera.follow(ship);

	// Add the walls (for level 1)
	map = game.add.tilemap('level1');
	map.addTilesetImage('tiles-1');
	map.setCollisionByExclusion([ 13, 14, 15, 16, 46, 47, 48, 49, 50, 51 ]);

	walls = map.createLayer('Walls');
	walls.resizeWorld();
	//  Un-comment this to see the collision tiles
	// walls.debug = true;

	// Ship bullets
	shipBullets = game.add.group();
	shipBullets.enableBody = true;
	shipBullets.physicsBodyType = Phaser.Physics.ARCADE;
	shipBullets.createMultiple(30, 'bullet');
	shipBullets.setAll('anchor.x', 0.5);
	shipBullets.setAll('anchor.y', 1);
	shipBullets.setAll('outOfBoundsKill', true);
	shipBullets.setAll('checkWorldBounds', true);
	shipBullets.setAll('body.allowGravity', false);

	// Add the enemy
	enemies = game.add.group();
	enemies.enableBody = true;
	enemies.physicsBodyType = Phaser.Physics.ARCADE;
	map.createFromObjects('Enemy', 69, 'arrow', 0, true, false, enemies);
	enemies.setAll('anchor.x', 0.25);
	enemies.setAll('anchor.y', 0.5);
	enemies.setAll('scale.x', 0.5);
	enemies.setAll('scale.y', 0.5);
	enemies.setAll('body.allowGravity', false);

	// Enemy bullets
	enemyBullets = game.add.group();
	enemyBullets.enableBody = true;
	enemyBullets.physicsBodyType = Phaser.Physics.ARCADE;
	enemyBullets.createMultiple(30, 'enemyBullet');
	enemyBullets.setAll('anchor.x', 0.5);
	enemyBullets.setAll('anchor.y', 1);
	enemyBullets.setAll('outOfBoundsKill', true);
	enemyBullets.setAll('checkWorldBounds', true);
	enemyBullets.setAll('body.allowGravity', false);

	// Collectables (Dude)
	collectables = game.add.group();
	collectables.enableBody = true;
	collectables.physicsBodyType = Phaser.Physics.ARCADE;
	map.createFromObjects('Collectables', 71, 'dude', 0, true, false, collectables);
	// TODO create other collectables here

	collectables.forEach(function(sprite) {
		// TODO check for gid == 71 or type == 'M' (from the Tiled map)
		sprite.body.bounce.y = 0.2;
		sprite.body.collideWorldBounds = true;
		sprite.body.setSize(20, 32, 5, 16);

		sprite.animations.add('left', [0, 1, 2, 3], 10, true);
		sprite.animations.add('turn', [4], 20, true);
		sprite.animations.add('right', [5, 6, 7, 8], 10, true);
		
		sprite.body.velocity.x = 30; // TODO set this from map.properties (peferably on the collectable tile)
		sprite.animations.play('right');
	});

	//  An explosion pool
	explosions = game.add.group();
	explosions.createMultiple(10, 'kaboom');
	explosions.forEach(function(sprite) {
		sprite.anchor.set(0.5);
		sprite.animations.add('kaboom');
	}, this);

	// Finally, the scoreboard
	scoreboard = new Game.Scoreboard(game);
}

function update() {
	// Left / Right angular control
	if (cursors.left.isDown) {
		ship.body.angularVelocity = -300;
		ship.frame = 1;
	}
	else if (cursors.right.isDown)
	{
		ship.body.angularVelocity = 300;
		ship.frame = 0;
	}
	else
	{
		ship.body.angularVelocity = 0;
		ship.frame = 3;
	}
	// Thrust control
	if (cursors.up.isDown && scoreboard.fuel > 0)
	{
		if (game.time.now > fuelTimer) {
			scoreboard.setFuel(scoreboard.fuel - map.properties.fuelExpense);
			fuelTimer = game.time.now + 500;
		}
		game.physics.arcade.accelerationFromRotation(ship.rotation, 200, ship.body.acceleration);
		ship.frame = 2;
	}
	else
	{
		ship.body.acceleration.set(0);
 		if (ship.frame > 1) {
 			ship.frame = 3;
 		}
	}
	// Firing?
	if (fireButton.isDown)
	{
		//  To avoid them being allowed to fire too fast we set a time limit
		if (game.time.now > shipShootTime)
		{
			shipShoot();
		}
	}
	if (game.time.now > enemyShootTime)
	{
		enemyShoot();
	}

	//  Run collisions
	game.physics.arcade.collide(ship, walls, function(ship, walls) {
		// Smooth the landing and make the ship upright if we think the ship landed.
		if (!shipTween.isRunning && !Phaser.Math.fuzzyEqual(ship.angle, -90) && ship.body.onFloor()) {
			if (ship.angle > -135 && ship.angle < -45) {
				ship.body.angularVelocity = 0;
				shipTween = game.add.tween(ship).to({ angle: -90}, 400).start();
			}
		}
	});
	game.physics.arcade.collide(collectables, walls, function(collectable, walls) {
		// TODO Treat different collectables differently
		// Debounce
		if (collectable.nextTime && game.time.now < collectable.nextTime) {
			return;
		}
		if (collectable.body.onWall()) {
			var currentAnim = collectable.animations.currentAnim.name;
			if (currentAnim == 'right') {
				collectable.body.velocity.x = -30;
				collectable.animations.play('left');
			} else if (currentAnim == 'left') {
				collectable.body.velocity.x = 30;
				collectable.animations.play('right');
			}
			// Debounce the dude which otherwise may still be touching the wall
			collectable.nextTime = game.time.now + 1000;
		}
	});
	game.physics.arcade.overlap(ship, collectables, function(ship, collectable) {
		collectable.kill();
		// TODO Tween into ship
		// TODO Tween points
		// TODO Add to score
		scoreboard.changeScore(500);
	});
	game.physics.arcade.overlap([shipBullets, enemyBullets], walls, bulletHitsWall, null, this);
	game.physics.arcade.overlap(shipBullets, enemies, bulletHitsEnemy, null, this);
	game.physics.arcade.overlap(enemyBullets, ship, enemyBulletHitsShip, null, this);

}

function explosion(x, y) {
	var explosion = explosions.getFirstExists(false);
	if (explosion) {
		explosion.reset(x, y);
		explosion.play('kaboom', 30, false, true);
	}
}

function bulletHitsWall(bullet, walls) {
	// When a bullet hits a wall we kill the bullet and explode (with no damage to the wall)
	bullet.kill();
	explosion(bullet.body.x, bullet.body.y);
}

function bulletHitsEnemy (bullet, enemy) {

	// When a bullet hits an enemy we kill it
	bullet.kill();

	//  And create an explosion :)
	explosion(bullet.body.x, bullet.body.y);

	// TODO Increase the score
	scoreboard.changeScore(100);
	// TODO map.properties

	// TODO Damage the enemy
	enemy.destroy();

}

function enemyBulletHitsShip(ship,enemyBullet) {
	enemyBullet.kill();
	explosion(enemyBullet.body.x, enemyBullet.body.y);
	
	if (scoreboard.setLife(scoreboard.life - map.properties.lifeExpense) <= 0) {
		ship.kill();
	}

}

function enemyShoot () {
	// If all the enemies are dead then do nothing.
	if (enemies.length == 0) {
		return;
	}
	// Grab the first bullet we can from the pool
	var enemyBullet = enemyBullets.getFirstExists(false);
	if (enemyBullet) {        
		// randomly select one of them
		var shooter = enemies.getRandom();
		// tween to point the enemy at the ship
		game.add.tween(shooter).to({ rotation: game.physics.arcade.angleBetween(shooter, ship)}, 400).start();
		// Only shoot if the enemy has line of sight
		var ray = new Phaser.Line(ship.x, ship.y, shooter.x, shooter.y);
		var wallsInTheWay = walls.getRayCastTiles(ray, 8, true);
		if (wallsInTheWay.length == 0) {
			// Then fire the bullet from this enemy
			enemyBullet.reset(shooter.body.x, shooter.body.y);
			game.physics.arcade.moveToObject(enemyBullet, ship, 120); // TODO map.properties
			enemyShootTime = game.time.now + parseInt(map.properties.enemyShootTime);
		}
	}

}

function shipShoot  () {
	// Grab the first bullet we can from the pool
	var bullet = shipBullets.getFirstExists(false);
	if (bullet)
	{
		// And fire it
		bullet.reset(ship.x, ship.y); // TODO Get a better start position for the bullet based on angle
		bullet.rotation = ship.rotation; 
		game.physics.arcade.velocityFromRotation(ship.rotation, 300, bullet.body.velocity);
		shipShootTime = game.time.now + 500; // TODO map.properties
	}
}

function render () {

	//game.debug.text(game.time.physicsElapsed, 32, 32);
	//game.debug.body(ship);
	//game.debug.bodyInfo(enemies, 16, 24);
	//game.debug.body(bullets);

}
