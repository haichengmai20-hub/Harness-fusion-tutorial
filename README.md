# Harness 四门原课对读

Windows 双击 [打开原课对读.cmd](打开原课对读.cmd)。在顶部「主课」选择课程，左栏会更换为这门课自己的目录、章节正文和原有的代码或实验。右侧的三门课是对照。首次打开默认 Learn Claude Code，以后从首页进入会恢复上次选择。只切右侧框架，可以保留左侧的阅读或实验位置。

| 选作主课 | 左边实际学习的内容 |
|---|---|
| [Learn Claude Code](http://127.0.0.1:8765/?primary=claude&mode=original&chapter=s01) | 中文上线站的 20 章，从原始循环开始，保留学习、模拟、源码、深入探索以及「试一下」。 |
| [Hermes](http://127.0.0.1:8765/?primary=hermes&lesson=agent-loop) | 社区 Hermes Agent 学习教程，原生编号 00–33，共 34 章。保留双语正文、交互练习和浏览器 Python 示例。 |
| [dsh](http://127.0.0.1:8765/?primary=dsh&lesson=chapter-1) | 社区原课《DeepSeek Harness from Scratch》的 6 章，使用原生 TypeScript / Python 切换、模型请求、执行轨迹和渐进源码。 |
| [AgentScope](http://127.0.0.1:8765/?primary=agentscope&lesson=quickstart) | AgentScope 2.0.12 官方中文文档的 60 篇，按该版本的导航层级保留完整正文、示例和图，使用本地阅读界面。 |

右侧点「用 … 作主课」可沿同一问题进入另一门课。能够关联到具体段落时会打开那一节，仅有章级联系时会标为“相关章节”。没有核实直接对应的主题可从目标课程目录继续。下方的 Learn Claude Code「试一下」和购物车练习仍各有自己的入口，其他主课使用本课程实际提供的实验或代码示例。

四门课的主要阅读路径均由本地 HTTP 提供，访问上游网站、框架仓库和外部模型服务需要网络。[多主课验收记录](research/primary-courses.md)

Learn Claude Code 主课使用 2026-11-21 捕获的公开部署，包括首页、20 章，以及学习路径、版本对比、架构层三个页面。原页的正文、代码块、图、模拟、深入探索、折叠附录和站内导航保存在本地。对 Claude Code 产品行为的描述保留原作者口径。[快照说明](upstream/README.md) · [MIT 许可](upstream/LICENSE)

## 例子：从 Learn Claude Code 出发对读

1. 从原课目录进入 **s11 · Error Recovery**。在右栏选择「路径 1: 输出被截断」，点「定位原文」可选中左页依据。读者要回答的是生成被截断后会不会续写、由谁限制次数。
2. 切到 Hermes、dsh 或 AgentScope，或者点「三家并看」。这一步只更新旁注，保留左页的滚动位置、当前页签和模拟状态。每条旁注指向固定版本源码，并分别标记“对应”“部分对应”或“待核”。
3. 把问题换成「上下文超限」或「临时故障」，再看恢复入口和下次请求有何区别。当原文小节没有单独核实的对照时，侧栏会保留选定的问题。点击定位可以回到其具体依据。窄屏可用「打开对照／返回原文」在两栏切换。

当前 20 章有 48 个原文检查点、144 条逐点三方对照；首页另有两处入门对照。覆盖与证据见[逐章说明](research/original-crosswalk.md)。实际页面与交互的核验见[原课验收](research/original-acceptance.md)。

## Learn Claude Code 的「试一下」

**s10 源码研读**已嵌入[系统提示词章节](http://127.0.0.1:8765/?primary=claude&mode=original&chapter=s10)。右栏的「按需拼接」和「缓存避免重复拼接」各有四个研读题。可展开查看教学代码、Claude Code 第三方源码与旧研究笔记，或直接[读确认定稿](学习笔记/s10-请求字段与缓存断点.md)、[查作业和源码对照](学习笔记/s10-prompt-cache与系统提示词组装-作业对照源码与旧笔记.md)、[做 Harness Lab 离线实验](docs/s10-harness-lab.md)。[样章证据与扩展方式](research/s10-source-study.md)

读到 s07、s09、s10 时可对照这份[复习笔记：工具名、技能与记忆怎样进入请求，缓存断点覆盖哪一段](学习笔记/s10-请求字段与缓存断点.md)。里面保留了当时的追问、两张纯文本图，以及四种前缀变化的自测。

在任意章节点顶部「动手练习」。上半栏从该章原页提取试做提示、配套工程的启动命令和观察重点。20 节共有 62 条原课试做提示；原课没有在这些小节设提交和自动评分表单。[逐章清点与计数口径](research/original-practice.md)

下半栏每章配一项可直接在浏览器完成的观察练习。例如在 [s03 权限练习](http://127.0.0.1:8765/?mode=original&chapter=s03&practice=1)，先预测用户点「允许」时是否已经有工具结果。点「去原页观察」，单步比较第 4、5、6 步，再展开「核对参考现象」。可以把预测和实际观察记在本章文本框里，记录按章节保存在当前浏览器。点「回到本题的框架对照」可以沿着刚才的问题看其他 Harness。

## 购物车补充实验

上方「购物车实验」可打开自编课程，独立使用时也可双击 [lab.html](dist/lab.html)。它提供第二个可运行的案例，专门练习复现、单步和验收。

1. 打开 **s01 · Agent Loop**，进入「模拟」，勾选「先预测」。看到模型发出 `check_cart` 时停一下，预测它下一轮会收到什么证据。点击「单步」，沿同一调用 ID 找到结果，比较实际 350 分与预期 700 分。
2. 到 **s03 · Permission**，分别选择允许和拒绝写入。对照 `permission-resolved`、下一轮模型收到的回执，以及末步的金额和 `fileBytesChanged`。在同一事件切换 Hermes、dsh 和 AgentScope，阅读各自的执行位置与适用条件。
3. 到 **s20 · Comprehensive Agent** 的末步，检查 `completed`、金额和具体测试名。允许分支的两件商品应为 700 分，混合商品应为 760 分。切到拒绝分支，找出导致验收结果改变的第一个决定。

每章有学习、模拟、源码、深入探索四个入口。源码页展示相邻章节之间生成的实际差异，也能查看累计代码。深入探索里有三家并排对照和预测题。阅读记录和答题通过数分别保存在当前浏览器。链接会记住章节、框架、标签、场景，以及当前事件的语义位置。同一语义步骤在一条轨迹中出现多次时，链接会区分第几次。

## 本地运行与重现

离线页面已构建。重建或执行实验使用 Python 标准库，本机验证版本为 Python 3.14.6。以下命令从项目根目录运行。

```powershell
python -B study.py serve
```

打开 <http://127.0.0.1:8765/>。按 Ctrl+C 关闭服务，也可通过 `--port 8766` 更换端口。服务只向本机提供构建好的页面。

| 想做的事 | 命令 |
|---|---|
| 在新的购物车副本中执行一次拒绝写入实验，输出完整事件 | `python -B runtime/lab.py run s03 failure` |
| 执行综合修复并运行副本里的真实单元测试 | `python -B runtime/lab.py run s20 normal` |
| 重新执行全部教学场景，生成轨迹与代码快照 | `python -B runtime/lab.py export` |
| 对照已保存的数据逐值检查重跑结果 | `python -B runtime/lab.py check` |
| 将原版快照和双栏阅读器构建到 dist，同时打包单文件实验 | `python -B study.py build` |
| 按原 URL 和 SHA-256 核对课程快照及依赖 | `python -B tools/snapshot_original.py` |
| 比较本地原课和已采集的在线浏览器结果（先启动本地服务） | `node tests/original-browser.mjs verify http://127.0.0.1:8765` |
| 实际检查每章原题、观察位置、笔记与返回框架对照 | `node tests/original-browser.mjs practice http://127.0.0.1:8765` |
| 核对课程、源码引用、运行时与构建产物 | `python -B -m unittest discover -s tests -v` |
| 核对框架映射与上游版本锁 | `python -B research/verify_sources.py` |
| 核对 `sources/` 下两份本地源码的提交与内容 | `python -B tools/source_snapshots.py` |
| 用浏览器实际操作购物车实验并重新截图 | `node tests/browser-check.mjs` |

浏览器验收使用 Node 22+ 和本机 Chrome 或 Edge；脚本创建临时浏览器配置，可以用 `BROWSER_EXE` 选择浏览器。阅读教程本身无须安装 Node。改变实验代码后依次执行 `export`、`build` 再运行测试。

## 课程与证据

| 入口 | 可以检查什么 |
|---|---|
| [原课快照](upstream/site/zh) · [文件清单](research/original-snapshot.json) | 中文原始 HTML、路由数据及相关资源的来源、版本和校验值 |
| [逐点对照](data/original-crosswalk.json) | 原课可定位文字、同一条机制问题、三家源码解释和支持边界 |
| [实验章节正文](data/chapters.json) | 20 章购物车实验的问题、单步任务、失败情形、选项和判据 |
| [固定起始快照](fixtures/cart_repo) | 购物车源码、金额单位及暴露漏乘错误的测试 |
| [逐章新增的 Python 代码](runtime/layers) | 同一教学 Harness 可以调用的机制与各章实验入口 |
| [轨迹生成器](runtime/lab.py) | 在临时副本中重跑场景、导出事件与累计 Diff 的过程 |
| [三框架的 60 格映射](data/mappings.json) | 每格的支持关系、证据等级、调用位置、状态归属与永久链接 |
| [官方源码核对记录](research/README.md) | 固定版本与许可、权限案例的三种实现、5 项尚待确认的机制 |
| [课程参考基线](research/course-baseline.json) | 在线 20 章与社区仓库 17 章主线的差异及固定提交 |
| [本地验收记录](research/acceptance.md) | 已执行的检查、通过条件、截图与使用边界 |
| [本地源码目录](sources/README.md) | 教学仓库在 `20e7cbb` 的完整克隆，以及工作区的 Claude Code 第三方源码快照；各自的提交、许可与复核方式 |

购物车实验中的轨迹由本项目的 Python 教学程序生成。模型回复由确定性代码产生，文件读写、SQLite 条件更新以及最终购物车测试在临时副本中实际执行。切换框架会更换源码和状态解释，仍保留同一条共同教学轨迹。三个产品的证据来自固定版本源码阅读，产品安装版、真模型调用和性能比较均留待独立实验。s18 的隔离实验使用目录副本与整文件基线，s19 使用本地工具发现与调用子集。

## 版本选择

原课快照固定为部署构建 `kmlR_r3nY0eufm7KiGEJ3`。参考仓库的锁定提交 README 描述 17 章，部署站点提供 20 章。快照 20 章内嵌的源码与仓库提交 `20e7cbb` 逐字节一致，该提交的完整克隆放在 `sources/learn-claude-code/`，原课「试一下」的启动命令按它的目录写成。左侧保留实际部署内容，归档记录单独追踪线上构建与仓库版本。完整原版使用本地 HTTP 加载 Next.js 组件和路由数据，标准库服务仅绑定 127.0.0.1。[参考站点](https://learn.shareai.run/zh/) · [固定版本仓库](https://github.com/shareAI-lab/learn-claude-code/tree/448c75bb596917ad196cc1fb7558f459c5c50fdd)
