/** Tile gids in tiles-1 that are scenery rather than wall (-1 is an empty cell). */
export const NON_SOLID_TILES = [-1, 13, 14, 15, 16, 46, 47, 48, 49, 50, 51];

/** The parts of a Tiled object the game reads. Phaser's Tiled objects match this. */
export interface TiledObject {
	x?: number;
	y?: number;
	gid?: number;
	name?: string;
	width?: number;
	height?: number;
}

/** The parts of a Tiled object layer the game reads. */
export interface TiledObjectLayer<T extends TiledObject = TiledObject> {
	objects: T[];
}

/** The objects in a Tiled object layer that use the given tile gid. */
export function objectsWithGid<T extends TiledObject>(objectLayer: TiledObjectLayer<T> | null | undefined, gid: number): T[] {
	return objectLayer ? objectLayer.objects.filter((obj) => obj.gid === gid) : [];
}

/**
 * Where to place a sprite for a Tiled tile object. Tile objects are anchored
 * at their bottom-left corner, so the sprite is lifted by its texture height
 * (the same placement Phaser 2's createFromObjects used).
 */
export function objectSpawnPosition(obj: TiledObject, textureHeight: number): { x: number; y: number } {
	return { x: obj.x ?? 0, y: (obj.y ?? 0) - textureHeight };
}
