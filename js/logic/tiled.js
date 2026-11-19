/** Tile gids in tiles-1 that are scenery rather than wall (-1 is an empty cell). */
export const NON_SOLID_TILES = [-1, 13, 14, 15, 16, 46, 47, 48, 49, 50, 51];

/** The objects in a Tiled object layer that use the given tile gid. */
export function objectsWithGid(objectLayer, gid) {
	return objectLayer ? objectLayer.objects.filter((obj) => obj.gid === gid) : [];
}

/**
 * Where to place a sprite for a Tiled tile object. Tile objects are anchored
 * at their bottom-left corner, so the sprite is lifted by its texture height
 * (the same placement Phaser 2's createFromObjects used).
 */
export function objectSpawnPosition(obj, textureHeight) {
	return { x: obj.x, y: obj.y - textureHeight };
}
