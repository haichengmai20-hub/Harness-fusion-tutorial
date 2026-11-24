"""Check official source links, optionally against local checkouts of the locked revisions."""

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path


HERE = Path(__file__).resolve().parent
FRAMEWORKS = ("hermes", "dsh", "agentscope")


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def git_blob(content):
    header = f"blob {len(content)}\0".encode("ascii")
    return hashlib.sha1(header + content).hexdigest()


def verify(roots):
    cards = load(HERE.parent / "data" / "mappings.json")
    locks = load(HERE / "sources.lock.json")["frameworks"]
    expected_chapters = [f"s{i:02}" for i in range(1, 21)]
    if list(cards) != expected_chapters:
        raise ValueError("课程目录或顺序与固定的 20 章不符")
    counts = Counter()
    anchors = 0
    checked_local = 0
    for framework in FRAMEWORKS:
        source = locks[framework]
        refs = {item["chapter"]: item for item in source["files"]}
        if list(refs) != expected_chapters or len(source["files"]) != 20:
            raise ValueError(f"{framework} 版本锁中的章节不全或重复")
        for chapter, chapter_cards in cards.items():
            if set(chapter_cards) != set(FRAMEWORKS):
                raise ValueError(f"{chapter} 框架选择不完整")
            card, ref = chapter_cards[framework], refs[chapter]
            path, line = ref["path"], ref["line"]
            url = f"{source['repository']}/blob/{source['commit']}/{path}#L{line}"
            if ref["permalink"] != url or card["url"] != url or path not in card["source"]:
                raise ValueError(f"{chapter}/{framework} 源码引用与版本锁不一致")
            if card["evidence"] != ["source-reviewed"]:
                raise ValueError(f"{chapter}/{framework} 本版本仅有源码核对记录")
            counts[card["support"]] += 1
            anchors += len(card.get("anchors", {}))
            if root := roots.get(framework):
                content = (root / path).read_bytes()
                # Git checkouts on Windows may apply CRLF conversion.
                if git_blob(content) != ref["gitBlob"] and git_blob(content.replace(b"\r\n", b"\n")) != ref["gitBlob"]:
                    raise ValueError(f"{framework}/{path} 内容不匹配固定版本")
                lines = content.decode("utf-8").splitlines()
                if not (1 <= line <= len(lines)) or not lines[line - 1].strip():
                    raise ValueError(f"{framework}/{path}:{line} 不能定位到源码")
                checked_local += 1
    return dict(counts), anchors, checked_local


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in FRAMEWORKS:
        parser.add_argument(f"--{name}", type=Path, help="对应固定提交的本地源码根目录")
    result, anchors, local = verify(vars(parser.parse_args()))
    print(f"{sum(result.values())} cards; {anchors} semantic anchors; {local} local line checks; {result}")
