import { describe, expect, it } from 'vitest';
import { PATROL_SPEED, reversePatrol } from '../../js/logic/patrol.js';

describe('reversePatrol', () => {
	it('turns a right-walker left', () => {
		expect(reversePatrol('dude-right')).toEqual({ anim: 'dude-left', velocityX: -PATROL_SPEED });
	});

	it('turns a left-walker right', () => {
		expect(reversePatrol('dude-left')).toEqual({ anim: 'dude-right', velocityX: PATROL_SPEED });
	});

	it('leaves any other animation alone', () => {
		expect(reversePatrol('dude-turn')).toBeNull();
	});
});
