#!/usr/bin/env python3
"""Draws public/assets/habitat.png: a 48x48 pixel-art dome habitat with a door at the bottom centre.

Run from the repo root:  python3 src/assets/habitat/make_habitat.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

SIZE = 48
OUT = Path(__file__).resolve().parents[3] / 'public' / 'assets' / 'habitat.png'

HULL = (150, 160, 175, 255)
HULL_SHADE = (95, 105, 125, 255)
DOME = (120, 170, 210, 255)
DOME_SHINE = (190, 225, 245, 255)
OUTLINE = (30, 35, 45, 255)
DOOR = (25, 25, 30, 255)
LIGHT = (255, 210, 90, 255)

img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Antenna
d.line([(24, 4), (24, 12)], fill=OUTLINE)
d.point((24, 3), fill=LIGHT)
# Dome: upper half of an ellipse
d.pieslice([6, 10, 41, 45], 180, 360, fill=DOME, outline=OUTLINE)
d.arc([11, 14, 30, 36], 200, 260, fill=DOME_SHINE)
# Base
d.rectangle([3, 28, 44, 47], fill=HULL, outline=OUTLINE)
d.rectangle([4, 41, 43, 46], fill=HULL_SHADE)
# Windows
for x in (8, 34):
    d.rectangle([x, 32, x + 5, 36], fill=LIGHT, outline=OUTLINE)
# Door, bottom centre (x 20..27, bottom 14 px)
d.rectangle([20, 34, 27, 47], fill=DOOR, outline=OUTLINE)

OUT.parent.mkdir(parents=True, exist_ok=True)
img.save(OUT)
print(f'wrote {OUT}')
