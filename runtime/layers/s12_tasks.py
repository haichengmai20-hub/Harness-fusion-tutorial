def ready_tasks(tasks):
    return [name for name, t in tasks.items()
            if t["status"] == "pending" and all(tasks[d]["status"] == "done" for d in t["depends"])]


def demo_tasks(lab, failed):
    task_file = lab.root / "tasks.json"
    tasks = {"fix": {"status": "pending", "depends": []},
             "verify": {"status": "pending", "depends": ["fix"]}}
    lab.event("tasks-created", "验证任务显式依赖修复任务", {}, {"ready": ready_tasks(tasks), "tasks": tasks})
    if not failed:
        execute_tool(lab, "write_fix", {}, "fix")
        tasks["fix"]["status"] = "done"
    task_file.write_text(json.dumps(tasks), encoding="utf-8")
    restored = json.loads(task_file.read_text(encoding="utf-8"))
    lab.event("tasks-restored", "重开任务表，再计算可以领取的工作",
              {"file": "tasks.json"}, {"ready": ready_tasks(restored), "tasks": restored})
    lab.event("claim-checked", "尝试领取 verify", {"requested": "verify"},
              {"allowed": "verify" in ready_tasks(restored)})


CHAPTERS[12] = demo_tasks
