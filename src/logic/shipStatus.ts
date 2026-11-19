export const MAX_GAUGE = 100;

function clampGauge(amount: number): number {
	return Math.min(MAX_GAUGE, Math.max(0, amount));
}

/** Fuel, life and score: the state behind the scoreboard. */
export class ShipStatus {
	fuel = MAX_GAUGE;
	life = MAX_GAUGE;
	score = 0;

	reset(): void {
		this.fuel = MAX_GAUGE;
		this.life = MAX_GAUGE;
		this.score = 0;
	}

	setFuel(amount: number): number {
		this.fuel = clampGauge(amount);
		return this.fuel;
	}

	setLife(amount: number): number {
		this.life = clampGauge(amount);
		return this.life;
	}

	changeScore(change: number): number {
		this.score += change;
		return this.score;
	}

	get isDead(): boolean {
		return this.life <= 0;
	}
}
