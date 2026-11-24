"""Build the offline reader from the licensed Chinese v2.0.12 documentation."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import zipfile

HERE = Path(__file__).resolve().parent
COMMIT = "e0ee835d1aca5d2b840d29bdd2f70770bbef69e8"
VERSION = "2.0.12"
PREFIX = f"zh/versions/{VERSION}/"
MOUNT = "/agentscope-course/"
BASE = "https://docs.agentscope.io/" + PREFIX
REPO = "https://github.com/agentscope-ai/docs"
PUBLIC = HERE / "site" / "agentscope-course"


def jsonfile(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf8", newline="\n")


def walk(items, groups=()):
    for item in items:
        if isinstance(item, str):
            yield item.removeprefix(PREFIX), groups
        elif "pages" in item:
            yield from walk(item["pages"], groups + (item["group"],))
        elif "openapi" not in item:
            raise ValueError(f"Unknown documentation group: {item}")


def field(key, header):
    match = re.search("^" + key + r":\s*(.+?)\s*$", header, re.MULTILINE)
    return match[1].strip().strip('"').strip("'") if match else ""


def build(archive):
    PUBLIC.mkdir(exist_ok=True, parents=True)
    points = json.loads((HERE / "points.json").read_bytes())
    with zipfile.ZipFile(archive) as z:
        if z.comment.decode() != COMMIT:
            raise ValueError("Documentation commit differs from the pinned snapshot.")
        root = z.namelist()[0]
        docs = json.loads(z.read(root + "docs.json"))
        version = next(v for lang in docs["navigation"]["languages"] if lang["language"] == "zh"
                       for tab in lang["tabs"] if tab["tab"] == "AgentScope"
                       for v in tab["versions"] if v["version"] == VERSION)
        directory = list(walk(version["groups"]))
        all_slugs = {n.removeprefix(root + PREFIX)[:-4] for n in z.namelist()
                     if n.startswith(root + PREFIX) and n.endswith(".mdx")}
        if set(s for s, _ in directory) != all_slugs or not set(points) <= all_slugs:
            raise ValueError("Document list or comparison key is out of sync.")
        (PUBLIC / "LICENSE.txt").write_bytes(z.read(root + "LICENSE"))
        assets = set()
        catalog, records = [], []
        for slug, groups in directory:
            entry = PREFIX + slug + ".mdx"
            raw = z.read(root + entry)
            doc = raw.decode("utf8")
            header, _ = doc.split("---", 2)[1:]
            title, description = field("title", header), field("description", header)
            assets.update(re.findall(r'(?:src|poster)="(/images/[^"]+)"', doc))
            link = MOUNT if slug == "index" else MOUNT + slug + "/"
            entries = points.get(slug, [])
            catalog.append(dict(id=slug.replace("/", "-"), title=title, heading=title, group=" / ".join(groups),
                                description=description, path=link, online=BASE+slug, source=f"{REPO}/blob/{COMMIT}/{entry}",
                                topics=list(dict.fromkeys(p["topic"] for p in entries if p["topic"])), points=entries, slug=slug))
            records.append({"path": entry, "sha256": hashlib.sha256(raw).hexdigest()})
            target = PUBLIC / "mdx" / (slug + ".mdx")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        duplicates = Counter(l["title"] for l in catalog)
        for lesson in catalog:
            if duplicates[lesson["title"]] > 1:
                lesson["title"] = lesson["group"].split(" / ")[-1] + " · " + lesson["title"]
        for rel in sorted(assets):
            name = rel.lstrip("/")
            blob = z.read(root + name)
            out = PUBLIC / name
            out.parent.mkdir(exist_ok=True, parents=True)
            out.write_bytes(blob)
            records.append({"path": name, "sha256": hashlib.sha256(blob).hexdigest()})
        api = PUBLIC / "openapi.json"
        api_entry = "en/versions/2.0.12/deploy/openapi.json"
        api.write_bytes(z.read(root + api_entry))
        records.append({"path": api_entry, "sha256": hashlib.sha256(api.read_bytes()).hexdigest()})
        upstream_license = hashlib.sha256(z.read(root+"LICENSE")).hexdigest()
    manifest = dict(id="agentscope", name="AgentScope", title="AgentScope 2.0.12 中文官方文档",
                    website=BASE+"index", source=REPO+"/tree/"+COMMIT+"/"+PREFIX.rstrip("/"),
                    license="MIT · Copyright (c) 2023 Mintlify", home=MOUNT, version=VERSION, lessons=catalog)
    jsonfile(HERE / "manifest.json", manifest)
    jsonfile(HERE / "sources.lock.json", {"docsRepo":REPO,"docsCommit":COMMIT,"frameworkVersion":VERSION,
             "frameworkCommit":"28ab5ef6b1d8969c6ed8a3975c2063478a5c4986","locale":"zh",
             "navigation":f"{REPO}/blob/{COMMIT}/docs.json","license":f"{REPO}/blob/{COMMIT}/LICENSE",
             "licenseSha256":upstream_license,"upstreamFiles":records})
    subprocess.run(["node", str(HERE / "render.mjs")], check=True)
    shutil.copyfile(HERE / "reader.css", PUBLIC / "reader.css")
    shutil.copyfile(HERE / "reader.js", PUBLIC / "reader.js")
    print(f"{len(catalog)} original documentation pages, {len(assets)} media assets")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--archive", type=Path, help="Previously downloaded codeload ZIP from the pinned commit")
    args = p.parse_args()
    if args.archive:
        build(args.archive)
    else:
        with tempfile.TemporaryDirectory(prefix="agentscope-docs-") as tmp:
            archive = Path(tmp) / "docs.zip"
            subprocess.run(["curl", "-fLsS", f"https://codeload.github.com/agentscope-ai/docs/zip/{COMMIT}", "-o", str(archive)], check=True)
            build(archive)
