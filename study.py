"""Build the offline course or serve it on the loopback interface."""
import argparse
import json
import os
import tempfile
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
DATA = ("chapters", "mappings", "runs", "code")
COURSE_MOUNTS = {"hermes": "hermes-tutorial", "dsh": "dsh-course", "agentscope": "agentscope-course"}


class CourseServer(ThreadingHTTPServer):
    # Next prefetches route segments for many chapters when a menu enters view.
    request_queue_size = 128


class CourseHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        if self.path != "/__study_local__/editors.json":
            return super().do_GET()
        from tools.chapter_readings import editor_roots
        payload = json.dumps(editor_roots(), ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def log_request(self, code="-", size="-"):
        if isinstance(code, int) and code >= 400:
            super().log_request(code, size)


def install_bytes(path, payload):
    """Serve either complete version while a new build is being installed."""
    if path.is_file() and path.read_bytes() == payload:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(payload)
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def build_lab():
    content = {
        name: json.loads((ROOT / "data" / f"{name}.json").read_text(encoding="utf-8"))
        for name in DATA
    }
    # Escape script boundaries even when Python examples contain HTML.
    packed = json.dumps(content, ensure_ascii=False, separators=(",", ":")).replace("<", r"\u003c")
    page = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "ui" / "course.css").read_text(encoding="utf-8")
    js = (ROOT / "ui" / "course.js").read_text(encoding="utf-8")
    page = page.replace('<link rel="stylesheet" href="ui/course.css">', f"<style>{css}</style>")
    page = page.replace('<script defer src="ui/course.js"></script>',
                        f'<script id="packed" type="application/json">{packed}</script>\n<script>{js}</script>')
    DIST.mkdir(exist_ok=True)
    path = DIST / "lab.html"
    install_bytes(path, page.encode("utf-8"))
    return path


def build():
    from tools.course_practice import extract_all
    from tools.chapter_readings import build_readings

    build_lab()
    upstream = ROOT / "upstream" / "site"
    if not (upstream / "zh" / "index.html").exists():
        raise FileNotFoundError(f"Missing original course snapshot at {upstream}")
    # Publish content-addressed assets before the documents that reference them.
    for resource in sorted(upstream.rglob("*"), key=lambda p: p.suffix == ".html"):
        if resource.is_file():
            install_bytes(DIST / resource.relative_to(upstream), resource.read_bytes())
    install_bytes(DIST / "learn-claude-code-LICENSE.txt", (ROOT / "upstream" / "LICENSE").read_bytes())
    comparison = {
        key: json.loads((ROOT / "data" / name).read_text(encoding="utf-8"))
        for key, name in (("crosswalk", "original-crosswalk.json"), ("home", "original-home.json"), ("mappings", "mappings.json"),
                          ("peerLinks", "native-peer-links.json"),
                          ("practicePrompts", "practice-prompts.json"),
                          ("chapters", "chapters.json"))
    }
    comparison["practiceOriginal"] = extract_all()
    comparison["chapterReadings"] = build_readings(DIST, install_bytes)
    comparison["courses"] = {}
    for key, mount in COURSE_MOUNTS.items():
        directory = ROOT / "courses" / key
        catalog = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        site = directory / "site" / mount
        if catalog["id"] != key or not catalog["lessons"] or not site.is_dir():
            raise ValueError(f"Incomplete course: {key}")
        catalog["mount"] = "/" + mount + "/"
        comparison["courses"][key] = catalog
        for resource in sorted(site.rglob("*"), key=lambda p: p.suffix == ".html"):
            if resource.is_file():
                install_bytes(DIST / mount / resource.relative_to(site), resource.read_bytes())
    packed = json.dumps(comparison, ensure_ascii=False, separators=(",", ":")).replace("<", r"\u003c")
    page = (ROOT / "ui" / "reader.html").read_text(encoding="utf-8")
    page = page.replace("/* READER_STYLE */", (ROOT / "ui" / "reader.css").read_text(encoding="utf-8"))
    page = page.replace("/* READER_JS */", (ROOT / "ui" / "reader.js").read_text(encoding="utf-8"))
    page = page.replace("/* PRACTICE_JS */", (ROOT / "ui" / "practice.js").read_text(encoding="utf-8"))
    page = page.replace("/* COURSES_JS */", (ROOT / "ui" / "courses.js").read_text(encoding="utf-8"))
    page = page.replace("/* STUDY_LINKS */", (ROOT / "ui" / "local-links.js").read_text(encoding="utf-8"))
    page = page.replace("<!-- READER_DATA -->", f'<script id="reader-data" type="application/json">{packed}</script>')
    path = DIST / "index.html"
    install_bytes(path, page.encode("utf-8"))
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("build", "serve", "open"), nargs="?", default="serve")
    parser.add_argument("--port", default=8765, type=int)
    args = parser.parse_args()
    path = build()
    print(f"Built {path} ({path.stat().st_size:,} bytes)", flush=True)
    if args.action in ("serve","open"):
        handler = partial(CourseHandler, directory=str(DIST))
        try:
            server = CourseServer(("127.0.0.1", args.port), handler)
        except OSError:
            if args.action != "open" or args.port == 0:
                raise
            server = CourseServer(("127.0.0.1", 0), handler)
        with server:
            url = f"http://127.0.0.1:{server.server_port}/"
            print(url, flush=True)
            if args.action == "open":
                webbrowser.open(url)
            server.serve_forever()


if __name__ == "__main__":
    main()
