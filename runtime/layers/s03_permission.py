WRITE_TARGETS = {"write_fix": "cart.py"}


def permitted_tool(lab, name, args, call, allow_write, executor=None, write_targets=None):
    executor = execute_tool if executor is None else executor
    targets = WRITE_TARGETS if write_targets is None else write_targets
    allowed = name not in targets or allow_write
    lab.event("permission-resolved", "检查本次调用的写入许可",
              {"requested": name}, {"allowed": allowed}, {"resource": targets.get(name)}, call)
    if not allowed:
        return {"error": "permission-denied", "executed": False}
    return executor(lab, name, args, call)


def demo_permission(lab, failed):
    before = check_cart(lab.repo)
    cart_file = lab.repo / "cart.py"
    original_bytes = cart_file.read_bytes()
    request_one_tool(lab, "write_fix", {},
                     lambda n, a, c: permitted_tool(lab, n, a, c, allow_write=not failed),
                     "修复购物车的件数乘法。")
    after = check_cart(lab.repo)
    after["fileBytesChanged"] = cart_file.read_bytes() != original_bytes
    lab.event("outcome-checked", "重算金额并与写入前的文件字节对照", before, after)


CHAPTERS[3] = demo_permission
