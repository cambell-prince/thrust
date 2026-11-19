/** A property in Tiled's newer array format. */
export interface TiledProperty {
	name: string;
	type?: string;
	value: unknown;
}

/** Map properties in either Tiled format: an array of `{ name, type, value }`, or an object of strings. */
export type TiledProperties = TiledProperty[] | Record<string, unknown> | null | undefined;

/**
 * Read a numeric custom property from a Tiled map.
 *
 * Old Tiled exports store properties as an object of strings
 * (`{ lifeExpense: '20' }`); newer ones use an array of
 * `{ name, type, value }`. Both are accepted.
 */
export function numberProperty(properties: TiledProperties, name: string, fallback: number): number {
	let value: unknown;
	if (Array.isArray(properties)) {
		const entry = properties.find((p) => p.name === name);
		value = entry ? entry.value : undefined;
	} else if (properties) {
		value = properties[name];
	}
	if (value === undefined || value === null || value === '') {
		return fallback;
	}
	const number = Number(value);
	return Number.isNaN(number) ? fallback : number;
}
