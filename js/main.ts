import Phaser from 'phaser';
import { levelIndexFromSearch } from './logic/levels.ts';
import { LevelScene } from './scenes/LevelScene.ts';

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
});

// ?level=N starts on level N (1-based), for map editing and the browser tests.
game.scene.add('Level', LevelScene, true, { levelIndex: levelIndexFromSearch(window.location.search), score: 0 });

// A handle for the browser tests and for poking at the game from the console.
window.thrust = game;
