"""Check the two local source checkouts under sources/ against the pinned course snapshot. Read-only.

The teaching checkout must be the 20-chapter revision whose code.py files the deployed
course embeds; the product snapshot must stay at the commit it was copied from.
"""
import argparse
import importlib.util
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "sources"
SITE = ROOT / "upstream" / "site" / "zh"
TEACHING = {"directory": "learn-claude-code",
            "repository": "https://github.com/shareAI-lab/learn-claude-code.git",
            "commit": "20e7cbb72c66ab01967299ad3eac6c7bda242136"}
# The product snapshot is proprietary third-party code kept for local reading only.
PRODUCT = {"directory": "claude-code",
           "repository": "https://github.com/tanbiralam/claude-code.git",
           "commit": "6f6f12b37f529488b10e53928dd5508bb93535c7",
           "carriedChanges": {"package.json"}}
CHAPTER_HEADER = re.compile(rb"([0-9a-fA-F]{1,4}):T([0-9a-fA-F]+),")
CHAPTER_FOLDER = re.compile(r"s\d\d_\w+")


def git(root, *args, binary=False):
    if not root.is_dir():
        raise ValueError(f"missing checkout: {root}")
    command = ["git", "--no-pager", "--no-optional-locks", "-C", str(root), "-c", "core.fsmonitor=false", *args]
    result = subprocess.run(command, capture_output=True)
    if result.returncode != 0:
        raise ValueError(f"git {' '.join(args)}: {result.stderr.decode('utf-8', 'replace').strip()}")
    return result.stdout if binary else result.stdout.decode("utf-8").rstrip("\n")


def has_checkout_marker(root):
    """An uninitialized submodule has no .git; initialized submodules may use a gitfile."""
    marker = root / ".git"
    return marker.is_dir() or marker.is_file()


def require_checkout(root):
    # git -C otherwise walks up to the parent repository of an empty submodule directory.
    if not has_checkout_marker(root):
        raise ValueError(f"missing checkout: {root}")
    if Path(git(root, "rev-parse", "--show-toplevel")).resolve() != root.resolve():
        raise ValueError(f"expected a separate worktree rooted at {root}")


def committed(root, spec):
    """Bytes of one file as stored in the commit, whatever the checkout's line endings are."""
    return git(root, "show", f"HEAD:{spec}", binary=True)


def embedded_code(chapter):
    """Concatenate the raw text rows of a chapter's Next payload and return its Python source."""
    data = (SITE / chapter / "index.txt").read_bytes()
    rows, position = {}, 0
    while position < len(data):
        match = CHAPTER_HEADER.match(data, position)
        if match:
            size, start = int(match.group(2), 16), match.end()
            rows.setdefault(match.group(1), []).append(data[start:start + size])
            position = start + size
            if data[position:position + 1] == b"\n":
                position += 1
            continue
        newline = data.find(b"\n", position)
        position = len(data) if newline < 0 else newline + 1
    sources = [b"".join(parts) for parts in rows.values() if b"".join(parts).startswith(b"#!/usr/bin/env python3")]
    if len(sources) != 1:
        raise ValueError(f"{chapter}: expected one embedded Python file, found {len(sources)}")
    return sources[0]


def course_commands():
    spec = importlib.util.spec_from_file_location("course_practice", ROOT / "tools" / "course_practice.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    commands = {}
    for chapter, sections in module.extract_all().items():
        targets = re.findall(r"python (s\d\d_\w+/code\.py)", "".join(
            block["text"] for section in sections for block in section["blocks"] if block["tag"] == "pre"))
        if len(set(targets)) != 1:
            raise ValueError(f"{chapter}: expected one launch command, found {targets}")
        commands[chapter] = targets[0].split("/")[0]
    return commands


def check_teaching():
    repo, problems = SOURCES / TEACHING["directory"], []
    require_checkout(repo)
    for args, expected in ((("remote", "get-url", "origin"), TEACHING["repository"]),
                           (("rev-parse", "HEAD"), TEACHING["commit"])):
        if (actual := git(repo, *args)) != expected:
            problems.append(f"teaching {args[-1]}: {actual} != {expected}")
    if changed := git(repo, "status", "--porcelain", "--untracked-files=no"):
        problems.append(f"teaching tracked files modified: {changed}")
    folders = [name for name in git(repo, "ls-tree", "--name-only", "HEAD").split("\n") if CHAPTER_FOLDER.fullmatch(name)]
    commands = course_commands()
    if len(folders) != 20:
        problems.append(f"teaching revision has {len(folders)} chapter folders, expected 20")
    for number, folder in enumerate(folders, 1):
        chapter = f"s{number:02d}"
        blob = committed(repo, f"{folder}/code.py")
        if blob != embedded_code(chapter):
            problems.append(f"{chapter}: {folder}/code.py differs from the code embedded in the course snapshot")
        if (repo / folder / "code.py").read_bytes().replace(b"\r\n", b"\n") != blob:
            problems.append(f"{chapter}: {folder}/code.py on disk differs from HEAD")
        if commands.get(chapter) != folder:
            problems.append(f"{chapter}: course launches {commands.get(chapter)}, revision has {folder}")
    return f"{len(folders)} chapter folders; expected commit {TEACHING['commit'][:10]}", problems


def check_product():
    repo, problems = SOURCES / PRODUCT["directory"], []
    require_checkout(repo)
    for args, expected in ((("remote", "get-url", "origin"), PRODUCT["repository"]),
                           (("rev-parse", "HEAD"), PRODUCT["commit"])):
        if (actual := git(repo, *args)) != expected:
            problems.append(f"product {args[-1]}: {actual} != {expected}")
    # Porcelain v1 lines are "XY path"; keep the leading status column intact.
    changed = git(repo, "status", "--porcelain", "--untracked-files=no").splitlines()
    unexpected = [line for line in changed if line[:2] not in {" M", "M ", "MM"}
                  or line[3:] not in PRODUCT["carriedChanges"]]
    if unexpected:
        problems.append(f"unexpected product tracked changes: {unexpected}")
    files = git(repo, "ls-tree", "-r", "--name-only", "HEAD").split("\n")
    return f"{PRODUCT['commit'][:10]}, {sum(name.startswith('src/') for name in files)} files under src/", problems


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("check", nargs="*", choices=(["teaching", "product"]), default=["teaching", "product"])
    failures = []
    for name in parser.parse_args().check:
        try:
            summary, problems = (check_teaching if name == "teaching" else check_product)()
        except (OSError, ValueError) as error:
            print(f"{name}: check failed")
            failures.append(f"{name}: {error}")
            continue
        print(f"{name}: {summary}; {len(problems)} problems")
        failures += [f"{name}: {problem}" for problem in problems]
    for failure in failures:
        print("  " + failure, file=sys.stderr)
    sys.exit(1 if failures else 0)
