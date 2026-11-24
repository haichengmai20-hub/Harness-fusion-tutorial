# s02 作业记录

> 个人学习记录，不属于上游教程内容，不要随 PR 提到上游（`CONTRIBUTING.md` 不收扩大章节结构的改动）。行号对应 commit `448c75b` 的原版 `code.py`，不含下面说的调试补丁。

**结论：这组题是好的，可以当模板。** 六问覆盖了 README 的观察重点：什么时候只调一个工具，什么时候一轮调多个，多个工具调用的顺序和结果对不对。README 的四条示例没覆盖的两处也拍到了：工具报错后模型怎么办，以及 `safe_path` 管不到 bash。有两处和出题时的预期不同，见「逐题核对」。

## 准备

**换一个干净的目录跑。** s02 能读能写。在仓库目录里跑，工作区就是整个仓库，`.env` 也在读得到的范围里。

```sh
mkdir -p ~/lcc-hw/s02 && cd ~/lcc-hw/s02
printf '第一行：今天天气很好。\n第二行：这是一份笔记。\n' > notes.txt
printf 'a\n' > a.txt
printf 'b\nb\n' > b.txt
printf 'outside the workspace\n' > ../outside.txt
```

**加 4 行调试输出。** 原版只打印工具名（`code.py:179`）和输出的前 200 字符（`code.py:182`），有两件事看不出来：bash 的具体命令；一轮里调了几个工具，还是分了几轮。实测「一轮两个工具」和「两轮各一个」的屏幕输出逐字相同。在 `agent_loop`（`code.py:163`）里加这 4 行，其余不动：

```python
def agent_loop(messages: list):
    turn = 0
    while True:
        turn += 1
        print(f"\n[turn {turn}]")
        response = client.messages.create(
            ...
        for block in tool_calls:
            print(f"\033[33m> {block.name}\033[0m")
            print(f"  input: {block.input}")
            handler = TOOL_HANDLERS.get(block.name)
```

`[turn N]` 是第 N 次模型调用。跑完用 `git checkout -- s02_tool_use/code.py` 还原。

**启动**（在 `~/lcc-hw/s02` 里）：

```sh
~/learn-claude-code/.venv/bin/python ~/learn-claude-code/s02_tool_use/code.py
```

从别的目录启动也能读到仓库的 `.env`，工作区就是当前目录（`code.py:44`）。

## 作业题目

| # | 提问 | 想看什么 | 模型调用 |
|---|------|---------|---------|
| 1 | `读一下 notes.txt，告诉我写了什么` | 选 `read_file` 还是 bash 的 `cat` | 2 次 |
| 2 | `把 a.txt 和 b.txt 都读一遍，告诉我两个文件一共几行` | 一轮里发两个工具，还是分两轮 | 2 次 |
| 3 | `读一下 ../outside.txt` | `safe_path` 拦不拦得住 | 2 次 |
| 4 | `把 notes.txt 里的「蓝色」改成「绿色」` | 文件里没有「蓝色」，看它拿到报错后怎么办 | 2 次 |
| 5 | `新建 poem.txt，内容写「你好，世界」` | 写文件；屏幕上的字节数对不对 | 3 次 |
| 补 | `用 bash 的 cat 命令读一下 ../outside.txt` | `safe_path` 管不管 bash | 2 次 |

第 1–5 问在同一个进程里按顺序问。补问在新进程里当第一问。

实跑环境：2026-11-23，`MODEL_ID=glm-5.3`（经 `ANTHROPIC_BASE_URL`），Python 3.12.15。原始输出见文末。

## 逐题核对

| 题 | 实跑现象 | 代码事实 |
|----|---------|---------|
| 1 | 用了 `read_file`，没用 bash | 读文件两种工具都能做，它选了专用工具 |
| 2 | `[turn 1]` 里连着两个 `read_file`，先 a 后 b，回答「一共 3 行」 | 两个调用在同一条 assistant 消息里，两个结果在同一条 user 消息里；`for` 循环逐个执行（`code.py:178`） |
| 3 | `read_file` 返回 `Error: Path escapes workspace: …`。第 2 轮它解释原因，建议把文件移进来，没有换工具 | 报错来自 `code.py:84`，是普通字符串，当 `tool_result` 回喂 |
| 4 | 它先读文件，看到没有「蓝色」，回复没改。没调 `edit_file` | `code.py:113` 的 "text not found" 没触发。它说的是「重新读了」，前几问的对话还在上下文里（`code.py:192`、`code.py:204`） |
| 5 | `write_file` 返回 `Wrote 5 bytes`，它接着 `read_file` 读回，再确认 | 文件实际 15 字节：`code.py:103` 数的是字符数 |
| 补 | `bash` 返回 `outside the workspace` | `safe_path` 只在三个文件工具里调用（`code.py:90`、`code.py:100`、`code.py:110`）。`run_bash` 只过 5 个子串组成的黑名单（`code.py:64`），工作目录就是工作区（`code.py:68`） |

### 和预期不同的两处

- **第 4 题它先读再改。** 出题时预期它直接改、然后报错。实际它先读了文件，所以 edit 的报错路径没拍到。
- **它传给文件工具的路径都是绝对路径。** `../outside.txt` 被换算成 `/Users/s11437/lcc-hw/outside.txt`，报错里看不到 `../`。`safe_path` 对绝对路径同样有效，原因在 `code.py:82`：`WORKDIR / p` 遇到绝对路径会丢掉左边，之后照常检查。

### 来自模型、不是代码保证的行为

下面三条是 GLM 这一次的选择，换模型或再跑一次可能不同：

- 第 2 题一轮发了两个工具。只问了一次，是否稳定没验证。
- 第 3 题被拒后没有换 bash 去读。
- 第 5 题写完主动读回。因为读了内容，它没被「5 bytes」误导。

### README 里的两处说法

- 速查表说循环「一行都没改」，变更表说「与 s01 完全一致」。实际骨架相同，`for` 体内改了 3 处：打印、查表执行、打印（`code.py:179`–`code.py:182`）。
- 根目录 `README-zh.md` 的章节表把 s02 的关键概念写成「并发」。代码是 `for` 循环逐个执行（`code.py:178`），本章 README 的中英文版都写的是逐个执行。

## 离线回放

用仓库测试同款的假模型（`tests/test_agent_loop_boundaries.py` 里的 `FakeMessagesApi`）回放，不花 API。跑的是带补丁的 `code.py`，补丁只加打印。

第 2 题，一轮里两个工具，每次模型调用拿到的消息是：

```
调用 1: user
调用 2: user · assistant[tool_use × 2] · user[tool_result × 2]
结束:   再追加一条 assistant[text]，history 一共 4 条
```

同一问如果分两轮各调一个：模型调用 3 次，history 6 条。

第 3 题和补问，模型第 2 次调用时多拿到的东西：

```
第 3 题: assistant[read_file] · user[tool_result: "Error: Path escapes workspace: …outside.txt"]
补问:    assistant[bash]       · user[tool_result: "outside the workspace"]
```

其他边界：

- 模型编造工具名 `list_files`：返回 `Unknown: list_files`，回喂后循环继续（`code.py:181`）。
- 模型给的参数对不上（漏 `path`、多一个字段、bash 漏 `command`）：`TypeError` 冲出 `agent_loop`。工具里的 `try/except` 在函数体内，管不到参数绑定这一步。REPL 只对 `input()` 做了异常处理（`code.py:194`）。
- `safe_path` 对六种路径写法：

| 写法 | 结果 |
|------|------|
| 绝对路径，在工作区内 | 放行 |
| 相对路径 | 放行 |
| 带 `..`，指向工作区外 | 拦截 |
| 绝对路径，在工作区外 | 拦截 |
| 兄弟目录的绝对路径，名字以工作区目录名开头（`…/s02-evil/x.txt`） | 拦截 |
| 带 `..` 但绕回工作区（`sub/../notes.txt`） | 放行 |

第 5 行说明它比的是路径段，不是字符串前缀：`…/s02-evil` 以 `…/s02` 开头，但不算在它下面。写成相对路径 `s02-evil/x.txt` 是工作区里的子目录，会放行。

## 放到训练里看

- **工具集就是动作空间。** `TOOL_HANDLERS` 的键是离散动作（`code.py:153`），`TOOLS` 里的 JSON schema 是每个动作的参数（`code.py:138`）。
- **一轮多个工具，是一条 assistant 消息里的多个 action。** 环境用一条 user 消息返回同样多个 observation。
- **工具返回值就是模型的全部观察。** 返回值错了，模型看到的世界就是错的：第 5 题屏幕上说 5 字节，实际 15 字节。
- **无效动作的两种代价不一样。** 工具名不存在，拿到 `Unknown` 纠正就行；参数对不上，循环直接崩，轨迹断在这里。

## 补充题（待实跑）

- **重问第 2 题两三次**，看「一轮两个」是否稳定。
- **问 `把 b.txt 里所有的 b 都改成 c`。** `edit_file` 只替换第一次（`code.py:114`）。看它一轮发几个 `edit_file`，会不会读回验证。这道是用来补 edit 的报错路径的。

作业目录里留着 `poem.txt`，重跑涉及列文件的题会多出它。

## 给后面各章出题的提醒

- 屏幕只打印工具名和输出的前 200 字符。要看轮数和参数，就加那 4 行。
- 模型倾向先读再改、写后读回。想拍到工具报错，要挑模型没法预先避免的错误，或者直接点名工具。
- 想看模型绕过某个限制，点名它用哪个工具。不点名，它被拒后可能就放弃了。
- 文件工具的路径可能是绝对路径，报错信息里看不到原始写法。

## 复算

```sh
# 从别的目录启动时能否读到 .env。退出码 0 就是读到了；读不到会在 code.py:46 抛 KeyError。
# 空输入启动，REPL 读到 EOF 就退出，不发请求。
cd ~/lcc-hw/s02 && PYTHONDONTWRITEBYTECODE=1 \
  ~/learn-claude-code/.venv/bin/python ~/learn-claude-code/s02_tool_use/code.py < /dev/null

# poem.txt 的字节数和字符数：15 和 5
wc -c ~/lcc-hw/s02/poem.txt
wc -m ~/lcc-hw/s02/poem.txt

# 全量测试。临时环境，不动 .venv。
PYTHONDONTWRITEBYTECODE=1 uv run --no-project --python 3.12 \
  --with pytest --with "anthropic>=0.25.0" --with "python-dotenv>=1.0.0" --with "pyyaml>=6.0" \
  pytest -q -p no:cacheprovider tests
```

2026-11-23 的结果：503 passed，118 subtests passed。原版和带补丁两种状态各跑了一次，结果相同。其中 `tests/test_chapter_readmes.py` 和 `tests/test_agents_smoke.py` 用 `py_compile` 编译 `s*/code.py` 和 `agents/*.py`，会在这些目录留下 `__pycache__/`（git 忽略），`PYTHONDONTWRITEBYTECODE=1` 挡不住。

## 修改记录

- 2026-11-23：建档。记录两次实跑（五问加一次补问）、逐题核对和离线回放结果。
- 2026-11-23：对抗性核验后修订。改正 `safe_path` 表里兄弟目录那行的示例：相对写法 `s02-evil/x.txt` 在工作区里，会放行，被拦的是兄弟目录的绝对路径。结论句按 README 原文补上「多个工具调用的顺序和结果是否正确」。

<details>
<summary>原始终端记录（2026-11-23，两次实跑，启动部分未录）</summary>

第一次，第 1–5 问，同一个进程：

````text
s02 >> 读一下 notes.txt，告诉我写了什么

[turn 1]
> read_file
  input: {'path': '/Users/s11437/lcc-hw/s02/notes.txt'}
第一行：今天天气很好。
第二行：这是一份笔记。

[turn 2]
notes.txt 里写的内容是：

```
第一行：今天天气很好。
第二行：这是一份笔记。
```

一共两行，就是一份简单的笔记：第一句说今天天气很好，第二句说明这是一份笔记。

s02 >> 把 a.txt 和 b.txt 都读一遍，告诉我两个文件一共几行

[turn 1]
> read_file
  input: {'path': '/Users/s11437/lcc-hw/s02/a.txt'}
a
> read_file
  input: {'path': '/Users/s11437/lcc-hw/s02/b.txt'}
b
b

[turn 2]
读完了：

- **a.txt**：1 行（内容就是 `a`）
- **b.txt**：2 行（两行都是 `b`）

两个文件加起来一共 **3 行**。

s02 >> 读一下 ../outside.txt

[turn 1]
> read_file
  input: {'path': '/Users/s11437/lcc-hw/outside.txt'}
Error: Path escapes workspace: /Users/s11437/lcc-hw/outside.txt

[turn 2]
读不了 `../outside.txt`：

```
Error: Path escapes workspace: /Users/s11437/lcc-hw/outside.txt
```

我的文件访问被限制在当前工作目录 `/Users/s11437/lcc-hw/s02` 内，这个文件在上一级目录（`s02` 之外），所以无法读取。如果你需要我看这个文件，可以把它复制/移动到 `s02` 目录里，我就能读了。

s02 >> 把 notes.txt 里的「蓝色」改成「绿色」

[turn 1]
> read_file
  input: {'path': '/Users/s11437/lcc-hw/s02/notes.txt'}
第一行：今天天气很好。
第二行：这是一份笔记。

[turn 2]
我重新读了 notes.txt，里面并没有「蓝色」这个词，当前内容是：

```
第一行：今天天气很好。
第二行：这是一份笔记。
```

所以没有可以替换的地方，我没有做任何修改。

是不是你想改别的文件，或者想改别的词？比如要把「很好」改成别的什么吗？告诉我具体需求我再操作。

s02 >> 新建 poem.txt，内容写「你好，世界」

[turn 1]
> write_file
  input: {'path': '/Users/s11437/lcc-hw/s02/poem.txt', 'content': '你好，世界'}
Wrote 5 bytes to /Users/s11437/lcc-hw/s02/poem.txt

[turn 2]
> read_file
  input: {'path': '/Users/s11437/lcc-hw/s02/poem.txt'}
你好，世界

[turn 3]
已确认：`poem.txt` 已创建，内容完整无误，就是「你好，世界」。

s02 >> 
````

第二次，补问，新进程的第一问：

````text
s02 >> 用 bash 的 cat 命令读一下 ../outside.txt

[turn 1]
> bash
  input: {'command': 'cat ../outside.txt'}
outside the workspace

[turn 2]
`../outside.txt` 的内容是:

```
outside the workspace
```
````

</details>
