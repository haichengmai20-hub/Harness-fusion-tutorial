"""Capture the public Chinese course at its deployed URLs or verify an existing capture."""

import argparse
import base64
import hashlib
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
from http.client import HTTPException
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urljoin, urlsplit
from urllib.request import Request, urlopen


PROJECT = Path(__file__).resolve().parents[1]
UPSTREAM = PROJECT / "upstream"
SITE = UPSTREAM / "site"
MANIFEST = PROJECT / "research" / "original-snapshot.json"
HOST = "https://learn.shareai.run"
LICENSE = "https://raw.githubusercontent.com/shareAI-lab/learn-claude-code/448c75bb596917ad196cc1fb7558f459c5c50fdd/LICENSE"
PAGES = ["/zh/"] + [f"/zh/s{i:02}/" for i in range(1, 21)] + ["/zh/timeline/", "/zh/compare/", "/zh/layers/"]
CHUNKS = re.compile(r"(?:/_next/)?static/(?:chunks|media)/[\w./~-]+\.(?:js|css|woff2?|svg|png)", re.ASCII)
COURSE_FILES = re.compile(r"/course-assets/[a-zA-Z0-9_./%~-]+\.(?:svg|png|jpg|webp|gif|json|py)")


class AssetTags(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "a" and (href := attrs.get("href", "")).startswith("/zh/"):
            if re.fullmatch(r"/zh/(?:[a-z0-9_-]+/?)?", href):
                self.refs.add(href.rstrip("/") + "/")
        if tag in {"link", "script", "img", "source", "video", "audio"}:
            for key in ("src", "href", "poster"):
                if attrs.get(key):
                    self.refs.add(attrs[key])
            if attrs.get("srcset"):
                self.refs.update(image.split()[0] for image in attrs["srcset"].split(",") if image.strip())


def sha(data):
    return hashlib.sha256(data).hexdigest()


def path_for(url):
    path = unquote(urlsplit(url).path)
    if not path.startswith("/") or any(part in {"..", "."} for part in path.split("/")):
        raise ValueError(f"Unsafe URL path: {url}")
    if any(c in path for c in ':*?"<>|\\'):
        raise ValueError(f"Incompatible file path: {url}")
    return SITE / (path.lstrip("/") + ("index.html" if path.endswith("/") else ""))


def request(url):
    for attempt in range(3):
        try:
            req = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; LearnCourseSnapshot/1.0)", "Accept-Encoding": "identity"})
            with urlopen(req, timeout=40) as response:
                return response.read(), response.headers.get_content_type()
        except HTTPError as exc:
            if exc.code < 500 or attempt == 2:
                raise
        except (HTTPException, URLError, TimeoutError, OSError):
            if attempt == 2:
                raise
        time.sleep(1 + attempt)


def fetch(path):
    target = path_for(path)
    data, mime = request(HOST + path)
    if not path.endswith("/") and mime == "text/html":
        raise ValueError(f"Expected resource, received HTML: {path}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    meta = {"path": target.relative_to(SITE).as_posix(), "url": HOST + path, "type": mime,
            "bytes": len(data), "sha256": sha(data)}
    return meta, data


def rsc_segments(page, data):
    """Derive real segment names from the Next tree (dynamic params and encoded route groups)."""
    tree = next(json.loads(line[2:])["tree"] for line in data.splitlines() if line.startswith("0:"))
    result = set()

    def encode(part):
        if re.fullmatch(r"[a-zA-Z0-9_@-]+", part):
            return part
        return "!" + base64.urlsafe_b64encode(part.encode()).decode().rstrip("=")

    def visit(node, parts):
        for key, child in (node["slots"] or {}).items():
            branch = parts + (["@" + encode(key)] if key != "children" else [])
            prefix = "$" + child["paramType"] + "$" if child["paramType"] else ""
            branch.append(prefix + encode(child["name"]))
            result.add(page + "__next." + ".".join(branch) + ".txt")
            visit(child, branch)

    visit(tree, [])
    return result


def collect(path, meta, data):
    refs = set()
    mime = meta["type"]
    if mime not in {"application/javascript", "text/javascript", "text/css", "text/html", "text/plain", "application/json"}:
        return refs
    text = data.decode("utf-8")
    if path.endswith("/__next._tree.txt"):
        refs.update(rsc_segments(path.removesuffix("__next._tree.txt"), text))
    if mime == "text/html":
        tags = AssetTags()
        tags.feed(text)
        refs |= tags.refs
        if path.startswith("/zh/") and path.endswith("/"):
            refs.update(path + name for name in ("index.txt", "__next._tree.txt", "__next._full.txt", "__next._head.txt", "__next._index.txt"))
    if mime == "text/css":
        refs.update(x.strip("'\" ") for x in re.findall(r"url\(([^)]+)\)", text))
    refs.update(chunk if chunk.startswith("/") else "/_next/" + chunk for chunk in CHUNKS.findall(text))
    refs.update(COURSE_FILES.findall(text))
    paths = set()
    for ref in refs:
        url = urlsplit(urljoin(HOST + path, ref))
        if url.scheme == "https" and url.netloc == urlsplit(HOST).netloc:
            paths.add(url.path + (("?" + url.query) if url.query else ""))
    return paths


def capture(extras, extend):
    existing = json.loads(MANIFEST.read_text("utf-8")) if extend and MANIFEST.exists() else {}
    if existing:
        data, _ = request(HOST + "/zh/")
        if f"<!--{existing['nextBuildId']}-->".encode() not in data[:100]:
            raise ValueError("Live deployment changed. Capture a fresh snapshot instead of mixing builds.")
    assets = {item["url"].removeprefix(HOST): item for item in existing.get("files", [])}
    errors = {}
    # The Next static export serves both the full RSC response and segment prefetch payloads.
    browser_resources = UPSTREAM / "browser-resources.txt"
    observed = browser_resources.read_text("utf-8").splitlines() if browser_resources.exists() else []
    wanted = set(PAGES) | set(extras) | {p for p in observed if p.startswith("/")}
    for path, meta in assets.items():
        wanted.update(collect(path, meta, path_for(path).read_bytes()))
    for page in PAGES:
        wanted.update(page + name for name in ("index.txt", "__next._tree.txt", "__next._full.txt", "__next._head.txt", "__next._index.txt"))
    with ThreadPoolExecutor(max_workers=6) as pool:
        while pending := sorted(wanted - assets.keys() - errors.keys()):
            print(f"fetching {len(pending)} resources", flush=True)
            jobs = [(p, pool.submit(fetch, p)) for p in pending]
            for path, job in jobs:
                try:
                    meta, data = job.result()
                    assets[path] = meta
                    wanted.update(collect(path, meta, data))
                except (HTTPException, HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
                    errors[path] = str(exc)
    license_data, _ = request(LICENSE)
    UPSTREAM.mkdir(parents=True, exist_ok=True)
    (UPSTREAM / "LICENSE").write_bytes(license_data)
    builds = set()
    for p in PAGES:
        if p in assets:
            match = re.search(rb"<!DOCTYPE html><!--([^>]+?)-->", path_for(p).read_bytes())
            if match:
                builds.add(match.group(1).decode())
    if len(builds) != 1:
        raise ValueError(f"Unexpected number of build IDs: {sorted(builds)}")
    manifest = {"site": HOST, "capturedAt": datetime.now(timezone.utc).isoformat(),
                "nextBuildId": builds.pop(), "deployedGitCommit": None, "pages": PAGES,
                "license": {"url": LICENSE, "path": "upstream/LICENSE", "sha256": sha(license_data)},
                "files": [assets[path] for path in sorted(assets)], "missing": errors}
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", "utf-8", newline="\n")
    print(f"captured {len(assets)} URLs; {len(errors)} missing: {errors}")


def verify():
    manifest = json.loads(MANIFEST.read_text("utf-8"))
    files = manifest["files"]
    for entry in [*files, manifest["license"]]:
        path = PROJECT / entry["path"] if entry is manifest["license"] else SITE / entry["path"]
        if sha(path.read_bytes()) != entry["sha256"]:
            raise ValueError(f"Snapshot hash mismatch: {path}")
    missing = {HOST + p for p in PAGES} - {item["url"] for item in files}
    if missing or manifest["missing"]:
        raise ValueError(f"Incomplete snapshot: {missing or manifest['missing']}")
    for page in PAGES:
        if f"<!--{manifest['nextBuildId']}-->".encode() not in path_for(page).read_bytes()[:100]:
            raise ValueError(f"Unexpected Next build at {page}")
    urls = {item["url"] for item in files}
    for item in files:
        dependencies = collect(item["url"].removeprefix(HOST), item, (SITE / item["path"]).read_bytes())
        absent = [path for path in dependencies if HOST + path not in urls]
        if absent:
            raise ValueError(f"Missing resource links in {item['path']}: {absent}")
    print(f"Verified {len(PAGES)} pages, {len(files)} resource hashes, build {manifest['nextBuildId']}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capture", action="store_true", help="Fetch a fresh deployment snapshot")
    parser.add_argument("--extend", action="store_true", help="Add resources to this same deployment")
    parser.add_argument("--extra", action="append", default=[], help="Exact same-origin path observed in browser")
    args = parser.parse_args()
    if args.capture or args.extend:
        capture(args.extra, args.extend)
    verify()
