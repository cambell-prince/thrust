/** A repeat limiter driven by the scene clock (milliseconds). */
export class Cooldown {
	constructor(interval) {
		this.interval = interval;
		this.readyAt = -Infinity;
	}

	ready(now) {
		return now > this.readyAt;
	}

	trigger(now, interval = this.interval) {
		this.readyAt = now + interval;
	}
}
