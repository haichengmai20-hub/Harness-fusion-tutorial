# 本地源码目录

对读仓库用 Git 子模块指针记录下表两份源码的提交。本项目分发的 `dist/` 已包含课程和 s10 研读页，可以先打开学习。若要用编辑器逐行查看教学代码，在项目根目录执行 `git submodule update --init -- sources/learn-claude-code`。Claude Code 第三方快照默认跳过下载，已有该固定版本的本地副本可放入 `sources/claude-code/`。两份源码的工作树、私有改动和嵌套 Git 配置均不进入课程发布文件。

s10 的研读卡会同时指向上述源码和同级目录 `../claude-code-internals/notes/` 的研究笔记。文件可用时选择 VS Code 或 Cursor 打开指定行。本地服务仅向阅读器返回编辑器定位需要的目录信息，源码目录不在静态文件服务范围内。

| 目录 | 是什么 | 本地停在哪一版 | 来源与许可 |
|---|---|---|---|
| `learn-claude-code/` | shareAI Lab 的社区教学仓库，完整克隆。原课每章「试一下」里的 `cd learn-claude-code` 指的就是它。 | 当前检出分支 `web-course-20`，提交 `20e7cbb`；`main` 停在 `448c75b`。 | [GitHub](https://github.com/shareAI-lab/learn-claude-code)，MIT。它是社区写的教学实现，不是官方 Claude Code 产品源码。 |
| `claude-code/` | Claude Code CLI 的第三方源码快照，从工作区 `D:\RL及harness\claude-code` 整目录复制，含 `.git`。 | `6f6f12b3`，仓库 `tanbiralam/claude-code`。 | 非官方开源。其 `README.md` 第 1–15 行记录了 2026-03-31 经 npm 包内 `.map` 文件外泄的经过。 |

## 为什么检出 20e7cbb，而不是 main

快照里的 20 章与仓库 `main` 的目录对不上。原课每章「试一下」的启动命令是 `python s10_system_prompt/code.py`、`python s20_comprehensive/code.py` 这类路径。`main`（`448c75b`，2026-11-15）已改成 17 章主线，从 `s10_task_system` 起目录名不同，也没有 `s20_comprehensive`。`20e7cbb`（2026-06-07）保留 s01–s20 的 20 章目录。

2026-11-23 以部署构建 `kmlR_r3nY0eufm7KiGEJ3` 的本地快照为准，做了两项核对：

- 快照 20 个章节页内嵌的 Python 源码（`upstream/site/zh/sNN/index.txt` 的文本行），与 `20e7cbb` 下同名的 `sNN_*/code.py` 逐字节相同，20 份的 git blob 哈希全部一致。
- 从 `main` 可达的 252 个提交里，20 份 `code.py` 同时等于这些内嵌源码的只有 4 个：`99a1e52`、`20e7cbb`、`4a329c9`、`65b1751`。`main` 自身的 20 份都已不同，包括目录名没变的 s01–s09。

这只能把快照的「源码」页签定到这一段提交。正文和前端资源是否出自同一提交，仍未证实，[快照说明](../upstream/README.md) 里的这句话继续有效。

学习笔记里的永久链接也停在 `20e7cbb7`，行号与本地文件一致。要看上游最新内容，用 `git -C sources/learn-claude-code log main`，或另开工作树，不要直接在这个目录切到 `main`。

## 两处本地状态

- `learn-claude-code` 工作树干净。按原课命令运行后出现的 `.env`、`.memory/` 等未跟踪文件不影响核对。
- `claude-code` 原样带着工作区副本的两处本地状态：`package.json` 有一行未提交修改（描述从 “Leaked Source (2026-03-31)” 改成 “Source code (2026-03-31)”），另有未跟踪的 `claude-code-source-analysis.md`。复制后与原目录做过逐字节比较：2048 个文件、42,257,846 字节，无差异。之后编辑器一侧的工具改写了副本里 `.git/gk/config` 的分支访问时间（按目录名判断是 GitKraken，未另行核实）；这个文件不是仓库内容。

## 复核

在项目根目录运行，只读，不改任何文件：

```powershell
python -B tools/source_snapshots.py
```

它检查教学仓库的 origin、分支、提交和已跟踪文件，逐章比较内嵌源码与本地 `code.py`，并核对原课启动命令里的目录名；再检查源码快照的 origin、提交和那一处已知修改。不一致时退出码为 1。

## 更新

教学仓库要取新版时先 `git -C sources/learn-claude-code fetch origin`，再判断是否需要换提交：换了提交，上面的逐字节结论要重新核对，笔记里的永久链接也要跟着改。`claude-code` 没有可更新的上游，它就是这一份快照。

后续若要为 `research/verify_sources.py` 准备 Hermes、dsh、AgentScope 的固定版本源码，可以放在同一目录下，用 `--hermes`、`--dsh`、`--agentscope` 指过去。
