import ast
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
from threading import Barrier
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "runtime"))
import lab


def fingerprint():
    fixture = ROOT / "fixtures" / "cart_repo"
    return {p.relative_to(fixture): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in fixture.rglob("*") if p.is_file() and "__pycache__" not in p.parts}


class TeachingRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        original = fingerprint()
        artifacts = lab.products()
        assert fingerprint() == original
        cls.runs = artifacts["runs"]
        cls.code = artifacts["code"]

    def events(self, chapter, scenario="normal"):
        return self.runs[f"s{chapter:02d}"][scenario]

    def last(self, chapter, scenario="normal"):
        return self.events(chapter, scenario)[-1]["after"]

    def test_replay_matches_fresh_execution_and_sources(self):
        for key, actual in (("runs", self.runs), ("code", self.code)):
            stored = json.loads((ROOT / "data" / f"{key}.json").read_text(encoding="utf-8"))
            self.assertEqual(actual, stored, key)

    def test_snapshots_are_cumulative_and_references_point_to_real_symbols(self):
        previous = ""
        self.assertEqual(len(self.code), 20)
        source_symbols = {p.name: {n.name for n in ast.walk(ast.parse(p.read_text(encoding="utf-8")))
                                  if isinstance(n, (ast.FunctionDef, ast.ClassDef))} for p in lab.LAYERS}
        for chapter, entry in self.code.items():
            self.assertTrue(entry["code"].startswith(previous))
            self.assertIn((ROOT / entry["path"]).read_text(encoding="utf-8").strip(), entry["code"][len(previous):])
            ns = {}
            exec(compile(entry["code"], chapter, "exec"), ns)
            self.assertEqual(len(ns["CHAPTERS"]), int(chapter[1:]))
            previous = entry["code"]
            for events in self.runs[chapter].values():
                self.assertEqual([e["seq"] for e in events], list(range(1, len(events) + 1)))
                for event in events:
                    path, symbol = event["sourceRef"].split("#")
                    self.assertIn(symbol, source_symbols[Path(path).name])
                    self.assertEqual(event["mode"], "teaching-simulation")
                    self.assertEqual(event["chapterId"], chapter)

    def test_loop_needs_tool_result_to_support_claim(self):
        events = self.events(1)
        messages = next(e["after"]["messages"] for e in events if e["semanticStep"] == "assistant-finished")
        self.assertEqual([m["role"] for m in messages], ["user", "assistant", "tool", "assistant"])
        self.assertEqual(messages[1]["id"], messages[2]["id"])
        self.assertEqual(messages[2]["result"], {"actual": 350, "expected": 700, "passed": False})
        self.assertFalse(self.events(1, "failure")[-1]["before"]["hasToolResult"])

    def test_unknown_tool_and_argument_type_do_not_read(self):
        def results(scenario):
            return [e["payload"]["result"] for e in self.events(2, scenario) if e["semanticStep"] == "tool-finished"]
        self.assertIn("sum(unit_cents for", results("normal")[0]["text"])
        self.assertEqual([r["error"] for r in results("failure")], ["unknown-tool", "invalid-arguments"])

    def test_permission_denial_never_reaches_dispatch(self):
        scope = lab.evaluate(lab.LAYERS[:3])
        def fail_if_called(*args):
            self.fail("拒绝时调用了执行器")
        scope["execute_tool"] = fail_if_called
        with TemporaryDirectory() as tmp:
            context = scope["Lab"](Path(tmp), "s03", "failure")
            verdict = scope["permitted_tool"](context, "write_fix", {}, "c", False)
        self.assertFalse(verdict["executed"])
        self.assertEqual(self.last(3)["actual"], 700)
        self.assertEqual(self.last(3, "failure")["actual"], 350)
        self.assertTrue(self.last(3)["fileBytesChanged"])
        self.assertFalse(self.last(3, "failure")["fileBytesChanged"])

    def test_hook_order_and_pre_hook_exception(self):
        for scenario in ("normal", "failure"):
            steps = [e["semanticStep"] for e in self.events(4, scenario)]
            if scenario == "normal":
                order = ["tool-requested", "hook-before", "permission-resolved", "hook-after", "tool-finished"]
                self.assertEqual([s for s in steps if s in order], order)
            else:
                self.assertIn("hook-failed", steps)
                self.assertNotIn("hook-after", steps)
                self.assertNotIn("permission-resolved", steps)
                self.assertFalse(self.last(4, scenario)["passed"])

    def test_hooks_accept_external_observers(self):
        scope = lab.evaluate(lab.LAYERS[:4])
        called = []

        def before(name, args, call):
            called.append(("before", call, args))
            return {"observer": "custom-pre"}

        def after(name, result, call):
            called.append(("after", call, result))
            return {"observer": "custom-post"}

        with TemporaryDirectory() as tmp:
            context = scope["Lab"](Path(tmp), "s04", "normal")
            scope["copytree"](ROOT / "fixtures" / "cart_repo", context.repo)
            scope["observed_tool"](context, "write_fix", {}, "x", before_hook=before, after_hook=after)
        self.assertEqual([x[:2] for x in called], [("before", "x"), ("after", "x")])
        self.assertTrue(called[1][2]["changed"])
        self.assertEqual(context.events[-1]["after"], {"observer": "custom-post"})

    def test_after_hook_error_preserves_applied_write_and_forwarded_result(self):
        scope = lab.evaluate(lab.LAYERS[:4])

        def raise_after(*args):
            raise RuntimeError("日志目的地不可用")

        with TemporaryDirectory() as tmp:
            context = scope["Lab"](Path(tmp), "s04", "normal")
            scope["copytree"](ROOT / "fixtures" / "cart_repo", context.repo)
            scope["request_one_tool"](context, "write_fix", {},
                lambda n, a, c: scope["observed_tool"](context, n, a, c, after_hook=raise_after), "修复。")
            state = scope["check_cart"](context.repo)
        self.assertEqual(state["actual"], 700)
        result = context.messages[-2]["result"]
        self.assertTrue(result["operationResult"]["changed"])
        self.assertIn(result["error"], context.messages[-1]["content"])
        self.assertEqual(sum(m.get("tool") == "write_fix" for m in context.messages), 1)

    def test_second_turn_uses_observed_tool_result(self):
        scope = lab.evaluate(lab.LAYERS[:4])
        # 切断真实文件读取，替换工具输出，再看相同问题的第二轮文字是否跟着改变。
        scope["execute_tool"] = lambda *args: {"text": "return injected_total"}
        with TemporaryDirectory() as tmp:
            context = scope["Lab"](Path(tmp), "s02", "normal")
            scope["demo_tools"](context, False)
        self.assertIn("return injected_total", context.messages[-1]["content"])

    def test_registered_schema_drives_dispatch_and_reaches_provider(self):
        scope = lab.evaluate(lab.LAYERS[:2])
        called = []
        def example(lab_context, args):
            called.append(args["quantity"])
            return {"quantity": args["quantity"]}
        scope["TOOLS"]["example"] = ({"quantity": "integer"}, example)
        with TemporaryDirectory() as tmp:
            context = scope["Lab"](Path(tmp), "s02", "normal")
            execute = scope["execute_tool"]
            self.assertEqual(execute(context, "example", {"quantity": 2}, "a"), {"quantity": 2})
            self.assertEqual(execute(context, "example", {"quantity": True}, "b")["error"], "invalid-arguments")
            self.assertEqual(called, [2])
            del scope["TOOLS"]["read"]
            scope["demo_tools"](context, False)
        self.assertIn("没有可用的 read(path)", context.messages[-1]["content"])
        self.assertFalse(any(e["semanticStep"] == "tool-requested" for e in context.events))
        first_request = next(e for e in context.events if e["semanticStep"] == "request-built")
        self.assertEqual(first_request["payload"]["tools"]["example"], {"quantity": "integer"})
        self.assertNotIn("tools", self.events(1)[1]["payload"])

    def test_progress_is_corrected_and_child_scope_is_explicit(self):
        self.assertEqual(self.last(5, "failure")["plan"]["验证"], "pending")
        child = self.events(6, "failure")
        self.assertEqual(child[-1]["payload"]["error"], "file-out-of-scope")
        self.assertEqual(child[1]["after"]["messages"], [{"role": "user", "content": "找出 cart.py 中的求和表达式。"}])

    def test_skill_body_compaction_and_new_session_memory(self):
        self.assertTrue(self.last(7)["bodyVisible"])
        self.assertFalse(self.last(7, "failure")["bodyVisible"])
        self.assertEqual(self.last(8, "failure"), {"constraintVisible": False, "originalIntact": True})
        self.assertTrue(self.last(8)["constraintVisible"])
        self.assertEqual(self.last(9), {"messages": [], "recalled": {"testNames": "English"}})
        self.assertEqual(self.last(9, "failure"), {"messages": [], "recalled": {}})

    def test_request_observability_and_uncertain_writes(self):
        self.assertTrue(self.last(10)["hasCents"])
        self.assertFalse(self.last(10, "failure")["hasCents"])
        outcome = self.last(11, "failure")
        self.assertEqual(outcome["writeRetries"], 0)
        self.assertTrue(outcome["check"]["passed"])
        self.assertIn("text", self.last(11))

    def test_persistence_background_and_idempotent_ticks(self):
        self.assertTrue(self.last(12)["allowed"])
        self.assertFalse(self.last(12, "failure")["allowed"])
        self.assertTrue(self.last(13)["result"]["passed"])
        self.assertIsNone(self.last(13, "failure")["result"])
        self.assertEqual(self.last(14, "failure")["jobs"], ["check@5"])
        self.assertFalse(self.last(14, "failure")["triggered"])

    def test_team_ownership_and_duplicate_deliveries(self):
        self.assertTrue(self.last(15)["agreed"])
        self.assertFalse(self.last(15, "failure")["agreed"])
        self.assertEqual(self.last(16, "failure"), {"receivedIds": ["msg-1"], "status": "duplicate"})
        competing = self.events(17, "failure")
        claims = [e["after"] for e in competing if e["semanticStep"] == "claim-resolved"]
        self.assertEqual(claims, [{"owner": "A", "won": True}, {"owner": "A", "won": False}])
        self.assertEqual([e["after"]["idleCount"] for e in competing if e["semanticStep"] == "worker-idle"], [1, 2])
        self.assertEqual(self.last(17, "failure"), {"reason": "idle-limit", "allTasksDone": False})

    def test_simultaneous_claims_only_one_worker_wins(self):
        scope = lab.evaluate(lab.LAYERS[:17])
        claim = scope["claim_task"]
        barrier = Barrier(2)
        with TemporaryDirectory() as tmp:
            database = Path(tmp) / "test.db"
            scope["seed_tasks"](database)

            def compete(worker):
                barrier.wait(timeout=5)
                return claim(database, "cart-fix", worker)
            with ThreadPoolExecutor(max_workers=2) as pool:
                outcomes = list(pool.map(compete, ("A", "B")))
        self.assertEqual(sum(won for won, owner in outcomes), 1)
        self.assertEqual(len({owner for won, owner in outcomes}), 1)

    def test_task_discovery_rechecks_dependency_before_claim(self):
        scope = lab.evaluate(lab.LAYERS[:17])
        with TemporaryDirectory() as tmp:
            database = Path(tmp) / "tasks.db"
            scope["seed_tasks"](database)
            discover, claim = scope["discover_tasks"], scope["claim_task"]
            self.assertEqual(discover(database)[0], ["cart-fix"])
            self.assertEqual(claim(database, "cart-verify", "B"), (False, None))
            self.assertEqual(claim(database, "cart-fix", "A"), (True, "A"))
            self.assertEqual(discover(database)[0], [])
            db = sqlite3.connect(database)
            with db:
                db.execute("UPDATE task SET status='done' WHERE name='cart-fix'")
            self.assertEqual(discover(database)[0], ["cart-verify"])
            with db:
                db.execute("UPDATE task SET status='running' WHERE name='cart-fix'")
            db.close()
            self.assertEqual(claim(database, "cart-verify", "B"), (False, None))

    def test_isolation_merge_conflict_and_protocol_ids(self):
        isolated = self.events(18)[0]["after"]
        self.assertNotEqual(isolated["main"]["actual"], isolated["worker"]["actual"])
        self.assertTrue(self.last(18)["main"]["passed"])
        self.assertTrue(self.last(18, "failure")["targetUnchanged"])
        self.assertEqual(self.last(18, "failure")["status"], "conflict")
        for scenario in ("normal", "failure"):
            events = self.events(19, scenario)
            requested = next(e for e in events if e["semanticStep"] == "rpc-requested")
            returned = next(e for e in events if e["semanticStep"] == "rpc-returned")
            tool = next(e for e in events if e["semanticStep"] == "tool-finished")
            requests = [e["payload"] for e in events if e["semanticStep"] == "request-built"]
            self.assertEqual(requested["toolCallId"], returned["toolCallId"])
            self.assertEqual(tool["payload"]["id"], requested["toolCallId"])
            self.assertEqual(requested["after"]["request"]["id"], returned["after"]["rpcReply"]["id"])
            self.assertEqual(requests[1]["messages"][-1], tool["payload"])
            self.assertIn("cart/cart_check", requests[0]["tools"])
            final = events[-1]["payload"]["content"]
            self.assertIn("350" if scenario == "normal" else "没有这个工具", final)

    def test_mcp_second_turn_changes_with_response_and_rejects_wrong_id(self):
        scope = lab.evaluate(lab.LAYERS[:19])
        original = scope["fixture_server"]
        for matched in (True, False):
            def server(lab_context, request):
                if request["method"] == "tools/list":
                    return original(lab_context, request)
                return {"id": request["id"] if matched else 999, "result": {"content": [
                    {"type": "text", "text": json.dumps({"actual": 271, "expected": 700})}]}}
            scope["fixture_server"] = server
            with TemporaryDirectory() as tmp:
                context = scope["Lab"](Path(tmp), "s19", "normal")
                scope["demo_mcp"](context, False)
            final = context.messages[-1]["content"]
            self.assertIn("271" if matched else "rpc-id-mismatch", final)
            if not matched:
                self.assertNotIn("271", final)

    def test_integration_checks_real_tests_and_preserves_negative_case(self):
        baseline = next(e for e in self.events(20) if e["semanticStep"] == "child-returned")["after"]["baselineTests"]
        self.assertEqual((baseline["count"], len(baseline["failures"])), (1, 1))
        positive = self.last(20)
        self.assertTrue(positive["completed"])
        self.assertEqual(positive["tests"]["count"], 2)
        self.assertIn("test_cart.CartTests.test_mixed_items", positive["tests"]["passedTestIds"])
        permissions = [e for e in self.events(20) if e["semanticStep"] == "permission-resolved"]
        self.assertEqual([e["payload"]["resource"] for e in permissions], ["cart.py", "tests/test_cart.py"])
        suite = {**positive["tests"], "passedTestIds": ["test_cart.CartTests.test_two_units"]}
        scope = lab.evaluate(lab.LAYERS)
        self.assertFalse(scope["meets_acceptance"](positive["job"], suite))
        negative = self.last(20, "failure")
        self.assertFalse(negative["completed"])
        self.assertEqual(negative["job"]["result"]["actual"], 350)
        self.assertEqual(len(negative["tests"]["failures"]), 1)


if __name__ == "__main__":
    unittest.main()
