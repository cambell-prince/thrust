/**
 * Read a numeric custom property from a Tiled map.
 *
 * Old Tiled exports store properties as an object of strings
 * (`{ lifeExpense: '20' }`); newer ones use an array of
 * `{ name, type, value }`. Both are accepted.
 */
export function numberProperty(properties, name, fallback) {
	let value;
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
