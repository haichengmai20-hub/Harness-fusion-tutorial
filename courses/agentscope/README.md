# AgentScope 2.0.12 中文主课

从[课程首页](/agentscope-course/)进入，目录沿用官方文档的「快速开始」「核心模块」「智能体即服务」「其他」。60 篇中文原文按该版本的导航顺序排列。每页都可打开官方在线原页、对应提交中的文件和本地原始 MDX。阅读、切换代码示例和查看图解可以断网进行。[官方中文首页](https://docs.agentscope.io/zh/versions/2.0.12/index)

适合动手跟读的入口有三个。

- [第一个智能体](/agentscope-course/quickstart/)同时给出等待最终消息和消费流式事件的代码。运行这一页的 DashScope 示例需要配置相应凭据。
- [智能体的主循环](/agentscope-course/building-blocks/agent/overview/)可以沿原图追踪推理、工具执行、等待外部输入与最终返回。展开图下的「查看流程图原文」可核对流程边。
- [注册 MCP 客户端](/agentscope-course/building-blocks/tool/mcp/)可以切换连接方式的原版代码示例，观察有状态客户端在交给工具包之前需要完成哪一步。

官方文档使用章节内的代码、选项卡、步骤和演示图组织练习。52 篇含代码块或流程图原文，全课共 389 块。另保留原版 OpenAPI 规范，附可离线浏览的 91 条路径和 117 个操作。[API 参考](/agentscope-course/api/)

## 来源与版本

中文正文、图片和导航取自官方文档仓库提交 `e0ee835d1aca5d2b840d29bdd2f70770bbef69e8` 中的 2.0.12 版本。该仓库根许可为 MIT，署名 Copyright (c) 2023 Mintlify；完整许可保留在发布物内。对应的框架源码标签是 `v2.0.12`，指向 `28ab5ef6b1d8969c6ed8a3975c2063478a5c4986`。逐文件 SHA-256 和原始来源记录见 [sources.lock.json](sources.lock.json)。[固定文档目录](https://github.com/agentscope-ai/docs/tree/e0ee835d1aca5d2b840d29bdd2f70770bbef69e8/zh/versions/2.0.12) · [官方文档许可](https://github.com/agentscope-ai/docs/blob/e0ee835d1aca5d2b840d29bdd2f70770bbef69e8/LICENSE)

本地阅读器在构建时把 MDX 编译为 HTML，将 Mintlify 的卡片、步骤、代码组、文档标签、文件树和折叠说明转换成对应的静态控件。15 个 Mermaid 图在本地渲染成 SVG，原图定义与 10 份上游图片/GIF 均保留。站内链接适配 `/agentscope-course/` 前缀，TTS 页指向中间件的旧英文片段名映射到实际中文小节「语音生成」。

另核对了 lingyaolab 的 Python 2.0.11 中文教程，提交 `a6c047e46c0578ec6d6fc7cb82e6dfa4d0db9f5a`。该快照包含 27 章、00A 实验室与附录，README 的授权说明仅覆盖其中引用的上游部分，目录中未找到对社区教程整部正文的复用许可。社区版保留独立入口。本地收录的是上面的官方 2.0.12 文档。[社区版固定入口](https://github.com/lingyaolab/agentscope-py-guide/tree/a6c047e46c0578ec6d6fc7cb82e6dfa4d0db9f5a)

## 对读与验收

74 个对照点各含本页可定位的文字、问题和工程说明。43 篇可对应原课程中的通用机制；另 17 篇的 `topic` 为 null，保留模型适配、语音、渠道、检索等自身问题。章级相似但没有同一个具体问题时，`crosswalk` 为 null。每个页面的 `online` 指向该节官方地址，`source` 指向固定提交的源文档。[对读清单](manifest.json)

在阻断外站域名解析的 Chrome 临时配置中打开全部 60 篇，74 个对照点均能从可见文本选取，逐项点击了 130 个代码组或文档标签选项。26 个正文配图实例全部解码，其中包括 15 个单独渲染的 SVG。示例适配器和真实模型运行结果需按各页要求另行验证。[浏览器记录](browser-verification.json)

在本目录执行以下命令可复核已打包内容。第二条命令需要本机 Chrome 或 Edge，也可通过 `BROWSER_EXE` 指定路径。

```powershell
python -B -I -X utf8 verify.py
python -B -I -X utf8 verify_browser.py
```

应用日常启动直接使用 `site/` 下的发布物。如需重新编译，安装固定的构建依赖后运行 `python -B -I -X utf8 build.py`；也可用 `--archive 路径` 读取同一提交的已有原始 ZIP。渲染依赖按需使用 `npm ci --ignore-scripts` 安装，阅读器本身不加载这些 npm 包。
