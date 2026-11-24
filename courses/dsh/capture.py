"""Capture the original published dsh course and adjust its four root-relative asset families."""

import hashlib
import json
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "site" / "dsh-course"
HOST = "https://dsh-from-scratch.pages.dev"
BASE = "/dsh-course"
REVISION = "bc4e47f5024f1f7bc6d8b6ac88ce44fa6e4249af"


def fetch(path):
    with urlopen(Request(HOST + path, headers={"User-Agent": "Mozilla/5.0"}), timeout=40) as response:
        return response.read()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def assets(data):
    text = data.decode("utf-8")
    return set(re.findall(r"""(?<=["'(])/(?:assets/|generated/|favicon|deepseek-harness-logo)[a-zA-Z0-9._/-]+""", text))


def capture():
    pending = {"/"}
    results = {}
    while pending:
        with ThreadPoolExecutor(max_workers=5) as pool:
            jobs = {path: pool.submit(fetch, path) for path in sorted(pending)}
        pending = set()
        for path, job in jobs.items():
            original = job.result()
            if path != "/" and original.lstrip().lower().startswith(b"<!doctype html"):
                raise ValueError(f"Upstream returned HTML for {path}")
            local = original
            if path == "/" or path.endswith((".js", ".css")):
                references = assets(original)
                for ref in sorted(references, key=len, reverse=True):
                    local = local.replace(ref.encode(), (BASE + ref).encode())
                pending.update(references)
            relative = path.lstrip("/") or "index.html"
            output = SITE / relative
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(local)
            results[path] = {"url": HOST + path, "file": relative, "bytes": len(original),
                             "originalSha256": digest(original), "servedSha256": digest(local)}
        pending -= results.keys()
    SNAP = {"website": HOST + "/", "repository": "https://github.com/tsrigo/dsh-from-scratch",
            "referenceCommit": REVISION, "capturedAt": datetime.now(timezone.utc).isoformat(),
            "mount": BASE + "/", "rewrite": "Root-relative assets in the entry HTML, JS and CSS use the local mount.",
            "files": list(results.values())}
    (ROOT / "snapshot.json").write_text(json.dumps(SNAP, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    capture()
