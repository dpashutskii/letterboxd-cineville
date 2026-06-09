"""Generate the extension icons (16/48/128) — a white star on a Cineville-coral
rounded square. Run inside a venv with Pillow installed."""
import math
import os
from PIL import Image, ImageDraw

CORAL = (232, 85, 63, 255)    # Cineville coral accent
WHITE = (255, 255, 255, 255)
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
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=CORAL)
    pts = star_points(s / 2, s / 2 * 1.04, s * 0.34, s * 0.155)
    d.polygon(pts, fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
for size in (16, 48, 128):
    make(size).save(os.path.join(OUT, f"icon{size}.png"))
    print("wrote", f"icons/icon{size}.png")
