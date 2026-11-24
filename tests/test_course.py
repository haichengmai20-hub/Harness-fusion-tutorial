"""Cross-check course, replay, source references and the generated standalone page."""
import ast
import json
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(name):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


class PackedPage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.inside = False
        self.payload = ""
        self.runtime_requests = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script":
            self.inside = attrs.get("id") == "packed"
        if tag == "script" and "src" in attrs or tag == "link" and attrs.get("rel") == "stylesheet":
            self.runtime_requests.append(attrs)

    def handle_endtag(self, tag):
        if tag == "script":
            self.inside = False

    def handle_data(self, data):
        if self.inside:
            self.payload += data


class CourseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.chapters = read("data/chapters.json")
        cls.ids = [f"s{i:02d}" for i in range(1, 21)]
        cls.runs = read("data/runs.json")
        cls.code = read("data/code.json")
        cls.maps = read("data/mappings.json")
        cls.sources = read("research/sources.lock.json")["frameworks"]

    def test_curriculum_and_choices(self):
        self.assertEqual([c["id"] for c in self.chapters], self.ids)
        self.assertEqual(set(self.ids), set(self.runs))
        self.assertEqual(set(self.ids), set(self.code))
        for c in self.chapters:
            with self.subTest(chapter=c["id"]):
                for field in ("title","problem","previous","mechanism","input","output","next","failure","explanation","checkpoint"):
                    self.assertTrue(c[field].strip(), field)
                self.assertGreaterEqual(len(c["walkthrough"]), 2)
                self.assertEqual(len(set(c["options"])), 3)
                self.assertIn(c["answer"], range(len(c["options"])))
        self.assertEqual(len({c["question"] for c in self.chapters}), 20)

    def test_source_cards_match_locked_locations(self):
        self.assertEqual(set(self.maps), set(self.ids))
        for chapter, trio in self.maps.items():
            self.assertEqual(set(trio), {"hermes","dsh","agentscope"})
            for name, card in trio.items():
                with self.subTest(chapter=chapter, framework=name):
                    lock = self.sources[name]
                    refs = [r for r in lock["files"] if r["chapter"] == chapter]
                    self.assertTrue(any(card["url"] == r["permalink"] for r in refs))
                    self.assertIn("/blob/" + lock["commit"] + "/", card["url"])
                    self.assertIn(card["support"], {"native","composed","unverified","no-direct-equivalent"})
                    self.assertTrue(set(card["evidence"]) <= {"document-reviewed","source-reviewed","offline-tested","live-tested"})
                    for field in ("title","body","entry","state","checkpoint","source"):
                        self.assertTrue(card[field].strip(), field)
                    if card.get("anchors"):
                        steps = {e["semanticStep"] for trace in self.runs[chapter].values() for e in trace}
                        self.assertLessEqual(set(card["anchors"]), steps)

    def test_every_replay_points_at_a_real_definition_in_its_layer(self):
        seen_files = {}
        for chapter, scenarios in self.runs.items():
            self.assertEqual(set(scenarios), {"normal","failure"})
            self.assertNotEqual(scenarios["normal"][-1],scenarios["failure"][-1])
            for events in scenarios.values():
                for n,e in enumerate(events, start=1):
                    self.assertEqual((e["chapterId"],e["mode"],e["harness"],e["seq"]),
                                     (chapter,"teaching-simulation","common",n))
                    file, symbol = e["sourceRef"].split("#")
                    self.assertRegex(file,r"^runtime/layers/s\d{2}_\w+\.py$")
                    if file not in seen_files:
                        tree = ast.parse((ROOT / file).read_text(encoding="utf-8"))
                        seen_files[file] = {fn.name for fn in ast.walk(tree) if isinstance(fn,ast.FunctionDef)}
                    self.assertIn(symbol,seen_files[file])
                    self.assertIn("def " + symbol + "(",self.code[chapter]["code"])

    def test_standalone_has_latest_four_datasets_and_no_external_assets(self):
        page = PackedPage()
        page.feed((ROOT / "dist/lab.html").read_text(encoding="utf-8"))
        self.assertFalse(page.runtime_requests)
        self.assertEqual(json.loads(page.payload), {"chapters":self.chapters,"code":self.code,
                                                    "runs":self.runs,"mappings":self.maps})


if __name__ == "__main__":
    unittest.main()
