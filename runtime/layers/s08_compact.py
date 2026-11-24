def compact_history(history, keep_constraint):
    finding = history[1]["content"]
    retained = [{"role": "summary",
                 "content": f"上次检查实得 {finding['actual']} 分，预期 {finding['expected']} 分。"}]
    if keep_constraint:
        retained.insert(0, history[0])
    return retained + [history[-1]]


def demo_compact(lab, failed):
    total = runpy.run_path(str(lab.repo / "cart.py"))["total_cents"]
    diagnostics = [{"quantity": n, "actual": total([(350, n)]), "expected": 350 * n}
                   for n in range(1, 9)]
    archive = [{"role": "user", "content": "保持整数分和 total_cents 接口。"},
               {"role": "tool", "content": check_cart(lab.repo)},
               {"role": "tool", "content": diagnostics},
               {"role": "assistant", "content": "下一步修改计算式。"}]
    ledger = lab.root / "turns.json"
    ledger.write_text(json.dumps(archive, ensure_ascii=False), encoding="utf-8")
    lab.event("history-archived", "把原始消息保存为只读实验基准", {},
              {"archiveLength": len(archive)}, {"file": "turns.json"})
    visible = compact_history(archive, keep_constraint=not failed)
    lab.event("context-compacted", "从四条原始消息构造下一轮可见输入",
              {"messages": archive}, {"messages": visible})
    recovered = json.loads(ledger.read_text(encoding="utf-8"))
    lab.event("outcome-checked", "在模型输入和磁盘原文中分别查找金额约束", {},
              {"constraintVisible": recovered[0] in visible, "originalIntact": recovered == archive})


CHAPTERS[8] = demo_compact
