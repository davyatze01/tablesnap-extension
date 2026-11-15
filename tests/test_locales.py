"""_locales/*/messages.json: valid JSON, complete, within store limits, placeholders consistent."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
LOCALES = SRC / "_locales"
REQUIRED_LANGS = {"en", "it", "es", "de", "fr", "pt"}


def load(lang):
    return json.loads((LOCALES / lang / "messages.json").read_text(encoding="utf-8"))


class LocaleTests(unittest.TestCase):
    def test_required_languages_present_and_valid_json(self):
        found = {p.name for p in LOCALES.iterdir() if p.is_dir()}
        self.assertTrue(REQUIRED_LANGS <= found, REQUIRED_LANGS - found)
        for lang in found:
            data = load(lang)
            self.assertIsInstance(data, dict)
            for key, entry in data.items():
                self.assertRegex(key, r"^[A-Za-z0-9_@]+$")
                self.assertTrue(entry.get("message"), f"{lang}.{key} empty")

    def test_all_languages_have_same_keys(self):
        base = set(load("en"))
        for lang in REQUIRED_LANGS:
            self.assertEqual(set(load(lang)), base, lang)

    def test_store_limits(self):
        for lang in REQUIRED_LANGS:
            d = load(lang)
            self.assertLessEqual(len(d["extName"]["message"]), 75, lang)
            self.assertLessEqual(len(d["extShortName"]["message"]), 12, lang)
            self.assertLessEqual(len(d["extDescription"]["message"]), 132, lang)

    def test_placeholders_consistent(self):
        for lang in REQUIRED_LANGS:
            for key, entry in load(lang).items():
                used = {m.lower() for m in re.findall(r"\$([A-Za-z0-9_]+)\$", entry["message"])}
                declared = set((entry.get("placeholders") or {}).keys())
                self.assertEqual(used, declared, f"{lang}.{key}")

    def test_every_ui_key_is_defined(self):
        en = set(load("en"))
        used = set()
        html = (SRC / "popup" / "popup.html").read_text(encoding="utf-8")
        used |= set(re.findall(r'data-i18n(?:-placeholder|-title|-aria)?="([^"]+)"', html))
        js = (SRC / "popup" / "popup.js").read_text(encoding="utf-8")
        used |= set(re.findall(r"\bt\('([A-Za-z0-9_]+)'", js))
        used |= set(re.findall(r":\s*'(license[A-Za-z]+)'", js))  # error-code → key map
        manifest = (SRC / "manifest.json").read_text(encoding="utf-8")
        used |= set(re.findall(r"__MSG_([A-Za-z0-9_]+)__", manifest))
        self.assertTrue(used, "no keys found")
        self.assertEqual(used - en, set(), "keys used but not defined")


if __name__ == "__main__":
    unittest.main()
