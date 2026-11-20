import { describe, expect, it } from 'vitest';
import { gameOverReason } from '../../src/logic/gameOver.ts';

describe('gameOverReason', () => {
	const flying = { life: 100, fuel: 100, shipAtRest: false, deliveryPending: false };

	it('is null while the ship has life and fuel', () => {
		expect(gameOverReason(flying)).toBeNull();
		expect(gameOverReason({ ...flying, shipAtRest: true })).toBeNull();
	});

	it('ends the game when the ship is destroyed, whatever else holds', () => {
		expect(gameOverReason({ ...flying, life: 0 })).toBe('SHIP DESTROYED');
		expect(gameOverReason({ ...flying, life: 0, fuel: 0, shipAtRest: true, deliveryPending: true })).toBe('SHIP DESTROYED');
	});

	it('waits for a ship out of fuel to come to rest', () => {
		expect(gameOverReason({ ...flying, fuel: 0 })).toBeNull();
		expect(gameOverReason({ ...flying, fuel: 0, shipAtRest: true })).toBe('OUT OF FUEL');
	});

	it('lets a ship out of fuel finish a delivery', () => {
		expect(gameOverReason({ ...flying, fuel: 0, shipAtRest: true, deliveryPending: true })).toBeNull();
	});
});
