#!/usr/bin/env python3
"""Generate TableSnap icons and store promo images with Pillow.

Outputs:
  src/icons/icon16.png, icon48.png, icon128.png
  store_assets/promo_1_hero_1280x800.png, promo_2_formats_1280x800.png, small_tile_440x280.png
  docs/assets/icon128.png (+ promo copies for the landing page)

Usage:  python scripts/generate_assets.py
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ICONS_DIR = ROOT / "src" / "icons"
STORE_DIR = ROOT / "store_assets"
DOCS_ASSETS = ROOT / "docs" / "assets"


def ensure_pillow():
    try:
        import PIL  # noqa: F401
    except ImportError:
        print("[assets] Pillow not found, installing from requirements.txt …")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", str(ROOT / "requirements.txt")])


ensure_pillow()
from PIL import Image, ImageDraw, ImageFilter, ImageFont  # noqa: E402

# Brand palette
TEAL_900 = (4, 47, 46)
TEAL_800 = (17, 94, 89)
TEAL_700 = (15, 118, 110)
TEAL_500 = (20, 184, 166)
TEAL_300 = (94, 234, 212)
AMBER = (245, 158, 11)
WHITE = (255, 255, 255)
INK = (15, 23, 42)
SLATE = (100, 116, 139)
PAPER = (248, 250, 252)

FONT_CANDIDATES = {
    "bold": ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf",
             "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/Library/Fonts/Arial Bold.ttf"],
    "regular": ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/Library/Fonts/Arial.ttf"],
    "semibold": ["C:/Windows/Fonts/seguisb.ttf", "C:/Windows/Fonts/segoeuib.ttf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
    "mono": ["C:/Windows/Fonts/consola.ttf", "C:/Windows/Fonts/cour.ttf",
             "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"],
}


_FONT_CACHE: dict = {}


def font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    """TrueType only (never the bitmap fallback): glyphs render at true 1:1 proportions at any size."""
    key = (kind, size)
    if key in _FONT_CACHE:
        return _FONT_CACHE[key]
    for path in FONT_CANDIDATES[kind]:
        if Path(path).exists():
            _FONT_CACHE[key] = ImageFont.truetype(path, size, layout_engine=ImageFont.Layout.BASIC)
            return _FONT_CACHE[key]
    fallback = ImageFont.load_default(size=size)  # Pillow >= 10.1 bundles a FreeType font
    if not isinstance(fallback, ImageFont.FreeTypeFont):
        raise SystemExit(f"No TrueType font found for '{kind}'. Install DejaVu or Segoe UI fonts.")
    _FONT_CACHE[key] = fallback
    return fallback


def ellipsize(d, text: str, fnt, max_width: int) -> str:
    """Shortens text with '…' instead of ever squeezing it horizontally."""
    if d.textlength(text, font=fnt) <= max_width:
        return text
    while text and d.textlength(text + "…", font=fnt) > max_width:
        text = text[:-1]
    return text.rstrip() + "…"


def save_exact(img: Image.Image, path: Path, size: tuple[int, int]) -> None:
    """Guards against any accidental non-uniform scaling: the canvas must already be the target size."""
    if img.size != size:
        raise SystemExit(f"{path.name}: canvas {img.size} != {size} — refusing to stretch")
    img.convert("RGB").save(path, optimize=True)


def fit_font(d, texts, kind: str, max_size: int, max_width: int):
    """Largest font (<= max_size) where every text fits max_width."""
    size = max_size
    while size > 10:
        f = font(kind, size)
        if all(d.textlength(t, font=f) <= max_width for t in texts):
            return f
        size -= 2
    return font(kind, size)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size, top_left, bottom_right):
    w, h = size
    small = Image.new("RGB", (64, 64))
    px = small.load()
    for y in range(64):
        for x in range(64):
            px[x, y] = lerp(top_left, bottom_right, (x + y) / 126)
    return small.resize(size, Image.BICUBIC)


# --------------------------------------------------------------------------- icons

def draw_icon(size: int) -> Image.Image:
    """Teal rounded square with a white table sheet (amber header) and a 'snap' corner."""
    s = 16  # supersampling factor
    S = size * s
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bg = gradient((S, S), TEAL_500, TEAL_800).convert("RGBA")
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
    img.paste(bg, (0, 0), mask)
    d = ImageDraw.Draw(img)

    small = size <= 16
    pad = S * (0.17 if small else 0.2)
    x0, y0, x1, y1 = pad, pad * 1.05, S - pad, S - pad * 0.95
    radius = S * 0.06
    d.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=WHITE)
    # header band
    head_h = (y1 - y0) * (0.30 if small else 0.26)
    d.rounded_rectangle([x0, y0, x1, y0 + head_h], radius=radius, fill=AMBER)
    d.rectangle([x0, y0 + head_h - radius, x1, y0 + head_h], fill=AMBER)
    # grid lines
    line_w = max(int(S * (0.045 if small else 0.028)), 1)
    cols = 2 if small else 3
    rows = 2 if small else 3
    for i in range(1, cols):
        x = x0 + (x1 - x0) * i / cols
        d.line([(x, y0 + head_h), (x, y1 - radius * 0.5)], fill=TEAL_700, width=line_w)
    body_h = (y1 - y0 - head_h)
    for j in range(1, rows):
        y = y0 + head_h + body_h * j / rows
        d.line([(x0 + radius * 0.5, y), (x1 - radius * 0.5, y)], fill=TEAL_700, width=line_w)
    if not small:
        # snap corner brackets (selection) top-left & bottom-right
        bw = int(S * 0.045)
        L = S * 0.14
        o = S * 0.075
        for (cx, cy, dx, dy) in ((x0 - o, y0 - o, 1, 1), (x1 + o, y1 + o, -1, -1)):
            d.line([(cx, cy), (cx + dx * L, cy)], fill=WHITE, width=bw)
            d.line([(cx, cy), (cx, cy + dy * L)], fill=WHITE, width=bw)
    return img.resize((size, size), Image.LANCZOS)


# --------------------------------------------------------------------------- promo helpers

def shadowed_card(base: Image.Image, box, radius=24, fill=WHITE, shadow=36):
    x0, y0, x1, y1 = box
    sh = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([x0 + 8, y0 + 18, x1 + 8, y1 + 18], radius=radius, fill=(0, 0, 0, 110))
    sh = sh.filter(ImageFilter.GaussianBlur(shadow))
    base.alpha_composite(sh)
    ImageDraw.Draw(base).rounded_rectangle(box, radius=radius, fill=fill)


def pill(d: ImageDraw.ImageDraw, xy, text, fnt, fill, color):
    x, y = xy
    tw = d.textlength(text, font=fnt)
    h = fnt.size + 18
    d.rounded_rectangle([x, y, x + tw + 32, y + h], radius=h // 2, fill=fill)
    d.text((x + 16, y + h / 2), text, font=fnt, fill=color, anchor="lm")
    return x + tw + 32


def draw_mock_table(d, x, y, col_w, row_h, data, highlight=False):
    w = col_w * len(data[0])
    h = row_h * len(data)
    f_head, f_cell = font("semibold", 20), font("regular", 20)
    d.rectangle([x, y, x + w, y + row_h], fill=(226, 232, 240))
    for r, row in enumerate(data):
        for c, val in enumerate(row):
            fnt = f_head if r == 0 else f_cell
            numeric = r > 0 and c > 0
            tx = x + col_w * (c + 1) - 14 if numeric else x + col_w * c + 14
            d.text((tx, y + row_h * r + row_h / 2), val, font=fnt, fill=INK, anchor="rm" if numeric else "lm")
        if r:
            d.line([(x, y + row_h * r), (x + w, y + row_h * r)], fill=(226, 232, 240), width=2)
    if highlight:  # dashed outline, one side at a time
        ox0, oy0, ox1, oy1 = x - 8, y - 8, x + w + 8, y + h + 8
        for (ax, ay, bx, by) in ((ox0, oy0, ox1, oy0), (ox1, oy0, ox1, oy1), (ox1, oy1, ox0, oy1), (ox0, oy1, ox0, oy0)):
            length = max(abs(bx - ax), abs(by - ay))
            for s in range(0, int(length), 22):
                e = min(s + 12, length)
                d.line([(ax + (bx - ax) * s / length, ay + (by - ay) * s / length),
                        (ax + (bx - ax) * e / length, ay + (by - ay) * e / length)], fill=TEAL_500, width=4)
    return w, h


DATA = [
    ["Country", "Population", "GDP ($bn)"],
    ["Italy", "58,940,425", "2,255"],
    ["Spain", "48,345,223", "1,620"],
    ["Germany", "84,482,267", "4,526"],
    ["France", "68,170,228", "3,052"],
    ["Portugal", "10,467,366", "289"],
]


def draw_popup_mock(img: Image.Image, px: int, py: int, w: int, h: int) -> None:
    """Large, readable TableSnap popup (text 18-30 px at native 1:1 resolution)."""
    shadowed_card(img, (px, py, px + w, py + h), radius=24, fill=WHITE, shadow=30)
    d = ImageDraw.Draw(img)
    img.alpha_composite(draw_icon(44), (px + 24, py + 22))
    f_brand = font("bold", 30)
    d.text((px + 80, py + 44), "TableSnap", font=f_brand, fill=INK, anchor="lm")
    bx = px + 80 + d.textlength("TableSnap", font=f_brand) + 12
    d.rounded_rectangle([bx, py + 31, bx + 52, py + 57], radius=13, fill=AMBER)
    d.text((bx + 26, py + 44), "PRO", font=font("bold", 15), fill=INK, anchor="mm")
    d.text((px + w - 26, py + 44), "3 found", font=font("semibold", 22), fill=TEAL_700, anchor="rm")
    d.line([(px + 20, py + 86), (px + w - 20, py + 86)], fill=(226, 232, 240), width=2)

    items = (("Table 1 · Statistics 2025", "5 rows × 3 cols · <table>", True),
             ("List 2 · Sources", "4 rows × 1 col · <ul>", False),
             ("Grid 3 · Team members", "3 rows × 2 cols · <div>", True))
    f_title, f_meta, f_chip = font("semibold", 23), font("regular", 18), font("bold", 17)
    chip_w, chip_h, gap = 62, 38, 8
    for i, (title, meta, on) in enumerate(items):
        yy = py + 102 + i * 102
        d.rounded_rectangle([px + 20, yy, px + w - 20, yy + 90], radius=14,
                            fill=(230, 246, 244) if on else (246, 248, 250),
                            outline=TEAL_500 if on else (221, 227, 232), width=2)
        cb = (px + 40, yy + 33, px + 64, yy + 57)
        if on:
            d.rounded_rectangle(cb, radius=6, fill=TEAL_700)
            d.line([(cb[0] + 6, cb[1] + 12), (cb[0] + 10, cb[1] + 17), (cb[0] + 18, cb[1] + 7)], fill=WHITE, width=3)
        else:
            d.rounded_rectangle(cb, radius=6, fill=WHITE, outline=(148, 163, 184), width=2)
        chips_x0 = px + w - 40 - (3 * chip_w + 2 * gap)
        tx = px + 82
        d.text((tx, yy + 32), ellipsize(d, title, f_title, chips_x0 - tx - 16), font=f_title, fill=INK, anchor="lm")
        d.text((tx, yy + 63), ellipsize(d, meta, f_meta, chips_x0 - tx - 16), font=f_meta, fill=SLATE, anchor="lm")
        for k, lab in enumerate(("CSV", "MD", "TSV")):
            cx = chips_x0 + k * (chip_w + gap)
            d.rounded_rectangle([cx, yy + 26, cx + chip_w, yy + 26 + chip_h], radius=8, fill=WHITE, outline=(203, 213, 225), width=2)
            d.text((cx + chip_w / 2, yy + 26 + chip_h / 2), lab, font=f_chip, fill=INK, anchor="mm")
    by = py + 102 + 3 * 102 + 4
    d.rounded_rectangle([px + 20, by, px + w - 20, by + 54], radius=12, fill=TEAL_700)
    d.text((px + w / 2, by + 27), "Selected → Excel (.xlsx)", font=font("bold", 22), fill=WHITE, anchor="mm")


def promo_hero(path: Path):
    W, H = 1280, 800
    img = gradient((W, H), TEAL_900, TEAL_700).convert("RGBA")
    dots = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dots)
    for yy in range(16, H, 32):
        for xx in range(16, W, 32):
            dd.ellipse([xx, yy, xx + 2, yy + 2], fill=(255, 255, 255, 22))
    img.alpha_composite(dots)
    d = ImageDraw.Draw(img)

    # left column: brand, headline, subtitle, pills (max 470 px wide, never overlaps the mockups)
    left, max_w = 64, 470
    img.alpha_composite(draw_icon(84), (left, 70))
    d.text((left + 102, 112), "TableSnap", font=font("bold", 46), fill=WHITE, anchor="lm")
    lines = [("Any web table →", WHITE), ("Excel, CSV &", TEAL_300), ("Markdown, 1 click.", WHITE)]
    head = fit_font(d, [l for l, _ in lines], "bold", 62, max_w)
    y = 214
    for text, color in lines:
        d.text((left, y), text, font=head, fill=color)
        y += head.size + 14
    sub = ["Detects every table & list on the page.", "CSV for Excel · Markdown for AI chats."]
    body = fit_font(d, sub, "regular", 25, max_w)
    y += 22
    for text in sub:
        d.text((left, y), text, font=body, fill=(204, 251, 241))
        y += body.size + 12
    x, y = left, y + 26
    for label in ("100% local", "No sign-up", "No tracking"):
        x = pill(d, (x, y), label, font("semibold", 20), TEAL_800, WHITE) + 12

    # browser window with the highlighted table
    bx0, by0, bx1, by1 = 584, 50, 1236, 470
    shadowed_card(img, (bx0, by0, bx1, by1), radius=20, fill=PAPER)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([bx0, by0, bx1, by0 + 48], radius=20, fill=(226, 232, 240))
    d.rectangle([bx0, by0 + 28, bx1, by0 + 48], fill=(226, 232, 240))
    for i, c in enumerate(((248, 113, 113), (251, 191, 36), (52, 211, 153))):
        d.ellipse([bx0 + 20 + i * 24, by0 + 17, bx0 + 34 + i * 24, by0 + 31], fill=c)
    d.rounded_rectangle([bx0 + 100, by0 + 12, bx1 - 20, by0 + 36], radius=12, fill=WHITE)
    d.text((bx0 + 116, by0 + 24), "example.org/statistics", font=font("regular", 16), fill=SLATE, anchor="lm")
    d.text((bx0 + 34, by0 + 84), "European statistics 2025", font=font("bold", 26), fill=INK, anchor="lm")
    draw_mock_table(d, bx0 + 34, by0 + 118, (bx1 - bx0 - 68) // 3, 44, DATA[:5], highlight=True)

    # big popup in front
    draw_popup_mock(img, 616, 284, 600, 488)
    save_exact(img, path, (W, H))


def promo_formats(path: Path):
    W, H = 1280, 800
    img = Image.new("RGBA", (W, H), (240, 253, 250, 255))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 8], fill=TEAL_700)
    d.text((W / 2, 92), "Paste clean tables into ChatGPT & Claude", font=font("bold", 50), fill=INK, anchor="mm")
    d.text((W / 2, 150), "Perfect Markdown, Excel-ready CSV (UTF-8), TSV — free. Multi-sheet XLSX & JSON with Pro.",
           font=font("regular", 25), fill=SLATE, anchor="mm")

    # markdown code card
    shadowed_card(img, (80, 220, 690, 650), radius=20, fill=(15, 23, 42), shadow=26)
    d = ImageDraw.Draw(img)
    d.text((112, 256), "Markdown  ·  copied to clipboard", font=font("semibold", 20), fill=TEAL_300, anchor="lm")
    md = [
        "| Country  | Population | GDP ($bn) |",
        "| -------- | ---------: | --------: |",
        "| Italy    | 58,940,425 |     2,255 |",
        "| Spain    | 48,345,223 |     1,620 |",
        "| Germany  | 84,482,267 |     4,526 |",
        "| France   | 68,170,228 |     3,052 |",
    ]
    mono = font("mono", 22)
    for i, line in enumerate(md):
        d.text((112, 312 + i * 42), line, font=mono, fill=(226, 232, 240) if i != 1 else SLATE)
    d.text((112, 590), "→ paste into any AI chat, Notion, GitHub…", font=font("regular", 20), fill=(148, 163, 184))

    # format cards
    formats = [
        ("CSV", "Excel-ready · UTF-8 BOM · ; or , separator", "FREE", TEAL_700),
        ("Markdown", "For ChatGPT, Claude, docs & READMEs", "FREE", TEAL_700),
        ("TSV", "Paste straight into Sheets / Excel", "FREE", TEAL_700),
        ("XLSX", "Many tables → one multi-sheet workbook", "PRO", AMBER),
        ("JSON", "Structured objects, typed numbers", "PRO", AMBER),
    ]
    y = 220
    for name, desc, tag, color in formats:
        shadowed_card(img, (740, y, 1200, y + 74), radius=14, fill=WHITE, shadow=10)
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([740, y, 750, y + 74], radius=4, fill=color)
        d.text((772, y + 26), name, font=font("bold", 24), fill=INK, anchor="lm")
        d.text((772, y + 54), desc, font=font("regular", 17), fill=SLATE, anchor="lm")
        tw = d.textlength(tag, font=font("bold", 15))
        d.rounded_rectangle([1180 - tw - 20, y + 14, 1180, y + 38], radius=12, fill=color)
        d.text((1180 - tw / 2 - 10, y + 26), tag, font=font("bold", 15), fill=WHITE if tag == "FREE" else INK, anchor="mm")
        y += 88
    x = 330
    for label in ("Runs 100% in your browser", "No account", "One-time Pro license"):
        x = pill(d, (x, 700), label, font("semibold", 20), (204, 251, 241), TEAL_800) + 16
    save_exact(img, path, (W, H))


def small_tile(path: Path):
    W, H = 440, 280
    img = gradient((W, H), TEAL_800, TEAL_500).convert("RGBA")
    d = ImageDraw.Draw(img)
    img.alpha_composite(draw_icon(88), (36, 40))
    d.text((140, 84), "TableSnap", font=font("bold", 44), fill=WHITE, anchor="lm")
    d.text((36, 170), "Web tables → Excel,", font=font("bold", 28), fill=WHITE)
    d.text((36, 206), "CSV & Markdown in 1 click", font=font("bold", 28), fill=(204, 251, 241))
    save_exact(img, path, (W, H))


def main():
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_ASSETS.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        out = ICONS_DIR / f"icon{size}.png"
        draw_icon(size).save(out, optimize=True)
        print(f"[assets] {out.relative_to(ROOT)}")
    promo_hero(STORE_DIR / "promo_1_hero_1280x800.png")
    promo_formats(STORE_DIR / "promo_2_formats_1280x800.png")
    small_tile(STORE_DIR / "small_tile_440x280.png")
    draw_icon(300).save(STORE_DIR / "edge_logo_300x300.png", optimize=True)  # Edge Add-ons store logo
    for p in sorted(STORE_DIR.glob("*.png")):
        print(f"[assets] {p.relative_to(ROOT)}")
    shutil.copy2(ICONS_DIR / "icon128.png", DOCS_ASSETS / "icon128.png")
    shutil.copy2(ICONS_DIR / "icon32.png", DOCS_ASSETS / "favicon.png")
    shutil.copy2(STORE_DIR / "promo_1_hero_1280x800.png", DOCS_ASSETS / "promo_1.png")
    shutil.copy2(STORE_DIR / "promo_2_formats_1280x800.png", DOCS_ASSETS / "promo_2.png")
    print("[assets] docs/assets updated")


if __name__ == "__main__":
    main()
