"""Icons, store images and website files exist with the exact sizes the stores require."""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None


@unittest.skipIf(Image is None, "Pillow not installed (pip install -r requirements.txt)")
class AssetTests(unittest.TestCase):
    def assertImage(self, rel, size, mode_alpha=None):
        path = ROOT / rel
        self.assertTrue(path.is_file(), f"missing {rel} — run python scripts/generate_assets.py")
        with Image.open(path) as im:
            self.assertEqual(im.format, "PNG", rel)
            self.assertEqual(im.size, size, rel)
            if mode_alpha is not None:
                self.assertEqual("A" in im.getbands(), mode_alpha, rel)

    def test_extension_icons(self):
        for s in (16, 48, 128):
            self.assertImage(f"src/icons/icon{s}.png", (s, s), mode_alpha=True)

    def test_store_promo_images(self):
        promos = sorted((ROOT / "store_assets").glob("promo_*_1280x800.png"))
        self.assertGreaterEqual(len(promos), 2)
        for p in promos:
            # Chrome Web Store screenshots: 1280x800, no alpha channel
            self.assertImage(p.relative_to(ROOT).as_posix(), (1280, 800), mode_alpha=False)
        self.assertImage("store_assets/small_tile_440x280.png", (440, 280), mode_alpha=False)
        self.assertImage("store_assets/edge_logo_300x300.png", (300, 300))

    def test_website_files(self):
        for rel in ("docs/index.html", "docs/privacy.html", "docs/assets/icon128.png"):
            self.assertTrue((ROOT / rel).is_file(), rel)
        privacy = (ROOT / "docs/privacy.html").read_text(encoding="utf-8").lower()
        for word in ("gdpr", "lemonsqueezy", "chrome.storage.local"):
            self.assertIn(word, privacy)


if __name__ == "__main__":
    unittest.main()
