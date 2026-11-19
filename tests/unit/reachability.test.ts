import { describe, expect, it } from 'vitest';
import { reachableBoxes } from '../helpers/reachability.ts';

/** Build a grid from rows of '#' (solid) and '.' (open). */
function grid(rows: string[]) {
	const height = rows.length;
	const width = rows[0].length;
	const data = rows.join('').split('').map((ch): number => (ch === '#' ? 1 : 0));
	return { data, width, height, solid: (gid: number) => gid !== 0 };
}

describe('reachableBoxes', () => {
	it('floods every box position in an open room', () => {
		const g = grid(['.....', '.....', '.....', '.....']);
		const boxes = reachableBoxes({ ...g, start: { col: 0, row: 0 } });
		// box positions: cols 0..2 × rows 0..1
		expect(boxes.size).toBe(6);
		expect(boxes.has('2,1')).toBe(true);
	});

	it('does not pass through a gap narrower than the box', () => {
		const g = grid([
			'...#...',
			'...#...',
			'.......',
			'...#...',
			'...#...',
		]);
		// The only gap in the wall is one tile high, so a 3x3 box can't cross it.
		const boxes = reachableBoxes({ ...g, start: { col: 0, row: 0 } });
		expect([...boxes].some((k) => Number(k.split(',')[0]) >= 4)).toBe(false);
	});

	it('passes through a gap as wide as the box', () => {
		const g = grid([
			'...#...',
			'.......',
			'.......',
			'.......',
			'...#...',
		]);
		const boxes = reachableBoxes({ ...g, start: { col: 0, row: 1 } });
		expect(boxes.has('4,1')).toBe(true);
	});

	it('is empty when the start is walled in', () => {
		const g = grid(['###', '#.#', '###']);
		expect(reachableBoxes({ ...g, start: { col: 1, row: 1 } }).size).toBe(0);
	});

	it('honours a custom box size', () => {
		const g = grid(['..#', '..#', '###']);
		expect(reachableBoxes({ ...g, start: { col: 0, row: 0 }, box: 2 })).toEqual(new Set(['0,0']));
	});
});
