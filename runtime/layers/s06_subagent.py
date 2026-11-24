def inspect_child(lab, assignment, span):
    # 子调用只获得委派参数；不接收父对话。允许读取的文件由参数决定。
    scope = assignment["allowedFiles"]
    child_messages = [{"role": "user", "content": assignment["question"]}]
    lab.event("child-started", "创建独立子上下文", {"parent": "cart-repair"},
              {"messages": child_messages, "allowedFiles": scope}, span=span)
    if "cart.py" not in scope:
        return {"error": "file-out-of-scope", "file": "cart.py"}
    result = execute_tool(lab, "read", {"path": "cart.py"}, "child-read")
    return {"file": result["path"], "line": result["text"].splitlines()[-1].strip()}


def demo_child(lab, failed):
    lab.messages = [{"role": "user", "content": "修复并说明金额错误。"}]
    assignment = {"question": "找出 cart.py 中的求和表达式。", "allowedFiles": [] if failed else ["cart.py"]}
    lab.event("child-delegated", "父任务交给只读子任务", {"parentMessages": lab.messages},
              {"assignment": assignment}, span="child-1")
    reply = inspect_child(lab, assignment, "child-1")
    lab.messages.append({"role": "tool", "name": "delegate", "result": reply})
    lab.event("child-returned", "父任务只收到子任务的摘要或错误", {"parentMessageCount": 1},
              {"messages": lab.messages}, reply, span="child-1")


CHAPTERS[6] = demo_child
