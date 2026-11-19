import { describe, expect, it, test } from 'vitest';
import assert from 'node:assert/strict';
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
	test('reads the newer array format', () => {
		assert.equal(stringProperty([{ name: 'music', type: 'string', value: 'music-stargazer' }], 'music', ''), 'music-stargazer');
	});
	test('reads the old object-of-strings format', () => {
		assert.equal(stringProperty({ music: 'music-spaceshooter' }, 'music', ''), 'music-spaceshooter');
	});
	test('falls back when missing, empty or not a string', () => {
		assert.equal(stringProperty([], 'music', 'none'), 'none');
		assert.equal(stringProperty({ music: '' }, 'music', 'none'), 'none');
		assert.equal(stringProperty({ music: 3 }, 'music', 'none'), 'none');
		assert.equal(stringProperty(undefined, 'music', 'none'), 'none');
	});
});
