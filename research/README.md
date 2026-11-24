# 官方源码核对记录

取样于 2026-11-21（台北）。课程里的矩阵保存在 [mappings.json](../data/mappings.json)，每个主引用的提交、路径、行号与许可保存在 [sources.lock.json](sources.lock.json)。共同课程的参考基线另见 [course-baseline.json](course-baseline.json)。

## 购物车修改被拒时，三家分别发生什么

| 框架 | 源码中的观测点 | 做实验时要盯住什么 |
|---|---|---|
| Hermes | [文件编辑检查](https://github.com/NousResearch/hermes-agent/blob/0284ce17d9bf9ed2f1832ad8950dfac2394d45ab/acp_adapter/edit_approval.py#L211) 接在 [分发前检查](https://github.com/NousResearch/hermes-agent/blob/0284ce17d9bf9ed2f1832ad8950dfac2394d45ab/model_tools.py#L792) 内 | 使用适用的 ACP 宿主和编辑请求。拒绝可在调用编辑处理函数之前返回。换 CLI、宿主或工具后要重查生效条件。 |
| dsh | [审批服务](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/interaction/user-approval/src/index.ts#L208) 在已打开的 turn 内记录请求和裁决。[工具调度](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/core/tools/src/index.ts#L1483) 还要结合所装策略。 | 先判断动作是否需要提出审批，再观察提出后是批准、拒绝还是取消。普通工作区写入可能不会提出审批。 |
| AgentScope | [工具调用分支](https://github.com/agentscope-ai/agentscope/blob/28ab5ef6b1d8969c6ed8a3975c2063478a5c4986/src/agentscope/agent/_agent.py#L2615) 产生要求确认的事件，并保存等待状态。[公共回复入口](https://github.com/agentscope-ai/agentscope/blob/28ab5ef6b1d8969c6ed8a3975c2063478a5c4986/src/agentscope/agent/_agent.py#L323) 可接收用户裁决。 | 工具调用、等待确认和执行结果可分三次观察。处理拒绝后也可能有工具错误结果，要看结果内容。 |

同一案例刻意安排了三个可区分的检查。模型产生了写入请求吗，宿主是否已批准，这次回归的实际输出是多少。三个位置分别需要不同证据。

## 核对范围

| 项目 | 版本 | 阅读方式 |
|---|---|---|
| Hermes | `0284ce17d9bf9ed2f1832ad8950dfac2394d45ab` | 先以 GitHub API 解析分支，再按提交读取官方源码归档。 |
| dsh | `ddefc45fbc7f8e46dd73185e68295696d1297887` | 核对本地 checkout 的官方 origin、干净工作树与 HEAD，并从 GitHub API 复核提交存在。 |
| AgentScope | `v2.0.12`，`28ab5ef6b1d8969c6ed8a3975c2063478a5c4986` | 核对官方标签指向的提交，从该提交的归档读取源码。 |

60 格都读过其链接所指的源码。44 格找到了原生机制，11 格展示需要组合的路径，5 格保留未核实的机制。这里的“读过”只指链接所支撑的范围。网页教学轨迹来自课程自编运行时，三个产品均未安装或运行。比较结果不支持对模型效果、成本或可靠性排序。各项目版本对应的许可见锁文件中的 LICENSE 链接，课程使用自写的解释与源码指针。

## 五个有具体缺口的位置

| 章与框架 | 已能证明 | 能改变目前判断的证据 |
|---|---|---|
| s09 · dsh | 当前 Session 有动态上下文投影，另有让新子会话通过共享目录接续工作的 [Ralph 工作流](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/workflow/tool-ralph/src/index.ts#L157)。 | 找到跨独立用户会话的记忆检索入口与按用户过滤条件，并在新会话查看命中的金额约束。 |
| s16 · Hermes | 看板评论可以用任务 ID 记录，按增量读取。 | 从具体发送端追至另一 Agent 的接收端，找到端到端标识、投递及重试行为。 |
| s17 · AgentScope | TaskUpdate 可设置 owner。 | 在同一任务池找到竞争领取与唤醒的实现，并观测两位 worker 同时尝试的返回。 |
| s18 · dsh | 已查进程内 spawn 的上下文边界。 | 找到分别检出分支的工作目录、Git 元数据和回收过程，并在一次冲突中核对合并责任。 |
| s18 · AgentScope | 工作区 [提示文本](https://github.com/agentscope-ai/agentscope/blob/28ab5ef6b1d8969c6ed8a3975c2063478a5c4986/src/agentscope/workspace/_utils.py#L49) 建议按会话使用 Git 工作树。 | 找到创建工作树的实际调用及配置，再核对两个编辑者的目录与分支。 |

## 重验

从项目根运行 `python research/verify_sources.py` 即可检查 60 格与版本锁的关联。为脚本传入相应固定版本的源码目录，可进一步核对整个文件的 Git blob 哈希，并检查链接行号是否实际落到有内容的一行。核对兼容 Windows 检出时的换行符转换。

```powershell
python research/verify_sources.py --hermes <Hermes目录> --dsh <dsh目录> --agentscope <AgentScope目录>
```

首次构建的实际检查为 60 张卡、31 个前四章语义锚点、60 处实际源码行，退出码 0。行号检查适合发现链接错误；卡片对状态和调用顺序的解释来自人工逐段阅读。
