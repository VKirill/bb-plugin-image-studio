"""PM acceptance checks for texture-uv outputs (run in background Blender).

  Blender -b --factory-startup --python guide_check.py -- guide <dir>    # guide.png + mask.png of fire-mop without concept
  Blender -b --factory-startup --python guide_check.py -- preview <dir>  # preview.png from apply

Exits 1 with the failing measure printed.
"""
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
mode, folder = argv[0], argv[1]


def load(name):
    img = bpy.data.images.load(f"{folder}/{name}")
    return img.size[0], img.size[1], img.pixels[:]


def fail(msg):
    print("CHECK FAIL", msg)
    sys.exit(1)


if mode == "guide":
    w, h, g = load("guide.png")
    _, _, m = load("mask.png")
    blue = brown = inside = 0
    lum = 0.0
    for i in range(0, len(g), 4):
        if m[i] < 0.5:
            continue
        r, gg, b = g[i], g[i + 1], g[i + 2]
        inside += 1
        lum += 0.2126 * r + 0.7152 * gg + 0.0722 * b
        if b > r + 0.15 and b > 0.25:
            blue += 1
        if r > gg > b and r - b > 0.12 and r > 0.3:
            brown += 1
    mean = lum / max(inside, 1)
    print("GUIDE inside", inside, "blue", blue, "brown", brown, "mean_lum", round(mean, 3))
    if blue < 3000:
        fail("the blue tape of the model's own texture is missing from the guide")
    if brown < 3000:
        fail("the brown handle of the model's own texture is missing from the guide")
    if mean < 0.35:
        fail("the guide is too dark (mean luminance of the pieces < 0.35)")
elif mode == "preview":
    w, h, p = load("preview.png")
    tw, th = w // 2, h // 2
    for tx, ty, name in ((0, 1, "before-front"), (1, 1, "before-back")):
        x0, y0 = tx * tw, ty * th  # Blender pixel rows start at the bottom: ty=1 is the top row
        c = (y0 * w + x0) * 4
        bg = p[c:c + 3]
        rows = set()
        cols = set()
        edge = 0
        lum = 0.0
        n = 0
        for y in range(y0, y0 + th, 2):
            for x in range(x0, x0 + tw, 2):
                i = (y * w + x) * 4
                if abs(p[i] - bg[0]) + abs(p[i + 1] - bg[1]) + abs(p[i + 2] - bg[2]) > 0.08:
                    rows.add(y)
                    cols.add(x)
                    if x - x0 < tw * 0.02 or x0 + tw - x < tw * 0.02 or y - y0 < th * 0.02 or y0 + th - y < th * 0.02:
                        edge += 1
                    lum += 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]
                    n += 1
        span = (max(rows) - min(rows)) / th if rows else 0
        mean = lum / max(n, 1)
        box_area = ((max(rows) - min(rows)) * (max(cols) - min(cols)) / (tw * th)) if rows else 0
        print("BOX_AREA", name, round(box_area, 3))
        if box_area < 0.3:
            fail(f"{name}: the model's bounding box covers under 30% of the tile (tile shape does not follow the model)")
        print("PREVIEW", name, "height_fraction", round(span, 3), "edge_pixels", edge, "mean_lum", round(mean, 3))
        if span < 0.6:
            fail(f"{name}: the model fills less than 60% of the tile height")
        if span > 0.92 or edge > 0:
            fail(f"{name}: the model is cropped or touches the tile edge (height fraction {round(span, 3)}, {edge} edge pixels)")
        if mean < 0.25:
            fail(f"{name}: the model is too dark (mean luminance < 0.25)")
else:
    fail("usage: guide|preview <dir>")
print("CHECK OK", mode)
