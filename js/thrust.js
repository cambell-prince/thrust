
var game = new Phaser.Game(800, 600, Phaser.WEBGL, 'thrust', { preload: preload, create: create, update: update, render: render });

function preload() {
    game.load.tilemap('level1', 'assets/level1.json', null, Phaser.Tilemap.TILED_JSON);
    game.load.image('tiles-1', 'assets/tiles-1.png');
    game.load.image('arrow-line', 'assets/longarrow.png');
    game.load.image('arrow', 'assets/longarrow2.png');
    game.load.spritesheet('ship', 'assets/ship.png', 70, 48, 4, 2, 2);
    game.load.spritesheet('droid', 'assets/droid.png', 32, 32);
    game.load.image('background', 'assets/background2.png');
}

var map;
var tileset;
var layer;
var ship;
var shipTween;
var enemies;
var cursors;
var jumpButton;
var bg;

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

    // Ship Setup
    ship = game.add.sprite(100, 80, 'ship');
    game.physics.enable(ship, Phaser.Physics.ARCADE);

    ship.body.bounce.y = 0.2;
    ship.body.collideWorldBounds = true;
    ship.body.setSize(46, 46, 10, 0);
    ship.anchor.set(0.70, 0.5);
    ship.body.drag.set(15);
    ship.body.maxVelocity.set(200);

    game.camera.follow(ship);
    shipTween = game.add.tween(ship);

    cursors = game.input.keyboard.createCursorKeys();
    jumpButton = game.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR);

    // Add the walls (for level 1)
    map = game.add.tilemap('level1');
    map.addTilesetImage('tiles-1');
    map.setCollisionByExclusion([ 13, 14, 15, 16, 46, 47, 48, 49, 50, 51 ]);

    layer = map.createLayer('Walls');
    layer.resizeWorld();
    //  Un-comment this on to see the collision tiles
    //layer.debug = true;
    
    // Add the enemy
    enemies = game.add.group();
//    enemies.enableBody = true;
    map.createFromObjects('Enemy', 69, 'arrow', 0, true, false, enemies);
    enemies.setAll('anchor.x', 0.25);
    enemies.setAll('anchor.y', 0.5);
    enemies.setAll('scale.x', 0.5);
    enemies.setAll('scale.y', 0.5);
}

function damageShip(ship, enemy) {
    console.log('ship hit');
}

function trackShip(enemy) {
    enemy.rotation = game.physics.arcade.angleBetween(enemy, ship);
}

function update() {

    game.physics.arcade.collide(ship, layer, function(ship, layer) {
		if (!shipTween.isRunning && ship.angle != -90 && ship.body.onFloor()) {
			ship.body.angularVelocity = 0;
			shipTween.to({ angle: -90}, 250);
			shipTween.start();
		} else if (shipTween.isRunning && !ship.body.onFloor()) {
			shipTween.stop();
		}
	});
    game.physics.arcade.overlap(enemies, ship, damageShip, null, this);
    enemies.forEachAlive(trackShip, this);

    // Left / Right angular control
    if (cursors.left.isDown)
    {
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

}

function render () {

    //game.debug.text(game.time.physicsElapsed, 32, 32);
    //game.debug.body(ship);
    //game.debug.bodyInfo(ship, 16, 24);

}
