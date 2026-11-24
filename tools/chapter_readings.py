"""Package chapter-level study notes. Third-party source trees stay outside dist."""
import hashlib
import html
import json
from pathlib import Path
import re
import shutil
import subprocess
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parents[1]
PROJECT_KEY = "harness-fusion-tutorial"


def editor_roots():
    roots = {
        PROJECT_KEY: (ROOT, "study.py"),
        "agent-harness-lab": (ROOT.parent / "agent-harness-lab", "ai-daily-scan/src/agents/base.py"),
        "claude-code-internals": (ROOT.parent / "claude-code-internals", "notes/cc-prompt-assembly.md"),
        PROJECT_KEY + "/sources/learn-claude-code": (ROOT / "sources/learn-claude-code", "s10_system_prompt/code.py"),
        PROJECT_KEY + "/sources/claude-code": (ROOT / "sources/claude-code", "src/services/api/claude.ts"),
    }
    return {k: path.as_posix() if (path / marker).is_file() else None for k, (path, marker) in roots.items()}


def packaged_body(source, content, paths, digest, target):
    # Reuse the checked-in rendered page on machines without an authoring tool.
    stamp = f"<!-- source-sha256:{digest} format:1 -->"
    if target.exists() and target.read_bytes().startswith(stamp.encode()):
        return None
    pandoc = shutil.which("pandoc")
    if not pandoc:
        # A changed note can still be read in full on a Python-only installation.
        return "", "<pre>" + html.escape(content.decode("utf-8")) + "</pre>"
    out = subprocess.run([pandoc, "--from=gfm-raw_html", "--to=html5", "--wrap=none"],
                         input=content, stdout=subprocess.PIPE, check=True).stdout.decode("utf-8")

    def rewrite_link(m):
        href = html.unescape(m[1])
        if href.startswith(("https://", "http://", "#")):
            return m[0]
        dest = (source.parent / unquote(href)).resolve()
        if dest in paths:
            return 'href="' + html.escape(paths[dest], quote=True) + '"'
        if dest.is_relative_to(ROOT):
            key = PROJECT_KEY + "/" + dest.relative_to(ROOT).as_posix()
        elif dest.is_relative_to(ROOT.parent):
            key = dest.relative_to(ROOT.parent).as_posix()
        else:
            raise ValueError(f"Reference outside course workspace: {href}")
        return 'data-study-path="' + html.escape(key, quote=True) + '"'

    return stamp, re.sub(r'href="([^"]*)"', rewrite_link, out)


def build_readings(dist, install):
    registry = json.loads((ROOT / "data/chapter-readings.json").read_bytes())
    result = {}
    for chapter, entry in registry.items():
        docs = entry["documents"]
        paths = {(ROOT / item["file"]).resolve(): f"/study-notes/{chapter}/{key}.html"
                 for key, item in docs.items()}
        links = []
        for item in docs.values():
            source = (ROOT / item["file"]).resolve()
            raw = source.read_bytes()
            digest = hashlib.sha256(raw).hexdigest()
            if "sha256" in item and item["sha256"] != digest:
                raise ValueError(f"Confirmed study note differs from its accepted SHA-256: {source.name}")
            url = paths[source]
            target = dist / url.lstrip("/")
            rendered = packaged_body(source, raw, paths, digest, target)
            if rendered is not None:
                stamp, body = rendered
                page = (f'{stamp}<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
                        '<meta name="viewport" content="width=device-width,initial-scale=1">'
                        f'<title>{html.escape(item["title"])}</title><link rel="stylesheet" href="/study-notes/note.css">'
                        f'<header><a href="/?primary=claude&amp;chapter={chapter}&amp;mode=original">← 返回 {chapter.upper()} 原课对读</a></header>'
                        f'<main>{body}</main><script src="/study-notes/local-links.js"></script></html>')
                install(target, page.encode("utf-8"))
            links.append({"title": item["title"], "url": url})
        points = json.loads((ROOT / "data" / entry["pointsFile"]).read_bytes())
        result[chapter] = {"documents": links, "points": points}
    install(dist / "study-notes/note.css", (ROOT / "ui/note.css").read_bytes())
    install(dist / "study-notes/local-links.js", (ROOT / "ui/local-links.js").read_bytes())
    return result
