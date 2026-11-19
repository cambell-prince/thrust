#!/usr/bin/env bash
# Export Tiled maps to the JSON the game loads: public/assets/levelN.tmx -> levelN.json.
# With no arguments, exports every .tmx in public/assets/; otherwise the .tmx files given.
# Uses `tiled` from PATH, or the Flatpak (org.mapeditor.Tiled). Override with TILED="...".
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -n "${TILED:-}" ]; then
	read -r -a tiled <<< "$TILED"
elif command -v tiled > /dev/null; then
	tiled=(tiled)
elif command -v flatpak > /dev/null && flatpak info org.mapeditor.Tiled > /dev/null 2>&1; then
	tiled=(flatpak run --command=tiled org.mapeditor.Tiled)
else
	echo "Tiled not found: install it, or set TILED to its command." >&2
	exit 1
fi

if [ "$#" -eq 0 ]; then
	set -- public/assets/*.tmx
fi

for tmx in "$@"; do
	json="${tmx%.tmx}.json"
	# Absolute paths: the Flatpak's working directory isn't ours. Offscreen: no window needed.
	QT_QPA_PLATFORM=offscreen "${tiled[@]}" --export-map json "$PWD/$tmx" "$PWD/$json"
	echo "$tmx -> $json"
done
