/** A repeat limiter driven by the scene clock (milliseconds). */
export class Cooldown {
	interval: number;
	readyAt = -Infinity;

	constructor(interval: number) {
		this.interval = interval;
	}

	ready(now: number): boolean {
		return now > this.readyAt;
	}

	trigger(now: number, interval: number = this.interval): void {
		this.readyAt = now + interval;
	}
}
