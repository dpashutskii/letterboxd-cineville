"""Turn any screenshot into a Chrome Web Store screenshot: exactly 1280x800,
24-bit RGB (no alpha), without stretching.

Modes:
  cover (default) — scale to fill 1280x800 and center-crop the overflow. Keeps
                    the original background intact (just trims edges).
  pad             — scale to fit and letterbox on a background color.

Usage:
    python3 scripts/store_screenshot.py <input> [output.png] [cover|pad] [anchor|#bg]

For cover: 4th arg is a vertical anchor — center (default), top, or bottom.
For pad:   4th arg is the background — auto (sample corners) or a hex color.
"""
import sys
from PIL import Image

W, H = 1280, 800

inp = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else "dist/screenshot-1280x800.png"
mode = sys.argv[3] if len(sys.argv) > 3 else "cover"
extra = sys.argv[4] if len(sys.argv) > 4 else None

img = Image.open(inp).convert("RGB")

if mode == "pad":
    bg = extra or "auto"
    if bg == "auto":
        p = max(4, min(img.width, img.height) // 40)
        boxes = [
            (0, 0, p, p),
            (img.width - p, 0, img.width, p),
            (0, img.height - p, p, img.height),
            (img.width - p, img.height - p, img.width, img.height),
        ]
        cols = [img.crop(b).resize((1, 1), Image.LANCZOS).getpixel((0, 0)) for b in boxes]
        bg = tuple(sum(c[i] for c in cols) // len(cols) for i in range(3))
    scale = min(W / img.width, H / img.height)
    nw, nh = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    img = img.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGB", (W, H), bg)
    canvas.paste(img, ((W - nw) // 2, (H - nh) // 2))
    out_img = canvas
else:  # cover
    anchor = extra or "center"
    scale = max(W / img.width, H / img.height)
    nw, nh = max(W, round(img.width * scale)), max(H, round(img.height * scale))
    img = img.resize((nw, nh), Image.LANCZOS)
    left = (nw - W) // 2
    if anchor == "top":
        top = 0
    elif anchor == "bottom":
        top = nh - H
    else:
        top = (nh - H) // 2
    out_img = img.crop((left, top, left + W, top + H))

out_img.save(out)
print(f"wrote {out} {out_img.size}")
