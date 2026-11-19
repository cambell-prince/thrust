import { describe, expect, it } from 'vitest';
import { canUnload, FLOOR_TOLERANCE, HABITAT_RANGE, LANDED_SPEED, Mission, UPRIGHT_TOLERANCE } from '../../js/logic/mission.js';

describe('Mission', () => {
	it('starts with nothing aboard or delivered', () => {
		const mission = new Mission(2);
		expect(mission).toMatchObject({ total: 2, aboard: 0, delivered: 0 });
		expect(mission.hasCargo).toBe(false);
		expect(mission.isComplete).toBe(false);
	});

	it('counts pickups as cargo', () => {
		const mission = new Mission(2);
		mission.pickUp();
		mission.pickUp();
		expect(mission.aboard).toBe(2);
		expect(mission.hasCargo).toBe(true);
	});

	it('moves one dude from aboard to delivered per unload', () => {
		const mission = new Mission(2);
		mission.pickUp();
		mission.pickUp();
		expect(mission.unloadOne()).toBe(true);
		expect(mission).toMatchObject({ aboard: 1, delivered: 1 });
		expect(mission.isComplete).toBe(false);
		expect(mission.unloadOne()).toBe(true);
		expect(mission).toMatchObject({ aboard: 0, delivered: 2 });
		expect(mission.isComplete).toBe(true);
	});

	it('cannot unload with nothing aboard', () => {
		const mission = new Mission(1);
		expect(mission.unloadOne()).toBe(false);
		expect(mission).toMatchObject({ aboard: 0, delivered: 0 });
	});

	it('is not complete while some dudes are still in the cave', () => {
		const mission = new Mission(2);
		mission.pickUp();
		mission.unloadOne();
		expect(mission.isComplete).toBe(false);
	});

	it('stays complete when more are delivered than the total', () => {
		const mission = new Mission(1);
		mission.pickUp();
		mission.pickUp();
		mission.unloadOne();
		mission.unloadOne();
		expect(mission.isComplete).toBe(true);
	});

	it('is never complete for a level with no dudes', () => {
		expect(new Mission(0).isComplete).toBe(false);
	});
});

describe('canUnload', () => {
	const habitat = { x: 128, width: 48, floorY: 336 };
	const landed = { onFloor: true, angle: -90, speed: 0, shipX: 100, shipBottom: 336, habitat };

	it('allows a ship landed upright and still beside the habitat', () => {
		expect(canUnload(landed)).toBe(true);
	});

	it('refuses a ship in the air', () => {
		expect(canUnload({ ...landed, onFloor: false })).toBe(false);
	});

	it('refuses a ship that is not upright', () => {
		expect(canUnload({ ...landed, angle: -90 + UPRIGHT_TOLERANCE + 1 })).toBe(false);
		expect(canUnload({ ...landed, angle: -90 - UPRIGHT_TOLERANCE - 1 })).toBe(false);
		expect(canUnload({ ...landed, angle: -90 + UPRIGHT_TOLERANCE })).toBe(true);
	});

	it('refuses a ship that is still moving', () => {
		expect(canUnload({ ...landed, speed: LANDED_SPEED + 1 })).toBe(false);
		expect(canUnload({ ...landed, speed: LANDED_SPEED })).toBe(true);
	});

	it('refuses a ship too far to the left or right', () => {
		expect(canUnload({ ...landed, shipX: habitat.x - HABITAT_RANGE - 1 })).toBe(false);
		expect(canUnload({ ...landed, shipX: habitat.x + habitat.width + HABITAT_RANGE + 1 })).toBe(false);
	});

	it('allows the edges of the range and over the habitat itself', () => {
		expect(canUnload({ ...landed, shipX: habitat.x - HABITAT_RANGE })).toBe(true);
		expect(canUnload({ ...landed, shipX: habitat.x + habitat.width + HABITAT_RANGE })).toBe(true);
		expect(canUnload({ ...landed, shipX: habitat.x + 10 })).toBe(true);
	});

	it('refuses a ship landed on a different floor below or above', () => {
		expect(canUnload({ ...landed, shipBottom: 640 })).toBe(false);
		expect(canUnload({ ...landed, shipBottom: 100 })).toBe(false);
		expect(canUnload({ ...landed, shipBottom: 336 + FLOOR_TOLERANCE })).toBe(true);
		expect(canUnload({ ...landed, shipBottom: 336 - FLOOR_TOLERANCE })).toBe(true);
		expect(canUnload({ ...landed, shipBottom: 336 + FLOOR_TOLERANCE + 1 })).toBe(false);
		expect(canUnload({ ...landed, shipBottom: 336 - FLOOR_TOLERANCE - 1 })).toBe(false);
	});
});
