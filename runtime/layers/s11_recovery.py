def demo_recovery(lab, failed):
    # 注入故障的时点决定重试是否可能重复写入。
    name = "write_fix" if failed else "read"
    args = {} if failed else {"path": "cart.py"}
    for attempt in (1, 2):
        try:
            if name == "read" and attempt == 1:
                raise TimeoutError("读取前超时")
            result = execute_tool(lab, name, args, "request-1")
            if name == "write_fix":
                raise TimeoutError("写入后回执丢失")
            lab.event("tool-finished", "重试拿到读取结果", {"attempt": attempt}, result, call="request-1")
            return
        except TimeoutError as exc:
            lab.event("tool-failed", "记录故障发生的位置", {"attempt": attempt},
                      {"error": str(exc), "tool": name}, call="request-1")
            if name == "write_fix":
                lab.event("state-reconciled", "先读回当前文件来判定是否已经写入",
                          {"writeReceipt": None}, {"check": check_cart(lab.repo), "writeRetries": 0},
                          call="request-1")
                return
            lab.event("retry-scheduled", "只读操作可用剩余预算重试一次",
                      {"remainingRetries": 1}, {"remainingRetries": 0}, call="request-1")


CHAPTERS[11] = demo_recovery
