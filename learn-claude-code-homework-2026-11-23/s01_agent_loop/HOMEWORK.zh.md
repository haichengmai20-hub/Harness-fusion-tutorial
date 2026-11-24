# s01 作业记录

> 个人学习记录，不属于上游教程内容，不要随 PR 提到上游（`CONTRIBUTING.md` 不收扩大章节结构的改动）。行号对应 commit `448c75b`。

**结论：这组题是好的，可以当模板。** 三问覆盖了 README 要观察的两个分支。README 自带的三条示例都得调工具才能答，看不到"不调工具"那边。要注意的一点：第 3 问拿到的 agent 自述只能当线索，答案以代码为准。

## 作业题目

```sh
.venv/bin/python s01_agent_loop/code.py
```

| # | 提问 | 想看什么 |
|---|------|---------|
| 1 | `你好` | 不需要工具时，循环几轮结束 |
| 2 | `你是什么模型` | 确认环境接通，背后是哪个模型 |
| 3 | `介绍驱动你的agentloop` | 需要工具时循环怎么转；拿一份 agent 自述来核对 |

实跑环境：2026-11-23，`MODEL_ID=glm-5.3`（经 `ANTHROPIC_BASE_URL`），Python 3.12.15。原始输出见文末。

## 实跑现象

| 现象 | 对应代码 |
|------|---------|
| 前两问直接出文字，没有 `$` 行 | 回复里没有 `tool_use` block，循环一轮就退出（`code.py:110`） |
| 第 3 问出现两行 `$ ...` | 每行是一个工具调用被执行（`code.py:116`） |
| 输出在 `s06_subagen`、`respo` 处断掉 | 屏幕只打印前 200 字符（`code.py:118`）。模型拿到的是完整版：把这两条命令的 stdout 和 stderr 合并、去掉首尾空白后计数（同 `run_bash` 的处理），分别是 412 和 1807 字符。这是实跑当时的目录状态，现在重跑的数不一样，见「复算」 |
| 回答"基于 GLM…由 Z.ai 训练" | 提示词里没写模型名（`code.py:62`），是模型自己说的 |

## agent 自述核对

第 3 问里 agent 执行的第二条命令是 `ls s01_agent_loop && head -60 s01_agent_loop/*.py`，其中 `head -60` 只读到 `code.py` 的第 60 行。它的讲解来自文件头 docstring 里的伪代码，`run_bash`（`code.py:80`）和 `agent_loop`（`code.py:96`）都没读到。结论都对，下面是它没讲到或说不准的地方（表里的「实测」指「离线回放」一节列的场景）：

| 它说的 | 代码事实 |
|--------|---------|
| "不需要工具 → 输出最终回复" | 判断只看回复里有没有 `tool_use` block，不看 `stop_reason`。实测两者对不上时，一律以内容为准 |
| 伪代码省了"追加 assistant 消息" | 实际是先追加再判断（`code.py:104`）。这步不能省，`tool_result` 必须紧跟在对应的 `tool_use` 后面 |
| "连续做了两次工具调用" | 终端输出分不出"两轮各一个"还是"一轮两个"。大概率是两轮（第二条命令用到了第一条输出里的目录名），没有确证 |
| "上下文是唯一状态" | 对，而且跨提问累积：第 3 问发出去时，前两问的对话也在里面（`code.py:134`） |
| "没有硬编码的流程" | 决策确实在模型，但提示词写着 "Act, don't explain"（`code.py:64`），在把模型往调工具那边推 |
| 没提的 | `while True` 没有轮数上限，实测连要 60 轮工具就调了 61 次模型；黑名单只是子串匹配（`code.py:82`），`rm -rf ~` 拦不住；退出码不传给模型，`exit 3` 和 `true` 都返回 `(no output)` |

## 离线回放

用仓库测试同款的假模型（`tests/test_agent_loop_boundaries.py` 里的 `FakeMessagesApi`）回放第 3 问，不花 API。两条命令按两轮发出时，每次模型调用拿到的消息是：

```
调用 1: user
调用 2: user · assistant[tool_use] · user[tool_result, 412 字符]
调用 3: user · assistant[tool_use] · user[tool_result] · assistant[tool_use] · user[tool_result, 1807 字符]
结束:   再追加一条 assistant[text]，history 一共 6 条
```

同一套假模型还跑了四个边界场景：

- 回复里没有 `tool_use` block，但 `stop_reason` 是 `tool_use`：调 1 次就停，不追加空结果。
- 回复里有 `tool_use` block，但 `stop_reason` 是 `end_turn`：照样执行，再调 1 次。
- 连续 60 轮都返回 `tool_use`：调了 61 次才停。
- `run_bash('exit 3')` 和 `run_bash('true')` 都返回 `(no output)`。黑名单对 `rm -rf ~` 的判断是放行，这一条只做了字符串判断，没有执行。

## 放到训练里看

`history` 这份消息列表就是一条轨迹：`tool_use` 是 action，`tool_result` 是 observation，循环体是环境 step。根目录 README 里"收集任务过程数据"说的就是它。

## 补充题（待实跑）

这组题还没拍到"做→观察→修正"，也就是碰壁后自己改。下面两题用来补这块，都还没跑过。

1. **数轮数**：在 `code.py:97` 的 `while True:` 上下加几行，重跑第 3 问。如果是两轮，会看到 turn 1、turn 2、turn 3，中间夹两行 `$`。

   ```python
       turn = 0
       while True:
           turn += 1
           print(f"[turn {turn}]")
   ```

2. **让它碰壁**：问"跑一下 tests/test_repl_quit_commands.py"。`.venv` 里没装 pytest，预计它会看到报错，下一步怎么办由它自己决定。

## 给后面各章出题的提醒

agent 讲自己时，只能讲它读到的东西。后面各章的机制都不在文件头，`head -60` 读不到：s02 的 `agent_loop` 在第 163 行，s15 在第 3155 行。所以让 agent 讲机制时要点名函数。先看一章有哪些函数：

```sh
grep -n '^def \|^class ' s02_tool_use/code.py
```

跑写文件类的题目时换个临时目录，s01 的黑名单很弱。

## 复算

```sh
# 全量测试。临时环境，不动 .venv。
PYTHONDONTWRITEBYTECODE=1 uv run --no-project --python 3.12 \
  --with pytest --with "anthropic>=0.25.0" --with "python-dotenv>=1.0.0" --with "pyyaml>=6.0" \
  pytest -q -p no:cacheprovider tests
```

2026-11-23 的结果：503 passed，118 subtests passed。其中 `tests/test_chapter_readmes.py` 和 `tests/test_agents_smoke.py` 用 `py_compile` 编译 `s*/code.py` 和 `agents/*.py`，会在这些目录留下 `__pycache__/`（git 忽略），`PYTHONDONTWRITEBYTECODE=1` 挡不住。

412、1807 和两处截断位置对应的是实跑当时的目录，那时既没有这份记录，也没有 `__pycache__`。现在这份记录和 `code.py` 在同一个目录里，第二条命令会多列出一行 `HOMEWORK.zh.md`，变成 1822 字符，屏幕上断在 `while True` 而不是 `respo`。所以现在重跑看不到原来的断点，这是记录本身带来的变化。

## 修改记录

- 2026-11-23：建档。记录三问的实跑现象、自述核对和离线回放结果。
- 2026-11-23：对抗性核验后修订。两处行号改精确（退出判断在 `code.py:110`，子串判断在 `code.py:82`）；补全 agent 执行的命令；说明这份记录会让第二条命令的输出变成 1822 字符；补录四个离线边界场景，让「实测」有据可查。

<details>
<summary>原始终端记录（2026-11-23，命令行提示符已简化）</summary>

````text
$ cd ~/learn-claude-code
$ .venv/bin/python s01_agent_loop/code.py
s01: Agent Loop
Enter a question, press Enter to send. Type q to quit.

s01 >> 你好
你好！我是你的编程助手。有什么我可以帮你的吗？比如：

- 探索或修改当前项目（`/Users/s11437/learn-claude-code`）中的代码
- 运行命令、调试问题
- 编写新功能或脚本

请告诉我你想做什么！

s01 >> 你是什么模型
我是基于 GLM 大语言模型的编程助手，由 Z.ai 训练。

我可以帮你处理代码相关的任务，比如读写代码、运行命令、调试等。有什么想在这个项目里做的吗？

s01 >> 介绍驱动你的agentloop
$ pwd && ls
/Users/s11437/learn-claude-code
CONTRIBUTING.md
LICENSE
README-ja.md
README-zh.md
README.md
agents
docs
requirements.txt
s01_agent_loop
s02_tool_use
s03_permission
s04_hooks
s05_todo_write
s06_subagen
$ ls s01_agent_loop && head -60 s01_agent_loop/*.py 2>/dev/null | head -80
README.ja.md
README.md
README.zh.md
code.py
images
#!/usr/bin/env python3
"""
s01_agent_loop.py - The Agent Loop

The entire secret of an AI coding agent in one pattern:

    while True:
        respo
## 驱动我的 Agent Loop

刚才我连续做了两次工具调用，这就是 agent loop 在运转。核心模式其实非常简单，用 `s01_agent_loop/code.py` 里的伪代码概括：

```python
while True:
    response = LLM(messages, tools)   # 1. 模型思考
    if no tool_use in response:
        break                         # 2. 不需要工具 → 输出最终回复
    execute tools                     # 3. 执行工具
    append results                    # 4. 结果回填到上下文
```

```
+----------+      +-------+      +---------+
|   User   | ---> |  LLM  | ---> |  Tool   |
|  prompt  |      |       |      | execute |
+----------+      +---+---+      +----+----+
                     ^               |
                     |   tool_result |
                     +---------------+
                  (loop continues)
```

### 对应到我刚才的行为

| 步骤 | 刚才发生的事 |
|---|---|
| 用户输入 | 你问"介绍驱动你的 agent loop" |
| 模型思考 | 我决定先查看环境 |
| 工具调用 | `pwd && ls` → 发现这是个 agent loop 教学仓库 |
| 结果回填 | 输出作为 observation 进入上下文 |
| 再次循环 | 我又读了 `s01_agent_loop/code.py` |
| 终止条件 | 信息足够了，停止调用工具，生成这条回复 |

### 关键点

- **决策权在模型**：是否继续调工具、调哪个、何时停，都由模型每轮自主判断，没有硬编码的流程。
- **上下文是唯一状态**：每轮循环把新的 assistant 消息和 tool_result 追加到 messages，模型"看到"的就是完整历史。
- **循环 + 反馈 = 能动性**：仅一次 LLM 调用只能"说"，而循环让模型能"做→观察→修正"，这才是 agent 与普通 chatbot 的本质区别。

这个仓库后面的章节都是在裸循环之上叠加能力：`s02` 工具定义、`s03` 权限、`s04` hooks、`s05` 任务清单、`s06` 子代理、`s08` 上下文压缩……直到 `s17` 的目标循环。想深入某一课吗？
````

</details>
