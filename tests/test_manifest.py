"""Manifest V3 structure, permissions and referenced files."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"


class ManifestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))

    def test_manifest_v3_basics(self):
        m = self.manifest
        self.assertEqual(m["manifest_version"], 3)
        self.assertRegex(m["version"], r"^\d+(\.\d+){0,3}$")
        self.assertEqual(m["default_locale"], "en")
        for field in ("name", "short_name", "description"):
            self.assertTrue(m[field].startswith("__MSG_"), field)

    def test_minimal_permissions(self):
        m = self.manifest
        self.assertEqual(sorted(m["permissions"]), ["activeTab", "scripting", "storage"])
        self.assertNotIn("host_permissions", m, "no install-time host permissions")
        self.assertNotIn("content_scripts", m, "scripts are injected on demand via activeTab")
        self.assertEqual(m.get("optional_host_permissions"), ["https://api.lemonsqueezy.com/*"])

    def test_csp_has_no_remote_code(self):
        csp = self.manifest["content_security_policy"]["extension_pages"]
        self.assertIn("script-src 'self'", csp)
        self.assertNotRegex(csp, r"unsafe-eval|unsafe-inline")
        self.assertEqual(set(re.findall(r"https?://[^\s;]+", csp)), {"https://api.lemonsqueezy.com"})

    def test_referenced_files_exist(self):
        m = self.manifest
        paths = list(m["icons"].values()) + list(m["action"]["default_icon"].values())
        paths += [m["action"]["default_popup"], m["background"]["service_worker"]]
        for rel in paths:
            self.assertTrue((SRC / rel).is_file(), rel)

    def test_injected_and_imported_files_exist(self):
        popup_js = (SRC / "popup" / "popup.js").read_text(encoding="utf-8")
        for rel in re.findall(r"files:\s*\[([^\]]+)\]", popup_js):
            for f in re.findall(r"'([^']+)'", rel):
                self.assertTrue((SRC / f).is_file(), f)
        for js in SRC.rglob("*.js"):
            for imp in re.findall(r"^import .* from '(\.[^']+)';", js.read_text(encoding="utf-8"), re.M):
                self.assertTrue((js.parent / imp).resolve().is_file(), f"{js.name} imports {imp}")
        html = (SRC / "popup" / "popup.html").read_text(encoding="utf-8")
        for ref in re.findall(r'(?:src|href)="([^"#:]+)"', html):
            self.assertTrue((SRC / "popup" / ref).resolve().is_file(), ref)

    def test_no_remote_scripts_or_eval(self):
        for path in SRC.rglob("*"):
            if path.suffix not in {".js", ".html"}:
                continue
            text = path.read_text(encoding="utf-8")
            self.assertNotRegex(text, r"<script[^>]+src=\"https?:", path.name)
            self.assertNotRegex(text, r"\beval\(|new Function\(", path.name)
            self.assertNotIn("cdn.", text.lower(), path.name)


if __name__ == "__main__":
    unittest.main()
