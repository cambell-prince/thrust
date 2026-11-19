import { MAX_GAUGE } from '../logic/shipStatus.js';

const TEXT_STYLE = { fontFamily: 'Arial', fontSize: '11px', color: '#ffffff' };
const OUTLINE_COLOR = 0xffd900;
const EMPTY_COLOR = 0x000000;

const GAUGES = {
	life: { x: 42, y: 10, width: 140, height: 6, color: 0x6699ff },
	fuel: { x: 236, y: 10, width: 140, height: 6, color: 0xff3300 },
};

/** The camera-fixed HUD: life and fuel gauges, mission label and score. */
export class Scoreboard {
	constructor(scene, status) {
		this.status = status;
		this.graphics = scene.add.graphics();
		const labels = [
			scene.add.text(10, 7, 'LIFE', TEXT_STYLE),
			scene.add.text(200, 7, 'FUEL', TEXT_STYLE),
			scene.add.text(390, 7, 'MISSION', TEXT_STYLE),
			scene.add.text(580, 7, 'SCORE', TEXT_STYLE),
		];
		this.scoreText = scene.add.text(630, 7, '0', TEXT_STYLE);
		for (const item of [this.graphics, ...labels, this.scoreText]) {
			item.setScrollFactor(0).setDepth(100);
		}
		this.refresh();
	}

	/** Redraw from the current status. Call after changing fuel, life or score. */
	refresh() {
		this.graphics.clear();
		this.drawGauge(GAUGES.life, this.status.life);
		this.drawGauge(GAUGES.fuel, this.status.fuel);
		this.scoreText.setText(String(this.status.score));
	}

	drawGauge({ x, y, width, height, color }, amount) {
		const filled = (width * amount) / MAX_GAUGE;
		this.graphics.fillStyle(color).fillRect(x - 1, y - 1, width + 2, height + 2);
		this.graphics.lineStyle(2, OUTLINE_COLOR).strokeRect(x - 1, y - 1, width + 2, height + 2);
		this.graphics.fillStyle(EMPTY_COLOR).fillRect(x + filled, y, width - filled, height);
	}
}
