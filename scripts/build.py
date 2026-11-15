#!/usr/bin/env python3
"""TableSnap build pipeline (cross-platform, Python 3.9+).

Steps:
  1. (re)generate locales and — if missing or --assets — icons/promo images
  2. run the unittest suite in tests/ (JSON validity, locales, assets, JS logic via Node, report logic)
  3. package ONLY the contents of src/ into dist/tablesnap-store-ready.zip (manifest.json at zip root)
  4. verify the archive and list release blockers (placeholders still in config / website)

Usage:
  python scripts/build.py            # build (warn about placeholders)
  python scripts/build.py --strict   # fail while placeholders remain (use for the real release)
  python scripts/build.py --assets   # also regenerate icons and promo images
  python scripts/build.py --skip-tests
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
DIST = ROOT / "dist"
ZIP_PATH = DIST / "tablesnap-store-ready.zip"
EXCLUDE_NAMES = {".DS_Store", "Thumbs.db", "desktop.ini"}
EXCLUDE_SUFFIXES = {".map", ".bak", ".tmp", ".log"}
FIXED_DATE = (2026, 1, 1, 0, 0, 0)  # reproducible archives
PLACEHOLDER_RE = re.compile(r"REPLACE_WITH_[A-Z_]+")
PROVISIONAL_RE = re.compile(r"<a [^>]*data-provisional[^>]*>([^<]+)</a>")


def step(msg: str) -> None:
    print(f"\n=== {msg} ===", flush=True)


def run_script(name: str) -> None:
    subprocess.run([sys.executable, str(ROOT / "scripts" / name)], cwd=ROOT, check=True)


def run_tests() -> bool:
    suite = unittest.defaultTestLoader.discover(str(ROOT / "tests"), top_level_dir=str(ROOT))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return result.wasSuccessful()


def collect_files() -> list[Path]:
    files = []
    for path in sorted(SRC.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(SRC)
        if path.name in EXCLUDE_NAMES or path.suffix in EXCLUDE_SUFFIXES or any(p.startswith(".") for p in rel.parts):
            continue
        files.append(path)
    return files


def package() -> Path:
    DIST.mkdir(exist_ok=True)
    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for path in collect_files():
            info = zipfile.ZipInfo(path.relative_to(SRC).as_posix(), date_time=FIXED_DATE)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, path.read_bytes())
    return ZIP_PATH


def verify_zip(path: Path) -> dict:
    with zipfile.ZipFile(path) as z:
        bad = z.testzip()
        if bad:
            raise SystemExit(f"Corrupt entry in zip: {bad}")
        names = z.namelist()
        if "manifest.json" not in names:
            raise SystemExit("manifest.json must be at the root of the zip")
        manifest = json.loads(z.read("manifest.json"))
        leaked = [n for n in names if n.startswith(("tests/", "scripts/", "docs/", "store_assets/")) or n.endswith(".py")]
        if leaked:
            raise SystemExit(f"Non-extension files packaged: {leaked}")
        for rel in list(manifest["icons"].values()) + [manifest["action"]["default_popup"], manifest["background"]["service_worker"]]:
            if rel not in names:
                raise SystemExit(f"Manifest references {rel} but it is not in the zip")
    return {"files": len(names), "version": manifest["version"], "size_kb": path.stat().st_size / 1024}


def release_blockers() -> list[str]:
    found = []
    for rel in ("src/config.js", "docs/index.html", "docs/privacy.html"):
        text = (ROOT / rel).read_text(encoding="utf-8")
        for token in sorted(set(PLACEHOLDER_RE.findall(text))):
            found.append(f"{rel}: {token}")
        for label in PROVISIONAL_RE.findall(text):
            found.append(f'{rel}: provisional link "#" → {label.strip()}')
    return found


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Test and package TableSnap")
    parser.add_argument("--strict", action="store_true", help="fail if placeholders remain")
    parser.add_argument("--assets", action="store_true", help="regenerate icons and promo images")
    parser.add_argument("--skip-tests", action="store_true")
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    step("Locales")
    run_script("generate_locales.py")
    if args.assets or not (SRC / "icons" / "icon128.png").exists():
        step("Assets")
        run_script("generate_assets.py")

    if not args.skip_tests:
        step("Tests")
        if not run_tests():
            print("\n✗ Tests failed — package NOT built.")
            return 1

    step("Package")
    info = verify_zip(package())
    print(f"✓ {ZIP_PATH.relative_to(ROOT)} — v{info['version']}, {info['files']} files, {info['size_kb']:.1f} KB")

    blockers = release_blockers()
    if blockers:
        step("Release checklist (placeholders to replace before publishing)")
        for b in blockers:
            print(f"  • {b}")
        if args.strict:
            print("\n✗ --strict: placeholders remain.")
            return 2
    else:
        print("✓ No placeholders left — ready to upload.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
