import json
import unittest
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"


def read(path):
    return json.loads(path.read_bytes())


class PrimaryCourseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.courses = {k: read(ROOT/"courses"/k/"manifest.json") for k in ("hermes","dsh","agentscope")}
        cls.walk = read(ROOT/"data/original-crosswalk.json")

    def test_real_lessons_and_reading_points_have_working_destinations(self):
        expected_mounts = {"hermes":"/hermes-tutorial/", "dsh":"/dsh-course/", "agentscope":"/agentscope-course/"}
        for key, course in self.courses.items():
            lessons = course["lessons"]
            self.assertEqual(course["id"], key)
            self.assertTrue(course["source"] and course["license"])
            self.assertGreater(len(lessons), 1)
            self.assertEqual(len({l["id"] for l in lessons}), len(lessons))
            self.assertEqual(len({l["path"] for l in lessons}), len(lessons))
            for item in lessons:
                with self.subTest(primary=key, lesson=item["id"]):
                    path = unquote(urlsplit(item["path"]).path)
                    self.assertTrue(path.startswith(expected_mounts[key]))
                    file = DIST / path.lstrip("/")
                    if file.is_dir():
                        file = file / "index.html"
                    self.assertTrue(file.is_file(), file)
                    self.assertTrue(item["title"].strip())
                    self.assertTrue(item["online"].startswith("https://"))
                    for p in item.get("points", []):
                        self.assertTrue(all(p[k].strip() for k in ("label","needle","question","detail")))
                        if p.get("crosswalk") is not None:
                            self.assertIn(p["crosswalk"],range(1,len(self.walk[p["topic"]])+1))

    def test_peer_sources_point_to_the_named_course(self):
        links = read(ROOT/"data/native-peer-links.json")
        catalog = {k:{str(l["id"]):l for l in c["lessons"]} for k,c in self.courses.items()}
        catalog["claude"] = {s: {"points": pts} for s,pts in self.walk.items()}
        self.assertTrue(links)
        for primary, lessons in links.items():
            for lesson_id, points in lessons.items():
                for i, peers in points.items():
                    self.assertIn(int(i),range(1,len(catalog[primary][lesson_id]["points"])+1))
                    for dst, p in peers.items():
                        self.assertNotEqual(dst,primary)
                        lesson = catalog[dst][p["lesson"]]
                        if p.get("point") is not None:
                            self.assertIn(p["point"], range(1,len(lesson["points"])+1))
                        self.assertIn(p["grade"], {"对应","部分对应"})
                        self.assertTrue(p["url"].startswith("https://") and p["text"].strip())

    def test_distributed_courses_preserve_their_prepared_files(self):
        for course in self.courses:
            site=ROOT/"courses"/course/"site"
            for source in site.rglob("*"):
                if source.is_file():
                    with self.subTest(course=course, file=source.name):
                        self.assertTrue((DIST / source.relative_to(site)).read_bytes()==source.read_bytes())
