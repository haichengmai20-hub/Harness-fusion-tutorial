"""标准库实验入口，加载截至指定章的新增代码。"""
import argparse
import difflib
import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
LAYERS = sorted((ROOT / "runtime" / "layers").glob("s[0-9][0-9]_*.py"))
SCENARIOS = ("normal", "failure")


def evaluate(layers):
    namespace = {"__name__": "tutorial_layers"}
    for path in layers:
        exec(compile(path.read_text(encoding="utf-8"), str(path), "exec"), namespace)
    return namespace


def run(chapter, scenario):
    number = int(chapter[1:])
    if chapter != f"s{number:02d}" or not 1 <= number <= len(LAYERS) or scenario not in SCENARIOS:
        raise ValueError((chapter, scenario))
    namespace = evaluate(LAYERS[:number])
    with TemporaryDirectory(prefix="cart-lab-") as tmp:
        lab = namespace["Lab"](Path(tmp), chapter, scenario)
        namespace["copytree"](ROOT / "fixtures" / "cart_repo", lab.repo,
                              ignore=lambda directory, names: [n for n in names if n == "__pycache__"])
        namespace["CHAPTERS"][number](lab, scenario == "failure")
        return lab.events


def products():
    runs, sources = {}, {}
    previous = ""
    for number, path in enumerate(LAYERS, 1):
        chapter = f"s{number:02d}"
        if not path.name.startswith(chapter + "_"):
            raise ValueError(f"章节文件顺序错误：{path.name}")
        cumulative = previous + f"# ── {path.name} ──\n" + path.read_text(encoding="utf-8").rstrip() + "\n\n"
        patch = "".join(difflib.unified_diff(previous.splitlines(True), cumulative.splitlines(True),
                                             f"s{number - 1:02d}.py", chapter + ".py", n=2))
        runs[chapter] = {case: run(chapter, case) for case in SCENARIOS}
        sources[chapter] = {"code": cumulative, "diff": patch, "path": path.relative_to(ROOT).as_posix()}
        previous = cumulative
    return {"runs": runs, "code": sources}


def main():
    parser = argparse.ArgumentParser(description="中文 Harness 课程离线实验")
    sub = parser.add_subparsers(dest="command", required=True)
    execute = sub.add_parser("run", help="在全新购物车副本执行单个场景")
    execute.add_argument("chapter", choices=[f"s{i:02d}" for i in range(1, len(LAYERS) + 1)])
    execute.add_argument("scenario", choices=SCENARIOS)
    sub.add_parser("export", help="从真实教学执行与源码重建 data/runs.json 和 data/code.json")
    sub.add_parser("check", help="校验已落盘的轨迹与代码是否和重新执行一致")
    args = parser.parse_args()
    if args.command == "run":
        sys.stdout.reconfigure(encoding="utf-8")
        print(json.dumps(run(args.chapter, args.scenario), ensure_ascii=False, indent=2))
        return
    for name, content in products().items():
        dest = ROOT / "data" / f"{name}.json"
        if args.command == "export":
            dest.parent.mkdir(exist_ok=True)
            dest.write_text(json.dumps(content, ensure_ascii=False, separators=(",", ":")) + "\n",
                            encoding="utf-8", newline="\n")
        elif json.loads(dest.read_text(encoding="utf-8")) != content:
            raise SystemExit(f"数据过期：{dest}")
    print("20 chapters / 40 teaching scenarios: OK")


if __name__ == "__main__":
    main()
