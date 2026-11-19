export const PATROL_SPEED = 30;

/** The animation and velocity a walking collectable switches to when it meets a wall. */
export function reversePatrol(currentAnim) {
	if (currentAnim === 'dude-right') {
		return { anim: 'dude-left', velocityX: -PATROL_SPEED };
	}
	if (currentAnim === 'dude-left') {
		return { anim: 'dude-right', velocityX: PATROL_SPEED };
	}
	return null;
}
