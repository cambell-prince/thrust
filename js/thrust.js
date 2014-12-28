
var game = new Phaser.Game(800, 600, Phaser.WEBGL, 'thrust', { preload: preload, create: create, update: update, render: render });

function preload() {

    game.load.tilemap('level1', 'assets/level1.json', null, Phaser.Tilemap.TILED_JSON);
    game.load.image('tiles-1', 'assets/tiles-1.png');
    game.load.spritesheet('ship', 'assets/ship.png', 70, 48, 4, 2, 2);
    game.load.spritesheet('droid', 'assets/droid.png', 32, 32);
    game.load.image('starSmall', 'assets/star.png');
    game.load.image('starBig', 'assets/star2.png');
    game.load.image('background', 'assets/background2.png');

}

var map;
var tileset;
var layer;
var ship;
var facing = 'left';
var jumpTimer = 0;
var cursors;
var jumpButton;
var bg;

function create() {

    //  This will run in Canvas mode, so let's gain a little speed and display
	game.renderer.clearBeforeRender = false;
	game.renderer.roundPixels = true;

    game.physics.startSystem(Phaser.Physics.ARCADE);

    game.stage.backgroundColor = '#000000';

    bg = game.add.tileSprite(0, 0, 800, 600, 'background');
    bg.fixedToCamera = true;

    map = game.add.tilemap('level1');
    map.addTilesetImage('tiles-1');

    map.setCollisionByExclusion([ 13, 14, 15, 16, 46, 47, 48, 49, 50, 51 ]);

    layer = map.createLayer('Walls');

    //  Un-comment this on to see the collision tiles
    //layer.debug = true;

    layer.resizeWorld();

    game.physics.arcade.gravity.y = 30;

    ship = game.add.sprite(100, 80, 'ship');
    game.physics.enable(ship, Phaser.Physics.ARCADE);

    ship.body.bounce.y = 0.2;
    ship.body.collideWorldBounds = true;
    ship.body.setSize(46, 46, 10, 0);
    ship.anchor.set(0.70, 0.5);
    ship.body.drag.set(20);
    ship.body.maxVelocity.set(200);

//    ship.animations.add('left', [0, 1, 2, 3], 10, true);
//    ship.animations.add('turn', [4], 20, true);
//    ship.animations.add('right', [5, 6, 7, 8], 10, true);

    game.camera.follow(ship);

    cursors = game.input.keyboard.createCursorKeys();
    jumpButton = game.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR);

}

function update() {

    game.physics.arcade.collide(ship, layer);

    // Left / Right angular control
    if (cursors.left.isDown)
    {
		ship.body.angularVelocity = -300;
//        ship.body.velocity.x = -150;

        if (facing != 'left')
        {
			ship.frame = 1;
            facing = 'left';
//            ship.animations.play('left');
        }
    }
    else if (cursors.right.isDown)
    {
		ship.body.angularVelocity = 300;
  //      ship.body.velocity.x = 150;

        if (facing != 'right')
        {
			ship.frame = 0;
            facing = 'right';
//            ship.animations.play('right');
        }
    }
    else
    {
		ship.body.angularVelocity = 0;
		if (facing != 'up' && facing != 'idle') {
			ship.frame = 3;
			facing = 'idle';
		}
	}
	// Thrust control
    if (cursors.up.isDown)
    {
        game.physics.arcade.accelerationFromRotation(ship.rotation, 100, ship.body.acceleration);
        if (facing != 'up') {
			ship.frame = 2;
			facing = 'up';
		}
    }
    else
    {
        ship.body.acceleration.set(0);
        if (facing != 'left' && facing != 'right' && facing != 'idle') {
			ship.frame = 3;
			facing = 'idle';
		}
    }

}

function render () {

    //game.debug.text(game.time.physicsElapsed, 32, 32);
    //game.debug.body(ship);
    //game.debug.bodyInfo(ship, 16, 24);

}
