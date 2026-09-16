"""
House-style cover tiles for the categories that have no painted art yet
(Hockey, Yu-Gi-Oh!, Comics).

The painted covers are 2:3 portraits with a dark hall, a warm glow from below
and a title plate reading THE VAULT / <CATEGORY>. These stand-ins copy the
geometry and the light so they sit in the same grid without looking like
placeholders: dark ground, radial glow, gold-edged plate, same title wording.
Swap them for real art when it exists; the filenames stay the same.
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

F = "/tmp/fonts"
W, H = 440, 660
GOLD   = (214, 176, 96)
ORANGE = (255, 107, 53)


def glow(img, cx, cy, r, colour, peak):
    lay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    g = ImageDraw.Draw(lay)
    steps = 60
    for i in range(steps, 0, -1):
        rr = r * i / steps
        a = int(peak * (1 - i / steps) ** 1.7)
        g.ellipse([cx - rr, cy - rr * 0.78, cx + rr, cy + rr * 0.78], fill=(*colour, a))
    return Image.alpha_composite(img.convert("RGBA"), lay).convert("RGB")


def cover(name, out):
    img = Image.new("RGB", (W, H), (9, 10, 20))
    # deep blue hall light, then the warm pool the real covers have at the plinth
    img = glow(img, W * 0.5, H * 0.34, W * 0.95, (40, 70, 150), 52)
    img = glow(img, W * 0.5, H * 0.74, W * 0.80, ORANGE, 70)
    img = glow(img, W * 0.5, H * 0.80, W * 0.45, (255, 196, 96), 60)

    d = ImageDraw.Draw(img)

    # plinth: three stacked ellipses catching the light from below
    for i, (rw, rh, col) in enumerate([(150, 26, (28, 24, 30)), (118, 20, (40, 33, 36)), (86, 14, (62, 48, 42))]):
        cy = H * 0.80 + i * 16
        d.ellipse([W / 2 - rw, cy - rh, W / 2 + rw, cy + rh], fill=col)

    # title plate
    pw, ph = 330, 92
    px, py = (W - pw) / 2, 34
    d.rounded_rectangle([px, py, px + pw, py + ph], radius=8, fill=(16, 15, 22))
    d.rounded_rectangle([px, py, px + pw, py + ph], radius=8, outline=GOLD, width=2)
    d.rounded_rectangle([px + 6, py + 6, px + pw - 6, py + ph - 6], radius=5,
                        outline=(GOLD[0] // 2, GOLD[1] // 2, GOLD[2] // 2), width=1)

    small = ImageFont.truetype(f"{F}/BarlowCondensed-Medium.ttf", 21)
    t = "THE VAULT"
    x = px + (pw - (sum(d.textlength(c, font=small) for c in t) + 3 * (len(t) - 1))) / 2
    for c in t:
        d.text((x, py + 15), c, font=small, fill=(196, 176, 140))
        x += d.textlength(c, font=small) + 3

    size = 46
    big = ImageFont.truetype(f"{F}/BarlowCondensed-Bold.ttf", size)
    while d.textlength(name, font=big) > pw - 34 and size > 22:
        size -= 2
        big = ImageFont.truetype(f"{F}/BarlowCondensed-Bold.ttf", size)
    d.text((px + (pw - d.textlength(name, font=big)) / 2, py + 40), name, font=big, fill=(245, 236, 216))

    # vignette so the edges fall away like the painted covers
    v = Image.new("L", (W, H), 0)
    ImageDraw.Draw(v).ellipse([-W * 0.30, -H * 0.18, W * 1.30, H * 1.18], fill=255)
    v = v.filter(ImageFilter.GaussianBlur(70))
    img = Image.composite(img, Image.new("RGB", (W, H), (5, 5, 12)), v)

    img.save(out, "JPEG", quality=84, optimize=True, progressive=True)
    print(f"{out}  {img.size}")


cover("HOCKEY",    "hockey.jpg")
cover("YU-GI-OH!", "yugioh.jpg")
cover("COMICS",    "comics.jpg")
cover("OTHER TCG", "other-tcg-generic.jpg")
