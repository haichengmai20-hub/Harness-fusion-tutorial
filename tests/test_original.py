"""Verify the distributable preserves the chosen original, not a different tutorial."""
import hashlib
import importlib.util
import json
import os
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(name):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


class ReaderData(HTMLParser):
    def __init__(self):
        super().__init__()
        self.inside = False
        self.value = ""
        self.frames = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "iframe":
            self.frames.append(attrs.get("id"))
        if tag == "script":
            self.inside = attrs.get("id") == "reader-data"

    def handle_data(self, data):
        if self.inside:
            self.value += data

    def handle_endtag(self, tag):
        if tag == "script":
            self.inside = False


class OriginalCourse(unittest.TestCase):
    def test_rebuild_leaves_identical_browser_resources_in_place(self):
        spec = importlib.util.spec_from_file_location("course_build", ROOT / "study.py")
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        with tempfile.TemporaryDirectory() as tmp:
            asset = Path(tmp) / "chunks/test.js"
            builder.install_bytes(asset, b"const chapter=1;")
            os.utime(asset, (1_000_000_000, 1_000_000_000))
            unchanged = asset.stat().st_mtime_ns
            builder.install_bytes(asset, b"const chapter=1;")
            self.assertEqual(asset.stat().st_mtime_ns, unchanged)
            builder.install_bytes(asset, b"const chapter=2;")
            self.assertEqual(asset.read_bytes(), b"const chapter=2;")
            self.assertEqual(list(asset.parent.iterdir()), [asset])

    def test_served_archive_matches_download_bytes(self):
        manifest = read("research/original-snapshot.json")
        expected = {"/zh/", "/zh/timeline/", "/zh/compare/", "/zh/layers/"}
        expected.update(f"/zh/s{i:02d}/" for i in range(1, 21))
        self.assertEqual(set(manifest["pages"]), expected)
        self.assertFalse(manifest["missing"])
        for f in manifest["files"]:
            with self.subTest(resource=f["path"]):
                served = (ROOT / "dist" / f["path"]).read_bytes()
                self.assertEqual(hashlib.sha256(served).hexdigest(), f["sha256"])
        self.assertEqual((ROOT / "dist/learn-claude-code-LICENSE.txt").read_bytes(),
                         (ROOT / "upstream/LICENSE").read_bytes())

    def test_reader_uses_current_point_specific_comparisons(self):
        page = ReaderData()
        built = (ROOT / "dist/index.html").read_text(encoding="utf-8")
        for asset in ("reader.js", "reader.css", "practice.js", "courses.js"):
            self.assertTrue((ROOT / "ui" / asset).read_text(encoding="utf-8") in built, asset)
        page.feed(built)
        self.assertEqual(page.frames, ["original-frame"])
        packed = json.loads(page.value)
        self.assertEqual(packed["peerLinks"], read("data/native-peer-links.json"))
        for course_id, catalog in packed["courses"].items():
            self.assertEqual(catalog["lessons"], read("courses/"+course_id+"/manifest.json")["lessons"])
        walk = read("data/original-crosswalk.json")
        self.assertEqual(packed["crosswalk"], walk)
        self.assertEqual(packed["home"], read("data/original-home.json"))
        self.assertEqual(packed["mappings"], read("data/mappings.json"))
        prompts = read("data/practice-prompts.json")
        self.assertEqual(packed["practicePrompts"], prompts)
        self.assertEqual(set(prompts), set(walk))
        self.assertEqual(set(packed["practiceOriginal"]), set(walk))
        for chapter, prompt in prompts.items():
            self.assertIn(prompt["point"], range(1, len(walk[chapter])+1))
            self.assertIn(prompt["tab"], {"learn", "sim", "source"})
            self.assertTrue(all(prompt[k].strip() for k in ("question", "action", "expect", "needle")))
        self.assertEqual(set(walk), {f"s{i:02d}" for i in range(1, 21)})
        versions = read("research/sources.lock.json")["frameworks"]
        for chapter, items in walk.items():
            self.assertGreaterEqual(len(items), 2)
            self.assertEqual(len(items), len({p["find"] for p in items}))
            for point in items:
                with self.subTest(chapter=chapter, question=point["question"]):
                    for field in ("section","find","question","baseline"):
                        self.assertTrue(point[field].strip())
                    for field in ("match","links","frames"):
                        self.assertEqual(set(point[field]), set(versions))
                    for fw, v in versions.items():
                        self.assertTrue(point["frames"][fw].strip())
                        self.assertIn(point["match"][fw], {"对应","部分对应","待核"})
                        self.assertIn("/blob/" + v["commit"] + "/", point["links"][fw])
                        self.assertRegex(point["links"][fw], r"#L\d+(?:-L\d+)?$")


if __name__ == "__main__":
    unittest.main()
