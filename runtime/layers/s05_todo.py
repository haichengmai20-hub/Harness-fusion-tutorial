def demo_todo(lab, failed):
    plan = {"定位": "done", "修复": "pending", "验证": "pending"}
    lab.event("plan-created", "把接下来的工作写入显式计划", {}, {"plan": plan})
    if not failed:
        observed_tool(lab, "write_fix", {}, "todo-write")
    previous = plan.copy()
    plan.update({"修复": "done", "验证": "done"})
    lab.event("plan-updated", "记录计划填写者给出的进度", {"plan": previous}, {"plan": plan})
    result = check_cart(lab.repo)
    if not result["passed"]:
        plan.update({"修复": "pending", "验证": "pending"})
    lab.event("outcome-checked", "用实际金额校正计划", {"reported": "done"},
              {"plan": plan, "check": result})


CHAPTERS[5] = demo_todo
