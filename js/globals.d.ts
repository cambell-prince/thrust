import type Phaser from 'phaser';

declare global {
	interface Window {
		/** The running game, set by main.ts for the browser tests and the console. */
		thrust: Phaser.Game;
	}
}
