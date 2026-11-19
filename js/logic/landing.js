export const UPRIGHT_ANGLE = -90;

const LANDING_TOLERANCE = 45;

/**
 * Whether a ship touching the walls should be tweened back to upright:
 * it is on the floor, roughly nose-up, not already upright, and not already
 * being uprighted.
 */
export function shouldUpright({ angle, onFloor, tweenPlaying }) {
	if (tweenPlaying || !onFloor) {
		return false;
	}
	const offset = Math.abs(angle - UPRIGHT_ANGLE);
	return offset > 0.0001 && offset < LANDING_TOLERANCE;
}
