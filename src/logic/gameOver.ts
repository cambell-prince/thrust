/** Why the mission has failed, as the game-over banner names it. */
export type GameOverReason = 'SHIP DESTROYED' | 'OUT OF FUEL';

export interface GameOverCheck {
	life: number;
	fuel: number;
	/** The ship is on the floor, still and not being turned upright. */
	shipAtRest: boolean;
	/** Dudes are still walking into the habitat, or the ship can still unload some. */
	deliveryPending: boolean;
}

/**
 * Whether the mission has failed: the ship is destroyed, or it is out of fuel and has come to rest
 * with no delivery left to finish. Null while the mission can still go on.
 */
export function gameOverReason({ life, fuel, shipAtRest, deliveryPending }: GameOverCheck): GameOverReason | null {
	if (life <= 0) {
		return 'SHIP DESTROYED';
	}
	if (fuel <= 0 && shipAtRest && !deliveryPending) {
		return 'OUT OF FUEL';
	}
	return null;
}
