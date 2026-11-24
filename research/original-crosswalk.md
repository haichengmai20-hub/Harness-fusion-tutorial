# 原课逐章对照的核验记录

s10 的「源码研读」把当前原文定位点接到教学文件、工作区 Claude Code 快照及独立旧笔记。8 个问题、71 条本地引用另行核验，原有 48 个原课定位点仍按其统计范围计数。[源码研读样章](s10-source-study.md)

2026 年 11 月 21 日（台北时间），从中文上线站点打开 s01 至 s20。每页依次点选学习、模拟、源码、深入探索，读取当前面板的实际文字，再把原课的机制、例子和执行位置整理成 48 个可以定位的问题。三个框架的 144 条解释逐点标示可对应的行为，并附固定提交的源码位置。[原课中文目录](https://learn.shareai.run/zh/) · [逐点对照数据](../data/original-crosswalk.json)

## 怎么读一条对照

例如 s08 同章有四个问题。裁整段消息可能把工具请求与其结果拆开，缩短旧结果可以保留这对消息，而一次结果过大则可能需要把内容写到文件。这三种操作给下一轮请求留下的内容不同。第四个问题再追踪何时调用模型生成摘要，以及服务端已经拒绝长输入后的恢复。读者可以先找到原课相应的小标题，再用三家的函数或状态检查同一项判断。[原课 s08](https://learn.shareai.run/zh/s08/)

每点的 `section` 保留原有标题或符号，`find` 是中文学习页可以直接找到的字串，`baseline` 说明该处的原课示例。每家分别保存 `frames`、`match` 与 `links`。定位词全部在浏览器实际渲染的学习面板文字中核对。当前 48 点内共有 73 项“对应”、55 项“部分对应”、16 项“待核”。“对应”只针对这一点可在固定源码中追到的行为。“部分对应”说明范围、位置或触发条件有差异。“待核”保留已有相邻入口并指出仍缺哪段证据。章节级支持判断另见[章节映射](../data/mappings.json)。

## 跨章检查

- s03 的原课示例是在本地工具执行前裁决。Hermes 的终端守卫直接处理命令并区分阻挡与等待确认，ACP 编辑是另外一条路径。s04 又加了一层问题，同一个返回值在工具前与会话退出时可以有不同含义。[原课 s03](https://learn.shareai.run/zh/s03/) · [Hermes 终端守卫](https://github.com/NousResearch/hermes-agent/blob/0284ce17d9bf9ed2f1832ad8950dfac2394d45ab/tools/terminal_tool.py#L1190)
- s11 的三类问题发生在模型请求层。输出被截断需要判断是否续写，上下文超限应改变下一次输入，服务端限流才可能需要等待后重发。本站购物车实验的“写入后回执丢失”用于学习工具副作用，不能替代这三项原课观察。[原课 s11](https://learn.shareai.run/zh/s11/)
- s16 的 `request_id` 和响应类型共同确认某一笔关机或计划审批请求。框架里的普通消息 ID、投递完成以及看板评论都不能单独证明对端同意了请求。[原课 s16](https://learn.shareai.run/zh/s16/)
- s17 的发现和认领要分别核查。dsh 的条件认领先核对已有 owner，再查状态及前置项，成功时才写入 `ownerId` 和 `in_progress`。这段源码能解释旧候选为何抢不到，还需要别的入口才能解释空闲成员何时醒来。[原课 s17](https://learn.shareai.run/zh/s17/) · [dsh 认领分支](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/experimental/agent-team/src/task-board.ts#L133)
- s19 把发现、公开名和远端调用拆开。AgentScope 包装工具时保留原名，向模型公布带服务名前缀的名字，真正的远端请求仍发送原名。[原课 s19](https://learn.shareai.run/zh/s19/) · [AgentScope 命名](https://github.com/agentscope-ai/agentscope/blob/28ab5ef6b1d8969c6ed8a3975c2063478a5c4986/src/agentscope/tool/_adapters.py#L257) · [远端调用](https://github.com/agentscope-ai/agentscope/blob/28ab5ef6b1d8969c6ed8a3975c2063478a5c4986/src/agentscope/tool/_adapters.py#L410)

## 上线版本和面板范围

下表记录实际打开的章节及取回的 HTML 字节摘要，截取 SHA-256 的前 16 位以便定位漂移。GitHub 教学仓库的提交与该部署之间没有确认的对应关系。源码面板在浏览器呈现的 Python 属于原课；三家框架的源码另行固定到提交。研究材料保留文档位置、摘要和自己编写的对照解释。[版本锁定记录](sources.lock.json)

| 中文站章节原题 | 检查点 | HTML 摘要 |
| --- | ---: | --- |
| [s01 · Agent Loop](https://learn.shareai.run/zh/s01/) | 2 | 50eae889b19c5f50 |
| [s02 · Tool Use](https://learn.shareai.run/zh/s02/) | 2 | 1fc6c5d05263886b |
| [s03 · Permission](https://learn.shareai.run/zh/s03/) | 2 | ae54c96b095bc788 |
| [s04 · Hooks](https://learn.shareai.run/zh/s04/) | 3 | 3ec4a442808b2a5d |
| [s05 · TodoWrite](https://learn.shareai.run/zh/s05/) | 2 | a412b7eee5948071 |
| [s06 · Subagent](https://learn.shareai.run/zh/s06/) | 2 | f73b509cd83671d0 |
| [s07 · Skills](https://learn.shareai.run/zh/s07/) | 2 | 41b64ba94eb69c7f |
| [s08 · Context Compact](https://learn.shareai.run/zh/s08/) | 4 | 1c1c7d535eebf5d4 |
| [s09 · Memory](https://learn.shareai.run/zh/s09/) | 2 | 7e1551645ce60a68 |
| [s10 · System Prompt](https://learn.shareai.run/zh/s10/) | 2 | d5a5e8a3c3df61c4 |
| [s11 · Error Recovery](https://learn.shareai.run/zh/s11/) | 3 | 8567c9997071b3ac |
| [s12 · Task System](https://learn.shareai.run/zh/s12/) | 3 | 677fac3c8e0ad7eb |
| [s13 · Background Tasks](https://learn.shareai.run/zh/s13/) | 2 | f6f9e70f7ce472ac |
| [s14 · Cron Scheduler](https://learn.shareai.run/zh/s14/) | 2 | 6081e1cfb20982f4 |
| [s15 · Agent Teams](https://learn.shareai.run/zh/s15/) | 2 | 6242a99cd186c07c |
| [s16 · Team Protocols](https://learn.shareai.run/zh/s16/) | 2 | bff6e11ec1ad7ed1 |
| [s17 · Autonomous Agents](https://learn.shareai.run/zh/s17/) | 2 | 4928383da5a63ac9 |
| [s18 · Worktree Isolation](https://learn.shareai.run/zh/s18/) | 2 | 56f6ba47849a0e15 |
| [s19 · MCP Tools](https://learn.shareai.run/zh/s19/) | 3 | 2d7a8cc14a0f0f1d |
| [s20 · Comprehensive Agent Turn](https://learn.shareai.run/zh/s20/) | 4 | ff393a59cf53efb7 |

每章均核查了四个面板。原站页面上方的机制图与「模拟」标签里的 Agent 循环模拟器各有其状态。异步场景载入期间会短暂出现未提供场景的占位；验证时需要等待工具栏和第一步就绪，再逐步操作与重置。最终检查见[线上浏览器记录](original-verification-online.json)与[本地浏览器记录](original-verification.json)。购物车实验另见[实验验收记录](acceptance.md)。
