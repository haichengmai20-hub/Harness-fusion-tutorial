def demo_team(lab, failed):
    old_snapshot = lab.root / "review-copy"
    copytree(lab.repo, old_snapshot)
    tasks = {"fix": "builder", "verify": "reviewer"}
    lab.event("team-assigned", "把修复和独立复核交给两个角色", {}, {"owners": tasks})
    fix = observed_tool(lab, "write_fix", {}, "builder-write")
    lab.event("member-reported", "修复者提交变更摘要", {"role": "builder"}, fix, span="builder")
    review_repo = old_snapshot if failed else lab.repo
    verdict = check_cart(review_repo)
    lab.event("member-reported", "复核者在自己的输入版本上重算金额",
              {"role": "reviewer", "snapshot": "起始副本" if failed else "修复后副本"},
              verdict, span="reviewer")
    lab.event("team-collected", "负责人同时核对修复结果和复核输入",
              {"owners": tasks}, {"write": fix, "review": verdict, "agreed": verdict["passed"]})


CHAPTERS[15] = demo_team
