# 对读站接入本地源码：设计

日期：2026-11-24。下文保留当时的候选方案。后续按用户指定先以 s10 做样章，采用独立源码研读卡、编辑器逐行定位和三份本地读本。当前实现与后续章节接入方式见[s10 样章记录](../../../research/s10-source-study.md)。

## 背景与目标

`sources/` 下已有两份本地源码：教学仓库 `learn-claude-code`（`20e7cbb`）和 Claude Code 第三方源码快照 `claude-code`（`6f6f12b3`）。对读站目前只显示它们的路径说明，界面里没有入口。这次要打通两处：

1. **动手练习面板**：每章「试一下」的启动命令指向本地 `sNN_*/code.py`，给出可点的链接，在编辑器里直接打开；观察练习的定位词能在文件里找到时，跳到那一行。
2. **对照栏**：每个原文定位点在三家框架答案上方加一张「Claude Code 源码」卡，写明真实实现在快照的哪里、和原课是否对应。

## 不做的事

- 不把 `sources/` 挂到本机 HTTP 服务上。现在的行为是 `sources/` 返回 404，保持不变。
- 不改购物车实验（`lab.html` 的 60 张章级卡）。
- 不给 Hermes、dsh、AgentScope 做本地克隆。
- 不把教学仓库做成第四个切换项。交接文档约定它只作共同基线，不能与产品源码等同。

## 三项待确认

| 项 | 推荐做法 | 备选 |
|---|---|---|
| A 打开方式 | 链接形如 `vscode://file/<绝对路径>:<行>`，构建时按项目所在位置生成。卡上放一个「VS Code / Cursor」切换，选择记在浏览器里。本机两个协议都已注册（`HKCR\vscode`、`HKCR\cursor`）。 | 把 `sources/` 挂到本机服务，做一个页内查看器。改动大，还要让泄露源码走 HTTP，不推荐。 |
| B 卡的位置 | 放在三家答案上方，默认可见，不进入 Hermes / dsh / AgentScope 的切换组。「三家并看」仍是三家。 | 做成第四个切换项，并入并排对照。需要改四处浏览器验收里「恰好三张卡」的断言。 |
| C 分期 | 先做接线，并用 s01–s04 的 9 个点和首页 2 个点做样张。看过文字风格和深度再铺开到其余 39 个点。 | 一次做完 48 + 2 个点。 |

浏览器里第一次点击会弹出「打开 Visual Studio Code？」的确认，勾选后不再询问。

## 数据

对照点仍在 `data/original-crosswalk.json`，每个点新增一个字段，和三家答案放在一起。下面的行号只是格式示例：

```json
"claudeCodeProduct": {
  "match": "对应",
  "text": "真实实现的一句话到三句话说明。",
  "refs": [
    {"path": "src/query.ts", "line": 640, "endLine": 668, "symbol": "QueryEngine"}
  ]
}
```

- `match` 沿用现有三档：`对应`、`部分对应`、`待核`。
- `refs` 每点 1 到 4 条。`path` 相对 `sources/claude-code/`。`symbol` 若填写，必须出现在 `line` 到 `endLine` 之间，由脚本核对。
- 首页两个对照点写在 `data/original-home.json` 的同级字段里，结构相同。

构建时 `study.py` 往页面数据里多放一份 `localSources`：

```json
"localSources": {
  "root": "D:/RL及harness/harness-fusion-tutorial",
  "teaching": {"path": "sources/learn-claude-code", "present": true},
  "product": {"path": "sources/claude-code", "commit": "6f6f12b3", "present": true},
  "practice": {"s01": {"file": "s01_agent_loop/code.py", "line": 1}, "s10": {"file": "s10_system_prompt/code.py", "line": 71}}
}
```

`practice` 里的行号由构建时在本地 `code.py` 中查找该章观察练习的定位词得到；找不到或文件不在时为 1。`sources/` 不在时 `present` 为 `false`，构建不报错。

## 界面

- **动手练习面板**（`ui/practice.js`）：在「以下命令用于原课配套工程」下面加一行「本地文件：`s10_system_prompt/code.py`（第 71 行）」，点击在所选编辑器打开。`present` 为 `false` 时这一行不显示。
- **对照栏**（`ui/reader.js`、`ui/reader.css`）：新增一张卡，标题「Claude Code 源码」，右侧是对应程度标签，下面一行小字「第三方快照 `6f6f12b3`，非官方开源」。正文是 `text`，随后列出 `path:line`，每条是一个链接，鼠标悬停显示 `symbol`。`待核` 时链接文字写「已排查的位置」，和三家卡片的现有做法一致。
- **编辑器切换**：卡头部的下拉框，选项 VS Code、Cursor，默认 VS Code，记在 `localStorage`。
- 路径编码：逐段 `encodeURIComponent` 后拼成 `scheme://file/…:line`，盘符冒号编码为 `%3A`。
- 卡片放在 `#responses` 之外、其上方。现有 `#responses article` 恰好三张的断言不受影响。

## 测试

- `tests/test_original.py`：48 个点和首页 2 个点都有 `claudeCodeProduct`；`match` 在三档之内；`refs` 非空且字段齐全；`localSources.practice` 覆盖 20 章。
- `tools/source_snapshots.py` 增加一项检查：每条 `ref` 的文件在 `6f6f12b3` 中受版本管理、不是 stub、行号在文件范围内、`symbol` 出现在指定行段。`sources/` 不在时这项跳过。
- `tests/original-browser.mjs` 阅读流程补三条：每个点都有这张卡；卡有对应程度和至少一个链接；链接前缀是所选协议。
- `node --check ui/reader.js ui/practice.js`。

## 文字内容的做法与验收

- 只读 `sources/claude-code` 这一份快照，结论不外推到当前版本的 Claude Code。
- 用真实符号名（如 `runToolUse`、`executePreToolHooks`），不用教学代码里的名字。
- 定位先交给并行的检索子代理，每点带回文件、行段和原文片段；主会话逐条读片段后定稿，脚本再核对行号和符号。
- 定稿后由独立审查代理抽不少于 12 个点对照源码复核，列出不成立的说法。
- 机制落在 stub 文件里、或只找到相邻入口时，如实写 `待核`，并说明还缺哪段证据。

## 文档

实现后同步四处：`README.md` 加一小节说明入口与边界；`research/original-crosswalk.md` 记录这一栏的做法、三档数量和边界；`sources/README.md` 说明对读站如何使用这两份源码；`research/original-acceptance.md` 补新增的浏览器检查。

## 风险

- 快照是 2026-03-31 的源码，与当前产品有差异，卡上标明快照与日期。
- 编辑器协议依赖本机安装，换机器后需要在下拉框里重选，或在构建后重新生成路径。
- 48 个点的文字量不小，风格不合需要返工，所以先出 s01–s04 样张。
