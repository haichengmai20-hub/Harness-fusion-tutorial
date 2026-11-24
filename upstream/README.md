# Learn Claude Code 中文站快照

此目录保存 shareAI Lab 部署在 [learn.shareai.run](https://learn.shareai.run/zh/) 的中文课程。浏览器实际获取的文件按原路径保存在 `site/`。中文首页、s01–s20 以及「学习路径」「版本对比」「架构层次」三个公共页面均在快照范围内。前端、模拟器、章节正文、插图、代码面板和深入探索数据沿用该次部署分发的内容。

原站作者为 shareAI Lab。保留其 [MIT 许可全文](LICENSE)。可对照社区教程仓库的 [固定版本许可证](https://github.com/shareAI-lab/learn-claude-code/blob/448c75bb596917ad196cc1fb7558f459c5c50fdd/LICENSE)。实际部署可辨认的 Next build 为 `kmlR_r3nY0eufm7KiGEJ3`，部署对应的 Git 提交尚未证实。这里独立保留发布网页与资源，仓库该提交的目录不能代替部署站点。

## 内容与来源

- `site/zh/` 保存中文路由的原始 HTML 与 Next 路由数据。后者让浏览器切换到下一章时可以只加载必要部分。
- `site/_next/static/chunks/` 保存实际分发的 JavaScript 与样式，包含原版前端组件及其按需加载的数据。原本文档中的代码和动画会随原组件呈现。
- `site/course-assets/` 保存章内插图。`browser-resources.txt` 记录从原站首页和各章切换标签时浏览器实际请求过的站内路径。其余文件由 HTML、CSS、路由树与 JS 标明的依赖递归发现。
- 每个文件的原始 URL、MIME 类型、大小和 SHA-256 保存在 [快照清单](../research/original-snapshot.json)。站点读取层可以在返回给浏览器前加上框架切换入口；磁盘中的原始文件保留下载时的字节。

快照只涵盖中文内容路由。语言切换可前往公开站的其他语言版本。上游指向 GitHub 等外部站点的链接仍指向原地址。

## 核验与更新

在项目根目录运行以下命令。默认模式只核验本地材料，检查哈希、各页面的构建 ID，以及已记录组件的站内依赖。

```powershell
python tools/snapshot_original.py
```

维护者可使用 `--capture` 重新从线上获取完整快照。想给同一版快照补入浏览器发现的路径时，使用 `--extend --extra /实际路径`。更新后应复查原站界面、前后两个构建 ID 及本地页签行为。
