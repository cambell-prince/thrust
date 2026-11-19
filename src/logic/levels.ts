/** A level: its Phaser cache key and Tiled JSON file. */
export interface Level {
	/** The Phaser cache key. */
	key: string;
	/** The Tiled JSON file under assets/. */
	file: string;
}

/** The levels in play order. */
export const LEVELS: readonly Level[] = [
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
/** The ship's body spans this far (px) left and right of the start x (the 46 px body at offset 27 of the 70 px sprite, origin 0.7). */
export const SHIP_BODY_LEFT = 22;
export const SHIP_BODY_RIGHT = 24;
/** Enemies (the 72x32 arrow) are drawn at this scale; they turn about a pivot that must be half their width from rock. */
export const ENEMY_SCALE = 0.5;
/** The arrow texture's height (px), which objectSpawnPosition() lifts an enemy by. */
export const ENEMY_TEXTURE_HEIGHT = 32;

export function isLastLevel(index: number): boolean {
	return index >= LEVELS.length - 1;
}

/** The level after `index`; the first level after the last or for an index that is not a level. */
export function nextLevelIndex(index: number): number {
	return Number.isInteger(index) && index >= 0 && index <= LEVELS.length - 2 ? index + 1 : 0;
}

/** The 0-based level index from a URL search string's 1-based `level`; 0 when missing or invalid. */
export function levelIndexFromSearch(search: string): number {
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
export function shipStartPosition(habitat: { x: number; y: number; width: number }, mapWidth: number): { x: number; y: number } {
	const left = habitat.x - SHIP_START_BESIDE;
	const right = habitat.x + habitat.width + SHIP_START_BESIDE;
	const clamp = (value: number): number => Math.min(Math.max(value, SHIP_START_MARGIN), mapWidth - SHIP_START_MARGIN);
	const onHabitat = (value: number): boolean => value + SHIP_BODY_RIGHT > habitat.x && value - SHIP_BODY_LEFT < habitat.x + habitat.width;
	const [first, other] = left < SHIP_START_MARGIN ? [right, left] : [left, right];
	let x = clamp(first);
	if (onHabitat(x) && !onHabitat(clamp(other))) {
		// The clamp pushed the start onto the habitat: use the other side.
		x = clamp(other);
	}
	const y = Math.max(SHIP_START_MIN_Y, habitat.y - SHIP_START_ABOVE);
	return { x, y };
}
