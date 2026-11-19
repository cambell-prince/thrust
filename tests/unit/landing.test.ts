import { describe, expect, it } from 'vitest';
import { shouldUpright } from '../../src/logic/landing.ts';

describe('shouldUpright', () => {
	const landed = { angle: -100, onFloor: true, tweenPlaying: false };

	it('uprights a ship that has landed roughly nose-up', () => {
		expect(shouldUpright(landed)).toBe(true);
	});

	it('leaves a ship that is already upright', () => {
		expect(shouldUpright({ ...landed, angle: -90 })).toBe(false);
	});

	it('ignores a ship that is airborne or already being uprighted', () => {
		expect(shouldUpright({ ...landed, onFloor: false })).toBe(false);
		expect(shouldUpright({ ...landed, tweenPlaying: true })).toBe(false);
	});

	it('ignores a ship lying too far over (outside -135..-45 degrees)', () => {
		expect(shouldUpright({ ...landed, angle: -150 })).toBe(false);
		expect(shouldUpright({ ...landed, angle: -30 })).toBe(false);
	});
});
