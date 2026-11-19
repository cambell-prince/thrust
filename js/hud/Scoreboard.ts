import type Phaser from 'phaser';
import type { Mission } from '../logic/mission.ts';
import { MAX_GAUGE, type ShipStatus } from '../logic/shipStatus.ts';

const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '11px', color: '#ffffff' };
const OUTLINE_COLOR = 0xffd900;
const EMPTY_COLOR = 0x000000;

interface Gauge {
	x: number;
	y: number;
	width: number;
	height: number;
	color: number;
}

const GAUGES = {
	life: { x: 42, y: 10, width: 140, height: 6, color: 0x6699ff },
	fuel: { x: 236, y: 10, width: 140, height: 6, color: 0xff3300 },
} satisfies Record<string, Gauge>;

/** The camera-fixed HUD: life and fuel gauges, the mission (level) number and count (delivered/total, +aboard) and score. */
export class Scoreboard {
	status: ShipStatus;
	mission: Mission;
	graphics: Phaser.GameObjects.Graphics;
	missionLabel: Phaser.GameObjects.Text;
	missionText: Phaser.GameObjects.Text;
	scoreText: Phaser.GameObjects.Text;

	constructor(scene: Phaser.Scene, status: ShipStatus, mission: Mission, levelNumber: number) {
		this.status = status;
		this.mission = mission;
		this.graphics = scene.add.graphics();
		this.missionLabel = scene.add.text(390, 7, `MISSION ${levelNumber}`, TEXT_STYLE);
		const labels = [
			scene.add.text(10, 7, 'LIFE', TEXT_STYLE),
			scene.add.text(200, 7, 'FUEL', TEXT_STYLE),
			this.missionLabel,
			scene.add.text(580, 7, 'SCORE', TEXT_STYLE),
		];
		this.missionText = scene.add.text(460, 7, '', TEXT_STYLE);
		this.scoreText = scene.add.text(630, 7, '0', TEXT_STYLE);
		for (const item of [this.graphics, ...labels, this.missionText, this.scoreText]) {
			item.setScrollFactor(0).setDepth(100);
		}
		this.refresh();
	}

	/** Redraw from the current status and mission. Call after changing fuel, life, score or cargo. */
	refresh(): void {
		this.graphics.clear();
		this.drawGauge(GAUGES.life, this.status.life);
		this.drawGauge(GAUGES.fuel, this.status.fuel);
		const { delivered, total, aboard } = this.mission;
		this.missionText.setText(`${delivered}/${total}` + (aboard > 0 ? ` +${aboard}` : ''));
		this.scoreText.setText(String(this.status.score));
	}

	drawGauge({ x, y, width, height, color }: Gauge, amount: number): void {
		const filled = (width * amount) / MAX_GAUGE;
		this.graphics.fillStyle(color).fillRect(x - 1, y - 1, width + 2, height + 2);
		this.graphics.lineStyle(2, OUTLINE_COLOR).strokeRect(x - 1, y - 1, width + 2, height + 2);
		this.graphics.fillStyle(EMPTY_COLOR).fillRect(x + filled, y, width - filled, height);
	}
}
