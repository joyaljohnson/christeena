"""Turn the source artwork in artwork/ into web-ready files in assets/.

Run with a Python that has Pillow:  python tools/process_art.py
Line art (black on white) becomes black-on-transparent WebP, used as a CSS mask
and painted gold in the page. The seal gets its white background removed.
"""
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / "artwork", ROOT / "assets"
OUT.mkdir(exist_ok=True)


def clamp(v):
    return max(0, min(255, int(v)))


def crop_to_alpha(img, pad):
    box = img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    l, t, r, b = box
    w, h = img.size
    return img.crop((max(0, l - pad), max(0, t - pad), min(w, r + pad), min(h, b + pad)))


def line_art(name, out, max_w):
    g = Image.open(SRC / name).convert("L")
    # dark lines -> opaque, white paper -> transparent
    alpha = g.point(lambda v: clamp((238 - v) * 255 / (238 - 70)))
    img = Image.new("RGBA", g.size, (0, 0, 0, 0))
    img.putalpha(alpha)
    img = crop_to_alpha(img, 6)
    if img.width > max_w:
        img = img.resize((max_w, round(img.height * max_w / img.width)), Image.LANCZOS)
    img.save(OUT / out, "WEBP", quality=90, method=6)
    print(out, img.size)


def seal():
    im = Image.open(SRC / "seal.png").convert("RGB")
    r, g, b = im.split()
    # gold wax has a low blue channel; the white backdrop is ~255
    alpha = b.point(lambda v: clamp((247 - v) * 255 / 40))
    im = im.convert("RGBA")
    im.putalpha(alpha)
    im = crop_to_alpha(im, 2)
    s = 480
    im = im.resize((s, round(im.height * s / im.width)), Image.LANCZOS)
    im.save(OUT / "seal.webp", "WEBP", quality=82, method=6)
    print("seal.webp", im.size)
    # icons on ivory
    for size, fname, inset in ((180, "apple-touch-icon.png", 0.12), (64, "favicon.png", 0.02)):
        bg = Image.new("RGBA", (size, size), (251, 247, 239, 255))
        inner = round(size * (1 - 2 * inset))
        icon = im.resize((inner, inner), Image.LANCZOS)
        bg.alpha_composite(icon, ((size - inner) // 2, (size - inner) // 2))
        bg.convert("RGB").save(OUT / fname, optimize=True)
        print(fname, size)


def paper():
    im = Image.open(SRC / "paper.jpg").convert("RGB")
    im.save(OUT / "paper.jpg", "JPEG", quality=78, optimize=True, progressive=True)
    print("paper.jpg", im.size)


if __name__ == "__main__":
    line_art("floral-corner.png", "floral-corner.webp", 1024)
    line_art("floral-divider.png", "floral-divider.webp", 1400)
    line_art("emblem-rings.png", "emblem-rings.webp", 800)
    seal()
    paper()
