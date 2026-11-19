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
	return index === LEVELS.length - 1;
}

/** The level after `index`, or the first level after the last. */
export function nextLevelIndex(index) {
	return isLastLevel(index) ? 0 : index + 1;
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
	let x = habitat.x - SHIP_START_BESIDE;
	if (x < SHIP_START_MARGIN) {
		x = habitat.x + habitat.width + SHIP_START_BESIDE;
	}
	x = Math.min(Math.max(x, SHIP_START_MARGIN), mapWidth - SHIP_START_MARGIN);
	const y = Math.max(SHIP_START_MIN_Y, habitat.y - SHIP_START_ABOVE);
	return { x, y };
}
