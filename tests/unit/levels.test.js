import { describe, expect, it } from 'vitest';
import {
	isLastLevel, LEVELS, levelIndexFromSearch, nextLevelIndex, shipStartPosition,
	SHIP_BODY_LEFT, SHIP_BODY_RIGHT, SHIP_START_ABOVE, SHIP_START_BESIDE, SHIP_START_MARGIN, SHIP_START_MIN_Y,
} from '../../js/logic/levels.js';

describe('LEVELS', () => {
	it('lists level1 then level2 with their map files', () => {
		expect(LEVELS).toEqual([
			{ key: 'level1', file: 'level1.json' },
			{ key: 'level2', file: 'level2.json' },
		]);
	});
});

describe('progression', () => {
	it('knows the last level', () => {
		expect(isLastLevel(0)).toBe(false);
		expect(isLastLevel(LEVELS.length - 1)).toBe(true);
	});

	it('advances to the next level and wraps to the first after the last', () => {
		expect(nextLevelIndex(0)).toBe(1);
		expect(nextLevelIndex(LEVELS.length - 1)).toBe(0);
	});

	it('treats an index past the last level as the last, and wraps any bad index to the first', () => {
		expect(isLastLevel(5)).toBe(true);
		expect(nextLevelIndex(5)).toBe(0);
		expect(nextLevelIndex(-1)).toBe(0);
		expect(nextLevelIndex(0.5)).toBe(0);
		expect(nextLevelIndex(NaN)).toBe(0);
	});
});

describe('levelIndexFromSearch', () => {
	it('reads a 1-based ?level= as a 0-based index', () => {
		expect(levelIndexFromSearch('?level=1')).toBe(0);
		expect(levelIndexFromSearch('?level=2')).toBe(1);
		expect(levelIndexFromSearch('?foo=bar&level=2')).toBe(1);
	});

	it('falls back to the first level for a missing or bad value', () => {
		for (const search of ['', '?', '?level=', '?level=0', '?level=3', '?level=abc', '?level=1.5', '?level=-1']) {
			expect(levelIndexFromSearch(search), search).toBe(0);
		}
	});
});

describe('shipStartPosition', () => {
	const habitat = { x: 128, y: 288, width: 48 };

	it('starts the ship to the left of the habitat, above it', () => {
		expect(shipStartPosition(habitat, 1024)).toEqual({ x: 128 - SHIP_START_BESIDE, y: 288 - SHIP_START_ABOVE });
	});

	it('starts on the right when there is no room on the left', () => {
		const nearEdge = { x: 40, y: 288, width: 48 };
		expect(shipStartPosition(nearEdge, 1024).x).toBe(40 + 48 + SHIP_START_BESIDE);
	});

	it('keeps the start inside the map', () => {
		expect(shipStartPosition({ x: 128, y: 100, width: 48 }, 1024).y).toBe(SHIP_START_MIN_Y);
		expect(shipStartPosition({ x: 20, y: 288, width: 1000 }, 1024).x).toBe(1024 - SHIP_START_MARGIN);
		// left -28 is under the margin; right 20 + 130 + 48 = 198 is over 200 - 40, so the upper clamp applies.
		expect(shipStartPosition({ x: 20, y: 288, width: 130 }, 200).x).toBe(200 - SHIP_START_MARGIN);
	});

	it('tries the other side when the clamped start lands on the habitat', () => {
		// Both sides overlap the habitat: the 984 start (body 962..1008) and the 40 start (body 18..64, over x 60).
		// This was 40 before the body width counted; now the first clamped value is kept.
		expect(shipStartPosition({ x: 60, y: 288, width: 940 }, 1024).x).toBe(1024 - SHIP_START_MARGIN);
	});

	it('counts the ship body, not just its x, as over the habitat', () => {
		expect(SHIP_BODY_LEFT).toBe(22);
		expect(SHIP_BODY_RIGHT).toBe(24);
		// The right start clamps to 984 (body 962..1008), past the habitat's right edge (974) by x alone but
		// overlapping it by body; the left start 40 (body 18..64) is clear of the habitat at 80.
		expect(shipStartPosition({ x: 80, y: 288, width: 894 }, 1024).x).toBe(40);
	});

	it('keeps the clamped start when neither side is off the habitat', () => {
		expect(shipStartPosition({ x: 35, y: 288, width: 960 }, 1024).x).toBe(1024 - SHIP_START_MARGIN);
	});
});
