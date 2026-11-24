def merge_file(path, base, incoming):
    current = path.read_text(encoding="utf-8")
    if current != base and current != incoming:
        return "conflict"
    path.write_text(incoming, encoding="utf-8")
    return "merged"


def demo_workspace(lab, failed):
    # 普通目录副本与单文件基线，演示隔离和冲突，没有创建 Git 分支。
    scratch = lab.root / "worker-copy"
    copytree(lab.repo, scratch)
    target = lab.repo / "cart.py"
    base = target.read_text(encoding="utf-8")
    patch_file = scratch / "cart.py"
    incoming = base.replace("sum(unit_cents for", "sum(unit_cents * quantity for")
    patch_file.write_text(incoming, encoding="utf-8")
    lab.event("workspace-isolated", "在工作者副本修改后分别执行两个版本",
              {"copies": ["cart_repo", "worker-copy"]}, {"main": check_cart(lab.repo), "worker": check_cart(scratch)})
    if failed:
        target.write_text(base + "\n# 主目录已收到另一位工作者的改动\n", encoding="utf-8")
    before = target.read_text(encoding="utf-8")
    status = merge_file(target, base, patch_file.read_text(encoding="utf-8"))
    lab.event("merge-checked", "将主目录当前文本与分叉时基线比较",
              {"targetMatchesBase": before == base},
              {"status": status, "targetUnchanged": target.read_text(encoding="utf-8") == before,
               "main": check_cart(lab.repo)})


CHAPTERS[18] = demo_workspace
