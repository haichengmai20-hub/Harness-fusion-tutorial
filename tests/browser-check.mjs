// Run with Node 22+ and locally installed Chrome or Edge. No external packages.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = path.join(root, "research", "screenshots");
const fileURL = pathToFileURL(path.join(root, "dist", "lab.html")).href;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function locateBrowser() {
  const paths = [
    process.env.BROWSER_EXE,
    path.join(process.env.ProgramFiles || "", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft/Edge/Application/msedge.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  ];
  const exe = paths.find(p => p && existsSync(p));
  if (!exe) throw new Error("请将 BROWSER_EXE 设为本机 Chrome 或 Edge 的完整路径。");
  return exe;
}

function startProcess(exe, args, pipe, regex) {
  const child = spawn(exe, args, { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("子进程启动超时 " + exe)), 20000);
    const fail = e => { clearTimeout(timeout); reject(e); };
    child.once("error", fail);
    child.once("exit", code => fail(new Error("子进程提前退出 " + exe + " (" + code + ") " + output.slice(-500))));
    child[pipe].setEncoding("utf8").on("data", data => {
      output = (output + data).slice(-4000);
      const hit = regex.exec(output);
      if (hit) { clearTimeout(timeout); resolve(hit[0]); }
    });
  });
  return { child, ready };
}

async function closeChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, "close").catch(() => {});
  child.kill();
  await Promise.race([closed, sleep(1500)]);
}

async function connect(address) {
  const ws = new WebSocket(address);
  await once(ws, "open");
  let id = 0;
  const waiting = new Map();
  const errors = [];
  ws.addEventListener("message", ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.text);
    const pending = waiting.get(msg.id);
    if (!pending) return;
    waiting.delete(msg.id);
    clearTimeout(pending.timer);
    if (msg.error) pending.reject(new Error(msg.error.message));
    else pending.resolve(msg.result);
  });
  function send(method, params = {}, sessionId) {
    const request = ++id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiting.delete(request); reject(new Error(method + " 超时")); }, 10000);
      waiting.set(request, { resolve, reject, timer });
      ws.send(JSON.stringify({ method, params, id: request, sessionId }));
    });
  }
  return { ws, send, errors };
}

const owners = [];
const reports = [];
let profile;
let client;
try {
  const python = process.env.PYTHON || "python";
  const server = startProcess(python, ["-B", "study.py", "serve", "--port", "0"], "stdout", /http:\/\/127\.0\.0\.1:\d+\//);
  owners.push(server.child);
  const base = await server.ready;
  const tempRoot = await realpath(os.tmpdir());
  profile = await mkdtemp(path.join(tempRoot, "harness-course-chrome-"));
  const chrome = startProcess(locateBrowser(), ["--headless=new", "--disable-gpu", "--disable-extensions",
    "--disable-background-networking", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", "--user-data-dir=" + profile,
    "--window-size=1440,960", "about:blank"], "stderr", /ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[0-9a-z-]+/);
  owners.push(chrome.child);
  client = await connect(await chrome.ready);
  const product = (await client.send("Browser.getVersion")).product;
  const { targetId } = await client.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await client.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => client.send(method, params, sessionId);
  await send("Page.enable");
  await send("Runtime.enable");
  const evaluate = async expression => {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result.value;
  };
  const waitFor = async (expression, label) => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return;
      await sleep(70);
    }
    throw new Error("等待超时 " + label + ": " + expression);
  };
  const sel = s => "document.querySelector(" + JSON.stringify(s) + ")";
  const textOf = s => evaluate(sel(s) + "?.innerText");
  const click = async selector => {
    if (!await evaluate(sel(selector) + " !== null")) throw new Error("找不到 " + selector);
    const point = await evaluate("(()=>{const e=" + sel(selector) +
      ";e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});const r=e.getBoundingClientRect();" +
      "const x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:e.contains(document.elementFromPoint(x,y))};})()");
    assert.ok(point.hit, "控件未处于可点击位置 " + selector + " " + JSON.stringify(point));
    for (const type of ["mousePressed", "mouseReleased"])
      await send("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, button: "left", clickCount: 1 });
  };
  const press = async key => {
    for (const type of ["keyDown", "keyUp"])
      await send("Input.dispatchKeyEvent", { type, key, code: key, windowsVirtualKeyCode: key === "Enter" ? 13 : 27 });
  };
  const ready = () => waitFor("!!document.querySelector('h1')", "页面渲染");
  const route = () => evaluate("Object.fromEntries(new URLSearchParams(location.hash.startsWith('#?') ? location.hash.slice(2) : location.search))");
  const shot = async name => {
    const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, name), Buffer.from(data, "base64"));
  };
  const viewport = (width, height, mobile = false) => send("Emulation.setDeviceMetricsOverride",
    { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height });
  const noOverflow = async label => {
    const [content, viewport] = await evaluate("[document.documentElement.scrollWidth, innerWidth]");
    assert.ok(content <= viewport, label + " 页面宽度 " + content + " / " + viewport);
  };
  const timeline = () => evaluate("Number(document.querySelector('.timeline [aria-current=step]').dataset.seq)");
  const chapters = JSON.parse(await readFile(path.join(root, "data/chapters.json"), "utf8"));
  const traces = JSON.parse(await readFile(path.join(root, "data/runs.json"), "utf8"));
  function report(message) { reports.push(message); console.log("PASS", message); }

  await viewport(1440, 960);
  await send("Page.navigate", { url: base + "lab.html" });
  await ready();
  assert.equal(await textOf("h1"), "Agent Loop");
  assert.equal(await evaluate("document.querySelectorAll('#sidebar .chapter').length"), 20);
  assert.match(await textOf(".progress small"), /已读 1 章.*通过 0 章/);
  await shot("s01-desktop.png");
  report("s01 首屏可读，目录列出 20 章，首次打开记已读 1、练习通过 0。");

  await click("[data-tab=explore]");
  await click("[data-answer=" + JSON.stringify(String((chapters[0].answer + 1) % 3)) + "]");
  assert.match(await textOf(".feedback"), /再看/);
  assert.match(await textOf(".progress small"), /通过 0 章/);
  await click("[data-answer=" + JSON.stringify(String(chapters[0].answer)) + "]");
  assert.match(await textOf(".feedback"), /正确/);
  assert.match(await textOf(".progress small"), /已读 1 章.*通过 1 章/);
  report("s01 答错保留未通过状态，答对才增加通过数。");

  await click("#sidebar [data-chapter=s03]");
  await click("[data-tab=sim]");
  await click("[data-scenario=failure]");
  const index = traces.s03.failure.findIndex(e => e.semanticStep === "permission-resolved");
  await click("[data-seq=\"" + index + "\"]");
  const checkpoint = (await route()).step;
  const initialCard = await textOf("#framework-impl .frame-body");
  const priorState = await textOf(".state-pair");
  for (const framework of ["dsh", "agentscope"]) {
    await click("[data-fw=" + framework + "]");
    assert.deepEqual(await route(), { chapter: "s03", harness: framework, tab: "sim", scenario: "failure", step: checkpoint });
    assert.equal(await textOf(".state-pair"), priorState);
    assert.notEqual(await textOf("#framework-impl .frame-body"), initialCard);
  }
  const savedURL = await evaluate("location.href");
  await send("Page.reload", { ignoreCache: true });
  await ready();
  assert.equal(await evaluate("location.href"), savedURL);
  assert.equal(await timeline(), index);
  assert.equal(await textOf(".state-pair"), priorState);
  assert.match(await textOf(".progress small"), /通过 1 章/);
  await click("[data-sim=reset]");
  assert.equal(await timeline(), 0);
  await click("[data-conceal]");
  assert.match(await textOf(".timeline [data-seq='1']"), /等待单步揭晓/);
  await click("[data-sim=step]");
  assert.equal(await timeline(), 1);
  assert.doesNotMatch(await textOf(".timeline [data-seq='1']"), /等待单步揭晓/);
  assert.match(await textOf(".timeline [data-seq='2']"), /等待单步揭晓/);
  await click("[data-conceal]");
  await click("[data-sim=back]");
  assert.equal(await timeline(), 0);
  await click("[data-sim=play]");
  await waitFor("Number(document.querySelector('.timeline [aria-current=step]').dataset.seq)>0", "自动播放前进");
  await click("[data-sim=play]");
  const paused = await timeline();
  await sleep(1300);
  assert.equal(await timeline(), paused);
  await click("[data-seq=\"" + (traces.s03.failure.length - 1) + "\"]");
  assert.deepEqual(JSON.parse(await textOf(".state-pair > :last-child pre")),
    { actual: 350, expected: 700, passed: false, fileBytesChanged: false });
  await shot("s03-denial-desktop.png");
  await click("[data-event-source]");
  assert.equal((await route()).view, "full");
  assert.ok(await textOf(".code code"));
  assert.ok(await evaluate("!!document.querySelector('#source-target')"), "教学事件应定位到源定义");
  await click("footer [data-chapter=s04]");
  assert.equal((await route()).harness, "agentscope");
  assert.equal((await route()).tab, "source");
  await click("footer [data-chapter=s03]");
  assert.equal(await textOf("h1"), "Permission");
  report("s03 三家切换保留拒绝场景与权限检查点，内容改变；刷新、跨章导航、隐藏后续事件并逐步揭晓、播放暂停、重置和源码定位均通过。");

  await click("#sidebar [data-chapter=s08]");
  await click("[data-tab=sim]");
  for (const scenario of ["normal", "failure"]) {
    await click("[data-scenario=" + scenario + "]");
    const compressed = traces.s08[scenario].findIndex(e => e.semanticStep === "context-compacted");
    await click("[data-seq=" + JSON.stringify(String(compressed)) + "]");
    const visible = JSON.parse(await textOf(".state-pair > :last-child pre")).messages;
    assert.match(JSON.stringify(visible), /700/);
    assert.equal(JSON.stringify(visible).includes("total_cents"), scenario === "normal");
    await click("[data-seq=\"" + (traces.s08[scenario].length - 1) + "\"]");
    const state = JSON.parse(await textOf(".state-pair > :last-child pre"));
    assert.equal(state.constraintVisible, scenario === "normal");
    assert.equal(state.originalIntact, true);
  }
  report("s08 两个终态均保留原始记录，失败摘要保留 700，却丢失 total_cents 接口约束。");

  await viewport(390, 844, true);
  await click("#menu");
  assert.equal(await evaluate("document.querySelector('#menu').getAttribute('aria-expanded')"), "true");
  await press("Escape");
  assert.equal(await evaluate("document.activeElement.id"), "menu");
  await click("#menu");
  await click("#sidebar [data-chapter=s20]");
  assert.equal(await textOf("h1"), "Comprehensive Agent");
  for (const mode of ["learn", "source", "explore", "sim"]) {
    await click("[data-tab=" + mode + "]");
    await noOverflow("s20 " + mode);
  }
  assert.equal(await evaluate("document.querySelector('footer .next') === null"), true);
  for (const scenario of ["normal", "failure"]) {
    await click("[data-scenario=" + scenario + "]");
    await click("[data-seq=\"" + (traces.s20[scenario].length - 1) + "\"]");
    const state = JSON.parse(await textOf(".state-pair > :last-child pre"));
    assert.equal(state.completed, scenario === "normal");
    assert.equal(state.tests.count, scenario === "normal" ? 2 : 1);
  }
  await click("[data-tab=learn]");
  await evaluate("scrollTo({top:0,behavior:'instant'})");
  await shot("s20-mobile.png");
  report("390 × 844 窄屏菜单、Esc、四个标签、章节边界无误，s20 无整页横向溢出。允许与拒绝终态分别显示两项通过和一项失败。");

  await send("Page.navigate", { url: fileURL + "?chapter=s03&harness=dsh&tab=sim&scenario=failure" });
  await ready();
  await click("[data-sim=step]");
  await waitFor("document.querySelector('.timeline [aria-current=step]')?.dataset.seq === '1'", "单文件步骤");
  assert.equal((await route()).harness, "dsh");
  assert.equal((await route()).chapter, "s03");
  assert.ok((await route()).step);
  const fileCheckpoint = await route();
  await click("[data-scroll=framework-impl]");
  assert.deepEqual(await route(), fileCheckpoint);
  await send("Page.reload", { ignoreCache: true });
  await ready();
  assert.equal(await timeline(), 1);
  assert.deepEqual(await route(), fileCheckpoint);
  report("dist/lab.html 直接打开可从 URL 恢复 s03 的 dsh 拒绝场景，离线单步、页内锚点和刷新后恢复均正常。");
  // Walk the complete chapter matrix through visible UI handlers in the standalone browser document.
  const allCards = await evaluate(`(() => {
    const rows = [];
    const data = JSON.parse(document.querySelector('#packed').textContent);
    const q = s => document.querySelector(s);
    for (const chapter of data.chapters) {
      q('#sidebar [data-chapter='+chapter.id+']').click();
      q('[data-tab=source]').click();
      q('[data-code=origin]').click();
      for (const name of ['hermes','dsh','agentscope']) {
        q('[data-fw='+name+']').click();
        const card = data.mappings[chapter.id][name];
        if (q('h1').textContent !== chapter.title ||
            q('#framework-impl h3').textContent !== card.title ||
            q('#framework-impl .source-link').href !== card.url) {
          throw Error(chapter.id + ' ' + name);
        }
        rows.push(chapter.id+'-'+name);
      }
      q('[data-tab=sim]').click();
      for (const key of ['normal','failure']) {
        q('[data-scenario='+key+']').click();
        const trace = data.runs[chapter.id][key];
        q('[data-seq="'+(trace.length-1)+'"]').click();
        if (q('.event h3').textContent !== trace.at(-1).title) throw Error(chapter.id+' '+key);
      }
    }
    return rows.length;
  })()`);
  assert.equal(allCards, 60);
  report("单文件界面走遍 20 章，60 张框架卡的标题和固定源码链接均随选择切换，40 条模拟路径均可走到末步。");
  assert.deepEqual(client.errors, []);
  report("浏览器未捕获页面未处理的 JavaScript 异常。");
  await writeFile(path.join(root, "research", "browser-check.json"),
    JSON.stringify({ browser: product, desktop: [1440, 960], mobile: [390, 844], verified: reports }, null, 2) + "\n");
} finally {
  if (client) { await client.send("Browser.close").catch(() => {}); client.ws.close(); }
  for (const child of owners.reverse()) await closeChild(child);
  if (profile) {
    const resolved = await realpath(profile);
    const tempRoot = await realpath(os.tmpdir());
    if (path.dirname(resolved) === tempRoot && path.basename(resolved).startsWith("harness-course-chrome-"))
      await rm(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
}
