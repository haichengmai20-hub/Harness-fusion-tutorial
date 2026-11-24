def fixture_server(lab, request):
    # 进程内协议子集，只演示 list/call 的请求结果形状。
    # 省略连接、握手、版本协商、网络传输和实际 MCP SDK。
    reply = {"jsonrpc": "2.0", "id": request["id"]}
    if request["method"] == "tools/list":
        reply["result"] = {"tools": [{"name": "cart_check", "description": "重算两件商品",
                                      "inputSchema": {"type": "object", "properties": {}}}]}
    elif request["method"] == "tools/call" and request["params"]["name"] == "cart_check":
        data = check_cart(lab.repo)
        reply["result"] = {"content": [{"type": "text", "text": json.dumps(data)}]}
    else:
        reply["error"] = {"code": -32602, "message": "该教学服务没有这个工具"}
    return reply


def demo_mcp(lab, failed):
    listing = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
    catalog = fixture_server(lab, listing)
    lab.event("tools-listed", "从本地教学服务发现工具", {"request": listing}, catalog)
    if catalog["id"] != listing["id"] or "error" in catalog:
        raise RuntimeError("工具发现未收到匹配的清单")
    exposed = {"cart/" + item["name"]: item["inputSchema"] for item in catalog["result"]["tools"]}
    next_rpc_id = 2

    def dispatch(local_name, args, call):
        nonlocal next_rpc_id
        rpc = {"jsonrpc": "2.0", "id": next_rpc_id, "method": "tools/call",
               "params": {"name": local_name.removeprefix("cart/"), "arguments": args}}
        next_rpc_id += 1
        lab.event("rpc-requested", "把模型调用转成协议请求",
                  {"localTool": local_name}, {"request": rpc}, call=call)
        reply = fixture_server(lab, rpc)
        matches = reply.get("id") == rpc["id"]
        lab.event("rpc-returned", "按本次协议请求 ID 核对服务响应",
                  {"rpcId": rpc["id"]}, {"rpcReply": reply}, {"matches": matches}, call=call)
        if not matches:
            return {"error": {"message": "rpc-id-mismatch"}, "rpcId": rpc["id"]}
        if "error" in reply:
            return {"error": reply["error"], "rpcId": rpc["id"]}
        return {"content": reply["result"]["content"], "rpcId": rpc["id"]}

    def provider(request):
        last = request["messages"][-1]
        if last["role"] == "user":
            name = "cart/missing_cart" if failed else next(iter(request["tools"]))
            return {"tool": name, "args": {}}
        result = last["result"]
        if "error" in result:
            return {"final": f"{last['id']} 收到错误：{result['error']['message']}。"}
        observed = json.loads(result["content"][0]["text"])
        return {"final": f"{last['id']} 收到协议响应 {result['rpcId']}："
                         f"实际 {observed['actual']} 分，预期 {observed['expected']} 分。"}

    run_loop(lab, "使用外部购物车工具复查金额。", provider, dispatch, tools=exposed)


CHAPTERS[19] = demo_mcp
