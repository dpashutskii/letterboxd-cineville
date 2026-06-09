"""Generate the extension icons (16/48/128) — a Letterboxd-green star on a dark
rounded square. Run via the venv created in scripts/package notes."""
import math
import os
from PIL import Image, ImageDraw

DARK = (20, 24, 28, 255)      # Letterboxd dark
GREEN = (0, 224, 84, 255)     # Letterboxd green
OUT = os.path.join(os.path.dirname(__file__), "..", "icons")


def star_points(cx, cy, outer, inner, n=5, rot=-math.pi / 2):
    pts = []
    for i in range(n * 2):
        r = outer if i % 2 == 0 else inner
        a = rot + i * math.pi / n
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def make(size):
    s = size * 4  # supersample for crisp edges
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=DARK)
    pts = star_points(s / 2, s / 2 * 1.04, s * 0.34, s * 0.155)
    d.polygon(pts, fill=GREEN)
    return img.resize((size, size), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
for size in (16, 48, 128):
    make(size).save(os.path.join(OUT, f"icon{size}.png"))
    print("wrote", f"icons/icon{size}.png")
