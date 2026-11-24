def build_request(repo, include_policy):
    policy = (repo / "README.md").read_text(encoding="utf-8").splitlines()[2]
    parts = ["你在修复教学购物车。"]
    if include_policy:
        parts.append(policy)
    parts.append("每轮最多申请 1 次写入。")
    return {"system": "\n".join(parts), "tools": list(TOOLS),
            "messages": [{"role": "user", "content": "解释 350 分的差异。"}]}


def demo_prompt(lab, failed):
    request = build_request(lab.repo, include_policy=not failed)
    lab.event("config-read", "读取系统角色、仓库约束和工具清单", {},
              {"policyFile": "README.md", "tools": list(TOOLS), "writeBudget": 1})
    lab.event("request-built", "检查实际发送给教学模型的请求",
              {"policyFileAvailable": True}, request)
    lab.event("outcome-checked", "在 system 字段中查找单位和预算", {},
              {"hasCents": "整数分" in request["system"], "hasBudget": "1 次写入" in request["system"]})


CHAPTERS[10] = demo_prompt
