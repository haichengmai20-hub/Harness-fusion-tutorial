"""累计教学实现。直接运行请用 runtime/lab.py。"""
import inspect
import json
import runpy
import subprocess
import sys
from copy import deepcopy
from pathlib import Path
from shutil import copytree

CHAPTERS = {}


class Lab:
    def __init__(self, root, chapter, scenario):
        self.root = root
        self.repo = root / "cart_repo"
        self.chapter = chapter
        self.scenario = scenario
        self.events = []
        self.messages = []

    def event(self, step, title, before, after, payload=None, call=None, span=None):
        # 每一步展示被观察的局部变量，立即复制以保留当时的值。
        frame = inspect.currentframe().f_back
        filename = Path(frame.f_code.co_filename).name
        self.events.append(deepcopy({
            "runId": f"{self.chapter}-{self.scenario}", "chapterId": self.chapter,
            "harness": "common", "mode": "teaching-simulation",
            "seq": len(self.events) + 1, "semanticStep": step,
            "eventType": step, "title": title, "toolCallId": call,
            "parentSpanId": span, "before": before, "after": after,
            "payload": payload or {},
            "sourceRef": f"runtime/layers/{filename}#{frame.f_code.co_name}",
        }))

    def message(self, step, title, message, call=None):
        before = list(self.messages)
        self.messages.append(message)
        self.event(step, title, {"messages": before}, {"messages": self.messages}, message, call)


def check_cart(repo):
    # 执行固定教学快照中的纯函数。输入数据由本实验提供。
    total = runpy.run_path(str(repo / "cart.py"))["total_cents"]
    actual = total([(350, 2)])
    return {"actual": actual, "expected": 700, "passed": actual == 700}


def run_loop(lab, user, provider, dispatch, budget=6, **request_fields):
    lab.message("user-input", "用户把购物车问题交给模型", {"role": "user", "content": user})
    for turn in range(1, budget + 1):
        request = {**request_fields, "messages": list(lab.messages)}
        lab.event("request-built", "构造本轮模型输入", {"turn": turn},
                  {"messageCount": len(lab.messages)}, request)
        action = provider(request)
        if "tool" not in action:
            lab.message("assistant-finished", "模型给出最终回复",
                        {"role": "assistant", "content": action["final"]})
            return
        call = f"call-{turn}"
        lab.message("tool-requested", "模型请求调用 " + action["tool"],
                    {"role": "assistant", "tool": action["tool"], "args": action["args"], "id": call}, call)
        result = dispatch(action["tool"], action["args"], call)
        lab.message("tool-finished", "把工具结果交回模型",
                    {"role": "tool", "id": call, "result": result}, call)
    lab.event("budget-exhausted", "模型轮次用尽", {"budget": budget}, {"stopped": True})


def demo_loop(lab, failed):
    def provider(request):
        messages = request["messages"]
        if failed:
            return {"final": "我已经修好了。"}
        if messages[-1]["role"] == "user":
            return {"tool": "check_cart", "args": {}}
        result = messages[-1]["result"]
        return {"final": f"已复现，得到 {result['actual']} 分，预期 {result['expected']} 分。"}

    run_loop(lab, "请检查两件单价 350 分的商品。", provider,
             lambda name, args, call: check_cart(lab.repo))
    checked = any(m["role"] == "tool" for m in lab.messages)
    lab.event("outcome-checked", "用独立断言核对模型的说法",
              {"hasToolResult": checked}, check_cart(lab.repo),
              {"finding": "已复现，尚未修复" if checked else "回复称已修复，文件仍复现错误"})


CHAPTERS[1] = demo_loop
