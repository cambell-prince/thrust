import { describe, expect, it } from 'vitest';
import { numberProperty, stringProperty } from '../../src/logic/mapProperties.ts';

describe('numberProperty', () => {
	it('parses string values from the legacy Tiled object format', () => {
		expect(numberProperty({ lifeExpense: '20' }, 'lifeExpense', 0)).toBe(20);
	});

	it('reads the newer Tiled array format', () => {
		const props = [{ name: 'enemyShootTime', type: 'int', value: 2500 }];
		expect(numberProperty(props, 'enemyShootTime', 0)).toBe(2500);
	});

	it('falls back when the property is missing, empty or not numeric', () => {
		expect(numberProperty({}, 'fuelExpense', 1)).toBe(1);
		expect(numberProperty({ fuelExpense: '' }, 'fuelExpense', 1)).toBe(1);
		expect(numberProperty({ fuelExpense: 'lots' }, 'fuelExpense', 1)).toBe(1);
		expect(numberProperty(undefined, 'fuelExpense', 1)).toBe(1);
	});
});

describe('stringProperty', () => {
	it('reads the newer Tiled array format', () => {
		expect(stringProperty([{ name: 'music', type: 'string', value: 'music-stargazer' }], 'music', '')).toBe('music-stargazer');
	});

	it('reads the legacy Tiled object format', () => {
		expect(stringProperty({ music: 'music-spaceshooter' }, 'music', '')).toBe('music-spaceshooter');
	});

	it('falls back when the property is missing, empty or not a string', () => {
		expect(stringProperty([], 'music', 'none')).toBe('none');
		expect(stringProperty({ music: '' }, 'music', 'none')).toBe('none');
		expect(stringProperty({ music: 3 }, 'music', 'none')).toBe('none');
		expect(stringProperty(undefined, 'music', 'none')).toBe('none');
	});
});
