/** The levels in play order: the Phaser cache key and the Tiled JSON file under assets/. */
export const LEVELS = [
	{ key: 'level1', file: 'level1.json' },
	{ key: 'level2', file: 'level2.json' },
];

/** How far (px) to the side of the habitat the ship starts, so it doesn't land on the dome. */
export const SHIP_START_BESIDE = 48;
/** How far (px) above the habitat's top the ship starts. */
export const SHIP_START_ABOVE = 200;
/** The highest (smallest y, px) the ship may start. */
export const SHIP_START_MIN_Y = 40;
/** The closest (px) the ship may start to the map's left or right edge. */
export const SHIP_START_MARGIN = 40;

export function isLastLevel(index) {
	return index >= LEVELS.length - 1;
}

/** The level after `index`; the first level after the last or for an index that is not a level. */
export function nextLevelIndex(index) {
	return Number.isInteger(index) && index >= 0 && index <= LEVELS.length - 2 ? index + 1 : 0;
}

/** The 0-based level index from a URL search string's 1-based `level`; 0 when missing or invalid. */
export function levelIndexFromSearch(search) {
	const value = new URLSearchParams(search).get('level');
	if (value === null || !/^\d+$/.test(value)) {
		return 0;
	}
	const index = Number(value) - 1;
	return index >= 0 && index < LEVELS.length ? index : 0;
}

/**
 * Where the ship starts: above the ground beside the habitat (left of it, or right
 * when the left is too near the map edge), kept inside the map.
 * `habitat` is the Tiled rectangle's `{ x, y, width }`.
 */
export function shipStartPosition(habitat, mapWidth) {
	const left = habitat.x - SHIP_START_BESIDE;
	const right = habitat.x + habitat.width + SHIP_START_BESIDE;
	const clamp = (value) => Math.min(Math.max(value, SHIP_START_MARGIN), mapWidth - SHIP_START_MARGIN);
	const onHabitat = (value) => value >= habitat.x && value <= habitat.x + habitat.width;
	const [first, other] = left < SHIP_START_MARGIN ? [right, left] : [left, right];
	let x = clamp(first);
	if (onHabitat(x) && !onHabitat(clamp(other))) {
		// The clamp pushed the start onto the habitat: use the other side.
		x = clamp(other);
	}
	const y = Math.max(SHIP_START_MIN_Y, habitat.y - SHIP_START_ABOVE);
	return { x, y };
}
