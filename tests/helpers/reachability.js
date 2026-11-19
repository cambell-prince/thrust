/**
 * Flood-fill a tile grid for where a box-shaped craft can go.
 * Returns the "col,row" keys of the top-left tiles of every box × box window that is
 * free of solid tiles and reachable, by one-tile steps, from a free window that
 * contains the start tile.
 */
export function reachableBoxes({ data, width, height, solid, start, box = 3 }) {
	const free = (col, row) => {
		if (col < 0 || row < 0 || col + box > width || row + box > height) {
			return false;
		}
		for (let r = row; r < row + box; r++) {
			for (let c = col; c < col + box; c++) {
				if (solid(data[r * width + c])) {
					return false;
				}
			}
		}
		return true;
	};

	const seen = new Set();
	const queue = [];
	const visit = (col, row) => {
		const key = `${col},${row}`;
		if (!seen.has(key) && free(col, row)) {
			seen.add(key);
			queue.push([col, row]);
		}
	};
	for (let row = start.row - box + 1; row <= start.row; row++) {
		for (let col = start.col - box + 1; col <= start.col; col++) {
			visit(col, row);
		}
	}
	for (let i = 0; i < queue.length; i++) {
		const [col, row] = queue[i];
		visit(col + 1, row);
		visit(col - 1, row);
		visit(col, row + 1);
		visit(col, row - 1);
	}
	return seen;
}
