# DeepSeek Harness from Scratch

采用 Weikai Huang 编写的六章中文互动教程，保留原章序、Python 和 TypeScript 两版正文、源码补全卡、工具调用记录和会话视图。[作者课程](https://dsh-from-scratch.pages.dev/) · [对应仓库](https://github.com/tsrigo/dsh-from-scratch/tree/bc4e47f5024f1f7bc6d8b6ac88ce44fa6e4249af) · [完整 MIT 许可](site/dsh-course/LICENSE.txt)

网页前端使用的 React、React DOM、Scheduler 和 PrismJS 依其自身许可分发。按上游锁文件的版本，从 npm 发布包取出的许可文本也随 [静态站点](site/dsh-course/licenses/) 一并提供。

## 阅读与实验

本地入口为 `/dsh-course/?locale=zh`，原生章节链接使用 `#chapter-1` 到 `#chapter-6`。页面按原课提供的预生成数据展示模型请求、工具结果、插件的安装释放和长期目标的轮次决策。可以在网站里切换 Python 和 TypeScript，滚动正文对照各段源码和执行证据。

要运行作者的教学实现，可下载 [原课实验源码包](site/dsh-course/dsh-labs.zip)。包内包括两个语言版本的实现、原始说明、演示工作区、生成脚本、测试以及固定的前端数据。进入解压后的 `dsh-from-scratch`，用已安装的 Python 跑固定输入的测试：

```powershell
python -B -m unittest discover -s tests_python -v
```

本次从实际交付 ZIP 解压后执行了这条命令。五项测试全部通过，分别检查工具循环、工具结果投影、请求重建、插件定义与释放、长任务完成。这里运行的是原作者的教学代码和脚本化模型回复，DeepSeek 官方 dsh 与真实模型均未运行。TypeScript 的代码与原测试也在包中，首次安装其 Node 依赖需要包源。

## 取样

`capture.py` 获取部署站实际引用的 HTML、JS、CSS、配图和四份数据包。为同源挂载，入口、程序包与样式表中的根相对资源地址加上 `/dsh-course`。逐文件记录远端及挂载后内容的 SHA-256，[取样清单](snapshot.json) 可用于检查这些修改。四份 TS、Python 中英文课程数据均与仓库提交 `bc4e47f5024f1f7bc6d8b6ac88ce44fa6e4249af` 对应的 Git blob 完全一致。

离线浏览验证使用干净 Chromium 配置并阻断 HTTPS 请求。两种语言版本的 6 章、21 个正文定位点和 10 个嵌入式证据面板均可访问，浏览器没有报告运行时异常或资源 404。页面内的源码补全卡用于阅读与比对，本地离线测试另有真实断言。
