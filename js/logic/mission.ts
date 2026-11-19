import { UPRIGHT_ANGLE } from './landing.ts';

/** How far (px) either side of the habitat a landed ship may be and still unload. */
export const HABITAT_RANGE = 64;
/** The fastest (px/s) a ship can be moving and still count as landed. */
export const LANDED_SPEED = 5;
/** How far (degrees) from upright a landed ship may lean and still unload. */
export const UPRIGHT_TOLERANCE = 5;
/** How far (px) the ship's bottom may be from the habitat's floor and still count as on that floor. */
export const FLOOR_TOLERANCE = 8;

/** The rescue mission: how many dudes the level holds, how many are aboard and how many are home. */
export class Mission {
	total: number;
	aboard = 0;
	delivered = 0;

	constructor(total: number) {
		this.total = total;
	}

	pickUp(): void {
		this.aboard += 1;
	}

	/** Move one dude from the ship to the habitat. False when nobody is aboard. */
	unloadOne(): boolean {
		if (this.aboard === 0) {
			return false;
		}
		this.aboard -= 1;
		this.delivered += 1;
		return true;
	}

	get hasCargo(): boolean {
		return this.aboard > 0;
	}

	get isComplete(): boolean {
		return this.total > 0 && this.delivered >= this.total;
	}
}

export interface UnloadCheck {
	onFloor: boolean;
	angle: number;
	speed: number;
	shipX: number;
	shipBottom: number;
	/** The habitat rectangle's left edge, width and floor height. */
	habitat: { x: number; width: number; floorY: number };
}

/**
 * Whether a ship can unload at the habitat: on the floor, upright, nearly still,
 * within HABITAT_RANGE of the habitat's left or right edge, and standing on the habitat's
 * floor (the ship's bottom within FLOOR_TOLERANCE of it), not some other floor of the cave.
 */
export function canUnload({ onFloor, angle, speed, shipX, shipBottom, habitat }: UnloadCheck): boolean {
	if (!onFloor || speed > LANDED_SPEED) {
		return false;
	}
	if (Math.abs(shipBottom - habitat.floorY) > FLOOR_TOLERANCE) {
		return false;
	}
	if (Math.abs(angle - UPRIGHT_ANGLE) > UPRIGHT_TOLERANCE) {
		return false;
	}
	return shipX >= habitat.x - HABITAT_RANGE && shipX <= habitat.x + habitat.width + HABITAT_RANGE;
}
