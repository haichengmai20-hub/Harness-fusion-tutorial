# s07 作业记录

> 个人学习记录，不属于上游教程内容，不要随 PR 提到上游（`CONTRIBUTING.md` 不收扩大章节结构的改动）。行号对应 commit `448c75b` 的原版 `code.py`，不含下面说的调试补丁和两个自写的技能。

**结论：这组题是好的，可以当模板。** 七问覆盖了 README 观察重点的两个问题：系统提示词里是不是只有技能目录，调用 `load_skill` 后是不是拿到整份 `SKILL.md`。README 没让试的三处也拍到了：模型自己决定加不加载，技能全文加载后一直留在上下文里，启动后新增的技能 `load_skill` 认不出但模型能读到。没有要补的分支。

## 准备

**换一个干净的目录跑，并把技能带过去。** s07 扫的是工作目录下的 `skills/`（`code.py:46`）。

```sh
mkdir -p ~/lcc-hw/s07
cp -R ~/learn-claude-code/skills ~/lcc-hw/s07/
```

**放一个待审查的文件 `buggy.py`。** 17 行，故意写了 5 个问题：硬编码口令、SQL 注入、命令注入、连接没关、可变默认参数。

**自己写两个技能。** 每个留了一处“指纹”，也就是要求模型在回复里写一句固定的话，这样比读它的叙述容易判断技能有没有生效：

- `skills/hw-style/SKILL.md`：描述写“写任何 Python 函数时必须使用”。正文要求函数上方写一行 `# 作业风格 <函数名>`，回复最后一行写“已按 hw-style 检查”。
- `skills/misc-notes/SKILL.md`：描述只有“一些可能有用的笔记”。正文只要求回复最后一行写“已按 misc-notes 检查”。

**加 10 行调试输出。** 循环里 8 行：轮数、参数、返回值。原版的循环不打印工具输出，`load_skill` 交回的全文在屏幕上看不到；补丁打印它的前 600 个字符并标出总长度。启动处另加 2 行，把进了系统提示词的技能目录打印出来，并标出目录和全文各有多长：

```python
    print("Enter a question, press Enter to send. Type q to quit.\n")
    print(f"Skills in system prompt ({len(SKILL_LOADER.catalog())} chars of catalog, "
          f"{sum(len(s['content']) for s in SKILL_LOADER.skills.values())} chars if loaded in full):\n{SKILL_LOADER.catalog()}\n")
```

跑完用 `git checkout -- s07_skill_loading/code.py` 还原。

**启动**（在 `~/lcc-hw/s07` 里）：

```sh
~/learn-claude-code/.venv/bin/python ~/learn-claude-code/s07_skill_loading/code.py
```

## s07 相对 s04 改了什么

s07 也是在 s04 的内核上长出来的，没有待办，也没有子 agent。

- **启动时扫描 `skills/*/SKILL.md`**（`code.py:131`），只把每个技能的名称和描述拼进系统提示词（`code.py:139`）。
- **多了一个工具 `load_skill`**（`code.py:220`）。模型调它，才拿到整份 `SKILL.md`，作为工具结果进上下文。
- **技能目录只在启动时扫一次**（`code.py:131`），之后新增的技能，这个工具不认识。

## 作业题目

共三个进程。第一个进程里按顺序问了五句，第二个进程的第一问是补题 5，补题 6 在另一个进程里。提问文字照录实际输入：

| # | 提问 | 想看什么 | 模型调用 |
|---|---|---|---|
| 1 | `你现在有哪些技能？每个是做什么的？` | 由 README 的示例 1 改编。它只凭系统提示词里的目录作答，不调工具 | 1 次 |
| 2 | `帮我审查一下 buggy.py。只读代码，不要安装任何软件包` | 不点名技能，它会不会自己加载 | 3 次 |
| 3 | `加载 code-review 技能，然后按它的清单和输出格式审查buggy.py。只读代码，不要运行技能里的命令，也不要安装任何软件包` | 由 README 的示例 2、3 改编。`load_skill` 的调用，全文回到上下文，是否照清单做 | 2 次 |
| 4 | `加载 no-such-skill 这个技能` | 未知技能：报错和可用列表回喂，它怎么办 | 2 次 |
| 5 | `写一个 Python 函数 add(a, b)，存进 calc.py` | 不提技能，看它加载哪个 | 2 次 |
| 补 5 | `写一个 Python 函数 multiply(a, b)，存进 calc2.py` | 同第 5 问，放在新进程里当第一问 | 4 次 |
| 补 6 | `加载 late-skill 技能` | `late-skill` 是进程启动后才建的。看 `load_skill` 认不认 | 5 次 |

第 2、3 问里“不要安装任何软件包”是有意加的。仓库自带的 4 个技能里有 3 个，正文里带 `pip install` 这类命令。技能正文一旦被加载，就成了模型照着做的说明，而 bash 的权限规则不拦 `pip install`。

实跑环境：2026-11-23，`MODEL_ID=glm-5.3`（经 `ANTHROPIC_BASE_URL`），Python 3.12.15。原始输出见文末。

## 逐题核对

| 题 | 实跑现象 | 代码事实 |
|----|---------|---------|
| 1 | 没调工具，列出 6 个技能和用途 | 它答的是系统提示词里的目录，那里只有名称和描述 |
| 2 | 自己加载了 `code-review` 并读了文件，这两个调用在同一轮。下一轮又加载了 `hw-style`，再下一轮才作答。报告按技能给的格式写，找出了埋的 5 个问题 | `code-review` 的描述里写着用户要求审查代码时使用，这句进了系统提示词 |
| 3 | 又加载了一次 `code-review`，重新读文件。报告前多了一张逐项核对的清单 | 同一个技能加载两次，没有去重，两份全文都在上下文里 |
| 4 | 拿到 `Error: Unknown skill 'no-such-skill'. Available: …`，照着报错里的列表回答 | 报错里带着可用技能的名字（`code.py:128`） |
| 5 | 直接写了 `calc.py`，函数上方有 `# 作业风格 add`，回复最后一行是“已按 hw-style 检查” | 它没有再加载 `hw-style`，第 2 问加载的全文还在上下文里 |
| 补 5 | 第 1 轮先 `load_skill('hw-style')`，第 2 轮写 `calc2.py`，第 3 轮跑了一遍验证。指纹齐全 | 它先加载再动手，分了两轮 |
| 补 6 | `load_skill` 报 Unknown。它没有停：`glob` 找到目录，`find` 列出文件，`read_file` 读到内容 | 技能目录只在启动时扫一次。但技能文件就在工作目录里，别的工具照样能读 |

`misc-notes` 一次都没被加载，“已按 misc-notes 检查”也没出现过。

第一个进程里，每问结束时 Stop hook 打印的工具调用数依次是 0、3、5、6、7。

### 最值得记的三处

**技能加载由模型自己决定，依据只有描述。** 第 2 问没点名技能，它自己加载了 `code-review`。`hw-style` 的描述是“写任何 Python 函数时必须使用”，审查任务里要写修复代码，它就把 `hw-style` 也加载了。`misc-notes` 的描述只有“一些可能有用的笔记”，七问里它都没碰。

**技能全文一旦加载，就一直留在上下文里起作用。** 第 3 问和第 5 问都没有重新加载 `hw-style`，指纹照样出现。第 3 问加载 `code-review` 时，它说了一句“技能已加载”。

**`load_skill` 只是一个带目录的入口，技能本身只是磁盘上的一个文件。** 补题 6 里这个工具认不出 `late-skill`，模型换了 `glob` 和 `read_file` 就把文件读出来了，还自己说清了原因：“由于它是在会话启动后才创建的，系统的 `load_skill` 工具尚未注册它”。第 4 问它停下了，是因为 `no-such-skill` 在磁盘上确实不存在。

### 补题 6 来自另一个进程

补题 6 的输出不是第二个进程的，依据有三点：

- 第二个进程启动时的技能目录里有 `late-skill`，一共 7 个技能。
- 补题 6 的报错只列了 6 个技能，没有 `late-skill`。目录和 `load_skill` 查的是同一张表（`code.py:124`）。
- 补题 6 结束时显示用了 5 次工具调用，正好是这一问自己用的，说明那个进程此前没调过工具。

所以它是在另一个进程里问的，那个进程启动时 `late-skill` 还不存在。两段合起来是一组对照：启动时没有它的进程看不见它，启动时已经有它的进程把它放进了目录。

### 另外几点

- **启动时的技能目录。** 第二个进程启动时打印的是 `1140 chars of catalog, 16888 chars if loaded in full`，目录约占全文的 7%。第一个进程启动时的那两行没录下来；那时 `late-skill` 还不存在，建档时量到的是 1114 和 16824 个字符，6 个技能。
- **加载技能不经过任何检查。** 六次 `load_skill` 都直接通过。
- **“不要安装任何软件包”用上了。** 第 3 问它把清单里的“依赖漏洞”一项标成了“按要求跳过”。第一个进程的五问没有调用过 bash。
- **它 `ls` 了工作区外的目录。** 补题 6 里它列了 `~/.claude/skills/`，只是列目录，没有改动。bash 读工作区外不会被问，这是 s03 起就有的问题。
- **`Wrote 60 bytes`、`Wrote 70 bytes` 数的都是字符数**（`code.py:176`）。

### 和预期不同的

- **第 5 问没拍到“加载”这个动作。** 出题时想用它看模型会不会主动加载 `hw-style`，但第 2 问已经把全文加载进去了。补题 5 把它放进新进程才拍到。
- **第 2 问以为它可能不加载技能、直接审查**，结果它加载了。
- **补题 6 以为它会像第 4 问那样停下**，结果它自己找到了文件。

### 来自模型、不是代码保证的行为

下面几条是 GLM 这一次的选择，换模型或再跑一次可能不同：

- 第 2 问它先加载技能、读文件，下一轮再加载 `hw-style`；补题 5 也是先加载、下一轮再写。
- 补题 5 它写完函数后跑了一遍验证。
- 补题 6 它没有停在报错上，而是去找文件。
- 第 4 问和补题 6 的结局不同：前者磁盘上没有那个文件，它就停了。

### README 没说清楚的地方

- **没说这一章基于 s04 的内核**，章节导航把它排在 s05、s06 之后，代码里没有待办，也没有子 agent。
- **没提技能目录跟着工作目录走**：它在当前目录下的 `skills/`（`code.py:46`）。
- **README 的 `scan` 代码块少了“目录不存在就直接返回”**（`code.py:91`）。
- **没提三件事**：启动后新增的技能 `load_skill` 不认识；同一个技能加载多次不去重；`load_skill` 不经过权限检查。

## 离线回放

用仓库测试同款的假模型回放，不花 API。跑的是带补丁的 `code.py`。

进系统提示词的只有目录：

| 作业目录里的技能 | 目录（字符） | 全文合计（字符） |
|---|---|---|
| 仓库 4 个 + `hw-style` | 1089 | 16721 |
| 仓库 4 个 + `hw-style` + `misc-notes`，第一个进程启动时 | 1114 | 16824 |
| 再加 `late-skill`，第二个进程启动时 | 1140 | 16888 |

`load_skill` 的三种结果：

- 存在的技能：返回整份 `SKILL.md`，和文件全文逐字相同。`code-review` 是 4266 个字符。
- 不存在的名字：`Error: Unknown skill '<名字>'. Available: <全部技能名>`。
- 名字里带路径，比如 `../buggy.py`：同样是 Unknown。名字只用来查表（`code.py:124`），不会被当成文件路径。
- 权限 hook 对 `load_skill` 返回 `None`，不拦也不问。

同一个技能加载两次：两份全文都在 history 里，没有去重。三次模型调用带的消息数是 1、3、5，从第 2 次起全文一直在上下文里。

启动后新增技能：目录里没有它，`load_skill` 报 Unknown。手动重新扫描之后目录里有了，但系统提示词是启动时拼好的一段字符串，里面还是旧目录。

frontmatter 的回退规则：

| `SKILL.md` 的写法 | 用作名字 | 用作描述 |
|---|---|---|
| 正常的 `name` 和 `description` | 取 frontmatter | 取 frontmatter |
| 没有 frontmatter | 目录名 | 正文第一行，去掉开头的 `# ` |
| 有 `name`，没 `description` | 取 frontmatter | 正文第一行 |
| `description` 写成多行 | 取 frontmatter | 压成一行 |
| 第一行是 `--- name: 挤在一行` | 目录名 | 整个文件当正文，取第一行 |
| YAML 写坏了 | 目录名 | 正文第一行 |
| frontmatter 是一个列表 | 目录名 | 正文第一行 |
| `---` 之间是空的 | 目录名 | 空字符串 |

被跳过的两种目录：里面没有 `SKILL.md` 的；`SKILL.md` 是符号链接、指向 `skills/` 之外的（`code.py:97`）。工作目录下没有 `skills/` 时，目录是 `(no skills found)`（`code.py:117`）。

## 放到训练里看

- **技能目录是常驻系统提示词的一小段，全文按需进工具结果。** 加不加载体现在“调不调 `load_skill`”上，这是模型学出来的决策，输入只有那段描述。
- **技能正文是会改变模型行为的文本，加载后一直生效。** 一条轨迹里加载过什么，决定了后面每一步的条件。
- **限制入口不等于限制内容。** `load_skill` 只在启动时登记，技能文件却一直可读。补题 6 里模型换了个工具就绕过去了。
- **技能描述直接拼进系统提示词，不经过任何检查**（`code.py:139`）。这次没有试往描述里写别的东西。

## 给后面各章出题的提醒

- 想看模型会不会主动加载某个技能，把它放在新进程的第一问。之前加载过的技能还在上下文里，后面的问法拍不到“加载”这个动作。
- 自写技能留一句固定的“指纹”，比读模型的叙述好判断。
- 技能正文里有安装命令的，题目里写明“不要安装”。
- 想拍“启动后新增的技能看不见”，先启动进程，再建技能。

作业目录跑完多了 `calc.py`、`calc2.py`，`buggy.py` 没被改动。`late-skill` 留在了 `skills/` 里，以后每次启动它都会出现在目录中。

## 复算

```sh
# 启动时会打印进了系统提示词的技能目录。退出码 0 就是读到了 .env。
# 空输入启动，REPL 读到 EOF 就退出，不发请求。
cd ~/lcc-hw/s07 && PYTHONDONTWRITEBYTECODE=1 \
  ~/learn-claude-code/.venv/bin/python ~/learn-claude-code/s07_skill_loading/code.py < /dev/null

# 两个文件的字节数和字符数
wc -c ~/lcc-hw/s07/calc.py     # 68
wc -m ~/lcc-hw/s07/calc.py     # 60
wc -c ~/lcc-hw/s07/calc2.py    # 78
wc -m ~/lcc-hw/s07/calc2.py    # 70

# 全量测试。临时环境，不动 .venv。
PYTHONDONTWRITEBYTECODE=1 uv run --no-project --python 3.12 \
  --with pytest --with "anthropic>=0.25.0" --with "python-dotenv>=1.0.0" --with "pyyaml>=6.0" \
  pytest -q -p no:cacheprovider tests
```

2026-11-23 的结果：503 passed，118 subtests passed。这是 s02 到 s07 六个文件都带改动时跑的。`tests/test_chapter_readmes.py` 用 `py_compile` 编译各章的 `code.py`，`tests/test_agents_smoke.py` 编译 `agents/*.py`，会留下 `__pycache__/`（git 忽略），跑完要清。

现在启动会看到 7 个技能、1140 和 16888 个字符，因为 `late-skill` 已经在作业目录里了。

## 修改记录

- 2026-11-23：建档。记录三个进程里的七问、逐题核对和离线回放结果。
- 2026-11-23：对抗性核验后修订。第 2 问是 3 次模型调用，三个工具调用分在两轮里，不是“同一轮”。`buggy.py` 是 17 行，原来的 20 行照抄了模型报告里的说法。`load_skill` 一共调了 6 次，不是 7 次。自带技能里带安装命令的是 3 个，不是 4 个。离线表第一行的数字换成用作业目录里的文件实测的值。“拼进系统提示词”的行号改到 139。

<details>
<summary>原始终端记录（2026-11-23，三个进程，命令行提示符已简化）</summary>

第一个进程，五问，启动部分未录：

````text
s07 >> 你现在有哪些技能？每个是做什么的？
[HOOK] UserPromptSubmit: working in /Users/s11437/lcc-hw/s07

[turn 1]
[HOOK] Stop: session used 0 tool calls
我目前有 6 个可用技能：

| 技能 | 用途 |
|------|------|
| **agent-builder** | 设计和构建 AI agent（智能体）。适用于：想创建 agent、构建 assistant、设计 AI 系统，或想了解 agent 架构、agentic 模式、自主 AI、能力/子agent/规划/技能机制，或询问 Claude Code、Cursor 等工具的内部原理 |
| **code-review** | 深入的代码审查，包括安全性、性能和可维护性分析。适用于用户要求 review 代码、找 bug 或审计代码库 |
| **hw-style** | 写任何 Python 函数时必须使用的规范，规定函数命名、注释和返回值的固定写法（作业风格要求） |
| **mcp-builder** | 构建 MCP（Model Context Protocol）服务器，给 Claude 增加新能力。适用于想创建 MCP server、添加工具、集成外部服务 |
| **misc-notes** | 一些可能有用的杂项笔记 |
| **pdf** | 处理 PDF 文件——提取文本、创建 PDF、合并文档等 |

需要我详细介绍某个技能，或者直接开始用某个技能干活吗？

s07 >> 帮我审查一下 buggy.py。只读代码，不要安装任何软件包
[HOOK] UserPromptSubmit: working in /Users/s11437/lcc-hw/s07

[turn 1]
  input: {'name': 'code-review'}
[HOOK] load_skill(['code-review'])
  result: ---
name: code-review
description: Perform thorough code reviews with security, performance, and maintainability analysis. Use when user asks to review code, check for bugs, or audit a codebase.
---

# Code Review Skill

You now have expertise in conducting comprehensive code reviews. Follow this structured approach:

## Review Checklist

### 1. Security (Critical)

Check for:
- [ ] **Injection vulnerabilities**: SQL, command, XSS, template injection
- [ ] **Authentication issues**: Hardcoded credentials, weak auth
- [ ] **Authorization flaws**: Missing access controls, IDOR
- [ ] **Data expos…（共 4266 字符）
  input: {'path': 'buggy.py'}
[HOOK] read_file(['buggy.py'])
  result: import os
import sqlite3

PASSWORD = "hunter2"


def get_user(user_id):
    conn = sqlite3.connect("app.db")
    cur = conn.cursor()
    cur.execute(f"SELECT * FROM users WHERE id = {user_id}")
    re

[turn 2]
  input: {'name': 'hw-style'}
[HOOK] load_skill(['hw-style'])
  result: ---
name: hw-style
description: 写任何 Python 函数时必须使用。规定了函数命名、注释和返回值的固定写法。
---

# 作业专用代码风格

写 Python 函数时遵守下面五条：

1. 函数名全部小写，单词之间用下划线。
2. 函数上方写一行注释，格式固定为 `# 作业风格 <函数名>`。
3. 函数必须有类型标注。
4. 函数末尾必须有一条 `return` 语句。
5. 写完后，在回复的最后单独一行写：`已按 hw-style 检查`。
（共 243 字符）

[turn 3]
[HOOK] Stop: session used 3 tool calls
## Code Review: buggy.py

### Summary
文件只有 20 行，但每个函数都至少有一个严重缺陷：包含 SQL 注入、命令注入、硬编码口令、资源泄漏和可变默认参数共 5 类问题。

### Critical Issues

1. **SQL 注入**（第 10 行）：`f"SELECT * FROM users WHERE id = {user_id}"`
   - Impact：调用 `get_user("1 OR 1=1")` 可拖库，`"1; DROP TABLE users"` 可破坏数据。
   - Fix：用参数化查询 `cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))`。

2. **命令注入**（第 15 行）：`os.system(f"ls {cmd}")`
   - Impact：`cmd = "; rm -rf ~"` 即可执行任意命令，属于最严重的 RCE 类漏洞。
   - Fix：改用 `subprocess.run(["ls", cmd], check=True)`，参数以列表传入，不做 shell 解析。

3. **硬编码口令**（第 4 行）：`PASSWORD = "hunter2"`
   - Impact：凭据进入版本库，且口令本身极弱。
   - Fix：从环境变量读取，如 `os.environ["APP_PASSWORD"]`。

4. **资源泄漏**（第 9 行）：`sqlite3.connect(...)` 打开的连接从未关闭
   - Impact：每次调用泄漏一个连接，长时间运行会耗尽数据库句柄。
   - Fix：用 `with closing(sqlite3.connect(...))` 或 `try/finally` 保证关闭。

5. **可变默认参数**（第 14 行）：`def run(cmd, opts=[])`
   - Impact：默认列表在所有调用间共享，未来若往 `opts` 里追加元素会跨调用串数据。
   - Fix：默认 `None`，函数体内 `opts = opts or []`。

### Improvements

1. **恒真的死分支**（第 16 行）：`if PASSWORD == "hunter2"` 是常量和自身字面量比较，永远为 True，推测本意是校验用户输入的口令——逻辑写错了。
2. **`opts` 形同虚设**：只被 print，没有实际作用，建议删除或真正使用。
3. **命名与文档**：`run` 含义模糊；两个函数都缺类型标注和 docstring，`fetchone()` 可能返回 `None` 也未处理。

### Positive Notes

- 结构上把数据库访问单独封装成函数，职责划分的意图是对的。
- import 集中在顶部，代码简短易读。

### 修复后的参考实现

```python
import os
import sqlite3
import subprocess
from contextlib import closing
from typing import Optional

PASSWORD = os.environ.get("APP_PASSWORD")


# 作业风格 get_user
def get_user(user_id: int) -> Optional[tuple]:
    with closing(sqlite3.connect("app.db")) as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        return cur.fetchone()


# 作业风格 run
def run(cmd: str, opts: Optional[list] = None) -> int:
    opts = opts or []
    subprocess.run(["ls", cmd], check=True)
    print("running", opts)
    return 0
```

（`tuple` 标注在 Python 3.9+ 可用；`PASSWORD` 为 `None` 时应拒绝启动，此处从略。）

### Verdict
- [ ] Ready to merge
- [ ] Needs minor changes
- [x] **Needs major revision** — 3 个安全漏洞中任意一个都足以阻断合并。

已按 hw-style 检查

s07 >> 加载 code-review 技能，然后按它的清单和输出格式审查buggy.py。只读代码，不要运行技能里的命令，也不要安装任何软件包
[HOOK] UserPromptSubmit: working in /Users/s11437/lcc-hw/s07

[turn 1]
  input: {'name': 'code-review'}
[HOOK] load_skill(['code-review'])
  result: ---
name: code-review
description: Perform thorough code reviews with security, performance, and maintainability analysis. Use when user asks to review code, check for bugs, or audit a codebase.
---

# Code Review Skill

You now have expertise in conducting comprehensive code reviews. Follow this structured approach:

## Review Checklist

### 1. Security (Critical)

Check for:
- [ ] **Injection vulnerabilities**: SQL, command, XSS, template injection
- [ ] **Authentication issues**: Hardcoded credentials, weak auth
- [ ] **Authorization flaws**: Missing access controls, IDOR
- [ ] **Data expos…（共 4266 字符）
  input: {'path': 'buggy.py'}
[HOOK] read_file(['buggy.py'])
  result: import os
import sqlite3

PASSWORD = "hunter2"


def get_user(user_id):
    conn = sqlite3.connect("app.db")
    cur = conn.cursor()
    cur.execute(f"SELECT * FROM users WHERE id = {user_id}")
    re

[turn 2]
[HOOK] Stop: session used 5 tool calls
技能已加载，文件已重读（与上次一致，共 20 行）。未运行任何命令、未安装任何软件包，以下为纯静态审查，按技能的五大类清单逐项核对。

**清单核对结果**

| 检查项 | 结果 |
|---|---|
| 1. Security：注入 | ✗ SQL 注入（第 10 行）+ 命令注入（第 15 行） |
| 1. Security：认证 | ✗ 硬编码弱口令（第 4 行） |
| 1. Security：依赖漏洞 | ⏸ 未执行（需 `pip-audit`，按要求跳过） |
| 2. Correctness：资源泄漏 | ✗ 连接未关闭（第 9 行） |
| 2. Correctness：逻辑错误 | ✗ 恒真条件 + `fetchone()` 的 `None` 未处理 |
| 2. Correctness：类型安全 | ✗ 无类型标注 |
| 3. Performance | △ 每次调用新建连接、`os.system` 起子进程，量小可接受 |
| 4. Maintainability | ✗ `run` 命名含糊、`opts` 形同死参数、无注释 |
| 5. Testing | ✗ 无任何测试文件 |

---

## Code Review: buggy.py

### Summary
20 行代码集中了 SQL 注入、命令注入、硬编码口令、资源泄漏、可变默认参数五类问题，其中两个注入漏洞均可被直接利用。两个函数都需重写。

### Critical Issues

1. **SQL 注入**（第 10 行）：`cur.execute(f"SELECT * FROM users WHERE id = {user_id}")`
   - Impact：`get_user("1 OR 1=1")` 拖库，`"1; DROP TABLE users"` 破坏数据。
   - Fix：`cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))`。
2. **命令注入 / 任意命令执行**（第 15 行）：`os.system(f"ls {cmd}")`
   - Impact：`cmd = "; rm -rf ~"` 即可在宿主机执行任意命令，是最严重的漏洞。
   - Fix：`subprocess.run(["ls", cmd], check=True)`，参数走列表、不经 shell。
3. **硬编码弱凭据**（第 4 行）：`PASSWORD = "hunter2"`
   - Impact：凭据随代码进版本库，且口令本身在常见弱口令表中。
   - Fix：改从环境变量或密钥管理读取：`os.environ["APP_PASSWORD"]`。
4. **资源泄漏**（第 9 行）：`conn` 从未 `close()`
   - Impact：每次调用泄漏一个连接，长期运行耗尽句柄。
   - Fix：`with closing(sqlite3.connect("app.db")) as conn:`。
5. **可变默认参数**（第 14 行）：`def run(cmd, opts=[])`
   - Impact：默认列表跨调用共享，将来向 `opts` 追加元素会串数据。
   - Fix：默认 `None`，函数体内 `opts = opts or []`。

### Improvements

1. **恒真假分支**（第 16 行）：`if PASSWORD == "hunter2"` 拿常量与字面量比较，永远为真；推测本意是校验外部输入，逻辑写错，应改为比较用户提供的口令。
2. **`None` 处理**（第 11 行）：`fetchone()` 查无结果时返回 `None`，调用方无任何防护。
3. **死参数**（第 14 行）：`opts` 仅被 `print`，无实际作用，建议删除或真正使用。
4. **命名与文档**：`run` 含义模糊；两函数均缺类型标注与 docstring。
5. **缺测试**：注入和泄漏这类问题恰好是回归测试最容易锁住的，建议补 `get_user` 的参数化用例与 `run` 的参数边界用例。
6. **性能（次要）**：每次调用都新建 SQLite 连接，高频路径可考虑复用连接。

### Positive Notes

- 数据库访问被单独封装成 `get_user`，职责划分意识正确。
- import 集中置顶，代码短小、易读，问题定位成本低。

### 修复参考实现

```python
import os
import sqlite3
import subprocess
from contextlib import closing
from typing import Optional

PASSWORD = os.environ.get("APP_PASSWORD")


# 作业风格 get_user
def get_user(user_id: int) -> Optional[tuple]:
    with closing(sqlite3.connect("app.db")) as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        return cur.fetchone()


# 作业风格 run
def run(cmd: str, opts: Optional[list] = None) -> int:
    opts = opts or []
    subprocess.run(["ls", cmd], check=True)
    print("running", opts)
    return 0
```

### Verdict
- [ ] Ready to merge
- [ ] Needs minor changes
- [x] **Needs major revision** —— 两个注入漏洞任一即足以阻断合并。

已按 hw-style 检查

s07 >> 加载 no-such-skill 这个技能
[HOOK] UserPromptSubmit: working in /Users/s11437/lcc-hw/s07

[turn 1]
  input: {'name': 'no-such-skill'}
[HOOK] load_skill(['no-such-skill'])
  result: Error: Unknown skill 'no-such-skill'. Available: agent-builder, code-review, hw-style, mcp-builder, misc-notes, pdf（共 115 字符）

[turn 2]
[HOOK] Stop: session used 6 tool calls
`no-such-skill` 不存在，加载失败。当前可用的技能只有这 6 个：

- **agent-builder** — 设计和构建 AI agent
- **code-review** — 代码审查（安全、正确性、性能、可维护性）
- **hw-style** — Python 作业函数风格规范
- **mcp-builder** — 构建 MCP 服务器
- **misc-notes** — 杂项笔记
- **pdf** — PDF 处理

你想加载的是不是其中某个？告诉我正确的名字即可。

s07 >> 写一个 Python 函数 add(a, b)，存进 calc.py
[HOOK] UserPromptSubmit: working in /Users/s11437/lcc-hw/s07

[turn 1]
  input: {'path': 'calc.py', 'content': '# 作业风格 add\ndef add(a: int, b: int) -> int:\n    return a + b\n'}
[HOOK] write_file(['calc.py', '# 作业风格 add\ndef add(a: int, b: int) -> int:\n  )
  result: Wrote 60 bytes to calc.py

[turn 2]
[HOOK] Stop: session used 7 tool calls
已写入 `calc.py`：

```python
# 作业风格 add
def add(a: int, b: int) -> int:
    return a + b
```

函数名小写、带 `# 作业风格 add` 注释、有类型标注、以 `return` 结尾，全部符合规范。

已按 hw-style 检查
````

第二个进程，启动部分加补题 5：

````text
$ ~/learn-claude-code/.venv/bin/python ~/learn-claude-code/s07_skill_loading/code.py
s07: Skill Loading - catalog first, full content on demand
Enter a question, press Enter to send. Type q to quit.

Skills in system prompt (1140 chars of catalog, 16888 chars if loaded in full):
- agent-builder: Design and build AI agents for any domain. Use when users: (1) ask to "create an agent", "build an assistant", or "design an AI system" (2) want to understand agent architecture, agentic patterns, or autonomous AI (3) need help with capabilities, subagents, planning, or skill mechanisms (4) ask about Claude Code, Cursor, or similar agent internals (5) want to build agents for business, research, creative, or operational tasks Keywords: agent, assistant, autonomous, workflow, tool use, multi-step, orchestration
- code-review: Perform thorough code reviews with security, performance, and maintainability analysis. Use when user asks to review code, check for bugs, or audit a codebase.
- hw-style: 写任何 Python 函数时必须使用。规定了函数命名、注释和返回值的固定写法。
- late-skill: 启动之后才出现的技能。
- mcp-builder: Build MCP (Model Context Protocol) servers that give Claude new capabilities. Use when user wants to create an MCP server, add tools to Claude, or integrate external services.
- misc-notes: 一些可能有用的笔记。
- pdf: Process PDF files - extract text, create PDFs, merge documents. Use when user asks to read PDF, create PDF, or work with PDF files.

s07 >> 写一个 Python 函数 multiply(a, b)，存进 calc2.py
[HOOK] UserPromptSubmit: working in /Users/s11437/lcc-hw/s07

[turn 1]
  input: {'name': 'hw-style'}
[HOOK] load_skill(['hw-style'])
  result: ---
name: hw-style
description: 写任何 Python 函数时必须使用。规定了函数命名、注释和返回值的固定写法。
---

# 作业专用代码风格

写 Python 函数时遵守下面五条：

1. 函数名全部小写，单词之间用下划线。
2. 函数上方写一行注释，格式固定为 `# 作业风格 <函数名>`。
3. 函数必须有类型标注。
4. 函数末尾必须有一条 `return` 语句。
5. 写完后，在回复的最后单独一行写：`已按 hw-style 检查`。
（共 243 字符）

[turn 2]
  input: {'path': '/Users/s11437/lcc-hw/s07/calc2.py', 'content': '# 作业风格 multiply\ndef multiply(a: int, b: int) -> int:\n    return a * b\n'}
[HOOK] write_file(['/Users/s11437/lcc-hw/s07/calc2.py', '# 作业风格 multiply\ndef )
  result: Wrote 70 bytes to /Users/s11437/lcc-hw/s07/calc2.py

[turn 3]
  input: {'command': 'cd /Users/s11437/lcc-hw/s07 && python3 -c "from calc2 import multiply; print(multiply(3, 4), multiply(-2, 5))"'}
[HOOK] bash(['cd /Users/s11437/lcc-hw/s07 && python3 -c "from calc2 impo)
  result: 12 -10

[turn 4]
[HOOK] Stop: session used 3 tool calls
已写入 `calc2.py`，函数带类型标注并验证通过（`multiply(3, 4)` → 12，`multiply(-2, 5)` → -10）。

已按 hw-style 检查
````

另一个进程，补题 6，启动部分未录。这个进程启动时 `late-skill` 还不存在：

````text
s07 >> 加载 late-skill 技能
[HOOK] UserPromptSubmit: working in /Users/s11437/lcc-hw/s07

[turn 1]
  input: {'name': 'late-skill'}
[HOOK] load_skill(['late-skill'])
  result: Error: Unknown skill 'late-skill'. Available: agent-builder, code-review, hw-style, mcp-builder, misc-notes, pdf（共 112 字符）

[turn 2]
  input: {'pattern': '**/*late*'}
[HOOK] glob(['**/*late*'])
  result: skills/agent-builder/references/tool-templates.py
skills/late-skill
  input: {'command': 'ls -la /Users/s11437/lcc-hw/s07/ 2>/dev/null; ls -la /Users/s11437/.claude/skills/ 2>/dev/null'}
[HOOK] bash(['ls -la /Users/s11437/lcc-hw/s07/ 2>/dev/null; ls -la /User)
  result: total 16
drwxr-xr-x@ 5 s11437  MAKEBLOCK\Domain Users  160 Nov 23 17:27 .
drwxr-xr-x@ 9 s11437  MAKEBLOCK\Domain Users  288 Nov 23 17:17 ..
-rw-r--r--@ 1 s11437  MAKEBLOCK\Domain Users  333 Nov 23 17:

[turn 3]
  input: {'command': 'find /Users/s11437/lcc-hw/s07/skills/late-skill -type f | head -50; echo "---"; ls -la /Users/s11437/lcc-hw/s07/skills/'}
[HOOK] bash(['find /Users/s11437/lcc-hw/s07/skills/late-skill -type f | )
  result: /Users/s11437/lcc-hw/s07/skills/late-skill/SKILL.md
---
total 0
drwxr-xr-x@ 9 s11437  MAKEBLOCK\Domain Users  288 Nov 23 17:35 .
drwxr-xr-x@ 5 s11437  MAKEBLOCK\Domain Users  160 Nov 23 17:27 ..
drwxr

[turn 4]
  input: {'path': '/Users/s11437/lcc-hw/s07/skills/late-skill/SKILL.md'}
[HOOK] read_file(['/Users/s11437/lcc-hw/s07/skills/late-skill/SKILL.md'])
  result: ---
name: late-skill
description: 启动之后才出现的技能。
---

# Late Skill

[turn 5]
[HOOK] Stop: session used 5 tool calls
已加载 `late-skill` 技能。该技能位于项目目录 `skills/late-skill/SKILL.md`,但由于它是在会话启动后才创建的，系统的 `load_skill` 工具尚未注册它，所以我直接读取了文件内容。

**技能内容：**

```markdown
---
name: late-skill
description: 启动之后才出现的技能。
---

# Late Skill
```

**说明：**
- 这是一个"晚到"的技能——文件已存在于 `skills/` 目录中，格式正确(包含 name 和 description 的 frontmatter)
- 目前技能正文只有一个标题 `# Late Skill`,没有任何实际指令内容
- 如果希望系统能通过 `load_skill` 工具正常加载它，需要重启会话让技能注册表重新扫描；或者直接告诉我你想用这个技能做什么，我按照文件内容执行即可
````

</details>
