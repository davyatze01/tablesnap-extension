"""Runs the JavaScript unit tests (node:test) and cross-checks real CSV/XLSX output with Python parsers."""
import csv
import io
import json
import shutil
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JS_TESTS = sorted((ROOT / "tests" / "js").glob("*.test.js"))
NODE = shutil.which("node")
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


@unittest.skipIf(NODE is None, "Node.js not found — JS logic tests skipped (install Node 18+ to run them)")
class JavaScriptLogicTests(unittest.TestCase):
    def test_node_unit_tests(self):
        self.assertTrue(JS_TESTS)
        proc = subprocess.run([NODE, "--test", *map(str, JS_TESTS)], cwd=ROOT, capture_output=True, text=True,
                              encoding="utf-8", errors="replace", timeout=180)
        if proc.returncode != 0:
            self.fail("node --test failed:\n" + proc.stdout[-6000:] + proc.stderr[-2000:])

    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="tablesnap-test-"))
        subprocess.run([NODE, str(ROOT / "tests" / "js" / "export_fixture.js"), str(cls.tmp)], cwd=ROOT, check=True, timeout=60)
        cls.fixture = json.loads((cls.tmp / "fixture.json").read_text(encoding="utf-8"))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_csv_roundtrip_with_python_csv_module(self):
        raw = (self.tmp / "fixture.csv").read_bytes()
        self.assertTrue(raw.startswith(b"\xef\xbb\xbf"), "UTF-8 BOM for Excel")
        text = raw.decode("utf-8-sig")
        rows = list(csv.reader(io.StringIO(text, newline=""), delimiter=";"))
        expected = [list(r) for r in self.fixture["rows"]]
        expected[3][2] = "'" + expected[3][2]  # formula neutralised
        self.assertEqual(rows, expected)

    def test_xlsx_is_valid_ooxml(self):
        path = self.tmp / "fixture.xlsx"
        with zipfile.ZipFile(path) as z:
            self.assertIsNone(z.testzip())
            names = set(z.namelist())
            for required in ("[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels",
                             "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"):
                self.assertIn(required, names)
            for name in names:
                ET.fromstring(z.read(name))  # every part is well-formed XML
            wb = ET.fromstring(z.read("xl/workbook.xml"))
            sheet_names = [s.get("name") for s in wb.iterfind(".//m:sheet", NS)]
            self.assertEqual(sheet_names, ["Prezzi 2025", "Lista"])
            sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
            cells = {}
            for c in sheet.iterfind(".//m:c", NS):
                if c.get("t") == "inlineStr":
                    cells[c.get("r")] = ("s", "".join(t.text or "" for t in c.iterfind(".//m:t", NS)))
                else:
                    cells[c.get("r")] = ("n", c.find("m:v", NS).text)
            self.assertEqual(cells["A1"], ("s", "Città"))
            self.assertEqual(cells["B2"], ("n", "1234.50"))
            self.assertEqual(cells["B3"], ("n", "980.00"))
            self.assertEqual(cells["C2"], ("s", 'virgola, "quote" & <tag>'))
            self.assertEqual(cells["C3"], ("s", "riga1\nriga2"))
            self.assertIsNotNone(sheet.find(".//m:pane[@state='frozen']", NS))


if __name__ == "__main__":
    unittest.main()
