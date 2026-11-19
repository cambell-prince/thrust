import { describe, expect, it } from 'vitest';
import { ShipStatus } from '../../js/logic/shipStatus.js';

describe('ShipStatus', () => {
	it('starts full with no score', () => {
		const status = new ShipStatus();
		expect([status.fuel, status.life, status.score]).toEqual([100, 100, 0]);
		expect(status.isDead).toBe(false);
	});

	it('clamps fuel and life to 0..100 and returns the new value', () => {
		const status = new ShipStatus();
		expect(status.setFuel(-5)).toBe(0);
		expect(status.setLife(150)).toBe(100);
		expect(status.setLife(40)).toBe(40);
	});

	it('is dead once life reaches zero', () => {
		const status = new ShipStatus();
		status.setLife(status.life - 120);
		expect(status.isDead).toBe(true);
	});

	it('accumulates score', () => {
		const status = new ShipStatus();
		status.changeScore(100);
		expect(status.changeScore(500)).toBe(600);
	});

	it('resets to the starting values', () => {
		const status = new ShipStatus();
		status.setFuel(10);
		status.setLife(10);
		status.changeScore(50);
		status.reset();
		expect([status.fuel, status.life, status.score]).toEqual([100, 100, 0]);
	});
});
