import { describe, expect, it } from 'vitest';
import { objectSpawnPosition, objectsWithGid } from '../../js/logic/tiled.ts';

describe('objectSpawnPosition', () => {
	it('lifts the sprite by its texture height (Tiled tile objects sit on their bottom edge)', () => {
		expect(objectSpawnPosition({ x: 137, y: 1008 }, 48)).toEqual({ x: 137, y: 960 });
	});
});

describe('objectsWithGid', () => {
	it('selects only the objects using the given tile gid', () => {
		const layer = { objects: [{ name: 'a', gid: 69 }, { name: 'b', gid: 71 }, { name: 'c', gid: 69 }] };
		expect(objectsWithGid(layer, 69).map((o) => o.name)).toEqual(['a', 'c']);
	});

	it('returns nothing for a missing layer', () => {
		expect(objectsWithGid(null, 69)).toEqual([]);
	});
});
