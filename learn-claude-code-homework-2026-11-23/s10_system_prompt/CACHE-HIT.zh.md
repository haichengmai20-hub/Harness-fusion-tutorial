# 缓存命中率：一个困惑和查到的答案

- **提出时间**：2026-11-24，做网站版 s10 System Prompt 的作业时。
- **困惑的原话**：
  1. 「这里的 cache hit 和 claudecode 源码的 cache hit 有什么区别」
  2. 「我们各种 agent 或者 harness 里面的缓存命中率是不是和模型以及本身 harness 都相关，具体会怎么影响」
- **一句话结论**：s10 屏幕上的 `[cache hit]` 是进程里的备忘录，省的是一次字符串拼接。真正影响钱和等待时间的是服务端的 prompt cache。命中率同时取决于三件事：服务端的规则（模型和平台决定）、前缀是否逐字节稳定（harness 决定）、请求的间隔（使用方式决定）。服务端不支持缓存、前缀在断点之前变过、或者缓存已经过期，那个断点就命中不了。

几个词先说清楚，都指 Anthropic 官方 API 的 prompt cache：

- **断点**：请求里放的 `cache_control` 标记。服务端缓存“从请求开头到这个标记”的全部内容。
- **前缀**：从请求开头到断点的那一段。服务端渲染的顺序是 tools、system、messages。
- **命中**：这次请求的前缀和上次逐字节相同，而且缓存没过期。命中的那部分 token 不用重新计算。

## 一、两种 cache hit

| | s10 的 `[cache hit]` | 服务端的 prompt cache 命中 |
|---|---|---|
| 缓存放在哪 | Python 进程里，两个全局变量（`code.py` 67–68 行） | 模型服务端 |
| 缓存的是什么 | 拼好的提示词字符串 | 前缀的计算结果 |
| 谁判断命中 | 本地代码：两次 context 转成 JSON 后相等（81–82 行） | 服务端：前缀逐字节相同，且没过期 |
| 命中省了什么 | 一次字符串拼接 | 这部分 token 不用重新计算，更便宜，首字更快 |
| 命中后还发不发 | 照发，每次都把整份提示词传过去（176–178 行） | 照发，每次都把整份请求传过去 |
| 怎么看到 | 屏幕上打印一行（83 行） | 响应里的 `usage.cache_read_input_tokens` |
| 什么时候失效 | 不失效，但只记最近一份 | 默认 5 分钟没人用就过期；前缀从变动的位置往后全部失效 |

网站版 s10 的 README 自己也说了这一点（`README.md` 121 行），代码的注释里也写了（`code.py` 76–78 行）。

### Claude Code 源码里的三层

出处是 `haichengmai20-hub/claudecode_sourcecode1`，路径都在它的 `src/` 下。

1. **进程内备忘录，和 s10 同类。**
   - `constants/systemPromptSections.ts:20` 的 `systemPromptSection` 定义的段算一次，存进 `bootstrap/state.ts:1641` 返回的那个 Map。`/clear`、`/compact`、进入或退出 worktree、恢复会话时清掉。
   - 用 `DANGEROUS_uncachedSystemPromptSection` 定义的段例外，每轮重算（`:32`，判断在 `:50`）。注释里写的原因是它一变就会破坏 prompt cache（`:29`）。
   - `context.ts:116` 和 `:155` 的两个函数套了 lodash 的 `memoize`。
   - 和 s10 的差别有两点：它按段缓存，s10 是整份提示词一个 key；从注释看，它的目的不只是省重算，还要让每轮发出去的字节保持不变，服务端才认得。
2. **排版，让服务端能命中。s10 没有这一层。**
   - `constants/prompts.ts:560` 起把提示词排成“静态段、边界标记、动态段”，标记定义在 `:114`。边界标记只在启用全局缓存范围时才插入（`:573`）。按 `utils/betas.ts:227` 的判断，这只在 API 提供方类型是 `firstParty` 时成立，Bedrock、Vertex 不算。
   - `utils/api.ts:321` 的 `splitSysPromptPrefix` 按标记切块，给每块一个缓存范围。有边界时（`:362` 起）静态块的范围是 `global`，动态块没有范围。没有边界时（`:411` 起）静态和动态合成一块，范围是 `org`。
   - `services/api/claude.ts:3213` 给有范围的块打上 `cache_control`，没有范围的不打（`:3228`）。所以有边界时动态块不打标记；没有边界时静态和动态在同一个块里，一起打。
   - `:3063` 的 `addCacheBreakpoints` 每次请求只在一条消息上打标记，默认是最后一条（`:3089`）。标记由 `:358` 的 `getCacheControl` 生成，符合条件时带 1 小时的有效期。
3. **事后核对。s10 也没有这一层。**
   - `utils/modelCost.ts:131` 把读命中和写入的 token 分开计价。
   - `services/api/promptCacheBreakDetection.ts:437` 起的 `checkResponseForCacheBreak`：`:455`–`:456` 记下这一次读命中的 token 数，和上一次比。掉了 5% 以上、并且绝对掉量不少于 2000 个 token，才报一条缓存断裂（`:120`、`:485`–`:490`）。haiku 模型和第一次调用跳过。归因按模型、系统提示词、工具这些类别来分，不是精确到某一块。

### 放回 s10 看

- **服务端缓存 s10 一点没用上。** 请求里只有 model、system、messages、tools、max_tokens（176–178 行），没有 `cache_control`。
- **就算加了也命中不了。** 系统提示词本身是 111 个字符加工作目录的长度，在作业目录 `~/lcc-hw/s10` 里是 135 个字符。工具定义序列化后另有 524 个字符。合计按 4 个字符折 1 个 token，约 165 个 token。这是估的，没有用分词器量。最短的可缓存前缀是 512 到 4096 个 token。
- **memory 段放在最后，方向和 Claude Code 一样。** 稳定的在前，会变的在后。
- **但 memory 一变，从它所在的位置起都会失效，对话历史的缓存也跟着丢。** 按参考资料的分层说法，排在它前面的 tools 的缓存保得住。Claude Code 有边界时只给静态块打标记，所以静态块的缓存不受动态内容影响；但动态块排在对话历史前面，它一变，对话历史的缓存照样会丢。

## 二、命中率由什么决定

### 模型和服务端决定的

| 因素 | 规则（Anthropic 官方 API） | 对命中率的影响 |
|---|---|---|
| 要不要打标记 | 请求里必须有 `cache_control`：在内容块上放断点，或者用顶层的自动缓存。一次请求最多 4 个断点 | 完全没有标记就没有缓存 |
| 最短可缓存前缀 | 512 到 4096 个 token，看模型 | 前缀太短时不报错，静默不缓存 |
| 有效期 | 默认 5 分钟，可选 1 小时；每次命中会续期 | 隔太久就冷 |
| 隔离 | 缓存按模型隔离，也按 workspace 或组织隔离 | 换模型、换 workspace 都不共享 |
| 回看窗口 | 断点只往回找 20 个位置 | 一轮加的内容太多，会找不到上次的缓存 |
| 并发 | 第一条请求开始返回之后，缓存才可读 | 同时发出的相同请求都付全价 |

课程的代码在这些规则下命中率是 0：没有标记，前缀也只有一百多个 token。

### Harness 决定的

服务端只认一条：前缀逐字节和上次一样。harness 的每个动作都能按“有没有改掉前缀”来判断。

| Harness 的做法 | 后果 | 课程里的例子 |
|---|---|---|
| 系统提示词里放每轮都变的内容 | system 和 messages 的缓存丢，tools 的保住 | s09 每个问题重选记忆、重拼提示词（主仓库 `code.py` 727–728 行）；s10 的 memory 段一变 |
| 改写历史 | 对话历史的缓存从改动的位置起丢，tools 和 system 的保住 | s08 的压缩：主仓库 `code.py` 552 行每轮调用 `prepare`（定义在 518 行）。519、521 行两步每轮都执行，条件满足时改写旧消息；超限后（534 行判断）依次尝试 536、538、541 行，前一步没降下来才走下一步 |
| 中途增减工具 | 最前面就变了，全部丢 | 连上 MCP 后工具列表变了（主仓库 s14 `code.py` 491 行，每轮重算工具池） |
| 换模型 | 等于冷启动 | 网站版 s11 错误恢复里的“切换模型”（网站版 s10 `README.md` 198 行） |
| 只在末尾追加 | 前面的缓存都保得住 | s05 的提醒是跟在工具结果后面加一块（主仓库 `code.py` 342–346 行） |
| 子 agent 另起一份提示词和消息 | 和父 agent 不共享前缀 | s06（主仓库 `code.py` 276–283 行） |

序列化不确定也会让字节悄悄变掉，表面看不出来。s10 的 `sort_keys=True`（81 行）保护的是它自己的本地 key，和发出去的字节无关。同一类不确定性如果出现在发出去的 system 或 tools 里，才会破坏服务端缓存。

Claude Code 有边界时的做法是让静态块和动态块分开打标记，动态内容的变化不会连累静态块。它挡不住对话历史那一段的失效。

## 三、具体影响

### 成本

下面是算出来的例子，不是实测。前提有两条：

- 读命中按一成的价目。多数模型如此；Claude Opus 5.5 和 Sonnet 5.5 是半成，Fable 5.2、5.1 和对应的 Mythos 更低。
- 用 5 分钟的有效期，写入贵四分之一。用 1 小时的有效期，写入是两倍。

设定是 20 轮对话，固定前缀 2 万 token，每轮新增 2 千。

| 情况 | 按全价折算的输入 token |
|---|---|
| 不缓存 | 78 万 |
| 前缀稳定 | 约 14.5 万 |
| 打了标记但每轮都打断 | 约 97.5 万 |

- **前缀稳定时的成本约为不缓存的 0.19 倍。** 14.47 万除以 78 万约等于 0.19。
- **第三行是反直觉的地方。** 打了断点却每轮都改前缀，比不打还贵。因为每次都在付写入的加价，从没读到过。换成 1 小时的有效期，这一行是 156 万。

### 延迟

命中的部分不用重新算，首字更快。它和有效期互相牵制：有效期从请求发出时开始算，一轮生成越久，下一次请求发出时缓存剩的时间越少。

### 限流

官方 API 上，读命中的 token 在多数模型上不计入输入 token 的限额。

### 放到训练里看

训练里批量采样是同一个道理：一套系统提示词和工具定义被大量轨迹共享，前缀能不能复用直接影响采样成本。这一段是我的常识，没有核对过。

## 四、一条准则和验证办法

- **准则**：稳定的放前面，会变的放后面或放进消息；历史只追加不改写；一轮之内只让最后那一点变。
- **验证**：看响应里的 `usage`。连续两次前缀相同的请求，第二次的 `cache_read_input_tokens` 还是 0，就有东西在偷偷改前缀。

## 证据和出处

- **课程代码（网站版）**：`~/learn-claude-code-site`，提交 `20e7cbb`。`s10_system_prompt/code.py` 共 218 行。2026-11-24 我从网站的 `/zh/s10/` 页面里取出内嵌的源码，和这份文件逐字节比对过，相同。
- **课程代码（主仓库）**：`~/learn-claude-code`，提交 `448c75b`。s05、s06、s08、s09、s14 的行号都按这个提交的文件数，不是工作区的文件。工作区的文件带着调试补丁，行号会偏。
- **Claude Code 源码**：`https://github.com/haichengmai20-hub/claudecode_sourcecode1`，分支 `import-main`，提交 `2dc86d8`（2026-05-09）。它不是官方发布的代码。README 自述是基于 2026-03-31 泄露的源码修出来的可运行版本，仓库主人改过启动部分。
- **和课程的关系**：网站版 s10 的 README 里“深入 CC 源码”一节引用了六个文件，其中五个给了行数（914、68、189、718、123），和这个仓库完全一致。
- **本机 Claude Code 2.1.331**：我在它的可执行文件里按字符串数过，`__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` 出现 2 次，`ttl:"1h"` 2 次，`cache_control` 113 次，`cache_read_input_tokens` 175 次。函数名被压缩了，按名字搜不到。
- **API 规则**：Claude Code 自带的 `claude-api` 参考资料里的 `shared/prompt-caching.md`，2026-11-24 读取。

## 没有核实的

- GLM、DeepSeek 这些端点有没有同样的规则，数值是多少。
- 所有 API 规则都来自那份参考资料，一条都没有实测：断点上限、最短前缀、有效期、隔离、回看窗口、并发、价格、限流。
- token 数是按 4 个字符折 1 个 token 估的。
- Claude Code 的三层来自 2026-03 的快照，只读了上面列出的函数。本机的 2.1.331 只按字符串核了几个标识符，没有确认行为一样。
- 网站版 s10 的 README 对照表说，CLAUDE.md 这类用户上下文是前置成 `<system-reminder>` 用户消息的（`README.md` 238 行）。我没有在源码里核对这一点。
- “放到训练里看”那一段。

## 复算

成本的算例：

```python
P, D, N = 20_000, 2_000, 20
sizes = [P + D * t for t in range(N)]
total = sum(sizes)
writes = sizes[0] + (N - 1) * D
reads = total - writes
print(total, writes, reads)                      # 780000 58000 722000
print(round(writes * 1.25 + reads * 0.1))        # 144700
print(round(total * 1.25))                       # 975000
print(round(total * 2))                          # 1560000
print(round(144_700 / 780_000, 2))               # 0.19
```

提示词大小：三段分别是 43、45、19 个字符（`code.py` 43–45 行），中间两个 `\n\n` 共 4 个字符，所以是 111 加工作目录的长度。`/Users/s11437/lcc-hw/s10` 是 24 个字符，合计 135。工具定义的 524 是 `len(json.dumps(TOOLS, separators=(",", ":")))`，我用假客户端离线导入量的；默认分隔符下是 569。

主仓库的行号（读提交里的文件，不读工作区）：

```sh
git -C ~/learn-claude-code show HEAD:s09_memory/code.py | sed -n '726,728p'
git -C ~/learn-claude-code show HEAD:s05_todo_write/code.py | sed -n '342,346p'
git -C ~/learn-claude-code show HEAD:s08_context_compact/code.py | grep -n "COMPACTOR.prepare\|tool_result_budget\|snip_compact\|estimate_chars(messages) > self.CONTEXT_CHAR_LIMIT\|micro_compact\|fit_tool_results\|compact_history"
```

在本机的 Claude Code 里数字符串：

```sh
B=~/.local/share/claude/versions/2.1.331
grep -a -o '__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__' "$B" | wc -l
grep -a -o 'cache_control' "$B" | wc -l
```

Claude Code 源码的取法（只读）：

```sh
git clone --depth 1 --single-branch https://github.com/haichengmai20-hub/claudecode_sourcecode1.git
grep -n "splitSysPromptPrefix" src/utils/api.ts
```

## 修改记录

- 2026-11-24：新建。
- 2026-11-24：对抗性核验报 17 条，全部成立，已修订。主要几处：
  1. 去掉“从头失效”的说法，改成从变动的位置往后失效，tools 的缓存保住。
  2. Claude Code“动态块不打标记”限定为有边界标记时，并补上没有边界时静态和动态合在一块打标记。
  3. 价格补上模型差异和 1 小时有效期下写入是两倍。
  4. s09 的行号从 734–736 改成 727–728。原来数的是带调试补丁的工作区文件。
  5. s08 的行号指到真正的判断行。
  6. 断点的规则补上顶层的自动缓存。
  7. 缓存断裂检测补上 2000 个 token 的下限。
  8. 提示词大小的说法改成量出来的数，补上工具定义的大小。
  9. “没有核实的”补全。
