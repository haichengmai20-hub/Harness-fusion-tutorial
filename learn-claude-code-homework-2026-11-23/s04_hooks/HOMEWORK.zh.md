# s04 作业记录

> 个人学习记录，不属于上游教程内容，不要随 PR 提到上游（`CONTRIBUTING.md` 不收扩大章节结构的改动）。行号对应 commit `448c75b` 的原版 `code.py`，不含下面说的调试补丁和作业用的 Stop hook。

**结论：这组题是好的，可以当模板。** 六问覆盖了 README 观察重点的两个问题：每次工具执行前有没有 `[HOOK]` 日志，权限被拒时是不是 hook 拦的。README 没让试的 Stop hook 阻止退出也拍到了。另有两处值得记：回喂的话区分开之后，模型的解释也跟着区分；bash 的输出被悄悄截掉一半，模型却说自己“完整输出”。这次没有漏掉的分支。

## 准备

**换一个干净的目录跑。** 理由同 s02。

```sh
mkdir -p ~/lcc-hw/s04
printf '第一行：今天天气很好。\n第二行：这是一份笔记。\n' > ~/lcc-hw/s04/notes.txt
printf '这是待删除的旧文件\n' > ~/lcc-hw/s04/old.txt
python3 -c "open('$HOME/lcc-hw/s04/big.txt','w').write('abc\n'*25100)"
```

`big.txt` 是给最后两问用的，100400 字节，25100 行，每行都是 `abc`。

**加 6 行调试输出。** 比 s03 多一行：原版的循环里不再打印工具输出，得补回来。在 `agent_loop`（`code.py:224`）里加：

```python
def agent_loop(messages: list):
    turn = 0
    while True:
        turn += 1
        print(f"\n[turn {turn}]")
        response = client.messages.create(
            ...
        for block in tool_calls:
            print(f"  input: {block.input}")
            blocked = trigger_hooks("PreToolUse", block)
            if blocked:
                print("  -> denied")
                results.append({"type": "tool_result", "tool_use_id": block.id,
                                "content": str(blocked)})
                continue

            handler = TOOL_HANDLERS.get(block.name)
            output = handler(**block.input) if handler else f"Unknown: {block.name}"

            print(str(output)[:200])
            trigger_hooks("PostToolUse", block, output)  # s04: post hook
```

**加一个作业用的 Stop hook。** 这是我写的，不是上游代码。它只在模型第一次想停下来时生效，返回一句话不让停。自带代码里没有任何 hook 会阻止退出，而 Stop 是本章四个事件里唯一能阻止循环退出的。加在 `register_hook("Stop", summary_hook)`（`code.py:217`）后面：

```python
# 作业用：一个会阻止退出的 Stop hook，只在第一次想停时生效
_nudged = False

def nudge_hook(messages: list):
    global _nudged
    if not _nudged:
        _nudged = True
        print(f"\033[90m[HOOK] Stop: 先别停\033[0m")
        return "先别停：把 hello.txt 再读一遍，确认内容无误后，用一句话汇报。"
    return None

register_hook("Stop", nudge_hook)
```

因为它只生效一次，第 1 问要问一个会调工具的简单任务。

**启动**（在 `~/lcc-hw/s04` 里）：

```sh
~/learn-claude-code/.venv/bin/python ~/learn-claude-code/s04_hooks/code.py
```

## s04 相对 s03 改了什么

- **权限检查从循环里搬到了 hook 上。** 循环里只剩一行 `trigger_hooks("PreToolUse", block)`（`code.py:245`）。
- **同一个事件上可以挂多个 hook，按注册顺序执行，前面的一返回，后面的就不跑**（`code.py:143`、`code.py:145`）。
- **多了两个触发点**：工具执行后的 `PostToolUse`（`code.py:254`），循环要退出时的 `Stop`（`code.py:236`）。
- **README 没写、但代码变了的地方**：
  - 提示词回到 s02 的版本（`code.py:56`）。
  - 硬拒绝表从 7 项变成 6 项，少了 `> /dev/sda`（`code.py:151`）。
  - 回喂的话从一句变成两句。
  - 循环里不再打印工具名和输出。

## 作业题目

同一个进程里按顺序问了六句：

| # | 提问 | 被问时怎么答 | 想看什么 | 模型调用 |
|---|---|---|---|---|
| 1 | `新建 hello.txt，内容写「你好」` | | 通过的调用前的 `[HOOK]` 日志；结束时 Stop hook 不让停 | 4 次 |
| 2 | `读一下 ../outside.txt` | `n` | 被拒的调用有没有 `[HOOK]` 日志行 | 2 次 |
| 3 | `删掉 old.txt` | `n` | 它是自己先问，还是直接发起 `rm` | 2 次 |
| 4 | `用 rm -rf 删掉 hello.txt，路径写绝对路径` | 没被问，直接拒 | deny list 拒绝；回喂的话和第 3 问有什么不同 | 2 次 |
| 5 | `用 read_file 把 big.txt 整个读完再回答：里面重复的是哪几个字？回答里不要贴内容` | | 工具执行后的 hook：大输出提醒 | 2 次 |
| 6 | `用 bash 的 cat 命令把 big.txt 整个输出一遍，不用在回答里复述内容` | | 同一个大文件，bash 会不会触发提醒 | 2 次 |

实跑环境：2026-11-23，`MODEL_ID=glm-5.3`（经 `ANTHROPIC_BASE_URL`），Python 3.12.15。原始输出见文末。

## 逐题核对

| 题 | 实跑现象 | 代码事实 |
|----|---------|---------|
| 1 | 每个通过的调用前都有 `[HOOK]` 日志行。模型要停时出现 `Stop: 先别停`，又调了一次 `read_file` 才真正结束 | Stop hook 返回的字符串被追加成一条 user 消息（`code.py:238`），循环继续 |
| 2 | 被问，答 `n`，`-> denied`。没有 `[HOOK] read_file` 行 | 权限 hook 注册在日志 hook 前面（`code.py:214`、`code.py:215`），前者一返回，后者就不跑（`code.py:145`） |
| 3 | 它直接发起了一条带 `rm -f` 的复合命令，没有先口头问。被问，答 `n`。它回复“未获得授权……未执行任何命令” | 整条命令是一个工具调用，被拒就整条不跑，连前面的 `ls` 也没执行。回喂的是 `Permission denied by user`（`code.py:177`） |
| 4 | 硬拒绝，没问。它回复“deny list 拒绝”，并提议换普通 `rm` | 回喂的是 `Permission denied by deny list`（`code.py:169`） |
| 5 | 出现 `[HOOK] Large output from read_file: 100399 chars` | 阈值是 10 万字符（`code.py:196`） |
| 6 | 没有大输出提醒。它回复“已用 `cat` 完整输出” | `run_bash` 先把输出截到 5 万字符（`code.py:67`），低于阈值，截断时不告诉模型 |

每问结束时 Stop hook 打印的工具调用数，六问依次是 2、3、4、5、6、7，见下面「Stop hook」一节。

### 最值得记的两处

**回喂的话区分开之后，模型的解释也跟着区分。** 第 3 问它拿到 `Permission denied by user`，说的是“本次操作未获得授权”；第 4 问拿到 `Permission denied by deny list`，说的是“被环境策略拦截了（deny list 拒绝）”。s03 里两种情况回喂的都是 `Permission denied.`，它只能说“被拒绝了”。s03 的记录里留了一句“换个说法它会怎么做，这里没有测”，这次测到了。

**bash 的输出被悄悄截掉一半。** 第 6 问它说“已用 `cat` 完整输出 `big.txt`”。离线复算：文件是 100400 字节，`run_bash` 先截到 5 万字符（`code.py:67`），模型拿到 50000 字符、12500 行，文件一共 25100 行。截断时不告诉模型，所以它以为自己读完了。它说“与之前读到的一致”，但这次 `cat` 它只拿到前一半，读过后一半的只有第 5 问的 `read_file`。

### 来自模型、不是代码保证的行为

下面几条是 GLM 这一次的选择，换模型或再跑一次可能不同：

- 第 1 问它写完文件后没有自己读回，是被 Stop hook 拽回来才读的。
- 第 3 问它直接发起了带 `rm -f` 的命令。s04 的提示词里没有“不要自己问用户”那句，出题时以为它可能先来问，结果没有。
- 第 3 问的命令用的是相对路径，第 4、6 问用的是绝对路径。s03 那一次全是绝对路径。
- 第 4 问被硬拒后，它没有自己重发，而是提议换写法、等确认。s03 也是这样。
- 第 4 问它说“目录内容未变”。它并没有看到目录，这是它从“命令没执行”推出来的。

### README 和代码对不上的地方

- **“唯一的变动”又说少了**：README 说 s03 的循环和权限逻辑完全保留，唯一的变动是把 `check_permission()` 移到 hook 上。实际还有上面列的那四处。
- **`UserPromptSubmit`“可注入上下文”**：README 的变更表这么写，但 REPL 里调用它的那一行没有接收返回值（`code.py:276`）。自带的 `context_inject_hook` 也只是打印了一行工作目录（`code.py:201`）。
- **README 的 `permission_hook` 代码块比实际代码简略**：没有破坏性命令的询问，也没有屏幕打印。README 的示例 3 说“bash + rm 触发权限 hook”，实际代码里有，代码块里没有。
- **README 的 `log_hook` 代码块只打印工具名**，实际打印的是前两个参数值的前 60 个字符（`code.py:190`）。
- **README 没提被拒的调用不会留下日志**，见下一节。

## 离线回放

用仓库测试同款的假模型回放，不花 API。跑的是带补丁和 Stop hook 的 `code.py`。启动后注册表里是：

```
UserPromptSubmit   [context_inject_hook]
PreToolUse         [permission_hook, log_hook]
PostToolUse        [large_output_hook]
Stop               [summary_hook, nudge_hook]      ← nudge_hook 是作业加的
```

三种结局在屏幕上是，第一种取自实跑第 1 问：

```
通过     [HOOK] write_file(['…/hello.txt', '你好\n'])
         Wrote 3 bytes to …/hello.txt

问用户   [permission] Potentially destructive command
            Tool: bash({'command': 'rm old.txt'})
            Allow? [y/N]      ← 回车或 n：下面是 "  -> denied"，没有 [HOOK] 行
                               ← y：才出现 [HOOK] bash(['rm old.txt']) 和输出

硬拒绝   [blocked] 'rm -rf /'
           -> denied           ← 没有 [HOOK] 行
```

模型那边拿到的东西：

- 被拒时，硬拒绝是 `Permission denied by deny list`，用户拒绝是 `Permission denied by user`。文件工具也是这两句（`code.py:185`）。
- Stop hook 返回的字符串被原样追加成一条 user 消息。假模型回放的消息序列：

  ```
  user: 新建 hello.txt
  assistant[write_file] · user[结果]
  assistant[text: 已新建。]
  user: 先别停：把 hello.txt 再读一遍，确认内容无误后，用一句话汇报。    ← Stop hook 注入的
  assistant[read_file] · user[结果]
  assistant[text: 确认无误。]
  ```

  模型分不出这条 user 消息是 hook 说的还是人说的。

Stop hook：

- 自带的 `summary_hook` 只打印，不阻止退出。它数的是整份 history 里的工具结果，跨提问累积，被拒的调用也算。
- REPL 只打印最后一次模型回复，被 Stop hook 拦下的那一次回复（第 1 问的 `[turn 2]`）在 history 里，但屏幕上没有。

其他边界：

- **大输出提醒**：阈值 10 万字符（`code.py:196`）。`read_file` 读 `big.txt` 得到 100399 字符，触发；`run_bash` 的输出上限是 5 万（`code.py:67`），bash 永远触发不了。
- **拦截确实来自 hook**：把 PreToolUse 上的 hook 清空，`rm -rf /x` 就不再被拦。
- **短路**：UserPromptSubmit 上挂两个 hook，第一个返回字符串，第二个不执行。
- **hook 抛异常会冲出 `agent_loop`**，`trigger_hooks` 里没有 `try`。

## 放到训练里看

- **hook 是环境这一侧的扩展点。** 模型的策略没变，环境的行为变了：多了一道把关，多了一次“别停”。改环境行为不用动循环，也不用动模型。
- **Stop hook 注入的那句话，模型当成 user 消息。** 采集轨迹时，这类消息要标清来源，否则分不清哪句是人说的。
- **observation 里带多少信息，模型就能说清多少。** 第 3、4 问是一组对照。
- **环境悄悄裁剪 observation，模型会自信地说错。** 第 6 问的“完整输出”。
- **短路会让审计日志漏项。** 想用 hook 记录每次工具调用，记录类 hook 不能排在拦截类 hook 后面。

## 补充题（未实跑）

- **hook 抛异常后 REPL 怎么收场。** 离线看到的是异常冲出 `agent_loop`，REPL 只对 `input()` 做了异常处理。
- **Stop hook 每次都返回字符串会怎样。** 没试。按代码看，循环不会自己停。

作业目录跑完还剩四个文件，`hello.txt` 和 `old.txt` 都在，两次删除都被拒了。

## 给后面各章出题的提醒

- 想演示 Stop hook 阻止退出，得自己注册一个返回字符串的 hook，并加“只触发一次”的保护。
- 被拒的调用没有日志行。想每个调用都留痕，把记录类 hook 注册在拦截类前面。
- 大输出题放在最后问。大输出会留在上下文里，后面每一问都带着它。
- 想看到 bash 的静默截断，让文件超过 5 万字符。

## 复算

```sh
# 从别的目录启动时能否读到 .env。退出码 0 就是读到了。
# 空输入启动，REPL 读到 EOF 就退出，不发请求。
cd ~/lcc-hw/s04 && PYTHONDONTWRITEBYTECODE=1 \
  ~/learn-claude-code/.venv/bin/python ~/learn-claude-code/s04_hooks/code.py < /dev/null

# 文件大小。hello.txt 是第 1 问写的，内容是「你好」加换行。
wc -c ~/lcc-hw/s04/big.txt      # 100400
wc -l ~/lcc-hw/s04/big.txt      # 25100
wc -c ~/lcc-hw/s04/hello.txt    # 7
wc -m ~/lcc-hw/s04/hello.txt    # 3

# 全量测试。临时环境，不动 .venv。
PYTHONDONTWRITEBYTECODE=1 uv run --no-project --python 3.12 \
  --with pytest --with "anthropic>=0.25.0" --with "python-dotenv>=1.0.0" --with "pyyaml>=6.0" \
  pytest -q -p no:cacheprovider tests
```

2026-11-23 的结果：503 passed，118 subtests passed。这是 s02、s03、s04 三个文件都带改动时跑的。`tests/test_chapter_readmes.py` 用 `py_compile` 编译各章的 `code.py`，`tests/test_agents_smoke.py` 编译 `agents/*.py`，会留下 `__pycache__/`（git 忽略），跑完要清。

第 6 问的两个数是在 `big.txt` 的临时副本上调 `run_bash("cat big.txt")` 量的：拿到 50000 字符、12500 行。同一个副本上 `run_read("big.txt")` 得到 100399 字符。

## 修改记录

- 2026-11-23：建档。记录同一个进程里的六问、逐题核对和离线回放结果。
- 2026-11-23：对抗性核验后修订。改正两个数字：`cat` 截断后是 12500 行，原来写 12501，是数换行时多算了 1；调试补丁是 6 行，不是 5 行，并补上补丁代码。离线回放的屏幕和 Stop hook 注入的那句话，改成与实跑、与作业 hook 一致。Stop hook 的定位从“唯一能改变控制流”改为“唯一能阻止循环退出”，PreToolUse 的返回值同样改变控制流。第 6 问里“它的依据是第 5 问”是推测，改成只陈述事实。

<details>
<summary>原始终端记录（2026-11-23，同一个进程里的六问，启动部分未录）</summary>

````text
s04 >> 新建 hello.txt，内容写「你好」
[HOOK] UserPromptSubmit: working in /Users/s11437/lcc-hw/s04

[turn 1]
  input: {'path': '/Users/s11437/lcc-hw/s04/hello.txt', 'content': '你好\n'}
[HOOK] write_file(['/Users/s11437/lcc-hw/s04/hello.txt', '你好\n'])
Wrote 3 bytes to /Users/s11437/lcc-hw/s04/hello.txt

[turn 2]
[HOOK] Stop: session used 1 tool calls
[HOOK] Stop: 先别停

[turn 3]
  input: {'path': '/Users/s11437/lcc-hw/s04/hello.txt'}
[HOOK] read_file(['/Users/s11437/lcc-hw/s04/hello.txt'])
你好

[turn 4]
[HOOK] Stop: session used 2 tool calls
`hello.txt` 已确认存在，内容正是「你好」，无误。

s04 >> 读一下 ../outside.txt
[HOOK] UserPromptSubmit: working in /Users/s11437/lcc-hw/s04

[turn 1]
  input: {'path': '/Users/s11437/lcc-hw/outside.txt'}

[permission] Access outside workspace
   Tool: read_file({'path': '/Users/s11437/lcc-hw/outside.txt'})
   Allow? [y/N] n
  -> denied

[turn 2]
[HOOK] Stop: session used 3 tool calls
读取 `../outside.txt`（即 `/Users/s11437/lcc-hw/outside.txt`）被拒绝了——权限不足（该路径在当前工作目录 s04 之外），所以无法查看其内容。

s04 >> 删掉 old.txt
[HOOK] UserPromptSubmit: working in /Users/s11437/lcc-hw/s04

[turn 1]
  input: {'command': 'ls -la old.txt 2>&1; rm -f old.txt; ls old.txt 2>&1'}

[permission] Potentially destructive command
   Tool: bash({'command': 'ls -la old.txt 2>&1; rm -f old.txt; ls old.txt 2>&1'})
   Allow? [y/N] n
  -> denied

[turn 2]
[HOOK] Stop: session used 4 tool calls
删除被拒绝了——本次操作未获得授权，`old.txt` 没有被删除（未执行任何命令）。如果需要我删除它，请允许该操作。

s04 >> 用 rm -rf 删掉 hello.txt，路径写绝对路径
[HOOK] UserPromptSubmit: working in /Users/s11437/lcc-hw/s04

[turn 1]
  input: {'command': 'rm -rf /Users/s11437/lcc-hw/s04/hello.txt && ls /Users/s11437/lcc-hw/s04/'}

[blocked] 'rm -rf /'
  -> denied

[turn 2]
[HOOK] Stop: session used 5 tool calls
`rm -rf` 命令被环境策略拦截了（deny list 拒绝），所以 `hello.txt` 尚未被删除，目录内容未变。

如果确实要删除，我可以用不带 `-rf` 的普通 `rm` 再试一次，要继续吗？

s04 >> 用 read_file 把 big.txt整个读完再回答：里面重复的是哪几个字？回答里不要贴内容
[HOOK] UserPromptSubmit: working in /Users/s11437/lcc-hw/s04

[turn 1]
  input: {'path': '/Users/s11437/lcc-hw/s04/big.txt'}
[HOOK] read_file(['/Users/s11437/lcc-hw/s04/big.txt'])
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc

[HOOK] Large output from read_file: 100399 chars

[turn 2]
[HOOK] Stop: session used 6 tool calls
已完整读完 `big.txt`。里面重复的字是 **a、b、c** 这三个——文件由同一行「abc」反复组成，因此 a、b、c 各出现同样的次数（各占约三分之一）。

s04 >> 用 bash 的 cat 命令把 big.txt 整个输出一遍，不用在回答里复述内容
[HOOK] UserPromptSubmit: working in /Users/s11437/lcc-hw/s04

[turn 1]
  input: {'command': 'cat /Users/s11437/lcc-hw/s04/big.txt'}
[HOOK] bash(['cat /Users/s11437/lcc-hw/s04/big.txt'])
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc
abc


[turn 2]
[HOOK] Stop: session used 7 tool calls
已用 `cat` 完整输出 `big.txt`（内容如上方工具输出所示，与之前读到的一致：重复的「abc」行），此处不再复述。
````

</details>
