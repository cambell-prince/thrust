import Phaser from 'phaser';
import { LevelScene } from './scenes/LevelScene.js';

const game = new Phaser.Game({
	type: Phaser.AUTO,
	width: 800,
	height: 600,
	backgroundColor: '#000000',
	roundPixels: true,
	physics: {
		default: 'arcade',
		arcade: { gravity: { x: 0, y: 40 } },
	},
	scene: [LevelScene],
});

// A handle for the browser tests and for poking at the game from the console.
window.thrust = game;
