# Hermes 独立主课

本目录保留 g1429566 发布的 Hermes Agent 双语教程。切换到这门课后按 00 到 33 阅读，操作原书的实验和练习。它涵盖六个模块，包括安装、运行时机制、协作、扩展、评测和系统设计。[原课](https://g1429566.github.io/hermes-tutorial/) · [本地目录与定位点](manifest.json)

## 如何挂载

将 `site/hermes-tutorial/` 原样作为 HTTP 服务的 `/hermes-tutorial/` 目录。每章在同一页通过 URL 片段切换，例如 `/hermes-tutorial/#/memory`。原站内部导航会更新 hash；外层读者可以监听内页的 hashchange。首次访问默认中文，语言切换和学习进度由原课保存到本机浏览器。页面依赖脚本与 WebAssembly，使用本机 HTTP 服务打开。

原生练习在普通章节正文下方，以“交互练习与源码对照”起始。第 00 章有“纸上推演”。每章在 manifest 里给出所选原文定位词、原课网址和练习入口。安装向导、开发插件、多模态等本课特有问题保留其原题；对照编号为空时可以继续阅读本章。

## 来源与版本

- 34 章的中文和英文讲义都已与固定教程提交的原始 Markdown 逐章比对。每种语言有 32 章共用一个 course.md，记忆与自我进化各用一个文件。完整原文都存在于下载的出版页数据中。[教程提交](https://github.com/g1429566/hermes-tutorial/tree/63264f4ddbb8f27507e0819dd2b0c9ea09e49cc7)
- 教程作者单独标明所研究的 Hermes Agent 提交为 `9302ba9e212c63ba24cdf1f47f26b47bcd3b042e`。其他框架对照的源码锁定独立记录。[原课版本说明](https://github.com/g1429566/hermes-tutorial/blob/63264f4ddbb8f27507e0819dd2b0c9ea09e49cc7/content/SOURCES.md)
- 15 个原始站点资源包括发布页、Next.js 脚本和样式、图标以及 Pyodide 的五个运行时文件。仅首页新增首次中文设置。MIT 声明和主要运行时许可位于静态发布目录内，随副本一同分发。[来源与许可](site/hermes-tutorial/NOTICE.md) · [资源校验值](verification.json)

## 已验证的行为

本地 Chrome 阻断外网后，依次打开全部 34 章，对照章名、正文、练习入口和 47 个原文定位点。抽查记忆实验时，提案出现后文件仍无新偏好，批准后文件已有偏好但原会话快照仍旧，新建会话后初始快照才包含偏好。另实点了展开答案、完成本章并进入下一章，以及刷新后保留 hash 和中文界面。

“什么时候需要新工具”一章的 Python 示例在本地 Pyodide 中实际启动，执行教学 handler 并返回输入的中文文本。其他实验按上游实现保留。原站列出的模型认证、本机安装、外部服务、远端源码链接和真实工具运行仍需相应环境；浏览器模拟属于教学数据。核验结果见[验证记录](verification.json)。
