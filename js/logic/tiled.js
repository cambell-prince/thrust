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
