"""Check every packaged page, document anchor, internal link, source and figure."""
import hashlib
import collections
from html.parser import HTMLParser
import json
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parent
MOUNT = "/agentscope-course/"
PUBLIC = ROOT / "site" / "agentscope-course"


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.resources, self.ids = [], [], set()
        self.in_article = False
        self.body = []
        self.code = 0
        self.defaults, self.ctas = [], []
        self.examples = []
        self.in_pre = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            self.ids.add(a["id"])
        if tag == "a" and "href" in a:
            self.links.append(a["href"])
        if tag in {"script","img","link"} and (a.get("src") or a.get("href")):
            self.resources.append(a.get("src") or a["href"])
        if "data-default" in a: self.defaults.append(a["data-default"])
        if "data-card-cta" in a: self.ctas.append(a["data-card-cta"])
        if tag == "article":
            self.in_article = True
        if self.in_article and tag == "pre":
            self.in_pre = True
            self.examples.append([])
            self.code += 1

    def handle_endtag(self, tag):
        if tag == "article":
            self.in_article = False
        if tag == "pre":
            self.in_pre = False

    def handle_data(self, value):
        if self.in_article:
            self.body.append(value)
        if self.in_pre:
            self.examples[-1].append(value)


def local_target(url):
    stem = unquote(urlsplit(url).path).removeprefix(MOUNT)
    result = PUBLIC / stem
    return result / "index.html" if result.is_dir() else result


def verify():
    manifest = json.loads((ROOT / "manifest.json").read_bytes())
    locked = json.loads((ROOT / "sources.lock.json").read_bytes())
    for item in locked["upstreamFiles"]:
        name = item["path"]
        if name.startswith("images/"):
            file = PUBLIC / name
        elif name.endswith("openapi.json"):
            file = PUBLIC / "openapi.json"
        else:
            file = PUBLIC / "mdx" / name.removeprefix("zh/versions/2.0.12/")
        assert hashlib.sha256(file.read_bytes()).hexdigest() == item["sha256"], file
    assert hashlib.sha256((PUBLIC / "LICENSE.txt").read_bytes()).hexdigest() == locked["licenseSha256"]
    assert len(manifest["lessons"]) == 60
    cache = {}
    for html in PUBLIC.rglob("*.html"):
        p = Page()
        p.feed(html.read_text("utf8"))
        cache[html] = p
    missing_anchors = []
    for file, page in cache.items():
        for url in page.resources:
            assert url.startswith(MOUNT), (file, url)
        for url in page.resources + page.links:
            if not (url.startswith(MOUNT) or url.startswith("#")):
                assert urlsplit(url).scheme in {"https","http","mailto"}, (file, url)
                continue
            target = file if url.startswith("#") else local_target(url)
            assert target.is_file(), (file, url)
            frag = unquote(urlsplit(url).fragment)
            if frag and target in cache and frag not in cache[target].ids:
                missing_anchors.append((str(file.relative_to(PUBLIC)), url))
    assert not missing_anchors, missing_anchors
    points, blocks = 0, 0
    for lesson in manifest["lessons"]:
        raw = cache[local_target(lesson["path"])]
        mdx=(PUBLIC / "mdx" / (lesson["slug"]+".mdx")).read_text("utf8")
        assert collections.Counter(re.findall(r'<ParamField\b[^>]*?\bdefault="([^"]*)"',mdx)) == collections.Counter(raw.defaults), lesson["id"]
        assert collections.Counter(re.findall(r'<Card\b[^>]*?\bcta="([^"]*)"',mdx)) == collections.Counter(raw.ctas), lesson["id"]
        body = "".join(raw.body)
        assert body and lesson["points"] and lesson["online"].startswith("https://docs.agentscope.io/zh/versions/2.0.12/")
        for p in lesson["points"]:
            assert p["needle"] in body, (lesson["id"],p["needle"])
            assert p["question"] and p["detail"]
            if p["topic"] is not None: assert p["topic"] in lesson["topics"]
            points += 1
        blocks += raw.code
    figs = list((PUBLIC / "diagrams").glob("*.svg"))
    for fig in figs:
        assert ElementTree.parse(fig).getroot().tag.endswith("svg"), fig
    print(f"{len(manifest['lessons'])} original documents, {points} checked anchors, {blocks} code or diagram-source blocks, {len(figs)} diagrams")


if __name__ == "__main__":
    verify()
