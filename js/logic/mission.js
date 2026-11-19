import { UPRIGHT_ANGLE } from './landing.js';

/** How far (px) either side of the habitat a landed ship may be and still unload. */
export const HABITAT_RANGE = 64;
/** The fastest (px/s) a ship can be moving and still count as landed. */
export const LANDED_SPEED = 5;
/** How far (degrees) from upright a landed ship may lean and still unload. */
export const UPRIGHT_TOLERANCE = 5;

/** The rescue mission: how many dudes the level holds, how many are aboard and how many are home. */
export class Mission {
	constructor(total) {
		this.total = total;
		this.aboard = 0;
		this.delivered = 0;
	}

	pickUp() {
		this.aboard += 1;
	}

	/** Move one dude from the ship to the habitat. False when nobody is aboard. */
	unloadOne() {
		if (this.aboard === 0) {
			return false;
		}
		this.aboard -= 1;
		this.delivered += 1;
		return true;
	}

	get hasCargo() {
		return this.aboard > 0;
	}

	get isComplete() {
		return this.total > 0 && this.delivered === this.total;
	}
}

/**
 * Whether a ship can unload at the habitat: on the floor, upright, nearly still,
 * and within HABITAT_RANGE of the habitat's left or right edge.
 * `habitat` is the habitat rectangle's left edge `x` and `width`.
 */
export function canUnload({ onFloor, angle, speed, shipX, habitat }) {
	if (!onFloor || speed > LANDED_SPEED) {
		return false;
	}
	if (Math.abs(angle - UPRIGHT_ANGLE) > UPRIGHT_TOLERANCE) {
		return false;
	}
	return shipX >= habitat.x - HABITAT_RANGE && shipX <= habitat.x + habitat.width + HABITAT_RANGE;
}
