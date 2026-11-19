export const MAX_GAUGE = 100;

function clampGauge(amount) {
	return Math.min(MAX_GAUGE, Math.max(0, amount));
}

/** Fuel, life and score: the state behind the scoreboard. */
export class ShipStatus {
	constructor() {
		this.reset();
	}

	reset() {
		this.fuel = MAX_GAUGE;
		this.life = MAX_GAUGE;
		this.score = 0;
	}

	setFuel(amount) {
		this.fuel = clampGauge(amount);
		return this.fuel;
	}

	setLife(amount) {
		this.life = clampGauge(amount);
		return this.life;
	}

	changeScore(change) {
		this.score += change;
		return this.score;
	}

	get isDead() {
		return this.life <= 0;
	}
}
