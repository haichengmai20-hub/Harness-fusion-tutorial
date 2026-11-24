def run_suite(repo):
    # 在独立 Python 进程运行副本里的 unittest，回传可比较的结构化结果。
    script = """import io, json, os, sys, unittest
sys.path.insert(0, os.getcwd())
suite = unittest.defaultTestLoader.discover("tests")
class ObservedResults(unittest.TextTestResult):
    def addSuccess(self, test):
        super().addSuccess(test)
        successes.append(test.id())
successes = []
result = unittest.TextTestRunner(stream=io.StringIO(), resultclass=ObservedResults).run(suite)
print(json.dumps({"count": result.testsRun, "passedTestIds": sorted(successes), "failures": [c.id() for c, _ in result.failures],
                  "errors": [c.id() for c, _ in result.errors], "passed": result.wasSuccessful()}))
"""
    proc = subprocess.run([sys.executable, "-I", "-B", "-c", script], cwd=repo,
                          capture_output=True, text=True, check=True, timeout=10)
    return json.loads(proc.stdout)


def integration_tool(lab, name, args, call):
    if name != "add_regression":
        return execute_tool(lab, name, args, call)
    if args:
        return {"error": "invalid-arguments", "expected": {}}
    test_file = lab.repo / "tests" / "test_cart.py"
    source = test_file.read_text(encoding="utf-8")
    test = ("\n    def test_mixed_items(self):\n"
            "        self.assertEqual(total_cents([(350, 2), (20, 3)]), 760)\n")
    if test in source:
        return {"path": "tests/test_cart.py", "changed": False}
    test_file.write_text(source + test, encoding="utf-8")
    lab.event("regression-added", "补充混合商品回归断言",
              {"case": "2 × 350 + 3 × 20"}, {"expected": 760, "file": "tests/test_cart.py"}, call=call)
    return {"path": "tests/test_cart.py", "changed": True}


def repair_provider(request):
    last = request["messages"][-1]
    if last["role"] == "user":
        return {"tool": "write_fix", "args": {}}
    result = last["result"]
    if "error" in result:
        return {"final": f"工具返回 {result['error']}，结束写入，保留现场等待检查。"}
    if result["path"] == "cart.py":
        return {"tool": "add_regression", "args": {}}
    return {"final": "实现和测试已返回，等待执行验证。"}


def meets_acceptance(background, suite):
    required = {"test_cart.CartTests.test_two_units", "test_cart.CartTests.test_mixed_items"}
    return (background["status"] == "finished" and background["result"]["passed"]
            and suite["passed"] and required.issubset(suite["passedTestIds"]))


def demo_integration(lab, failed):
    plan = {"定位": "running", "修复": "pending", "验证": "pending"}
    lab.event("plan-created", "建立修复计划", {}, {"plan": plan})
    finding = inspect_child(lab, {"question": "定位购物车求和", "allowedFiles": ["cart.py"]}, "diagnose")
    plan["定位"] = "done"
    lab.event("child-returned", "子任务返回表达式，复跑原测试",
              {"finding": finding}, {"baselineTests": run_suite(lab.repo), "cart": check_cart(lab.repo)},
              span="diagnose")
    targets = {**WRITE_TARGETS, "add_regression": "tests/test_cart.py"}
    run_loop(lab, "修复购物车并补充测试。", repair_provider,
             lambda n, a, c: observed_tool(lab, n, a, c, allow_write=not failed,
                                           executor=integration_tool, write_targets=targets),
             tools={**public_tools(), "add_regression": {}})
    queue = CheckQueue()
    queue.submit("verify", lab.repo)
    lab.event("job-submitted", "提交后台金额检查", {}, queue.poll("verify"))
    queue.advance("verify")
    cart_check = queue.poll("verify")
    tests = run_suite(lab.repo)
    completed = meets_acceptance(cart_check, tests)
    plan["修复"] = "done" if cart_check["result"]["passed"] else "pending"
    plan["验证"] = "done" if completed else "blocked"
    lab.event("outcome-checked", "汇总后台结果、真实 unittest 和计划状态",
              {"job": "verify"}, {"job": cart_check, "tests": tests, "plan": plan,
                                  "completed": completed})


CHAPTERS[20] = demo_integration
