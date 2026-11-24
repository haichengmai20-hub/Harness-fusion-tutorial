def read_fixture(lab, args):
    if args["path"] not in ("cart.py", "README.md", "tests/test_cart.py"):
        return {"error": "unknown-fixture-file"}
    return {"path": args["path"], "text": (lab.repo / args["path"]).read_text(encoding="utf-8")}


def fix_cart(lab, args):
    path = lab.repo / "cart.py"
    source = path.read_text(encoding="utf-8")
    fixed = source.replace("sum(unit_cents for", "sum(unit_cents * quantity for")
    path.write_text(fixed, encoding="utf-8")
    return {"path": "cart.py", "changed": source != fixed}


# 注册项同时保存公开参数合同和本地处理函数。模型只收到工具名和合同。
TOOLS = {"read": ({"path": "string"}, read_fixture),
         "write_fix": ({}, fix_cart),
         "check_cart": ({}, lambda lab, args: check_cart(lab.repo))}
ARG_TYPES = {"string": str, "integer": int, "boolean": bool}


def public_tools():
    return {name: schema for name, (schema, handler) in TOOLS.items()}


def execute_tool(lab, name, args, call):
    if name not in TOOLS:
        return {"error": "unknown-tool", "name": name}
    schema, handler = TOOLS[name]
    if (not isinstance(args, dict) or set(args) != set(schema)
            or any(type(args[k]) is not ARG_TYPES.get(kind) for k, kind in schema.items())):
        return {"error": "invalid-arguments", "expected": schema, "received": args}
    return handler(lab, args)


def request_one_tool(lab, name, args, dispatch, question):
    def provider(request):
        last = request["messages"][-1]
        if last["role"] == "user":
            return {"tool": name, "args": args}
        result = last["result"]
        if "error" in result:
            return {"final": f"工具返回 {result['error']}，请核对执行记录。"}
        return {"final": f"工具返回 {result}，请独立验证结果。"}
    run_loop(lab, question, provider, dispatch, tools=public_tools())


def demo_tools(lab, failed):
    def provider(request):
        messages = request["messages"]
        if request["tools"].get("read") != {"path": "string"}:
            return {"final": "本轮工具清单没有可用的 read(path) 合同。"}
        if messages[-1]["role"] == "user":
            return {"tool": "scan", "args": {}} if failed else {"tool": "read", "args": {"path": "cart.py"}}
        result = messages[-1]["result"]
        if result.get("error") == "unknown-tool":
            # 错误样本：替换成已注册的名字，但仍传入了错误类型。
            return {"tool": "read", "args": {"path": 12}}
        if "error" in result:
            return {"final": f"读取失败：{result['error']}。"}
        return {"final": "读到的计算式是：" + result["text"].splitlines()[-1].strip()}
    catalog = public_tools()
    lab.event("tools-listed", "从注册表导出可公开的工具名与参数", {}, {"tools": catalog})
    run_loop(lab, "读取金额计算的代码。", provider,
             lambda name, args, call: execute_tool(lab, name, args, call), tools=catalog)


CHAPTERS[2] = demo_tools
