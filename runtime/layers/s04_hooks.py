def record_request(name, args, call):
    return {"id": call, "requested": name, "argumentKeys": list(args)}


def record_result(name, result, call):
    return {"id": call, "tool": name, "observed": result}


def observed_tool(lab, name, args, call, allow_write=True,
                  before_hook=record_request, after_hook=record_result, executor=None, write_targets=None):
    try:
        observation = before_hook(name, args, call)
    except Exception as exc:
        lab.event("hook-failed", "前置 Hook 异常，结束本次调用",
                  {"hook": "before"}, {"executed": False}, {"error": str(exc)}, call)
        return {"error": "before-hook-failed", "executed": False}
    lab.event("hook-before", "前置 Hook 收到调用参数", {"tool": name}, observation, call=call)
    result = permitted_tool(lab, name, args, call, allow_write, executor, write_targets)
    try:
        observation = after_hook(name, result, call)
    except Exception as exc:
        lab.event("hook-failed", "后置 Hook 抛错，保留已经收到的执行结果",
                  {"hook": "after", "operationResult": result}, {"error": str(exc)}, call=call)
        return {"error": "after-hook-failed", "operationResult": result}
    lab.event("hook-after", "后置 Hook 记录执行返回值", {"tool": name},
              observation, call=call)
    return result


def demo_hooks(lab, failed):
    def broken_observer(name, args, call):
        raise ValueError("观测器加载的规则有误")

    before = check_cart(lab.repo)
    request_one_tool(lab, "write_fix", {},
                     lambda n, a, c: observed_tool(lab, n, a, c,
                                                   before_hook=broken_observer if failed else record_request),
                     "用 Hook 记录这次修复。")
    lab.event("outcome-checked", "重算金额，核对 Hook 路径的副作用", before, check_cart(lab.repo))


CHAPTERS[4] = demo_hooks
