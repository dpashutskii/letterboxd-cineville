"""Turn any screenshot into a Chrome Web Store screenshot: exactly 1280x800,
24-bit RGB (no alpha), without stretching. The image is scaled to fit and
centered on a solid background (letterboxed) so the aspect ratio is preserved.

Usage:
    python3 scripts/store_screenshot.py <input-image> [output.png] [#bgcolor]
"""
import sys
from PIL import Image

W, H = 1280, 800

inp = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else "dist/screenshot-1280x800.png"
bg = sys.argv[3] if len(sys.argv) > 3 else "#ffffff"

img = Image.open(inp).convert("RGB")
scale = min(W / img.width, H / img.height)
nw, nh = max(1, round(img.width * scale)), max(1, round(img.height * scale))
img = img.resize((nw, nh), Image.LANCZOS)

canvas = Image.new("RGB", (W, H), bg)  # RGB => 24-bit, no alpha
canvas.paste(img, ((W - nw) // 2, (H - nh) // 2))
canvas.save(out)
print(f"wrote {out} {canvas.size}")
