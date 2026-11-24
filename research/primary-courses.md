# 四门主课的来源与验收

2026-11-22。顶部「主课」决定哪套目录、页面和实验出现在左侧。「三家并看」始终列出另外三门课。作为对照出现的课程也可直接升为主课。旧的 Claude 章节、练习和购物车实验链接保留各自的入口。

| 主课 | 主栏实际来源 | 形态和范围 |
|---|---|---|
| Learn Claude Code | 已归档的中文线上部署 | 20 章、4 类章内面板、站内公共工具页和 20 节「试一下」。[快照与来源](../upstream/README.md) |
| Hermes | 社区教程 g1429566/hermes-tutorial，教程提交 `63264f4` | 34 章，保留原站章节顺序、双语正文、交互和浏览器内 Python。教程采用的 Hermes Agent 源码版本见课程说明，与横向源码证据的版本分别记录。[来源与原生交互验证](../courses/hermes/README.md) |
| dsh | 社区教程 tsrigo/dsh-from-scratch，提交 `bc4e47f` | 6 章，保留每节的渐进源码、模型请求、会话事件、轨迹及 Python／TypeScript 分支。随附原实验源码与离线测试。[课程归档](../courses/dsh/README.md) |
| AgentScope | agentscope-ai/docs 官方中文 2.0.12 文档，文档提交 `e0ee835` | 遵循上游导航的 60 篇完整文档。以离线 HTML 呈现原始 MDX、图、代码和参数说明，附原始文件。此版本和项目的 AgentScope 实现对照版本一致。[来源清单](../courses/agentscope/sources.lock.json) · [原生内容核验](../courses/agentscope/browser-verification.json) |

## 右栏怎样对齐主课

每个主课阅读点记录该课的真实小节或源码符号、一句阅读问题、主课如何处理，以及能够核对的来源。其他课程中有直接证据时，旁注回答这道主课问题并提供出处。例如从 Hermes 的安装章对读 AgentScope，可分别确认安装、模型配置和第一次成功回复。目标课程若只有相关章节，入口会说明关联范围。未核实对应关系的项目保留课程首页入口。[跨课直接对照](../data/native-peer-links.json)

当前另写了 54 条面向具体主课问题的有向对照，22 条对应、32 条部分对应。这些条目会优先展示；一个方向的判断不会自动转成反向判断。例如 AgentScope 快速开始提到流式回复，Claude 旁注会指出 s01 实际演示的调用方式及它能说明的范围。

若两课均可参照 Learn Claude Code 的某个具体机制问题，右栏单独展示这条共同问题及对应证据。“共同机制的阅读位置”表示可以沿这个问题去读另一门课程。真实章节号、示例、调用顺序和接口各以所在课程为准。仅共享主题的说明按章级线索展示。[原课的机制索引](../data/original-crosswalk.json)

## 实际验证

- 在同一浏览器界面依次选作四门主课，逐门核对目录和其余三个对照选项。新增三门共 100 个章节或文档页面，逐页检查详细正文；逐项选择并定位了 Hermes 47 处、dsh 21 处、AgentScope 74 处主课原文。
- 检查切换旁注时主栏的文档实例和地址保持，当前课可保留已读章和实际滚动位置，刷新、从首页重新进入和把旁注升为主课都能工作。另在 390 像素宽的视口操作主课选择器。
- 对原 Learn Claude Code 另复跑原页对读和练习回归，覆盖 48 个原文定位点和全部 20 章的练习入口。外部模型调用、各框架生产服务以及示例所需的凭据均在本次页面验收范围之外。

从项目目录运行 `python -B study.py build`、`python -B -m unittest discover -s tests -v`。开启本机服务后，运行 `node tests/original-browser.mjs primary http://127.0.0.1:8765`。课程包和页面可离线使用；侧栏外部源码链接需要联网。[浏览器结果](primary-courses-browser.json) · [Hermes 主栏](screenshots/primary-hermes.png) · [dsh 主栏](screenshots/primary-dsh.png) · [AgentScope 主栏](screenshots/primary-agentscope.png)
