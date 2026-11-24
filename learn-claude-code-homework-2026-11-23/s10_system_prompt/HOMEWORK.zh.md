# s10 System Prompt（网站版）作业记录

## 结论

作业示例是好的。想看的点都拍到了：第一次组装发生在什么时候、memory 段在同一个问题里出现和消失、什么时候命中什么时候重拼。还多拍到一处：提示词里加了什么、删了什么，模型回答用的语言跟着变。

代码和网站上的逐字节相同（当时比对过，现在复核不了），没加调试补丁。这一章的 `[cache hit]` 和服务端缓存的关系，另见同目录的 `CACHE-HIT.zh.md`。

## 准备

- **版本**：网站版，提交 `20e7cbb`（2026-06-07）。主仓库（17 课的那一版）里没有这一章。`s10_system_prompt/code.py` 共 218 行。2026-11-24 我从网站的 `/zh/s10/` 页面里取出内嵌的源码，和这份文件逐字节比对过，相同。网页的副本没有留下，现在复核不了；“没加调试补丁”可以用 `git -C ~/learn-claude-code-site diff 20e7cbb -- s10_system_prompt/code.py` 复核，输出应该是空的。
- **启动命令**：

  ```sh
  cd ~/lcc-hw/s10
  ~/learn-claude-code/.venv/bin/python ~/learn-claude-code-site/s10_system_prompt/code.py
  ```

- **`.env`**：用户自己复制到了 `~/learn-claude-code-site/.env`。我没有读它。
- **模型**：`.env` 里配的那个。它在第一个问题里自述是“由 Z.ai 训练的 GLM 大语言模型驱动”。
- **作业目录**：`~/lcc-hw/s10`，空目录起步。用户 15:54 先试跑过一次，留下了一个 56 字节的 `.memory/MEMORY.md`（内容是 `-[tab](tab.md) — User prefers tab indentation in code` 加换行，横线后少一个空格）。那次试跑的终端输出没有留下。正式跑之前 `.memory` 目录被删掉了：现在这个目录的创建时间是 16:08:14，是第 2 问重新建出来的。那个 56 字节文件的内容只剩我当时记下的这一条，现在复核不了。
- **屏幕上自带的打印**，行号都指 `code.py`：
  - `[assembled] sections: …`（91 行），重拼时打印。
  - `[cache hit] system prompt unchanged`（83 行），context 没变时打印。颜色是暗灰色。
  - 每次调模型之前恰好打印其中一行（174 行和 197 行各调一次 `get_system_prompt`）。所以模型调用次数等于两种打印的行数之和。
- **看不到的东西**：工具只打印名字（187 行）和输出前 200 个字符（190 行），具体参数不打印。模型中途说的话不打印，只打印每个问题最后那条回答里的文字（215–217 行）。

## 相对 s09 改了什么

README 的对照表（`README.md` 161–169 行）说：提示词从写死的 `SYSTEM` 变成 `PROMPT_SECTIONS` 加 `assemble_system_prompt`；缓存从无到有；循环改用 `get_system_prompt(context)`；工具还是三个。

我在这一章的代码里核到的：

- **提示词由三部分拼成**（50–64 行）。`PROMPT_SECTIONS` 里的 identity、tools、workspace 三段总是拼进去，`Relevant memories` 只在 context 里有记忆内容时才拼（60–62 行）。
- **字典里的第四个键没有被用到。** `PROMPT_SECTIONS["memory"]`（46 行）没有任何地方引用它，记忆段是 62 行现拼的。
- **记忆只读一个文件。** `update_context` 把 `.memory/MEMORY.md` 的全文放进 context（159–162 行）。这一章只有一处模型调用（176 行），没有选记忆、提取、整理这些额外的调用。
- **三个工具，没有权限闸门。** bash、read_file、write_file（134–149 行）。bash 用 `shell=True` 直接执行（106 行），没有 hooks。这一版的 README 没有提醒这一点。
- **没有核对的**：这一版的 s09 代码我没有读，对照表里“s09 那边怎样”的说法没有核对。

## 作业题目

同一个进程，按顺序输入八句。下面照录终端里的实际输入：

| # | 实际输入 | 备注 |
|---|---|---|
| 0 | `你是谁` | 用户自己加的 |
| 1 | `不调用任何工具，直接回答：你现在有哪些工具可以用？当前工作目录是什么？` | |
| 2 | `新建文件 .memory/MEMORY.md，内容是下面这一行，行尾留一个换行：- [tab](tab.md) — User prefers tab indentation in code` | |
| 3 | `一个 Python 函数 add(a, b)，存进 calc.py` | 计划的题目是“写一个…”，开头少了“写” |
| 4 | `在 .memory/MEMORY.md 末尾加一行：- [lang](lang.md) — Always answer in English` | |
| 5 | `读一下 .memory/MEMORY.md，告诉我里面记了什么` | |
| 6 | ` .memory/MEMORY.md 清空` | 计划的题目是“把 …”，开头变成了一个空格 |
| 7 | `calc.py 用的是 tab 还是空格缩进？` | |

贴出来的输出最后一行是空的提示符，程序没有退出。我检查的时候这个进程还开着。

## 逐题核对（用户实跑）

| 问 | 模型调用 | 屏上的标记行 | 工具 | 核对结果 |
|---|---|---|---|---|
| 0 | 1 | `[assembled]`，三段 | 无 | 敲完第一句才组装。工作目录来自提示词 45 行。“GLM、Z.ai”提示词里没有，是模型自己说的 |
| 1 | 1 | `[cache hit]` | 无 | 没调工具。三个工具和提示词 44 行一致 |
| 2 | 2 | 命中，然后 `[assembled]` 带 memory | write_file | 写完文件，同一个问题里就带上了 memory 段 |
| 3 | 2 | 命中，命中 | write_file | 写 `calc.py` 不在 context 里，所以命中。磁盘上是 tab |
| 4 | 3 | 命中，`[assembled]`，命中 | bash 两次 | 追加那一行后重拼；第二次 bash 没改文件，命中 |
| 5 | 2 | 命中，命中 | read_file | 回答用的英文 |
| 6 | 2 | 命中，然后 `[assembled]`，三段 | bash | 清空后 memory 段消失，回答切回中文 |
| 7 | 3 | 命中三次 | bash 两次 | 答案来自读文件，没提旧的偏好 |

- **调用次数**：16 次模型调用，等于 4 行 `[assembled]` 加 12 行 `[cache hit]`。工具调用 8 次：write_file 两次，bash 五次，read_file 一次。
- **每次调用拿到几段提示词**（按标记行推算，每个标记行对应它后面那次调用）：第 1 到 3 次三段，第 4 到 12 次四段，第 13 到 16 次三段。
- **磁盘上的结果**（2026-11-24 我量的）：
  - `calc.py` 29 字节，修改时间 16:08:43。`cat -et` 显示第二行是 `^Ireturn a + b$`，缩进是 tab。
  - `.memory/MEMORY.md` 0 字节，修改时间 16:18:30。
  - `.memory` 目录的创建时间是 16:08:14，对应第 2 问。

逐条的依据：

- **第 2 问的 `Wrote 55 bytes`**：129 行的 `len(content)` 数的是字符，不是字节。这一行内容是 55 个字符，按 UTF-8 是 57 字节。57 是算出来的；文件后来又被改写，没能在磁盘上量到。模型回答里也跟着说“55 字节”。
- **第 2、3 问写文件用的是绝对路径**。`safe_path`（98–100 行）解析之后还在工作目录内，所以放行。
- **第 4 问第一次 bash 的输出是 `(no output)`**：109 行，命令没有任何输出时返回这个字符串。
- **第 6 问重拼的原因**：文件清空后，161 行的 `if content:` 不成立，`memories` 成了空字符串。
- **第 7 问**：`cat -A` 在 macOS 上不支持。模型说它换成了 `cat -t`，输出里只有 `^I`、没有行尾的 `$`，两者一致（`cat -et` 会多出 `$`）。

## 示范跑

2026-11-24 15:58:48 到 15:59:57，我用同一个代码、计划的七句题目跑了一次，69 秒。时间上它在用户的正式实跑之前：用户正式跑的 `.memory` 目录是 16:08:14 才建的。做法和用户实跑不同的地方：

- 在临时目录 `/private/tmp/lcc-s10-real.kOgVd4` 里跑，没碰用户的作业目录。
- 七句用管道送进标准输入，不是交互式输入。
- `.env` 的值只进环境变量。输出在打印之前过了一遍密钥掩码，没有命中。这是当时的流程，现在没有留下可复核的东西。

| 问 | 模型调用 | 屏上的标记行 | 工具 | 回答用的语言 |
|---|---|---|---|---|
| 1 | 1 | `[assembled]`，三段 | 无 | 中文 |
| 2 | 2 | 命中，然后 `[assembled]` 带 memory | write_file | 中文 |
| 3 | 2 | 命中，命中 | write_file | 中文 |
| 4 | 2 | 命中，然后 `[assembled]` | bash 一次 | 中文 |
| 5 | 2 | 命中，命中 | read_file | 中文 |
| 6 | 2 | 命中，然后 `[assembled]`，三段 | bash 一次 | 中文 |
| 7 | 3 | 命中三次 | bash 两次 | 中文 |

一共 14 次模型调用，7 次工具调用（write_file 两次，bash 四次，read_file 一次）。跑完之后磁盘上 `calc.py` 是 29 字节、带一个 tab，`MEMORY.md` 是 0 字节。这两项是我当时量的，临时目录已经删掉，现在复核不了。

## 最值得记的几处

1. **提示词里加了什么、删了什么，模型的回答跟着变。用户实跑里两个方向都拍到了。**
   - 第 4 问追加英文那句之后，同一个问题的最后一句回答改成了英文，它还说 “I'll answer in English from now on”。
   - 第 6 问清空之后，最后一句回答马上切回中文。对话历史里有英文回答，也有它自己那句承诺，都没起作用。
   - 限定：示范跑里第 4、5 问都还是中文。所以这个现象不是每次都一样。
2. **缓存 key 是 context 的内容，不是段落名单。** 第 4 问追加一行之后又重拼了一次，名单里还是那四段。
3. **模型会照抄工具返回的话。** 屏幕上写 `Wrote 55 bytes`，它的回答里也写“55 字节”，其实那是字符数。
4. **在 agent 外面改记忆文件，下一个问题看不到。** 这一条是离线回放拍到的，见下面“离线回放”的第 3 项。
5. **`cat -A` 在 macOS 上失败后，它自己换了命令。** 用户实跑换成 `cat -t`，示范跑换成 `cat -et`。所以第 7 问两次都是三次调用。

## 和预期不同

| 现象 | 用户实跑 | 示范跑 |
|---|---|---|
| 输入 | 八句，多了“你是谁”；第 3、6 句开头少字 | 计划的七句 |
| 第 4 问 | 两轮 bash。从输出看，第一次是追加（没有输出），第二次是读文件。最后一句是英文 | 一条命令做完。中文 |
| 第 5 问 | 英文 | 中文 |
| 第 6 问 | bash 的输出是 `0`；回答切回中文 | bash 的输出是一行 `ls -l`；中文 |
| 第 7 问 | 用 `cat -t`；没提旧的偏好 | 用 `cat -et`；提到“你之前记录的偏好” |
| 写文件用的路径 | 绝对路径 | 绝对路径 |

同一段代码、大体相同的题目，两次结果在第 4、5、7 问上不一样。和语言、措辞有关的现象，每次都可能不同，不能当规律记。

另外三处和预期不同：

- **README 说“创建 `.memory/MEMORY.md` 文件后，下一轮 memory section 自动加载”**（`README.md` 184 行）。agent 自己用工具创建时成立，第 2 问拍到了。在 agent 外面创建时不成立，见“离线回放”第 3 项。
- **`PROMPT_SECTIONS` 的 `memory` 键没有被用到**，见上面“相对 s09 改了什么”。
- **用户贴出来的输出里，第 3 问回答代码块的缩进是 8 个空格**，示范跑的输出里是一个 tab 字符，磁盘上是 tab。差别出在终端的显示或复制上，还是模型两次的输出本来就不同，我分不清。

## 来自模型的行为

模型的话只能当线索，下面每条都写了能不能核实。

| 模型说的 | 能不能核实 | 依据 |
|---|---|---|
| “由 Z.ai 训练的 GLM 大语言模型驱动” | 核不了 | 提示词 43 行只写了 “You are a coding agent. Act, don't explain.”，模型名是从哪来的，harness 里没有依据 |
| “当前工作目录是 `/Users/s11437/lcc-hw/s10`” | 对 | 提示词 45 行 |
| “已创建 `.memory/MEMORY.md`（55 字节）” | 数不对 | 照抄了工具的返回。55 是字符数，字节是 57 |
| “按你的偏好使用了 tab 缩进” | 缩进对，原因核不了 | 磁盘上是 tab。没有做对照，不能确定没有那句记忆它会不会也用 tab |
| “I'll answer in English from now on” | 只管到第 5 问 | 第 5 问是英文。第 6 问记忆清空后就切回中文了 |
| “用 `cat -t` 查看” | 和输出一致 | 输出里有 `^I`，没有 `$` |
| “文件现在为 0 字节” | 对 | 磁盘上是 0 字节 |

## README 说法

对不上的地方：

1. **表格说 tools 段的判断依据是 `enabled_tools`**（`README.md` 54 行）。代码里 tools 和 workspace 是两句写死的字符串（`code.py` 44–45 行）。离线回放里从工具表去掉一个工具，提示词重拼了，文本没变。
2. **“从 s01 到 s09，system prompt 都是一行硬编码”**（14 行）。这一版里 s07 和 s08 已经是 `SYSTEM = build_system()`（各自的 102 行和 110 行），s09 是每个问题现拼一次（`s09_memory/code.py` 589 行）。它引的那一行在前九章里逐字找不到。最接近的是 s02 的 39 行和 s04 的 74 行，两行相同，都比引文多了 “Act, don't explain.”。
3. **“s01 够用，只有 bash、read、write 三个工具”**（20 行）。s01 只有 bash（`s01_agent_loop/code.py` 57–65 行，`TOOLS` 里只有一项）。
4. **表格说 memory 段的判断依据是“`.memory/MEMORY.md` 是否存在”**（56 行，141 行也这么说）。代码要求文件存在，而且内容非空（`code.py` 159–162 行）。用户实跑的第 6 问把文件清成 0 字节，文件还在，memory 段却消失了。

说得对的：

- **缓存只省字符串拼接**（121 行）。代码注释 76–78 行也这么写。展开见 `CACHE-HIT.zh.md`。
- **三条观察点**（182–184 行）里，前两条实跑都拍到了，第三条有上面说的限定。

没有核对的：README 里折叠的“深入 CC 源码”一节。它引用的六个文件，其中五个给了行数（203 行），和我用的参照仓库 `haichengmai20-hub/claudecode_sourcecode1`（提交 `2dc86d8`）一致。那一节的正文没有逐条核对，参照仓库也不是官方发布的代码，出处见 `CACHE-HIT.zh.md`。

## 离线回放

都用假模型，没发请求，跑的是仓库里这份原版代码。脚本在文末。

1. **把计划的七句送进整个程序。** 13 次模型调用。第 1、2 次拿到三段提示词，第 3 到 10 次四段，第 11 到 13 次三段。命中和重拼出现的时机和两次实跑一致。回放里假模型用哪些工具、每问调用几次是我写死的，和实跑不同，所以打印出来的行并不完全一样。
2. **函数级的三项检查。**
   - 从 `TOOL_HANDLERS` 里去掉一个工具：重新组装了，提示词文本没变。
   - 两个 context 来回给（有记忆、无记忆、有、无、无）：只有相邻两次相同时才命中。缓存只记最近一份。
   - 键的顺序不同、内容相同时：命中。81 行的 `sort_keys=True` 起的作用。
3. **两次提问之间，在 agent 外面写 `.memory/MEMORY.md`。** 第二问开头打印的是 `[cache hit]`，这一问的调用只拿到三段。第三问开头才打印 `[assembled]`，拿到四段。原因：`agent_loop` 拿到的是上一个问题结束时算好的 context（214 行），进循环时只拿它去比对（174 行），不重新读文件。context 只在工具跑完一轮之后（196–197 行）和每个问题结束之后（214 行）才重算。

## 放到训练里看

这一章的提示词会在一段对话中途变。放到轨迹里看，相当于同一集做到一半换了任务说明：第 2 问里模型的前一次调用和后一次调用，拿到的系统提示词不一样。采样时如果依赖前缀缓存，这种变化会让缓存从变动的位置往后失效。这一段是我的推想，没有做实验，缓存的规则见 `CACHE-HIT.zh.md`。

## 补充题

都没跑。

1. **对照**：在没有记忆的空目录里只问一次第 3 问，看它用 tab 还是空格。这样第 3 问“缩进对，原因核不了”那一条就有依据了。
2. **外面改文件**：进程开着，在另一个终端里写 `.memory/MEMORY.md`，然后问一句不需要工具的话。按离线回放，这一问开头是 `[cache hit]`，回答时看不到记忆；再问一句才带上 memory 段。

## 出题提醒

- **空行回车会退出程序**（210 行）。
- **没有权限闸门**，bash 直接执行，题目里不要让它删东西。
- **输入可能少字。** 第 3、6 句的开头各少了一个字，原因不清楚。记录时照终端里的实际输入写。
- **和语言有关的现象至少跑两次再下结论。** 两次实跑的结果不一样。
- **数调用次数用标记行**，不要凭工具行去猜。
- **出题前先用假模型把路径走一遍。** 我原以为“在 agent 外面改了文件，下一问开头就会重拼”，离线一跑是错的。

## 复算

原始输出去掉颜色码、另存成文件之后数标记行。用户实跑应该是 4、12、8，示范跑是 4、10、7：

```sh
grep -c 'assembled' out.txt
grep -c 'cache hit' out.txt
grep -c '^> ' out.txt
```

磁盘上的结果：

```sh
cat -et ~/lcc-hw/s10/calc.py
wc -c ~/lcc-hw/s10/calc.py ~/lcc-hw/s10/.memory/MEMORY.md
```

行号：

```sh
grep -n "^def \|cache hit\|assembled\|system=system\|len(content)" ~/learn-claude-code-site/s10_system_prompt/code.py
```

离线回放（第一个参数是 `code.py` 的路径，脚本自己建临时目录）：

```sh
python replay_s10.py ~/learn-claude-code-site/s10_system_prompt/code.py
python replay_between_questions.py ~/learn-claude-code-site/s10_system_prompt/code.py
```

## 修改记录

- 2026-11-24：新建。依据是用户贴的终端输出、我量的磁盘状态、示范跑的原始输出、离线回放。
- 2026-11-24：对抗性核验报 12 条，11 条成立，已修订；另 1 条是存疑项（见下）。主要几处：
  1. 三处行号改对了：打印工具名在 187 行；README 那句“一行硬编码”在 14 行；s01 的工具表是 57–65 行。
  2. “示范跑”不再叫“第二次实跑”。按磁盘上的时间，它发生在用户正式实跑之前。
  3. 离线回放和实跑“打印顺序一致”改掉了。回放的打印行和实跑并不完全一样。
  4. README 对不上的地方补了第四条：memory 段的条件是“存在且非空”，不是“是否存在”。
  5. “s02 的 39 行最接近”补上相同的 s04 的 74 行。
  6. 缩进的差别限定到用户贴的输出，并说明示范跑的输出里是 tab。
  7. “先追加，再读”标明是从输出推的。
  8. `.memory` 那句改成“目录被删掉后重建”，和目录的创建时间对上。
  9. 三处现在复核不了的说法补了说明：和网页源码的逐字节比对、密钥掩码、15:54 那个文件的内容。参照仓库补了名字和提交号。
  10. 存疑没改的一条：README 157 行说“每轮循环开头拿一次 system prompt”，代码是循环前拿一次（174 行）、每轮工具跑完再拿一次（197 行）。我认为这句说的是每次调模型之前都会拿，不算对不上。

## 原始输出和回放脚本


<details>
<summary>原始输出：用户实跑（照录终端里粘贴的内容）</summary>

````text
s10 >> 你是谁
  [assembled] sections: identity, tools, workspace
你好！我是一个编程助手（coding agent），由 Z.ai 训练的 GLM 大语言模型驱动。

我可以帮你完成各种开发任务，包括：

- **阅读和分析代码**：查看文件内容、理解项目结构
- **编写和修改文件**：创建新代码、修改现有代码
- **执行命令行操作**：运行脚本、安装依赖、测试、构建等
- **调试和排查问题**：分析报错、定位 bug
- **项目搭建**：初始化项目、配置环境

当前工作目录是 `/Users/s11437/lcc-hw/s10`，有什么我可以帮你做的吗？

s10 >> 不调用任何工具，直接回答：你现在有哪些工具可以用？当前工作目录是什么？
  [cache hit] system prompt unchanged
好的，直接回答：

**我可用的工具（共 3 个）：**

1. **bash** — 运行 shell 命令，比如执行脚本、查看目录结构、安装依赖、运行测试等
2. **read_file** — 读取文件内容
3. **write_file** — 向文件写入内容（创建或覆盖文件）

**当前工作目录：** `/Users/s11437/lcc-hw/s10`

s10 >> 新建文件 .memory/MEMORY.md，内容是下面这一行，行尾留一个换行：- [tab](tab.md) — User prefers tab indentation in code
  [cache hit] system prompt unchanged
> write_file
Wrote 55 bytes to /Users/s11437/lcc-hw/s10/.memory/MEMORY.md
  [assembled] sections: identity, tools, workspace, memory
已创建 `.memory/MEMORY.md`（55 字节），内容为：

```
- [tab](tab.md) — User prefers tab indentation in code
```

行尾已包含一个换行符。

s10 >> 一个 Python 函数 add(a, b)，存进 calc.py
  [cache hit] system prompt unchanged
> write_file
Wrote 29 bytes to /Users/s11437/lcc-hw/s10/calc.py
  [cache hit] system prompt unchanged
已创建 `calc.py`：

```python
def add(a, b):
        return a + b
```

（按你的偏好使用了 tab 缩进）

s10 >> 在 .memory/MEMORY.md 末尾加一行：- [lang](lang.md) — Always answer in English
  [cache hit] system prompt unchanged
> bash
(no output)
  [assembled] sections: identity, tools, workspace, memory
> bash
- [tab](tab.md) — User prefers tab indentation in code
- [lang](lang.md) — Always answer in English
  [cache hit] system prompt unchanged
Done. The file `.memory/MEMORY.md` now contains:

```
- [tab](tab.md) — User prefers tab indentation in code
- [lang](lang.md) — Always answer in English
```

The new line was appended at the end with a trailing newline. (Also noting the new preference — I'll answer in English from now on.)

s10 >> 读一下 .memory/MEMORY.md，告诉我里面记了什么
  [cache hit] system prompt unchanged
> read_file
- [tab](tab.md) — User prefers tab indentation in code
- [lang](lang.md) — Always answer in English
  [cache hit] system prompt unchanged
The file `.memory/MEMORY.md` contains two entries:

1. **[tab](tab.md)** — User prefers tab indentation in code
2. **[lang](lang.md)** — Always answer in English

In short: it records that you prefer tab indentation in code, and that I should always answer in English.

s10 >>  .memory/MEMORY.md 清空
  [cache hit] system prompt unchanged
> bash
0
  [assembled] sections: identity, tools, workspace
已清空 `.memory/MEMORY.md`，文件现在为 0 字节（空文件）。之前的两条记录（tab 缩进偏好、英文回答）已全部移除。

s10 >> calc.py 用的是 tab 还是空格缩进？
  [cache hit] system prompt unchanged
> bash
cat: illegal option -- A
usage: cat [-belnstuv] [file ...]
  [cache hit] system prompt unchanged
> bash
def add(a, b):
^Ireturn a + b
  [cache hit] system prompt unchanged
`calc.py` 用的是 **tab 缩进**。

用 `cat -t` 查看，第二行开头的 `^I` 就是 tab 字符：

```
def add(a, b):
^Ireturn a + b
```

s10 >> 
````

</details>


<details>
<summary>原始输出：示范跑（去掉了颜色码）</summary>

````text
s10: system prompt — runtime assembly
Enter a question, press Enter to send. Type q to quit.

s10 >>   [assembled] sections: identity, tools, workspace
不调用工具，直接回答如下：

**可用的工具（共 3 个）：**

1. **bash** — 运行 shell 命令（参数：`command`）
2. **read_file** — 读取文件内容（参数：`path`，可选 `limit`）
3. **write_file** — 向文件写入内容（参数：`path`、`content`）

**当前工作目录：** `/private/tmp/lcc-s10-real.kOgVd4`

s10 >>   [cache hit] system prompt unchanged
> write_file
Wrote 55 bytes to /private/tmp/lcc-s10-real.kOgVd4/.memory/MEMORY.md
  [assembled] sections: identity, tools, workspace, memory
已创建 `.memory/MEMORY.md`，内容为：

```
- [tab](tab.md) — User prefers tab indentation in code
```

行尾保留了一个换行符（共 55 字节）。

s10 >>   [cache hit] system prompt unchanged
> write_file
Wrote 29 bytes to /private/tmp/lcc-s10-real.kOgVd4/calc.py
  [cache hit] system prompt unchanged
已创建 `calc.py`：

```python
def add(a, b):
	return a + b
```

缩进使用了制表符（tab），符合你的偏好。

s10 >>   [cache hit] system prompt unchanged
> bash
- [tab](tab.md) — User prefers tab indentation in code
- [lang](lang.md) — Always answer in English
  [assembled] sections: identity, tools, workspace, memory
已在 `.memory/MEMORY.md` 末尾追加该行，当前文件内容：

```
- [tab](tab.md) — User prefers tab indentation in code
- [lang](lang.md) — Always answer in English
```

s10 >>   [cache hit] system prompt unchanged
> read_file
- [tab](tab.md) — User prefers tab indentation in code
- [lang](lang.md) — Always answer in English
  [cache hit] system prompt unchanged
`.memory/MEMORY.md` 中记录了两条记忆：

1. **[tab](tab.md)** — User prefers tab indentation in code（用户在代码中偏好使用 tab 缩进）
2. **[lang](lang.md)** — Always answer in English（始终用英文回答）

s10 >>   [cache hit] system prompt unchanged
> bash
-rw-r--r--@ 1 s11437  wheel  0 Nov 24 15:59 /private/tmp/lcc-s10-real.kOgVd4/.memory/MEMORY.md
  [assembled] sections: identity, tools, workspace
`.memory/MEMORY.md` 已被清空（文件大小为 0 字节，文件本身仍存在）。

s10 >>   [cache hit] system prompt unchanged
> bash
cat: illegal option -- A
usage: cat [-belnstuv] [file ...]
  [cache hit] system prompt unchanged
> bash
def add(a, b):$
^Ireturn a + b$
  [cache hit] system prompt unchanged
`calc.py` 用的是 **tab 缩进**。`cat -et` 输出中的 `^I` 就是制表符：

```
def add(a, b):$
^Ireturn a + b$
```

符合你之前记录的偏好（代码中使用 tab 缩进）。

s10 >> 
````

</details>


<details>
<summary>离线回放的输出：七句送进整个程序，加函数级三项检查</summary>

````text
s10: system prompt — runtime assembly
Enter a question, press Enter to send. Type q to quit.

s10 >>   [assembled] sections: identity, tools, workspace
我有 bash、read_file、write_file 三个工具。当前工作目录是 <作业目录>。

s10 >>   [cache hit] system prompt unchanged
> write_file
Wrote 55 bytes to .memory/MEMORY.md
  [assembled] sections: identity, tools, workspace, memory
已新建 .memory/MEMORY.md。

s10 >>   [cache hit] system prompt unchanged
> write_file
Wrote 29 bytes to calc.py
  [cache hit] system prompt unchanged
已写入 calc.py。

s10 >>   [cache hit] system prompt unchanged
> bash
(no output)
  [assembled] sections: identity, tools, workspace, memory
Added the line.

s10 >>   [cache hit] system prompt unchanged
> read_file
- [tab](tab.md) — User prefers tab indentation in code
- [lang](lang.md) — Always answer in English
  [cache hit] system prompt unchanged
MEMORY.md records two preferences: tab indentation, and answering in English.

s10 >>   [cache hit] system prompt unchanged
> write_file
Wrote 0 bytes to .memory/MEMORY.md
  [assembled] sections: identity, tools, workspace
Cleared.

s10 >>   [cache hit] system prompt unchanged
> read_file
def add(a, b):
	return a + b
  [cache hit] system prompt unchanged
Tab indentation.

s10 >> 
===== 整个程序跑完：13 次模型调用 =====
第  1 次：3 段，不带 memory
第  2 次：3 段，不带 memory
第  3 次：4 段，带 memory
第  4 次：4 段，带 memory
第  5 次：4 段，带 memory
第  6 次：4 段，带 memory
第  7 次：4 段，带 memory
第  8 次：4 段，带 memory
第  9 次：4 段，带 memory
第 10 次：4 段，带 memory
第 11 次：3 段，不带 memory
第 12 次：3 段，不带 memory
第 13 次：3 段，不带 memory
  [assembled] sections: identity, tools, workspace, memory
  [cache hit] system prompt unchanged
  [assembled] sections: identity, tools, workspace, memory

[1] 去掉一个工具后：重新组装了吗（看上面有没有新的一行 [assembled]），提示词文本变了吗： False
  [assembled] sections: identity, tools, workspace, memory
  [assembled] sections: identity, tools, workspace
  [assembled] sections: identity, tools, workspace, memory
  [assembled] sections: identity, tools, workspace
  [cache hit] system prompt unchanged
[2] 两个 context 来回给（有记忆、无记忆、有、无、无），每一次和上一次返回的是不是同一个字符串对象： [False, False, False, True]
  [assembled] sections: identity, tools, workspace, memory
  [cache hit] system prompt unchanged
[3] 键的顺序不同、内容相同时，是不是同一个字符串对象： True
````

</details>


<details>
<summary>离线回放的输出：两次提问之间在外面写记忆文件</summary>

````text
s10: system prompt — runtime assembly
Enter a question, press Enter to send. Type q to quit.

s10 >>   [assembled] sections: identity, tools, workspace
（假回答）

s10 >>   [cache hit] system prompt unchanged
（假回答）

s10 >>   [assembled] sections: identity, tools, workspace, memory
（假回答）

s10 >> 
模型调用 3 次
第 1 次：3 段，不带 memory
第 2 次：3 段，不带 memory
第 3 次：4 段，带 memory
````

</details>


<details>
<summary>回放脚本：replay_s10.py</summary>

````python
"""离线回放网站版 s10：假模型，不发请求。

用法：python replay_s10.py <s10_system_prompt/code.py 的路径>
脚本自己建一个临时目录当作业目录，跑完删掉，不碰当前目录。
"""
import io, os, re, runpy, shutil, sys, tempfile, types
from pathlib import Path

code = Path(sys.argv[1]).resolve()


def tool_use(name, **inp):
    return types.SimpleNamespace(stop_reason="tool_use", content=[
        types.SimpleNamespace(type="tool_use", name=name, input=inp, id="toolu_" + name)])


def text(t):
    return types.SimpleNamespace(stop_reason="end_turn", content=[
        types.SimpleNamespace(type="text", text=t)])


# 假模型的回答，按顺序弹出。回答的内容是写死的，只看程序打印的顺序。
SCRIPT = [
    text("我有 bash、read_file、write_file 三个工具。当前工作目录是 <作业目录>。"),
    tool_use("write_file", path=".memory/MEMORY.md",
             content="- [tab](tab.md) — User prefers tab indentation in code\n"),
    text("已新建 .memory/MEMORY.md。"),
    tool_use("write_file", path="calc.py", content="def add(a, b):\n\treturn a + b\n"),
    text("已写入 calc.py。"),
    tool_use("bash", command="printf '%s\\n' '- [lang](lang.md) — Always answer in English' >> .memory/MEMORY.md"),
    text("Added the line."),
    tool_use("read_file", path=".memory/MEMORY.md"),
    text("MEMORY.md records two preferences: tab indentation, and answering in English."),
    tool_use("write_file", path=".memory/MEMORY.md", content=""),
    text("Cleared."),
    tool_use("read_file", path="calc.py"),
    text("Tab indentation."),
]


class Messages:
    def __init__(self):
        self.calls = 0
        self.systems = []

    def create(self, **kw):
        self.calls += 1
        self.systems.append(kw["system"])
        return SCRIPT.pop(0)


MESSAGES = Messages()
fake_anthropic = types.ModuleType("anthropic")


class FakeAnthropic:
    def __init__(self, *a, **k):
        self.messages = MESSAGES


fake_anthropic.Anthropic = FakeAnthropic
fake_dotenv = types.ModuleType("dotenv")
fake_dotenv.load_dotenv = lambda override=True: None
sys.modules["anthropic"] = fake_anthropic
sys.modules["dotenv"] = fake_dotenv
os.environ["MODEL_ID"] = "fake-model"
os.environ.pop("ANTHROPIC_BASE_URL", None)

QUESTIONS = [
    "不调用任何工具，直接回答：你现在有哪些工具可以用？当前工作目录是什么？",
    "新建文件 .memory/MEMORY.md，内容是下面这一行，行尾留一个换行：- [tab](tab.md) — User prefers tab indentation in code",
    "写一个 Python 函数 add(a, b)，存进 calc.py",
    "在 .memory/MEMORY.md 末尾加一行：- [lang](lang.md) — Always answer in English",
    "读一下 .memory/MEMORY.md，告诉我里面记了什么",
    "把 .memory/MEMORY.md 清空",
    "calc.py 用的是 tab 还是空格缩进？",
    "q",
]

scratch = Path(tempfile.mkdtemp(prefix="lcc-s10-replay-"))
prev_cwd = Path.cwd()
real_stdout = sys.stdout


class Clean:
    def write(self, s):
        real_stdout.write(re.sub(r"\033\[[0-9;]*m", "", s).replace(str(scratch), "<作业目录>"))
        real_stdout.flush()

    def flush(self):
        real_stdout.flush()


try:
    os.chdir(scratch)
    sys.stdout = Clean()
    sys.stdin = io.StringIO("\n".join(QUESTIONS) + "\n")
    g = runpy.run_path(str(code), run_name="__main__")
finally:
    os.chdir(prev_cwd)

print("\n===== 整个程序跑完：%d 次模型调用 =====" % MESSAGES.calls)
for i, s in enumerate(MESSAGES.systems, 1):
    print("第 %2d 次：%d 段，%s" % (i, len(s.split("\n\n")), "带 memory" if "Relevant memories" in s else "不带 memory"))

# ---- 函数级的三项检查（跑完 REPL 之后做；先放一个有内容的记忆文件）----
(scratch / ".memory").mkdir(exist_ok=True)
(scratch / ".memory" / "MEMORY.md").write_text("- [x](x.md) — demo\n", encoding="utf-8")
get_prompt, upd = g["get_system_prompt"], g["update_context"]
ctx = upd({}, [])
assert "Relevant memories" in get_prompt(ctx)
base = get_prompt(ctx)
handlers = g["TOOL_HANDLERS"]
saved = handlers.pop("write_file")
after = get_prompt(upd(ctx, []))
handlers["write_file"] = saved
print("\n[1] 去掉一个工具后：重新组装了吗（看上面有没有新的一行 [assembled]），提示词文本变了吗：", after != base)

nomem = dict(upd({}, []), memories="")
returns = [get_prompt(c) for c in (ctx, nomem, ctx, nomem, nomem)]
hits = [b is a for a, b in zip(returns, returns[1:])]
print("[2] 两个 context 来回给（有记忆、无记忆、有、无、无），每一次和上一次返回的是不是同一个字符串对象：", hits)

first = get_prompt(ctx)
reordered = {k: ctx[k] for k in ("memories", "workspace", "enabled_tools")}
print("[3] 键的顺序不同、内容相同时，是不是同一个字符串对象：", get_prompt(reordered) is first)

sys.stdout = real_stdout
shutil.rmtree(scratch)
````

</details>


<details>
<summary>回放脚本：replay_between_questions.py</summary>

````python
"""离线回放网站版 s10 的另一条路径：两次提问之间，在 agent 外面改 .memory/MEMORY.md。

用法：python replay_between_questions.py <s10_system_prompt/code.py 的路径>
假模型，不发请求；脚本自己建临时目录，跑完删掉。
"""
import builtins, io, os, re, runpy, shutil, sys, tempfile, types
from pathlib import Path

code = Path(sys.argv[1]).resolve()


def text(t):
    return types.SimpleNamespace(stop_reason="end_turn", content=[
        types.SimpleNamespace(type="text", text=t)])


class Messages:
    def __init__(self):
        self.calls = 0
        self.systems = []

    def create(self, **kw):
        self.calls += 1
        self.systems.append(kw["system"])
        return text("（假回答）")


MESSAGES = Messages()
fake_anthropic = types.ModuleType("anthropic")


class FakeAnthropic:
    def __init__(self, *a, **k):
        self.messages = MESSAGES


fake_anthropic.Anthropic = FakeAnthropic
fake_dotenv = types.ModuleType("dotenv")
fake_dotenv.load_dotenv = lambda override=True: None
sys.modules["anthropic"] = fake_anthropic
sys.modules["dotenv"] = fake_dotenv
os.environ["MODEL_ID"] = "fake-model"
os.environ.pop("ANTHROPIC_BASE_URL", None)

scratch = Path(tempfile.mkdtemp(prefix="lcc-s10-between-"))
prev_cwd = Path.cwd()
real_stdout = sys.stdout


class Clean:
    def write(self, s):
        real_stdout.write(re.sub(r"\033\[[0-9;]*m", "", s).replace(str(scratch), "<作业目录>"))
        real_stdout.flush()

    def flush(self):
        real_stdout.flush()


QUESTIONS = iter(["第一问", "第二问", "第三问", "q"])


def fake_input(prompt=""):
    """代替 input()：读到第二问之前，模拟用户在另一个终端里写了记忆文件。"""
    sys.stdout.write(prompt)
    sys.stdout.flush()
    q = next(QUESTIONS)
    if q == "第二问":
        (scratch / ".memory").mkdir()
        (scratch / ".memory" / "MEMORY.md").write_text("- [x](x.md) — written outside the agent\n", encoding="utf-8")
    return q


builtins.input, real_input = fake_input, builtins.input
try:
    os.chdir(scratch)
    sys.stdout = Clean()
    runpy.run_path(str(code), run_name="__main__")
finally:
    sys.stdout = real_stdout
    os.chdir(prev_cwd)
    builtins.input = real_input

print("\n模型调用 %d 次" % MESSAGES.calls)
for i, s in enumerate(MESSAGES.systems, 1):
    print("第 %d 次：%d 段，%s" % (i, len(s.split("\n\n")), "带 memory" if "Relevant memories" in s else "不带 memory"))
shutil.rmtree(scratch)
````

</details>
