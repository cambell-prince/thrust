
var game = new Phaser.Game(800, 600, Phaser.WEBGL, 'thrust', { preload: preload, create: create, update: update, render: render });

function preload() {
    game.load.image('background', 'assets/background2.png');
    game.load.spritesheet('ship', 'assets/ship.png', 70, 48, 4, 2, 2);
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
var layer;

// Input
var cursors;
var fireButton;

// Ship
var ship;
var shipTween;
var bullets;
var bulletTime = 0;

// Enemies
var enemies;
var enemyBullets;
var firingTimer = 0;

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
    ship = game.add.sprite(100, 80, 'ship');
    game.physics.enable(ship, Phaser.Physics.ARCADE);

    ship.body.bounce.y = 0.2;
    ship.body.collideWorldBounds = true;
    ship.body.setSize(46, 46, 10, 0);
    ship.anchor.set(0.70, 0.5);
    ship.body.drag.set(15);
    ship.body.maxVelocity.set(200);
    shipTween = game.add.tween(ship).to({ angle: -80}, 1000).start();

    game.camera.follow(ship);

    // Add the walls (for level 1)
    map = game.add.tilemap('level1');
    map.addTilesetImage('tiles-1');
    map.setCollisionByExclusion([ 13, 14, 15, 16, 46, 47, 48, 49, 50, 51 ]);

    layer = map.createLayer('Walls');
    layer.resizeWorld();
    //  Un-comment this on to see the collision tiles
    //layer.debug = true;

    // Ship bullets
    bullets = game.add.group();
    bullets.enableBody = true;
    bullets.physicsBodyType = Phaser.Physics.ARCADE;
    bullets.createMultiple(30, 'bullet');
    bullets.setAll('anchor.x', 0.5);
    bullets.setAll('anchor.y', 1);
    bullets.setAll('outOfBoundsKill', true);
    bullets.setAll('checkWorldBounds', true);
    bullets.setAll('body.allowGravity', false);

    // Add the enemy
    enemies = game.add.group();
    //enemies.enableBody = true;
    //enemies.physicsBodyType = Phaser.Physics.ARCADE;
    map.createFromObjects('Enemy', 69, 'arrow', 0, true, false, enemies);
    enemies.setAll('anchor.x', 0.25);
    enemies.setAll('anchor.y', 0.5);
    enemies.setAll('scale.x', 0.5);
    enemies.setAll('scale.y', 0.5);

    // Enemy bullets
    enemyBullets = game.add.group();
    enemyBullets.enableBody = true;
    enemyBullets.physicsBodyType = Phaser.Physics.ARCADE;
    enemyBullets.createMultiple(30, 'enemyBullet');
    enemyBullets.setAll('anchor.x', 0.5);
    enemyBullets.setAll('anchor.y', 1);
    enemyBullets.setAll('outOfBoundsKill', true);
    enemyBullets.setAll('checkWorldBounds', true);

    //  An explosion pool
    explosions = game.add.group();
    explosions.createMultiple(10, 'kaboom');
    explosions.forEach(function(sprite) {
		sprite.anchor.set(0.5);
		sprite.animations.add('kaboom');
	}, this);

}

function damageShip(ship, enemy) {
    console.log('ship hit');
}

function trackShip(enemy) {
    enemy.rotation = game.physics.arcade.angleBetween(enemy, ship);
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
    if (cursors.up.isDown)
    {
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
		if (game.time.now > bulletTime)
		{
			shipShoot();
		}
	}
	if (game.time.now > firingTimer)
	{
		enemyFires();
	}

	//  Run collisions
	game.physics.arcade.collide(ship, layer, function(ship, layer) {
		if (shipTween && !shipTween.isRunning && !Phaser.Math.fuzzyEqual(ship.angle, -90) && ship.body.onFloor()) {
			ship.body.angularVelocity = 0;
			shipTween = game.add.tween(ship).to({ angle: -90}, 400).start();
		}
	});
	game.physics.arcade.overlap(bullets, layer, bulletHitsWall, null, this);
//    game.physics.arcade.overlap(enemies, ship, damageShip, null, this);
    enemies.forEachAlive(trackShip, this);
	game.physics.arcade.overlap(bullets, enemies, bulletHitsEnemy, null, this);
	game.physics.arcade.overlap(enemyBullets, ship, enemyBulletHitsShip, null, this);

}

function explosion(x, y) {
    var explosion = explosions.getFirstExists(false);
    explosion.reset(x, y);
    explosion.play('kaboom', 30, false, true);
}

function bulletHitsWall(bullet, layer) {
    // When a bullet hits a wall we kill the bullet and explode (with no damage to the wall)
    bullet.kill();
    explosion(bullet.body.x, bullet.body.y);
}

function bulletHitsEnemy (bullet, enemy) {

    //  When a bullet hits an enemy we kill them both
    bullet.kill();
    //enemy.kill();

    //  Increase the score
    score += 20;
    scoreText.text = scoreString + score;

    //  And create an explosion :)
    explosion(enemy.body.x, enemy.body.y);

    if (enemies.countLiving() == 0)
    {
        score += 1000;
        scoreText.text = scoreString + score;

        enemyBullets.callAll('kill',this);
        stateText.text = " You Won, \n Click to restart";
        stateText.visible = true;

        //the "click to restart" handler
        game.input.onTap.addOnce(restart,this);
    }

}

function enemyBulletHitsShip (player,bullet) {
    
    bullet.kill();

    live = lives.getFirstAlive();

    if (live)
    {
        live.kill();
    }

    //  And create an explosion :)
    var explosion = explosions.getFirstExists(false);
    explosion.reset(player.body.x, player.body.y);
    explosion.play('kaboom', 30, false, true);

    // When the player dies
    if (lives.countLiving() < 1)
    {
        player.kill();
        enemyBullets.callAll('kill');

        stateText.text=" GAME OVER \n Click to restart";
        stateText.visible = true;

        //the "click to restart" handler
        game.input.onTap.addOnce(restart,this);
    }

}

function enemyFires () {

    //  Grab the first bullet we can from the pool
    enemyBullet = enemyBullets.getFirstExists(false);
    if (false || enemyBullet) {        
//        var random=game.rnd.integerInRange(0,livingEnemies.length-1);

        // randomly select one of them
//        var shooter=livingEnemies[random];
        // And fire the bullet from this enemy
//        enemyBullet.reset(shooter.body.x, shooter.body.y);

        game.physics.arcade.moveToObject(enemyBullet, ship, 120);
        firingTimer = game.time.now + 2000;
    }

}

function shipShoot  () {

	//  Grab the first bullet we can from the pool
	bullet = bullets.getFirstExists(false);
	if (bullet)
	{
		//  And fire it
		bullet.reset(ship.x, ship.y); //  TODO Get a better start position for the bullet based on angle
		bullet.rotation = ship.rotation; 
		game.physics.arcade.velocityFromRotation(ship.rotation, 300, bullet.body.velocity);
//  		bullet.body.velocity.y = -400; // TODO Fix
		bulletTime = game.time.now + 200; // Ok?
	}

}

function resetBullet(bullet) { // TODO Used?

    //  Called if the bullet goes out of the screen
    bullet.kill();

}

function render () {

    //game.debug.text(game.time.physicsElapsed, 32, 32);
    //game.debug.body(ship);
    //game.debug.bodyInfo(ship, 16, 24);
    //game.debug.body(bullets);

}
