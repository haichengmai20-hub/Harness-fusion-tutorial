# s10 在 Agent Harness Lab 里的一个可跑例子

**昨天分析过的项目多了一个，今天生成搜索画像时，哪一项请求参数应该变？** 在 `ai-daily-scan` 的 `ProfilerAgent` 里，改的是第一条用户消息。角色说明和输出格式都能沿用。若改的是输出工具的说明，则第一条用户消息保持原样，变化移到 `tools`。

沿一个动作看清三个字段：

| 实际入口 | 它交给下一步什么 |
| --- | --- |
| `ProfilerAgent.__init__` | 将固定的 `PROFILER_SYSTEM` 赋给 `self.system_prompt`。这个角色没有搜索类业务工具，但定义了要交付的结构化画像。 |
| `ProfilerAgent.run_with_context` | 把公司画像、待覆盖方向、近期项目标题拼成一段文字，作为 `self.run(...)` 的用户输入。 |
| `BaseAgent.run` | 将 `final_output` 加入工具清单。每轮传入 `system=self.system_prompt`、`tools=all_tools` 和 `messages=messages`。若上一轮只返回文字，循环还会向消息历史追加交付提醒。 |

[画像角色与输入拼装](../../agent-harness-lab/ai-daily-scan/src/agents/profiler.py) · [模型请求与工具清单](../../agent-harness-lab/ai-daily-scan/src/agents/base.py) · [交付字段定义](../../agent-harness-lab/ai-daily-scan/src/schemas.py)

## 在 PowerShell 中复现

从工作区运行下段命令即可。只用 Python 标准库。脚本调用仓库里的 `ProfilerAgent.run_with_context` 与 `BaseAgent.run`，在 SDK 入口截取完整参数。客户端固定先回一段文字、再调用 `final_output`，所以每组都能走到第二轮。SDK 和会加载凭据的配置模块由内存替身提供。

```powershell
Set-Location -LiteralPath 'D:\RL及harness'
@'
from copy import deepcopy
from pathlib import Path
from types import ModuleType, SimpleNamespace
import logging
import sys

sys.path.insert(0, str(Path("agent-harness-lab/ai-daily-scan/src").resolve()))
sys.modules["anthropic"] = ModuleType("anthropic")
client = SimpleNamespace(messages=SimpleNamespace())
config = ModuleType("utils")
config.MODEL_NAME = "offline-demo"
config.get_client = lambda: client
sys.modules["utils"] = config
from agents.profiler import ProfilerAgent

logging.getLogger("agent.base").setLevel(logging.ERROR)
profile = dict(summary="demo", core_keywords=["demo"], tech_keywords=["python"],
               business_domains=["research"], search_queries=["demo search"])

def run(recent_title, change_tool=False):
    requests = []

    def create(**kwargs):
        requests.append(deepcopy(kwargs))  # The real loop later mutates messages.
        if len(requests) == 1:
            block = SimpleNamespace(type="text", text="Preparing the profile.")
        else:
            block = SimpleNamespace(type="tool_use", name="final_output",
                                    id="demo-1", input=profile)
        return SimpleNamespace(content=[block])

    client.messages.create = create
    agent = ProfilerAgent()
    if change_tool:
        agent.final_output_description += " [revised demo description]"
    assert agent.run_with_context("demo company", [], [recent_title]) == profile
    assert len(requests) == 2
    return requests

def changed(left, right):
    return sorted(key for key in left.keys() | right.keys() if left.get(key) != right.get(key))

a = run("project-A")
b = run("project-B")
c = run("project-A", change_tool=True)
print("tool names:", [t["name"] for t in a[0]["tools"]])
print("A1 -> A2, next turn:", changed(a[0], a[1]))
print("A1 -> B1, recent title:", changed(a[0], b[0]))
print("A1 -> C1, tool description:", changed(a[0], c[0]))
print("A2 message roles:", [m["role"] for m in a[1]["messages"]])
print("A2 retains first user message:", a[1]["messages"][:1] == a[0]["messages"])
'@ | python -I -B -
```

在本地作品集提交 `8f37b3b` 上运行得到以下结果。A1、A2 是 A 组的第一、第二次 SDK 调用。比较函数逐项检查传给 SDK 的全部关键字参数。

```text
tool names: ['final_output']
A1 -> A2, next turn: ['messages']
A1 -> B1, recent title: ['messages']
A1 -> C1, tool description: ['tools']
A2 message roles: ['user', 'assistant', 'user', 'user']
A2 retains first user message: True
```

为什么 A2 会连续出现两条 `user`？第一条是运行时发现模型尚未调用 `final_output`，要求它交付；第二条是这个角色最多允许三轮，进入第二轮时又触发了剩余轮数提醒。二者都进入 `messages`。角色说明保持不变，第一条原始用户输入也仍在。追踪分支可看 `base.py` 第 64–78、93–101 行。

## 对回 s10 的缓存问题

原课 s10 的 `get_system_prompt` 比较本地 context key，决定是否复用已经拼好的系统字符串。这里的画像角色直接持有固定字符串，实验比较的是实际传给 SDK 的字段。A1 与 B1 的 `system`、`tools` 相等；A1 与 C1 又证明，只看 `system` 会漏掉工具定义的改动。三个对照组都没有获得供应商的缓存读写计数，无法从这份输出计算命中率、token 数或费用。[s10 请求字段与缓存断点笔记](../学习笔记/s10-请求字段与缓存断点.md)

同一个作品集里，显式控制缓存断点要沿另一条源码路径查。`ai-auto-harness` 的 `splitSysPromptPrefix` 会检查配置与边界标记，将系统提示分块；`buildSystemPromptBlocks` 再检查 `enablePromptCaching` 和每块的 `cacheScope`，据此决定哪些块带 `cache_control`。这是 TypeScript 快照的静态证据；上面的 Python 请求实验只运行了日报的画像角色。[分块与条件分支](../../agent-harness-lab/ai-auto-harness/src/utils/api.ts) · [构造 SDK 系统内容块](../../agent-harness-lab/ai-auto-harness/src/services/api/claude.ts)

作品集另有一篇[Claude Code Prompt 组装研究笔记](../../agent-harness-lab/claude-code-internals/notes/cc-prompt-assembly.md)，开头列出了对应源码快照，并说明请求示意图的重建方法。想从此例继续追系统内容块、工具规格和缓存断点，可从那里进入。
