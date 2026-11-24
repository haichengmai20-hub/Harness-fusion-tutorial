# prompt cache 与系统提示词组装：作业记录、Claude Code 源码、旧研究笔记

整理日期：2026-11-25。用到的材料：

| 材料 | 位置 | 版本 |
|---|---|---|
| 作业记录 | [HOMEWORK.zh.md](../learn-claude-code-homework-2026-11-23/s10_system_prompt/HOMEWORK.zh.md)、[CACHE-HIT.zh.md](../learn-claude-code-homework-2026-11-23/s10_system_prompt/CACHE-HIT.zh.md)，以及 s01–s09 各章的 `HOMEWORK.zh.md` | 2026-11-24 的 Mac 作业记录；下文复核终端摘录和源码 |
| 教学代码，s10 | [s10_system_prompt/code.py](../sources/learn-claude-code/s10_system_prompt/code.py) | 网站版 `20e7cbb`，218 行 |
| 教学代码，s01–s09 | 同一仓库的 `main` 历史版本 | `448c75b`。在本项目根目录可用 `git -C sources/learn-claude-code show 448c75b:s07_skill_loading/code.py` 阅读 s07，其余章换成实际路径 |
| Claude Code 源码 | `sources/claude-code/src/`，下文路径都相对它 | 第三方快照 `6f6f12b3`，2026-03-31 泄露源 |
| 旧研究笔记 | `D:\RL及harness\claude-code-internals\notes\`，下文记作 `notes/` | 2026-06-30 版，当时按同一份快照做过源码与 trace 交叉验证 |

**作业跨了两个版本，行号别混着看。** s01–s09 的作业记录开头写明「行号对应 commit `448c75b` 的原版 `code.py`」；s10 的两份对应网站版 `20e7cbb`。两个版本里 s10 之后的目录结构不同，s01–s09 的同名文件内容也有差异。

请求字段、断点、前缀这几个词，以及 T / S1 / S2 / U1 那张图，在 [s10-请求字段与缓存断点.md](s10-请求字段与缓存断点.md) 里讲过，本文不重复。

## 一、样本：作业实跑的八句话

后面三节都沿着这一次实跑讲。用户在同一个进程里按顺序输入八句，编号沿用作业的 0 到 7。

```text
问  输入                          屏上的标记行                         工具
0   你是谁                        [assembled] 三段                     无
1   不调工具，报工具和目录        [cache hit]                          无
2   新建 .memory/MEMORY.md        [cache hit] → write_file → [assembled] 四段
3   写 add(a, b) 存进 calc.py     [cache hit] ×2                       write_file
4   MEMORY.md 末尾加「用英文回答」 [cache hit] → bash → [assembled] 四段 → bash → [cache hit]
5   读 MEMORY.md                  [cache hit] ×2                       read_file
6   清空 MEMORY.md                [cache hit] → bash → [assembled] 三段
7   calc.py 是 tab 还是空格       [cache hit] ×3                       bash ×2
```

我按作业贴出的原始输出重数了一遍：`[assembled]` 4 行，`[cache hit]` 12 行，工具行 8 行，和作业写的 16 次模型调用、8 次工具调用一致。四处重拼的段落名单依次是「三段、四段、四段、三段」。

三个要盯住的瞬间：

- **问 2**：文件写完，同一个问题的下一次调用就带上了 memory 段。
- **问 4**：往文件追加一行之后重拼，名单里还是那四段，回答变成英文。
- **问 6**：文件清空，memory 段消失，回答切回中文。

## 二、作业里讲「系统提示词组装」的部分

### 2.1 s10：按状态拼，按内容缓存

出处是 s10 的 `HOMEWORK.zh.md`，行号见括号。

| 作业的结论 | 依据 |
|---|---|
| 提示词有三段固定内容（identity、tools、workspace）；context 含非空记忆时再加第四段（L34） | `code.py` 50–64 |
| `PROMPT_SECTIONS["memory"]` 这个键没有被用到，记忆段是现拼的（L35） | `code.py` 46、62 |
| 记忆只读一个文件：`.memory/MEMORY.md` 的全文（L36） | `code.py` 159–162 |
| 缓存 key 是 context 的内容，不是段落名单。问 4 追加一行后重拼，名单没变（L111） | `code.py` 81–86 |
| 启动时先读状态。进循环时用已有 context 查键；每轮工具执行完、每个问题结束后再更新 context（L174） | `code.py` 174、196–197、204、214 |
| 两问之间从外部改文件，下一问的第一次请求仍沿用上次留下的 context；作业回放中这一问没有刷新它的工具轮，第三问才看到新内容（L174） | 离线回放 |
| 从工具表去掉一个工具：重拼了，提示词文本没变（L171） | 离线回放 |
| 两个 context 来回给：只有相邻两次相同时才命中，缓存只记最近一份（L172） | 离线回放 |
| 键的顺序不同、内容相同：命中，靠 `sort_keys=True`（L173） | `code.py` 81 |
| 提示词里加了什么、删了什么，模型的回答跟着变：问 4 变英文，问 6 变中文。示范跑没有复现语言变化，所以不当规律记（L107–110） | 两次实跑对比 |

作业还列了课程 README 和代码对不上的两处（L153、L156）：README 说 tools 段看 `enabled_tools`，代码里是写死的字符串（44–45 行）；README 说 memory 段看文件是否存在，代码要求存在而且非空（159–162 行）。

### 2.2 s10 之前：提示词一章一章怎么变

这一小节的行号来自 s01–s09 各章的 `HOMEWORK.zh.md`，`code.py` 的行号按主仓库 `448c75b`。

| 章 | 提示词怎么变 | 作业的位置 |
|---|---|---|
| s01 | 写死的一段 `SYSTEM`（`code.py:62` 起）。作业记了两条：没写模型名，模型自述的训练方是它自己说的；写着 “Act, don't explain”，在把模型往调工具那边推（L28、L40） | `s01_agent_loop` |
| s03 | 多了三句（`code.py:68`）：不要自己问用户；破坏性操作照常发起调用；批不批由 harness 决定（L54）。README 说「唯一的变动是插入权限检查」，作业指出说少了（L118） | `s03_permission` |
| s04 | 回到 s02 的版本（`code.py:56`），拦不拦交给 hook（L77） | `s04_hooks` |
| s05 | 换了一句（`code.py:58`）：多步任务前先用 `todo_write` 列步骤。是换不是加，把 “Act, don't explain.” 换掉了（L72、L134） | `s05_todo_write` |
| s06 | 子 agent 用另一套 `SUB_SYSTEM`（`code.py:58`），从只有父 agent 那句话的消息列表开始（`:278`），工具里没有 `task`（`:262`）（L64） | `s06_subagent` |
| s07 | 启动时扫描技能目录，只把名称和描述拼进 system（`code.py:131`、`139`）（L43） | `s07_skill_loading` |
| s08 | 多了两句（`code.py:78`）：压缩之后只听当前请求，把摘要当参考数据（L83、L132） | `s08_context_compact` |
| s09 | 由四段组成：基础提示、记忆说明、整份索引、召回的正文（L217） | `s09_memory` |

prompt cache 的内容只在 s10 那两份里。s01–s09 的作业里出现 “cache” 的地方，说的都是 pytest 的缓存目录。

讲得最细的是 s07 和 s09。

**s07 技能**（`s07_skill_loading/HOMEWORK.zh.md`）：

- 进 system 的只有目录。离线回放量过：目录 1089 到 1140 个字符，全文合计 16721 到 16888 个字符（L133–139）。
- `load_skill` 返回整份 `SKILL.md`。同一个技能加载两次不去重，全文一直在上下文里（L143、L148）。
- 启动后新增技能：重新扫描后目录里有了，但 system 是启动时拼好的一段字符串，里面还是旧目录（L150）。
- 技能描述直接拼进 system，不经过任何检查（L172）。

**s09 记忆**（`s09_memory/HOMEWORK.zh.md`）：

- **选**：提问开始时尝试选择相关记忆。有候选记忆且有查询文字才额外调用模型；该请求不带 system，最多输出 200 token。选择器收到名称和描述，最多挑 5 条（`code.py:286–313`，L51、L213）。
- 判断「相关」时用的当前请求，是最近 3 条有文字的用户消息（`code.py:259`，L58）。
- system 里始终有整份索引，并写明记忆只是背景、冲突时以当前请求为准（`code.py:345–348`，L59）。
- 召回的正文合计最多 2 万字符（`code.py:72`，L60）。
- 实跑中 system 的长度：没有记忆 371 个字符，召回 1 条 830，召回 2 条 1074，召回 5 条 2513（L217–224）。
- 选记忆漏掉了最相关的那条，模型照样答对（L119）。

这些行号我对着主仓库 `448c75b` 核了 29 处，全部成立。

## 三、作业里讲 prompt cache 的部分

出处都在 `CACHE-HIT.zh.md`。

### 3.1 两种 cache hit（L17–25）

| | s10 的 `[cache hit]` | 服务端的 prompt cache 命中 |
|---|---|---|
| 缓存放在哪 | Python 进程里，两个全局变量（`code.py` 67–68） | 模型服务端 |
| 缓存的是什么 | 拼好的提示词字符串 | 前缀的计算结果 |
| 谁判断命中 | 本地代码比对这次和上次 context 的 JSON（81–82） | 服务端按已保存的相同前缀、有效期、隔离范围等条件匹配；远端读到多少看返回的 usage |
| 命中省了什么 | 一次字符串拼接 | 这部分 token 不用重新计算 |
| 命中后还发不发 | 照发（176–178） | 照发 |
| 怎么看到 | 屏幕上打印一行（83） | 响应里的 `usage.cache_read_input_tokens` |

### 3.2 Claude Code 源码里的三层（L33–45）

1. **进程内备忘录**，和 s10 同类：按段缓存，`/clear`、`/compact`、进出 worktree、恢复会话时清掉。
2. **请求中的断点**：客户端依据请求分支切分 system；开启提示缓存时给符合条件的块加 `cache_control`。消息侧通常另选一个位置，见 4.3。
3. **事后核对**：分别统计缓存读取与写入；在受跟踪的连续请求上，读量跌幅和绝对掉量同时达到条件才进入断裂诊断。

### 3.3 放回 s10 看（L49–52）

- `code.py:176–178` 传入 `model`、`system`、`messages`、`tools` 和 `max_tokens`，示例未显式请求缓存。作业记录的是本地打印，没有该端点的缓存读写用量。
- 作业按自己的工作目录量得初始提示词约 135 个字符、工具定义的紧凑 JSON 约 524 个字符，按每 4 个字符约 1 token 粗估这两项合计 165 token。实际缓存前缀还取决于断点位置、此前消息、服务端编码与所用模型的门槛。
- 把 memory 放在 system 末尾时，内容变化会改动从这里往后的输入。若在它之前恰好有可命中的已写入前缀，就可能复用那一段；工具定义排在前面本身不保证工具段已单独写入。

### 3.4 命中率由什么决定（L54–84）

- **服务端条件**（作业 L58–65）：作业引用的 Anthropic API 资料列出断点、模型门槛、有效期、缓存隔离和查找窗口等条件。第六节保留了两份历史参考资料的版本差异；它们不能直接说明这次 Mac 作业所用端点的行为。
- **harness 改变输入序列**（作业 L73–80）：定位最早变化的工具定义、system 块或历史消息，再判断此前有哪些已写入的前缀还相同。子 agent 是否能复用父请求的部分前缀，也取决于实际请求、断点与隔离条件。
- **一句话**（L7）：命中率同时取决于服务端规则、前缀是否逐字节稳定、请求间隔。

### 3.5 成本算例（L95–104）

作业的假设是 20 次请求，首次输入 2 万 token，以后每次比前一次多 2 千；每次整段输入都纳入可写前缀。读价按全价的 0.1 倍，写价按 1.25 倍。这里只算输入成本。

| 情况 | 折成全价的输入 token |
|---|---|
| 不缓存 | 78 万 |
| 前缀稳定 | 约 14.5 万，是不缓存的 0.19 倍 |
| 打了标记但每轮都打断 | 约 97.5 万，比不打还贵 |

复算：累计输入 `20×20,000 + 2,000×(0+…+19) = 780,000`。前缀稳定时首次及历次新增共写入 `58,000`，其余 `722,000` 全部读命中，折价为 `58,000×1.25 + 722,000×0.1 = 144,700`。每次都整段重写才是 `780,000×1.25 = 975,000`。这些数来自教学假设，作业没有测量真实账单。

### 3.6 准则与验证（L120–121）

验证连续两次请求时，同时记下 `usage.cache_creation_input_tokens` 与 `usage.cache_read_input_tokens`，再对照断点前的输入、模型、缓存隔离范围和间隔。第二次读量为零，先查第一次是否写入、前缀是否够长及是否过期，再查输入是否变化。

## 四、和 Claude Code 源码的区别

### 4.1 两种请求长什么样

```text
教学代码 s10（code.py 176–178）         Claude Code 快照（默认主循环，请求启用提示缓存时）
system: 一个字符串                       system: 文本块数组
  identity                               归因头                不打标记
  tools（工具名提示）                    CLI 前缀              取决于分支，见 4.3
  workspace                              静态候选段            符合 global 分支时在合并块末设断点
  Relevant memories: …（有内容才有）      动态段（memory 等）    同一分支内无独立断点
tools: TOOLS（名称、说明、参数规格）     tools: 当前请求的工具定义，主调用未显式给规格传断点
messages: 对话历史与工具结果             messages: 通常在最后一条的末块选点，有例外
```

“打标记”指实际写入 `cache_control`。快照用 `global`、`org`、`null` 表示内部选择。`org` 块发出的 `cache_control` 是 `{type: 'ephemeral'}`，符合条件时另带 `ttl`；只有 `global` 分支显式发送 `scope: 'global'`（`services/api/claude.ts:358–373`）。

### 4.2 逐项对比

| 维度 | 教学代码 s10 | Claude Code 快照 | 快照里的位置 |
|---|---|---|---|
| 提示词形状 | 一个字符串，`\n\n` 拼接 | 字符串数组，请求时切成几块文本 | `services/api/claude.ts:1358–1368`、`utils/api.ts:321` |
| 由哪些段组成 | 三段恒在，memory 段看内容；tools、workspace 是写死的字符串 | 默认长提示有七个静态候选段（含条件项）和按名计算的动态段；仅符合 global 分支条件时插入边界 | `constants/prompts.ts:491–555`、`560–576` |
| 记忆放哪 | `.memory/MEMORY.md` 非空时全文进 system 最后一段 | 常规主 agent 的记忆使用指引可进 system；项目指令、符合条件的索引从 userContext 进入 messages；按需选出的记忆可作 user 附件 | `context.ts:155–186`、`utils/api.ts:449–473`、`utils/messages.ts:3700–3727` |
| 什么时候重算 | 启动建 context，提问开头用已有 context 查键；每轮工具后再读状态、查键，问题结束再更新 context | `QueryEngine.submitMessage()` 取提示各部分，命中按名缓存的段可复用；默认长提示里的 `mcp_instructions` 是显式重算项 | `code.py:156–174,196–197,204,213–214`；`QueryEngine.ts:292`、`constants/systemPromptSections.ts:43–54`、`constants/prompts.ts:513–520` |
| 缓存键 | 整份 context 的 JSON，只记最近一份 | 按段名各存一项；两个上下文函数各自记忆化 | `bootstrap/state.ts:1641`、`context.ts:116` |
| 缓存为了什么 | 省一次重复拼接 | 客户端段缓存减少重复计算，有助于保持输入稳定；是否实际命中远端前缀仍看返回用量 | `constants/systemPromptSections.ts:17–32` |
| `cache_control` 写在哪 | `messages.create` 未显式传断点 | system 和 messages 按分支选点；工具转换器支持 `cacheControl`，而主调用实参未传它。`:1388` 的注释不足以证明工具带标记 | `utils/api.ts:228–230`；`services/api/claude.ts:1235–1245,3089–3105,3213–3234` |
| 动态内容变了的后果 | context 键变化会重拼，拼出的字符串是否变化取决于实际用到的字段 | 在带静态 global 断点的分支，动态段变化后静态前缀仍相同；后续断点能否读命中取决于有没有一份匹配新前缀的缓存 | `utils/api.ts:362–404` |
| 事后核对 | 这次作业没有记录服务端读写用量 | 分别核算读写费用；断裂检测有前置条件和掉量门槛 | `utils/modelCost.ts:131`、`services/api/promptCacheBreakDetection.ts:437–491` |

### 4.3 几处值得单独说

**问 2 写完文件后，提示词和消息要分别看。** 教学版 `update_context()` 重读 `.memory/MEMORY.md`，下一次 `get_system_prompt()` 随即能拼入新正文。快照的常规主 agent 从 `getUserContext()` 取得项目指令与日期，`prependUserContext()` 把它们作为带 `<system-reminder>` 的 user 消息前置（`context.ts:155–186`、`utils/api.ts:449–473`）。system 中的常规 `memory` 段由 `loadMemoryPrompt()` 生成记忆使用指引；另有受开关控制的模式和单独的 agent memory 路径（`memdir/memdir.ts:419–489`、`tools/AgentTool/agentMemory.ts:169`）。

**同一改动在两份程序中的可见时机不同。** 教学版在每轮工具后更新 context。快照的 `QueryEngine.submitMessage()` 取提示各部分（`QueryEngine.ts:292`），默认长提示把 `memory` 登记为按名缓存的段（`constants/prompts.ts:495`）。仅写文件不会自行改写这份段缓存；仍可通过工具结果、用户上下文或条件满足的记忆附件把数据带到后续请求。要判断这八个问题在真实会话中会看到什么，还需那次会话的输入与配置。已找到的清段缓存位置有：

- `/clear`：`clearSessionCaches()` 里调了 `runPostCompactCleanup()`，注释写明它清系统提示词段（`commands/clear/caches.ts:47`、`70–74`）。
- `/compact` 收尾：`services/compact/postCompactCleanup.ts:62`。
- 进入、退出 worktree：`tools/EnterWorktreeTool/EnterWorktreeTool.ts:99`、`tools/ExitWorktreeTool/ExitWorktreeTool.ts:143`。
- 恢复带 worktree 的会话及从中退出：`utils/sessionRestore.ts:364`、`388`。

**切块其实有三种情况，作业写了两种。** `splitSysPromptPrefix`（`utils/api.ts:321`）的注释列了三种：

| 情况 | 结果 |
|---|---|
| global 可用，且筛选后仍有本轮实际暴露的 MCP 工具（未 defer） | 略过边界，归因头无标记，非空的 CLI 前缀和其余正文各设普通 ephemeral 断点（内部记为 `org`） |
| global 可用、找到边界且未触发上述 MCP 分支 | 归因头和 CLI 前缀无标记；非空静态合并块显式标 `scope: 'global'`，动态合并块无独立断点 |
| 未启用 global 或缺边界 | 归因头无标记；非空 CLI 前缀和其余合并正文各可设普通断点 |

global 路径要求 first-party provider 且未禁用实验 beta（`utils/betas.ts:227–231`）。实际暴露的 MCP 工具触发回退（`services/api/claude.ts:1207–1229,1374–1379`）。表中各断点还取决于 `enablePromptCaching`；关闭时 `buildSystemPromptBlocks` 仍构造文本块，但不会由这里加标记（`:3213–3234`）。

**消息层通常选一个候选点。** `addCacheBreakpoints()` 默认选最后一条消息；`skipCacheWrite` 为真时改选倒数第二条，例如一次性 fork 想复用前缀时。用户消息可标末块，assistant 末块若为 `thinking`、`redacted_thinking` 或受相应开关排除的 connector 文本就跳过，不回头补标（`services/api/claude.ts:594–617,639–665,3089–3105`）。此处有效期也单独判定（`:358–373,393–432`）。

**断裂检测的门槛。** 对可跟踪且有前次基线的请求，`checkResponseForCacheBreak()` 比较两次 `cache_read_input_tokens`。排除的模型及预期的缓存删除等情况先跳过；其余请求要同时满足相对跌幅超过 5%、绝对减少至少 2,000 token，才进入后续归因（`services/api/promptCacheBreakDetection.ts:120,445–491`）。达到门槛说明读量下降，具体原因还要核对变更。

**快照里还有、作业和旧笔记都没提的一处。** 请求里有些 beta 头一旦发过就整个会话一直发，注释给的理由是中途切换会改掉服务端的缓存键，一换就是五六万 token（`claude.ts:1405–1410`）。

### 4.4 作业引用的源码行号，在本地快照里逐条对过

作业引的是另一个仓库 `haichengmai20-hub/claudecode_sourcecode1`（提交 `2dc86d8`）。我在你这份快照 `6f6f12b3` 里核了它引用的 24 处，全部对得上，涉及的 9 个文件都不是 stub。

| 文件 | 对上的行 |
|---|---|
| `constants/prompts.ts` | 114、560、573 |
| `constants/systemPromptSections.ts` | 20、29、32、50 |
| `bootstrap/state.ts` | 1641 |
| `context.ts` | 116、155 |
| `utils/betas.ts` | 227 |
| `utils/api.ts` | 321、362、411 |
| `services/api/claude.ts` | 358、3063、3089、3213、3228 |
| `utils/modelCost.ts` | 131 |
| `services/api/promptCacheBreakDetection.ts` | 120、437、455–456、485–490 |

s10 作业里教学代码的行号，我对着网站版 `20e7cbb` 的 `code.py` 核过，全部成立。其余各章见 2.2。

### 4.5 技能和记忆，Claude Code 放在哪

s07 和 s09 把技能目录、记忆索引和召回正文都放进了 system。Claude Code 快照里，这两类内容走的都是消息这一侧：

| | 教学代码（主仓库 `448c75b`） | Claude Code 快照 | 快照里的位置 |
|---|---|---|---|
| 技能目录和正文 | s07：技能名称与描述拼进 system，启动时拼一次 | 启用 Skill 工具后，目录可以 `skill_listing` 附件进入 user 消息；发现阶段已可读盘解析，内联调用后另把展开的正文送进消息，fork 型交给子会话 | `utils/attachments.ts:2661,2741`、`utils/messages.ts:3728`、`skills/loadSkillsDir.ts:435,447`、`utils/processUserInput/processSlashCommand.tsx:869,902–908`、`tools/SkillTool/SkillTool.ts:622` |
| 记忆索引 | s09：索引放在 system | 自动记忆开启且文件存在时，索引进入收集列表；跳过索引的开关可移除 AutoMem/TeamMem，再组装 userContext。之后出现的相关记忆是另一次选择的内容 | `utils/claudemd.ts:979–992,1142–1150`、`context.ts:170–186` |
| 选相关记忆 | s09：每次提问尝试选条目，将召回正文放进 system | `startRelevantMemoryPrefetch()` 尝试异步预取。经去重与文件读取最多返回 5 条；循环仅在预取已就绪且尚未消费时加入结果，`relevant_memories` 随 user 消息进入后续请求 | `query.ts:301,1599–1613`、`utils/attachments.ts:2196–2241`、`utils/messages.ts:3708–3727` |

就输入顺序看，s07 的技能目录在一次启动后保持稳定。s09 若召回的文字变化，从该处直到后续消息末尾的前缀就与此前不同；前面相同的工具定义能否复用，仍取决于先前写入的前缀和本次匹配位置。快照里，常规主 agent 的技能目录及相关记忆可经消息传递，system 还可含使用这些能力的指引。

## 五、旧研究笔记里关于这部分的记录

### 5.1 主笔记：`notes/cc-prompt-assembly.md`（608 行）

这份是专门讲提示词组装的，章节如下：

| 行 | 内容 |
|---|---|
| L14–59 | 一次请求长什么样：system 四块、`messages[0]`、tools；每个字段由哪个函数拼出来 |
| L61–80 | 术语速查 |
| L84–116 | 三路来源（默认提示词、用户上下文、系统上下文）与四阶段时序 |
| L120–193 | §一 默认提示词：归因头与 CLI 前缀、静态 7 段、边界标记、动态段 13 项及是否记忆化、「两层缓存别混为一谈」、边界为什么卡在这 |
| L197–230 | §二 系统上下文：会话开始时的 git 快照 |
| L234–291 | §三 用户上下文进 `messages[0]`；CLAUDE.md 加载链；自动记忆的两条注入路径 |
| L295–340 | §四 `cache_control` 的位置；旧笔记用 global、org、无标记概括内部选择。对外字段以本文 4.1 的序列化逻辑为准 |
| L344–370 | §五 系统提示词来源的优先级 |
| L374–413 | §六 子 agent 的提示词和主 agent 差在哪 |
| L417–445 | §七 用真实会话轨迹验证 |
| L449–474 | §八 特殊模式 |
| L478–488 | §九 组装时序与记忆化边界 |
| L492–524 | §十 完整调用链 |
| L532–580 | §十一 Output Styles |
| L584–608 | §十二 自己核对的办法，以及对流传说法的勘误表 |

和本题最有关的三段：

- **两层缓存（L186–189）。** 段的记忆化是一回事，请求里的 `cache_control` 范围是另一回事。边界之后的动态段在主路径里合成一块，不打标记。
- **用户上下文与前缀（L290–291）。** 旧笔记把两者分开放的理由解释为保护可复用的静态前缀。源码能直接核对的是字段位置、分段及编码；跨请求或跨用户是否复用不能由这一解释推出。
- **勘误表（L590–600）。** 例：没有 session 这一档缓存范围；`currentDate` 不在 system 里，在 `messages[0]`。

### 5.2 其他笔记里的相关记录

| 主题 | 记了什么 | 出处 |
|---|---|---|
| 记忆与缓存 | CLAUDE.md 进 `messages[0]`，不进 system；system 里画了缓存锚点和边界的示意 | `cc-memory-system-6-layers.md` L35、L180–183 |
| 工具定义 | 工具定义是每条请求都带的前缀；出网字段有白名单，`cache_control` 在名单里；某状态机的决定一旦做出就冻结，每轮逐字节重放 | `cc-tool-system.md` L118、L127、L378、L391 |
| 成本意识 | 把缓存当一等成本资源；`promptCacheBreakDetection.ts` 专门检测什么改动打破前缀 | `cc-production-engineering-lens.md` L26、L136 |
| fork 子 agent | 旧笔记列出对齐父请求输入的条件；能否复用取决于前缀与缓存隔离范围，折扣只作用于实际命中的 token | `cc-sub-agent-orchestration.md` L175–189、L490、L648–650 |
| 出错重试 | 旧笔记将回退与前缀复用联系起来。本快照会重新生成参数并调整非流式请求；应分别核对可缓存前缀及 usage，整包相同并非必要条件 | `cc-error-handling-comparison.md` L183；`services/api/claude.ts:853–864,3364` |
| 压缩 | 压缩走 fork 是为了复用主对话的缓存；按时间清旧工具结果选在 60 分钟，是算着 1 小时有效期已过 | `cc-context-management.md` L175、L222 |
| 有效期 | 默认约 5 分钟，隔太久就是冷的；`/clear` 会发一条缓存回收提示 | `cc-agent-loop-architecture.md` L171、L186 |
| 设计建议 | 按变化频率给 system prompt 分段，不变的放前面 | `agent-harness-blueprint.md` L473–502 |

另外 `README.md` L38 是这份笔记的索引行；作品集里 `agent-harness-lab/deep_dives/04_source_study_to_platform_design.md` L20、L22 引用了它。

### 5.3 三份材料互相补了什么

- **作业标了「没有核实」的一条，旧笔记早有记录，我这次也核了。** 作业 L138 说没核对「CLAUDE.md 是不是前置成用户消息」。旧笔记 §三 记了，快照里也成立（`utils/api.ts:449`、`context.ts:155`）。
- **作业有、旧笔记没有的。** 消息层如何选择候选断点；断裂检测的 5% 和 2,000 token 门槛；读写分开计价；成本算例中的前缀与价率假设。旧笔记里 `cc-production-engineering-lens.md` L26、L136 和 `cc-tool-system.md` L127 提过断裂检测。
- **旧笔记有、作业没有的。** system 前面的归因头和 CLI 前缀两块；用户上下文走 `messages[0]`；为保缓存做的其他设计，见 5.2。
- **两处要留意，都在旧笔记 §九 的那张表里。**
  - `loadMemoryPrompt()` 的「变化触发」写成「MEMORY.md 文件变化」，容易读成文件一变就重算。按快照它是记忆化的段，重算的前提是段缓存被清，见 4.3。
  - `defaultSystemPrompt` 的计算时机写成「会话启动（submitMessage 前）」。按快照，`fetchSystemPromptParts` 是在 `submitMessage()` 内部调的（`QueryEngine.ts:209`、`292`），每发一条消息调一次；它稳定，是靠各段记忆化得到的。

## 六、作业里的 API 规则，和参考资料对了一遍

本节保留历史资料的版本对照：Mac 作业引用客户端 2.1.331 附带的 `claude-api/shared/prompt-caching.md`，原整理记录另查了本机 2.1.316 的同名参考。表中“一致”仅指两份记录所述口径相符（作业 `CACHE-HIT.zh.md` L135 说明未实测这些规则）。本次未据此确定当前服务端价率或该次调用的缓存行为。

| 作业的说法 | 参考资料 | 结论 |
|---|---|---|
| 一次请求最多 4 个断点 | L127 | 一致 |
| 最短前缀 512 到 4096 个 token，看模型，太短静默不缓存 | L131–138 | 一致 |
| 默认 5 分钟，可选 1 小时；读命中会续期；从请求开始时算 | L148 | 一致 |
| 按 workspace 或组织隔离 | L130 | 一致 |
| 断点往回找 20 个位置 | L246 | 一致 |
| 第一条请求开始返回之后缓存才可读 | L254 | 一致 |
| 写入贵四分之一；1 小时是两倍 | L144 | 一致 |
| 读命中多数模型不计入输入 token 限额 | L158 | 一致 |
| 读命中一成；Opus 5.5 和 Sonnet 5.5 是半成；Fable 更低 | L144、L156：Opus 5.5 是 0.05 倍，其余 0.1 倍，Fable 5.1 是 0.025 倍 | **不一致**：Sonnet 5.5 是一成 |

参考资料里没有「Fable 5.2」，只有 Fable 5.1 和 Fable 5。作业读的是 2.1.331 那一份，可能版本不同，这一点留给作业原文。

## 七、我没核实的

- Mac 八问发生在 s10 教学程序里。没有一场以同样输入运行 Claude Code 快照的逐轮请求记录；外部修改文件后哪一次产品请求真正读到了它，只能结合相关配置和运行证据判断。
- §4.5 已核对常规索引的过滤条件和相关记忆附件的消费路径。某次预取实际选了哪些条目、是否赶在下一次请求前就绪，需要当次会话证据。
- 断裂检测报出来之后的归因方式。
- §4.5 已核对技能的目录、内联和 fork 路径；没有该样本的运行记录来判断它实际走的是哪条路径。
- `utils/claudemd.ts:1136–1139` 的注释笼统称索引注入 system prompt；常规主 agent 的字段以 `context.ts:170–186` 和 `utils/api.ts:449–473` 为准。AgentTool 另有读取 agent 专属索引的路径（`tools/AgentTool/agentMemory.ts:169`、`memdir/memdir.ts:272–306`），不能据此反推主会话。
- 旧笔记里我没有逐条复核的行号：`system.ts:30`、`:73`，`prompts.ts:175`，`utils/api.ts:243–258`。
- GLM、DeepSeek 这些端点有没有同样的缓存规则。

## 八、自测

先自己答，再对照第四、五节。

1. 教学代码里，往 `MEMORY.md` 追加一行之后为什么重拼？提示词的哪一处变了？
2. 同一件事放进 Claude Code，system 里的 `memory` 段会不会变？什么时候才变？
3. 有边界时，动态段变化会丢掉哪几段的缓存，保住哪一段？
4. 旧笔记说「只有 global、org、不打三种取值」。动态段在主路径里是哪一种？

<details>
<summary>参考答案</summary>

1. 工具执行后 `update_context()` 重读索引。新增一行使 context 的 JSON 串改变，下一次 `get_system_prompt()` 重拼；段落数依然是四段，只是 memory 段文字变了（`code.py:81–86,196–197`）。
2. 常规主 agent 已缓存的 `memory` 指引不会因写索引立即重算；清理段缓存后才会重新求值。文件内容是否已通过工具结果或新附件进入后续消息，需要另查该轮数据。
3. 在静态 global 断点有效的分支，变化前面的静态前缀仍具备复用条件。动态块和后面的历史会构成不同的较长前缀；实际命中了多长的一段，用本次 `usage` 验证。
4. 动态块无独立 `cache_control`；若消息侧另设断点，动态块也在该断点所覆盖的前缀中。

</details>
