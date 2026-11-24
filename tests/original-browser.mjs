// Compare the public Chinese course with the locally archived course in Chrome.
// node tests/original-browser.mjs online
// node tests/original-browser.mjs verify http://127.0.0.1:8765
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const research = path.join(root, "research");
const refFile = path.join(research, "original-verification-online.json");
const diffFile = path.join(research, "original-verification.json");
const upstream = "https://learn.shareai.run";
const mode = process.argv[2] || "verify";
const local = new URL(process.argv[3] || "http://127.0.0.1:8765").origin;
const chapters = ["home", ...Array.from({ length: 20 }, (_, i) => "s" + String(i + 1).padStart(2, "0"))];
const routes = [...chapters, "timeline", "compare", "layers"];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = text => createHash("sha256").update(text).digest("hex");

async function launch() {
  const executable = [process.env.BROWSER_EXE,
    path.join(process.env.ProgramFiles || "", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft/Edge/Application/msedge.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium",
  ].find(p => p && existsSync(p));
  if (!executable) throw new Error("请在 BROWSER_EXE 指定 Chrome 或 Edge。");
  const tmp = await realpath(os.tmpdir());
  const profile = await mkdtemp(path.join(tmp, "harness-original-audit-"));
  const browser = spawn(executable, ["--headless=new", "--disable-quic", "--disable-gpu", "--disable-extensions",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    "--disable-background-networking", "--no-first-run", "--no-default-browser-check", "--window-size=1440,900",
    "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", "--user-data-dir=" + profile, "about:blank"],
    { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("浏览器启动超时")), 15000);
    browser.once("error", reject);
    browser.once("exit", code => { clearTimeout(timeout); reject(new Error("浏览器退出 " + code)); });
    let buffer = "";
    browser.stderr.on("data", data => {
      buffer = (buffer + data).slice(-4000);
      const found = buffer.match(/ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[a-f0-9-]+/i);
      if (found) { clearTimeout(timeout); resolve(found[0]); }
    });
  });
  const socket = new WebSocket(endpoint);
  await once(socket, "open");
  const pending = new Map();
  const listeners = new Map();
  let seq = 0;
  socket.addEventListener("message", e => {
    const msg = JSON.parse(e.data);
    if (msg.method) { listeners.get(msg.sessionId)?.(msg); return; }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.error) p.fail(new Error(msg.error.message));
    else p.done(msg.result);
  });
  function send(method, params = {}, sessionId) {
    return new Promise((done, fail) => {
      const id = ++seq;
      const timer = setTimeout(() => { pending.delete(id); fail(new Error("CDP timeout " + method)); }, 30000);
      pending.set(id, { done, fail, timer });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  async function page(blockExternal) {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const call = (method, args) => send(method, args, sessionId);
    await call("Page.bringToFront");
    const errors = [];
    const blocked = new Set();
    const inFlight = new Set();
    const requested = new Map();
    let activity = Date.now();
    listeners.set(sessionId, msg => {
      const p = msg.params;
      if (msg.method === "Network.requestWillBeSent" && ["Document","Stylesheet","Image","Font","Script","Fetch","XHR"].includes(p.type)) {
        inFlight.add(p.requestId);requested.set(p.requestId,[p.type,p.request.url]); activity = Date.now();
      }
      if(msg.method==="Network.loadingFailed"&&!p.canceled&&requested.has(p.requestId))
        errors.push([...requested.get(p.requestId),p.errorText]);
      if ((msg.method === "Network.loadingFinished" || msg.method === "Network.loadingFailed") && inFlight.delete(p.requestId)) activity = Date.now();
      if (msg.method === "Network.responseReceived" && p.response.status >= 400)
        errors.push([p.response.url, p.response.status]);
      if (msg.method === "Runtime.exceptionThrown") errors.push(["javascript", p.exceptionDetails.exception?.description?.split("\n")[0] || p.exceptionDetails.text]);
      if (msg.method === "Fetch.requestPaused") {
        const u = new URL(p.request.url);
        const external = ["http:", "https:"].includes(u.protocol) && u.origin !== local;
        if (external) blocked.add(u.origin + u.pathname);
        call(external ? "Fetch.failRequest" : "Fetch.continueRequest", external
          ? { requestId: p.requestId, errorReason: "BlockedByClient" } : { requestId: p.requestId }).catch(() => {});
      }
    });
    await Promise.all([call("Runtime.enable"), call("Network.enable"), call("Page.enable")]);
    if (blockExternal) await call("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    const evalJS = async expression => {
      const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const wait = async (predicate, label, timeout = 20000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        try { if (await evalJS(predicate)) return; } catch {}
        await sleep(100);
      }
      throw new Error(label + " 超时 " + JSON.stringify(await evalJS("[location.href,document.title,document.body?.innerText?.slice(0,120)]")));
    };
    const settled = async (maxWait=10000) => {
      const deadline = Date.now() + maxWait;
      while (Date.now() < deadline && (inFlight.size || Date.now()-activity < 400)) await sleep(80);
      await sleep(90);
    };
    return { call, evalJS, wait, settled, errors, blocked, close: () => send("Target.closeTarget", { targetId }) };
  }
  async function close() {
    await send("Browser.close").catch(() => {});
    socket.close();
    if (browser.exitCode === null) await Promise.race([once(browser, "close"), sleep(1500)]);
    if (browser.exitCode === null) browser.kill();
    const resolved = await realpath(profile);
    if (path.dirname(resolved) === tmp && path.basename(resolved).startsWith("harness-original-audit-"))
      await rm(resolved, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
  }
  return { page, close, version: (await send("Browser.getVersion")).product };
}

// This runs inside the page. Its output records hashes, element counts and resource paths.
function takeSnapshot() {
  const main = document.querySelector("main");
  const visible = el => el.getClientRects().length > 0;
  const all = selector => [...main.querySelectorAll(selector)].filter(visible);
  const media = el => ({ src: new URL(el.currentSrc || el.src).pathname, alt: el.alt, width: el.naturalWidth, height: el.naturalHeight });
  const controls = all("button,input,select").map(el => ({
    type: el.type || el.tagName, label: el.innerText.trim() || el.title || el.getAttribute("aria-label") || "", disabled: el.disabled,
  }));
  let text = main.innerText.replaceAll("\r", "");
  const isHome = /\/zh\/?$/.test(location.pathname);
  if (isHome) {
    // The homepage plays a looping demonstration. Check its code, controls and
    // presence separately, while hashing the surrounding article text exactly.
    text = text.replace(/(观察 Agent 循环执行时消息数组的增长)[\s\S]*?(学习路径)/, "$1\n[dynamic message history]\n$2");
  }
  const code = all("pre").filter(el => !isHome || el.innerText.includes("client.messages.create")).map(el => el.textContent);
  return { text, code, details: all("details").map(el=>el.textContent), simulatorUnavailable: text.includes("Simulator scenario is not available for this lesson yet."),
    headings: all("h1,h2,h3,h4").map(el => el.innerText.trim()), controls,
    images: all("img").map(media), svg: all("svg").map(el => [el.getAttribute("viewBox"),
      [...el.querySelectorAll("path")].map(p => p.getAttribute("d")).join("|"), el.textContent.trim()]),
    links: all("a[href]").map(el => [el.innerText, el.getAttribute("href")]),
    sectionLinks: [...new Set(all("a[href]").map(el => new URL(el.href).pathname).filter(p => /^\/zh\/s\d{2}\/?$/.test(p)))].sort() };
}

async function snapshot(page, home) {
  await page.settled();
  // Request each lazy article image as a reader scrolling through the lesson would.
  await page.evalJS(`(async()=>{const images=[...document.querySelectorAll("main img")].filter(el=>el.getClientRects().length);
    for (const img of images) {img.scrollIntoView({behavior:"instant",block:"center"});await Promise.race([img.decode().catch(()=>{}),new Promise(r=>setTimeout(r,6500))]);}
    window.scrollTo({top:0,behavior:"instant"})})()`);
  if(await page.evalJS("/\\/s\\d{2}\\/?$/.test(location.pathname)")){
    await page.wait("[...document.querySelectorAll('main button[title=\"Next step\"]')].some(x=>x.getClientRects().length)", "可操作的章节总览图", 9000);
  }
  await sleep(150);
  const value = await page.evalJS("(" + takeSnapshot.toString() + ")()");
  const { text, code, svg, links, details, ...fields } = value;
  return { textHash: digest(text), textLength: text.length, codeBlocks: code.length, codeHash: digest(code.join("\n␞\n")),
    svgCount: svg.length, svgHash: digest(JSON.stringify(svg)), linkCount: links.length, linkHash: digest(JSON.stringify(links)),
    detailsCount: details.length, detailsHash: digest(details.join("\n␞\n")), ...fields };
}

const labels = ["学习", "模拟", "源码", "深入探索"];
const byLabel = label => "[...document.querySelectorAll('main button')].find(b=>b.innerText.trim()===" + JSON.stringify(label) + ")";
async function selectTab(page, label) {
  const button = byLabel(label);
  await page.wait("(()=>{const b=" + button + ";if(!b)return false;if(b.classList.contains('border-b-2'))return true;b.click();return false;})()", "切换 " + label);
  await sleep(200);
}
async function exerciseSimulator(page) {
  // This is the tab's separate simulator. The animated diagram above the four
  // tabs has its own English 'Next step' and 'Reset' controls.
  return page.evalJS(`(async()=>{
    const section=[...document.querySelectorAll("main h2")].find(h=>h.innerText==="Agent 循环模拟器")?.closest("section");
    if(!section)return {status:"missing"};
    const btns=[...section.querySelectorAll("button[title]")];
    if(!btns.length)return {status:"unavailable",note:section.innerText.trim().split("\\n").at(-1)};
    const [play,step,reset]=btns;
    const counter=section.querySelector(".tabular-nums");
    const getCount=()=>Number(counter.innerText.match(/\\d+/)?.[0]);
    const total=Number(counter.innerText.match(/\\d+/g).at(-1));
    if(!Number.isFinite(total)||total<=0||total>150)throw new Error("未知模拟步数 "+counter.innerText);
    const order=[];
    async function waitFor(n){
      for(let i=0;i<35;i++){
        if(getCount()===n)return;
        await new Promise(r=>setTimeout(r,20));
      }
      throw new Error("模拟器步数停留在 "+counter.innerText);
    }
    for(let n=1;n<=total;n++){step.click();await waitFor(n);order.push(getCount());}
    const result={status:"available",total,order,finalText:section.innerText,stepDisabled:step.disabled,playDisabled:play.disabled};
    reset.click();await waitFor(0);
    result.resetToStart=getCount()===0&&!step.disabled;
    return result;
  })()`);
}
async function captureChapter(browser, base, id, offline) {
  const page = await browser.page(offline);
  const url = base + "/zh/" + (id === "home" ? "" : id + "/");
  try {
    await page.call("Page.navigate", { url });
    await page.wait("document.readyState === 'complete' && !!document.querySelector('main h1')", "读取 " + id);
    if (!/^s\d{2}$/.test(id)) {
      const info = await snapshot(page);
      if(id==="compare"){
        await page.evalJS("(()=>{const selects=[...document.querySelectorAll('main select')];for(const [i,s] of selects.entries()){s.value=s.options[i+1].value;s.dispatchEvent(new Event('change',{bubbles:true}));}})()");
        await page.wait("document.querySelectorAll('main h2,main h3,main table').length>0","选择两版的实际比较内容");
        const pair=await snapshot(page);
        assert.notEqual(info.textHash,pair.textHash);
        info.selectedVersionsHash=pair.textHash;
      }
      return { tabs: { page: info }, errors: page.errors, blocked: [...page.blocked] };
    }
    const tabs = {};
    for (const label of labels) {
      await selectTab(page, label);
      tabs[label] = await snapshot(page);
      if (label==="学习") {
        const opened=await page.evalJS("(()=>{const ds=[...document.querySelectorAll('main details')].filter(x=>x.getClientRects().length&&!x.open);ds.forEach(x=>x.querySelector('summary')?.click());return ds.length;})()");
        if (opened) {
          const expanded=await snapshot(page);
          tabs[label].expandedArticle={textHash:expanded.textHash,codeHash:expanded.codeHash,images:expanded.images};
          await page.evalJS("document.querySelectorAll('main details[open]').forEach(x=>x.querySelector('summary')?.click())");
        }
      }
      if (label === "模拟") {
        const next = "[...document.querySelectorAll('button[title=\"Next step\"]')].find(x=>x.getClientRects().length)";
        const reset = "[...document.querySelectorAll('button[title=\"Reset\"]')].find(x=>x.getClientRects().length)";
        const previous = "[...document.querySelectorAll('button[title=\"Previous step\"]')].find(x=>x.getClientRects().length)";
        if (await page.evalJS(next + " && !" + next + ".disabled")) {
          await page.evalJS(next + ".click()");
          await page.wait(previous + " && !" + previous + ".disabled", id + " 示意图单步");
          tabs[label].afterStep = (await snapshot(page)).textHash;
          await page.evalJS(reset + ".click()");
          await page.wait(previous + "?.disabled", id + " 示意图重置");
          await sleep(480);
          tabs[label].resetRestored = true;
        }
        const sim=await exerciseSimulator(page);
        if(sim.finalText){sim.finalTextHash=digest(sim.finalText); delete sim.finalText;}
        tabs[label].simulator=sim;
      }
      if (label === "深入探索") {
        const decisions = await page.evalJS("[...([...document.querySelectorAll('h2,h3,h4')].find(h=>h.innerText.trim()==='设计决策')?.parentElement.querySelectorAll('button')||[])].filter(b=>b.getClientRects().length && b.innerText.trim()).map(b=>b.innerText.trim())");
        tabs[label].openedDecisions = [];
        for (const decision of decisions) {
          const ref = byLabel(decision);
          const before = await page.evalJS("document.querySelector('main').innerText");
          await page.evalJS(ref + ".click()");
          await page.wait("document.querySelector('main').innerText !== " + JSON.stringify(before), "展开设计问题");
          tabs[label].openedDecisions.push((await snapshot(page)).textHash);
          await page.evalJS(ref + ".click()");
        }
      }
    }
    return { tabs, errors: page.errors, blocked: [...page.blocked] };
  } catch(error) {
    return {error:String(error.message),errors:page.errors,blocked:[...page.blocked]};
  } finally { await page.close(); }
}

async function captureAll(browser, base, offline, previousPages={}) {
  const results = {...previousPages};
  const wanted=process.env.CHECK_ROUTES?.split(",").filter(k=>routes.includes(k));
  const queue = [...(wanted?.length?wanted:routes)];
  async function worker(owner) {
    for (let id; (id = queue.shift());) {
      try { results[id] = await captureChapter(owner, base, id, offline); }
      catch (error) { results[id] = { error: String(error.message) }; }
      results[id].origin=base;
      results[id].capturedAt=new Date().toISOString();
      console.log(offline ? "local" : "online", id, results[id].error || "OK");
    }
  }
  // One foreground document per Chromium instance. The source app renders
  // lesson diagrams lazily when they become visible to IntersectionObserver.
  const second=await launch();
  try {await Promise.all([worker(browser),worker(second)]);}finally{await second.close();}
  return Object.fromEntries(routes.map(id => [id, results[id]]));
}

function discrepancies(reference, localPages) {
  const findings = [];
  for (const id of routes) {
    const ref = reference[id], current = localPages[id];
    if (!ref?.tabs || !current?.tabs) { findings.push([id, ref?.error || "", current?.error || ""]); continue; }
    for (const [tab, expected] of Object.entries(ref.tabs)) {
      const actual = current.tabs[tab];
      for (const key of Object.keys(expected)) {
        if (JSON.stringify(expected[key]) !== JSON.stringify(actual?.[key]))
          findings.push([id, tab, key, expected[key], actual?.[key]]);
      }
      for (const img of actual?.images || []) if (!img.width) findings.push([id, tab, "broken image", img.src]);
    }
    if (current.errors.length) findings.push([id, "local browser errors", current.errors]);
    if (current.blocked.length) findings.push([id, "external requests from offline course", current.blocked]);
  }
  return findings;
}

async function exerciseReader(browser) {
  const page = await browser.page(true);
  const win = "document.querySelector('#original-frame').contentWindow";
  const doc = win + ".document";
  const actualPage = (slug) => win + ".location.pathname===" + JSON.stringify(slug === "home" ? "/zh/" : "/zh/" + slug + "/");
  const byQuery = selector => "document.querySelector("+JSON.stringify(selector)+")";
  const action = selector => page.evalJS(byQuery(selector)+".click()");
  const choose = async (selector, value) => {
    await page.evalJS("(()=>{const el="+byQuery(selector)+";el.value="+JSON.stringify(value)+";el.dispatchEvent(new Event('change',{bubbles:true}));})()");
  };
  const waitChapter = async id => {
    await page.wait(actualPage(id) + " && " + doc+".readyState==='complete' && !!"+doc+".querySelector('main h1')", "对读所在章节 "+id);
    await page.settled(650);
  };
  const shot = async name => {
    const { data } = await page.call("Page.captureScreenshot", { format:"png", captureBeyondViewport:false });
    const dir=path.join(research,"screenshots");
    await mkdir(dir,{recursive:true});
    await writeFile(path.join(dir,name),Buffer.from(data,"base64"));
  };
  const checks = [], findings=[];
  const expected = JSON.parse(await readFile(path.join(root,"data/original-crosswalk.json"),"utf8"));
  try {
    await page.call("Page.navigate",{url:local+"/"});
    await waitChapter("home");
    assert.match(await page.evalJS(doc+".querySelector('main h1').innerText"),/Learn Claude Code/i);
    await shot("original-home.png");
    checks.push("默认入口的阅读区显示原站中文首页。");
    for (const [i, heading] of ["核心模式","消息增长"].entries()){
      await choose("#concept",String(i));await action("#locate");
      await page.wait(win+".getSelection().toString().trim()==="+JSON.stringify(heading),"首页原文定位 "+heading);
      assert.ok(await page.evalJS("document.querySelector('#responses article p').innerText.length>0"));
    }
    checks.push("首页的核心模式和消息增长两个问题均定位到对应原文。");
    await page.call("Page.navigate",{url:local+"/?chapter=s03&harness=dsh&mode=original"});
    await waitChapter("s03");
    await page.wait(byQuery("[data-framework=dsh]") + "?.getAttribute('aria-pressed')==='true'", "框架路由");
    // Use the source tab so a framework-only update cannot silently reset the reader.
    const tab = text => "[..."+doc+".querySelectorAll('main button')].find(e=>e.innerText.trim()==="+JSON.stringify(text)+")";
    await page.wait("(()=>{const e="+tab("源码")+";if(!e)return false;if(e.classList.contains('border-b-2'))return true;e.click();return false})()", "原文源码标签");
    await page.wait("new URL(location.href).searchParams.get('originalTab')==='source'", "外层路由同步原页标签");
    await page.evalJS(win+".scrollTo({top:620,behavior:'instant'});window.__auditOriginalDocument="+doc+";true");
    await sleep(140);
    const y=await page.evalJS(win+".scrollY");
    const cardTexts = new Set();
    for (const id of ["dsh","hermes","agentscope"]) {
      await action("[data-framework="+id+"]");
      assert.equal(await page.evalJS("window.__auditOriginalDocument==="+doc),true);
      assert.equal(await page.evalJS(win+".scrollY"),y);
      assert.equal(await page.evalJS(tab("源码")+".classList.contains('border-b-2')"),true);
      cardTexts.add(await page.evalJS("document.querySelector('#responses article>p')?.innerText"));
    }
    assert.equal(cardTexts.size,3);
    await page.wait("!!document.querySelector('[data-locate-tab]')","源码页内定位按钮");
    const needle=await page.evalJS("document.querySelector('[data-locate-tab]').textContent.replace('在当前页签定位 ','')");
    await action("[data-locate-tab]");
    assert.ok((await page.evalJS(win+".getSelection().toString()")).includes(needle));
    assert.equal(await page.evalJS(tab("源码")+".classList.contains('border-b-2')"),true);
    await page.evalJS(tab("模拟")+".click()");
    const simStep=doc+".querySelector('button[title=\"单步\"]')";
    await page.wait("!!"+simStep,"原网页签内模拟器加载");
    await page.evalJS(simStep+".click()");
    const counter=simStep+".closest('section').querySelector('.tabular-nums').innerText";
    await page.wait("Number("+counter+".match(/\\d+/)[0])===1","进入原版模拟第一步");
    assert.equal(await page.evalJS("document.querySelector('[data-framework=agentscope]').getAttribute('aria-pressed')"),"true");
    for(const name of ["dsh","hermes","agentscope"]){
      await action("[data-framework="+name+"]");
      assert.equal(await page.evalJS("Number("+counter+".match(/\\d+/)[0])"),1);
      assert.equal(await page.evalJS("window.__auditOriginalDocument==="+doc),true);
    }
    await page.evalJS(tab("源码")+".click()");
    await page.wait("new URL(location.href).searchParams.get('originalTab')==='source'", "从模拟返回源码");
    checks.push("s03 可在源码页签定位实际符号并保留标签，原版模拟推进一步后切换三家，原页文档和步数均保留。");
    await action("[data-all]");
    assert.equal(await page.evalJS("document.querySelectorAll('#responses article').length"),3);
    checks.push("s03 切换三家和并排对照，左侧 Document 实例、源码标签及滚动坐标保持不变。");
    await action("#locate");
    await page.wait(tab("学习")+".classList.contains('border-b-2') && "+win+".getSelection().toString().trim().length>0", "从源码定位学习正文");
    await shot("original-s03-located.png");
    const next=doc+".querySelector('main a[href=\"/zh/s04/\"]')";
    await page.evalJS(next+".click()");
    await waitChapter("s04");
    await page.wait("new URL(location.href).searchParams.get('chapter')==='s04' && document.querySelector('#side-heading').innerText.includes('S04')","原文链接跳转与右侧同步");
    checks.push("从源码标签定位可返回学习正文，点击原页 s04 链接后右栏与外层 URL 自动跟随。");

    let points=0;
    for(const id of chapters.filter(k=>k!=="home")){
      await choose("#chapter",id);await waitChapter(id);
      for(let index=0;index<expected[id].length;index++){
        const pt=expected[id][index];points++;
        if(expected[id].length>1) await choose("#concept",String(index));
        await action("#locate");
        await sleep(90);
        const observation=await page.evalJS(`(()=>{
          const frame=document.querySelector("#original-frame"),w=frame.contentWindow,s=w.getSelection();
          const r=s.rangeCount?s.getRangeAt(0):null,rect=r?.getBoundingClientRect();
          const f=[...document.querySelectorAll("#responses article")].map(a=>({name:a.querySelector("h3")?.innerText,
            text:a.querySelector("article>p")?.innerText,grade:a.querySelector(".grade")?.innerText,link:a.querySelector("a")?.href}));
          return {selected:s.toString().trim(),visible:!!rect&&rect.bottom>0&&rect.top<frame.clientHeight,question:document.querySelector("#questions h2").innerText,frames:f};
        })()`);
        const normalize=value=>value.replace(/\s+/g," ").trim();
        const found=normalize(observation.selected).includes(normalize(pt.find));
        if(!found||!observation.visible||observation.question!==pt.question||observation.frames.length!==3 ||
          !observation.frames.every(x=>x.text&&x.grade&&x.link?.startsWith("https://")))
          findings.push({id,index,expected:pt.find,found,visible:observation.visible,grades:observation.frames.map(f=>f.grade),selected:observation.selected.slice(0,100)});
      }
    }
    checks.push(points+" 个原课对照点逐个点击，并检查选中原文、视口位置、右栏问题、三家答案和来源等级。");
    await page.call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await page.wait("document.body.classList.contains('closed')","窄屏默认阅读");
    await action("#toggle");
    assert.equal(await page.evalJS("document.querySelector('#toggle').getAttribute('aria-expanded')"),"true");
    assert.ok(await page.evalJS("document.documentElement.scrollWidth<=innerWidth"));
    await shot("original-mobile-comparison.png");
    await action("#locate");
    assert.equal(await page.evalJS("document.body.classList.contains('closed')"),true);
    checks.push("390px 窄屏可打开对照和定位后返回原文，外层页面无横向溢出。");
    return {checks,anchorFindings:findings,points,errors:page.errors,blocked:[...page.blocked]};
  } finally { await page.close(); }
}

async function exercisePractice(browser) {
  const page = await browser.page(true);
  const element = selector => "document.querySelector(" + JSON.stringify(selector) + ")";
  const frame = element("#original-frame") + ".contentWindow";
  const doc = frame + ".document";
  const qs = key => "new URL(location.href).searchParams.get(" + JSON.stringify(key) + ")";
  const click = selector => page.evalJS(element(selector) + ".click()");
  const shown = selector => "!!" + element(selector) + "?.getClientRects().length";
  const resolved = [];
  const checked = [];
  const norm = s => String(s ?? "").replace(/\s+/g, "");
  const matchesSection = (chunk, source) => norm(source).includes(norm(chunk));
  const activeTab = "[..."+doc+".querySelectorAll('main button')].find(b=>b.classList.contains('border-b-2'))?.textContent.trim()";
  async function waitChapter(id) {
    await page.wait(frame + ".location.pathname===" + JSON.stringify("/zh/"+id+"/") +
      " && " + doc + ".readyState==='complete' && !!"+doc+".querySelector('main h1')", "原文载入 "+id);
    await page.settled(350);
  }
  async function ensurePanel() {
    if (!await page.evalJS(shown("#practice-panel"))) await click("#practice-open");
    await page.wait(shown("#practice-panel"),"练习面板展开");
  }
  async function chooseChapter(id) {
    const wasOpen=await page.evalJS(shown("#practice-panel"));
    await page.evalJS("(()=>{const s=document.querySelector('#chapter');s.value="+JSON.stringify(id)+";s.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await waitChapter(id);
    if(wasOpen)assert.equal(await page.evalJS(shown("#practice-panel")),true,id+" 切章保持练习打开");
    await ensurePanel();
  }
  async function selected(needle,label) {
    await page.wait("(()=>{const s="+frame+".getSelection();if(!s||!s.rangeCount)return false;"+
      "const rect=s.getRangeAt(0).getBoundingClientRect();return s.toString().replace(/\\s+/g,'').includes(" +
      JSON.stringify(norm(needle)) + ")&&rect.bottom>0&&rect.top<document.querySelector('#original-frame').clientHeight})()",label);
  }
  function panelContents() {
    const task=document.querySelector("[data-original-tasks]");
    const own=document.querySelector("[data-observation]");
    const expected=document.querySelector("#practice-expected");
    return {original:task?.innerText, code:[...task.querySelectorAll("pre")].map(b=>b.textContent),
      observation:own?.innerText,hint:expected?.querySelector("summary")?.innerText,opened:expected?.open};
  }
  async function articleSections(headings) {
    const readInPage = headings => {
      const article = document.querySelector("#original-frame").contentDocument.querySelector(".prose-custom");
      const nodes = [...article.querySelectorAll("h2,h3,h4")];
      return headings.map(title => {
        const h = nodes.find(el => el.textContent.trim() === title);
        if (!h) return null;
        const text = [];
        for (let next=h.nextElementSibling; next; next=next.nextElementSibling) {
          if (/^H[1-6]$/.test(next.tagName) && Number(next.tagName[1]) <= Number(h.tagName[1])) break;
          text.push(next.textContent);
        }
        return text.join("\n");
      });
    };
    return page.evalJS("(" + readInPage.toString() + ")(" + JSON.stringify(headings) + ")");
  }
  try {
    await page.call("Page.navigate",{url:local+"/?chapter=s03&mode=original&harness=dsh&practice=1"});
    await waitChapter("s03");
    await page.wait(shown("#practice-panel"),"直达链接自动展开练习");
    const data=await page.evalJS("(()=>{const {practiceOriginal,practicePrompts,crosswalk}=JSON.parse(document.querySelector('#reader-data').textContent);return {practiceOriginal,practicePrompts,crosswalk}})()");
    const ids=chapters.filter(k=>k!=="home");
    assert.deepEqual(Object.keys(data.practiceOriginal).sort(),ids);
    assert.deepEqual(Object.keys(data.practicePrompts).sort(),ids);
    const prediction="拒绝写入后，先检查文件是否保持原状。";
    await page.evalJS("(()=>{const n=document.querySelector('#practice-note');n.value="+JSON.stringify(prediction)+";n.dispatchEvent(new Event('input',{bubbles:true}));})()");
    const startingURL=await page.evalJS("location.href");
    await page.call("Page.reload",{ignoreCache:true});await waitChapter("s03");
    assert.equal(await page.evalJS("location.href"),startingURL);
    assert.equal(await page.evalJS(shown("#practice-panel")),true);
    assert.equal(await page.evalJS(element("#practice-note")+".value"),prediction);
    await page.evalJS("window.__practiceOriginalDoc="+doc+";true");
    await click("#practice-open");await page.wait("!("+shown("#practice-panel")+")","练习收起");
    assert.equal(await page.evalJS(qs("harness")),"dsh");
    await ensurePanel();
    assert.equal(await page.evalJS("window.__practiceOriginalDoc==="+doc),true);
    for(const id of ids){
      await chooseChapter(id);
      const original=data.practiceOriginal[id], prompt=data.practicePrompts[id];
      assert.equal(await page.evalJS(element("#practice-note")+".value"),id==="s03"?prediction:"",id+" 手记按章隔离");
      assert.ok(prompt.question.trim()&&prompt.expect.trim()&&prompt.needle.trim(),id+" 有明确的问题、参考现象与核验点");
      const view=await page.evalJS("("+panelContents.toString()+")()");
      assert.ok(view.original?.includes("原课")&&view.original?.includes("试一下"),id+" 原题标注");
      assert.ok(view.observation?.includes("配套观察练习"),id+" 补充提示标注");
      assert.ok(matchesSection(prompt.question,view.observation),id+" 观察题显示自己的问题");
      assert.ok(!matchesSection(prompt.question,view.original),id+" 观察题与原题分区");
      assert.equal(view.opened,false,id+" 先预测再查看参考现象");
      const texts=await articleSections(original.map(s=>s.heading));
      let blockCount=0;
      let orderCursor=0;
      const originalPane=norm(view.original);
      const expectedCode=[];
      for(const [i,part] of original.entries()){
        assert.ok(texts[i],id+" 原文标题 "+part.heading);
        for(const block of part.blocks){
          assert.ok(matchesSection(block.text,texts[i]),id+" 原题块归属左侧原文小节");
          const at=originalPane.indexOf(norm(block.text),orderCursor);
          assert.ok(at>=orderCursor,id+" 原题块可按原来的顺序在右栏阅读");
          orderCursor=at+norm(block.text).length;
          if(block.tag==="pre") expectedCode.push(block.text);
          blockCount++;
        }
      }
      assert.deepEqual(view.code,expectedCode,id+" 命令示例保留原文换行和缩进");
      assert.ok(blockCount>0,id+" 至少一块真实原题");
      const steps=Array.isArray(prompt.action)?prompt.action:[prompt.action];
      for(const step of steps) assert.ok(matchesSection(step,view.observation),id+" 观察步骤可见");
      await click("#practice-expected summary");
      const expectedText=await page.evalJS(element("#practice-expected")+".innerText");
      for(const s of (Array.isArray(prompt.expect)?prompt.expect:[prompt.expect]))
        assert.ok(matchesSection(s,expectedText),id+" 展开后见到预期现象");
      await click("#practice-expected summary");
      assert.equal(await page.evalJS(qs("harness")),"dsh");
      checked.push({chapter:id,originalSections:original.length,originalBlocks:blockCount});
      const pt=prompt,section=original[0];
      await click("[data-practice-original]");
      await selected(section.heading,id+" 在原课定位题目");
      await click("[data-practice-observe]");
      const tabName={learn:"学习",source:"源码",sim:"模拟",deep:"深入探索"}[pt.tab];
      await page.wait(activeTab+"==="+JSON.stringify(tabName),id+" 核验位置的页签");
      await selected(pt.needle,id+" 核验位置的原文锚点");
      await click("[data-practice-compare]");
      await page.wait("!("+shown("#practice-panel")+") && "+shown("#responses article"),"返回框架对照");
      const activeQuestion=await page.evalJS("document.querySelector('#questions h2')?.innerText");
      const pos=data.crosswalk[id].findIndex(p=>p.question===activeQuestion);
      assert.equal(pos,pt.point-1,id+" 返回这道观察练习指定的原文问题");
      assert.equal(await page.evalJS(qs("harness")),"dsh");
      resolved.push({chapter:id,originalHeading:section.heading,observationTab:pt.tab,needle:pt.needle,crosswalkIndex:pos});
      await ensurePanel();
    }
    await click("#practice-open");await click("[data-all]");await ensurePanel();
    await click("[data-practice-compare]");
    assert.equal(await page.evalJS("document.querySelectorAll('#responses article').length"),3);
    assert.equal(await page.evalJS(element("[data-all]")+".getAttribute('aria-pressed')"),"true");
    assert.equal(await page.evalJS(qs("harness")),"dsh");
    await page.call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await page.wait("document.body.classList.contains('closed')","窄屏默认显示原文");
    const hitPractice=await page.evalJS("(()=>{const b=document.querySelector('#practice-open'),r=b.getBoundingClientRect();"+
      "return r.width>0&&r.left>=0&&r.right<=innerWidth&&b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()");
    assert.ok(hitPractice,"390px 下练习入口可见并可点击");
    await ensurePanel();await click("[data-practice-observe]");
    await page.wait("document.body.classList.contains('closed')","窄屏观察切回左页");
    await selected(data.practicePrompts.s20.needle,"窄屏选择原文核验位置");
    await click("#practice-open");await page.wait(shown("#practice-panel"),"窄屏返回练习");
    assert.ok(await page.evalJS("document.documentElement.scrollWidth<=innerWidth"));
    return {checked,resolved,restoredNotes:true,preservedParallelComparison:true,narrowViewport:[390,844],
      errors:page.errors,blocked:[...page.blocked]};
  } finally { await page.close(); }
}

async function exercisePrimaryCourses(browser){
  const page=await browser.page(true);
  const q=selector=>`document.querySelector(${JSON.stringify(selector)})`;
  const doc=q("#original-frame")+".contentDocument";
  const click=sel=>page.evalJS(q(sel)+".click();true");
  const select=(sel,value)=>page.evalJS(`(()=>{const el=${q(sel)};el.value=${JSON.stringify(value)};el.dispatchEvent(new Event("change",{bubbles:true}));return true;})()`);
  const names=["claude","hermes","dsh","agentscope"];
  const results={};
  try{
    await page.call("Page.navigate",{url:local+"/?mode=original&chapter=s03"});
    await page.wait(`${q("#primary-course")}?.value==='claude' && ${doc}?.querySelector('.prose-custom')`,"Claude 主栏");
    const catalogs=await page.evalJS("JSON.parse(document.querySelector('#reader-data').textContent).courses");
    const assertPeers=async id=>{
      const buttons=await page.evalJS("[...document.querySelectorAll('[data-framework]')].map(b=>b.dataset.framework)");
      assert.deepEqual(buttons.sort(),names.filter(x=>x!==id).sort());
      const before=await page.evalJS(`window.__mainDoc=${doc};${q("#original-frame")}.contentWindow.location.href`);
      for(const other of buttons){
        await click(`[data-framework=${other}]`);
        assert.equal(await page.evalJS(`${doc}===window.__mainDoc && ${q("#original-frame")}.contentWindow.location.href===${JSON.stringify(before)}`),true);
        assert.ok(await page.evalJS(`${q("#responses")}?.innerText.trim().length>5`));
      }
      await click("[data-all]");
      assert.equal(await page.evalJS("document.querySelectorAll('#responses article').length"),3);
    };
    await assertPeers("claude");
    for(const id of names.slice(1)){
      const c=catalogs[id];
      await select("#primary-course",id);
      await page.wait(`${q("#primary-course")}?.value===${JSON.stringify(id)} && ${doc}?.URL.includes(${JSON.stringify(c.mount)})`,"切换主课 "+id);
      const opts=await page.evalJS(`[...${q("#chapter")}.options].map(o=>o.value)`);
      assert.deepEqual(opts,["home",...c.lessons.map(l=>String(l.id))]);
      let located=0,checked=0;
      for(const l of c.lessons){
        const lid=String(l.id);
        await select("#chapter",lid);
        const activePath=new URL(l.path,local);
        const expectedPath=JSON.stringify(activePath.pathname.replace(/\/$/,""));
        await page.wait(`${q("#chapter")}.value===${JSON.stringify(lid)} && ${doc}?.readyState==='complete' && ${q("#original-frame")}.contentWindow.location.pathname.replace(/\\/$/,'')===${expectedPath} && ${q("#original-frame")}.contentWindow.location.hash===${JSON.stringify(activePath.hash)} && ${doc}?.body?.innerText.length>200`,"课程详细页 "+id+"/"+lid);
        assert.equal(await page.evalJS(q("#side-heading")+".textContent"),l.title);
        if(l.id===({hermes:"agent-loop",dsh:"chapter-2",agentscope:"quickstart"})[id]){
          await page.settled();
          const shot=await page.call("Page.captureScreenshot",{format:"png"});
          await writeFile(path.join(research,"screenshots","primary-"+id+".png"),Buffer.from(shot.data,"base64"));
        }
        for(let i=0;i<(l.points||[]).length;i++){
          if(!l.points[i].needle)continue;
          if(i>0)await select("#concept",String(i));
          await page.wait(`(${doc}.body.innerText.replace(/\\s+/g," ").includes(${JSON.stringify(l.points[i].needle.replace(/\s+/g," "))}))`,"实际正文章节锚点 "+id+"/"+lid+"/"+i);
          await click("[data-primary-locate]");
          await page.wait(`${q("#where")}.textContent.startsWith("已定位")`,"定位到主课 "+id+"/"+lid+"/"+i);
          located++;
        }
        if(checked===0)await assertPeers(id);
        checked++;
      }
      const saved=await page.evalJS("location.search");
      await page.call("Page.reload",{ignoreCache:true});
      await page.wait(`${q("#side-heading")}?.textContent===${JSON.stringify(c.lessons.at(-1).title)} && ${doc}?.body?.innerText.length>200`,"刷新恢复 "+id);
      assert.equal(await page.evalJS("location.search"),saved);
      results[id]={lessons:checked,located,otherCourses:3,refresh:true};
    }
    // A returning reader should resume their own current course at the bare entry.
    await page.call("Page.navigate",{url:local+"/"});
    await page.wait(`${q("#primary-course")}?.value==='agentscope' && ${q("#chapter")}.value===${JSON.stringify(String(catalogs.agentscope.lessons.at(-1).id))}`,"从首页继续主课");
    await select("#chapter","quickstart");
    await page.wait(`${doc}?.URL.includes('/agentscope-course/quickstart/') && ${doc}.querySelector("a[href='/agentscope-course/building-blocks/agent/overview/']")`,"AgentScope 原生目录");
    await page.evalJS(`${doc}.querySelector("a[href='/agentscope-course/building-blocks/agent/overview/']").click();true`);
    const overview=catalogs.agentscope.lessons.find(l=>l.path==="/agentscope-course/building-blocks/agent/overview/");
    await page.wait(`${q("#chapter")}.value===${JSON.stringify(overview.id)} && new URLSearchParams(location.search).get('lesson')===${JSON.stringify(overview.id)}`,"原生导航同步外层");
    await select("#chapter",String(catalogs.agentscope.lessons.at(-1).id));
    await page.wait(`${q("#side-heading")}?.textContent===${JSON.stringify(catalogs.agentscope.lessons.at(-1).title)}`,"保存最后阅读章");
    await page.call("Page.navigate",{url:local+"/?primary=hermes&lesson=memory&point=2"});
    await page.wait(`${q("#where")}?.textContent.startsWith("已定位")`,"新链接定位指定检查点");
    const y=await page.evalJS(`(()=>{const w=${q("#original-frame")}.contentWindow;w.scrollBy(0,360);return w.scrollY})()`);
    await sleep(650);
    await page.call("Page.reload",{ignoreCache:true});
    await page.wait(`${doc}?.readyState==='complete' && Math.abs(${q("#original-frame")}.contentWindow.scrollY-${y})<5`,"刷新恢复实际阅读位置");
    await select("#primary-course","agentscope");
    await page.wait(`${q("#side-heading")}?.textContent===${JSON.stringify(catalogs.agentscope.lessons.at(-1).title)}`,"从另一主课返回已读章");
    await select("#primary-course","hermes");
    await page.wait(`${q("#chapter")}?.value==='memory' && Math.abs(${q("#original-frame")}.contentWindow.scrollY-${y})<5`,"切回保留原文滚动位置");
    await select("#chapter","install");await click("[data-framework=agentscope]");
    const peer=await page.evalJS("JSON.parse(document.querySelector('#reader-data').textContent).peerLinks.hermes.install['1'].agentscope");
    assert.ok(peer);assert.ok((await page.evalJS(q("#responses")+".innerText")).includes(peer.text));
    await click("[data-promote=agentscope]");
    await page.wait(`${q("#primary-course")}?.value==='agentscope' && ${q("#chapter")}.value===${JSON.stringify(peer.lesson)} && ${q('[data-framework=hermes]')}.getAttribute('aria-pressed')==='true'`,"互换主课与对照并进入目标原章");
    await page.call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.ok(await page.evalJS("document.documentElement.scrollWidth<=innerWidth"));
    await select("#primary-course","dsh");
    await page.wait(`${q("#primary-course")}?.value==='dsh' && ${doc}?.body?.innerText.length>200`,"窄屏切换主课");
    await click("#toggle");await click("[data-framework=claude]");
    await click("[data-promote=claude]");
    await page.wait(`${q("#primary-course")}?.value==='claude' && ${doc}?.URL.includes('/zh/')`,"从对照转为 Claude 主课");
    return {courses:results,errors:page.errors,blocked:[...page.blocked]};
  }finally{await page.close();}
}

async function exerciseSourceStudy(browser){
  const p=await browser.page(true);
  const docs=[];
  let total=0,refs=0;
  try{
    await p.call("Page.navigate",{url:local+"/?primary=claude&mode=original&chapter=s10"});
    await p.wait("document.querySelector('#original-frame')?.contentDocument?.querySelector('.prose-custom') && document.querySelector('#chapter-reading a[href^=\"vscode:\"]')","s10 源码研读已挂载");
    await p.evalJS("window.studyOriginal=document.querySelector('#original-frame').contentDocument;true");
    const destinations=await p.evalJS("[...document.querySelectorAll('.study-docs a')].map(a=>a.href)");
    for(let i=0;i<2;i++){
      await p.evalJS(`(()=>{const e=document.querySelector('#concept');e.value='${i}';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await p.wait(`document.querySelector('#chapter-reading').dataset.key==='s10.${i}' && document.querySelector('#chapter-reading a[href^="vscode:"]')`,"与原文问题同步");
      const result=await p.evalJS(`(()=>{const b=document.querySelector('#chapter-reading');for(const e of b.querySelectorAll('details'))e.open=true;
        const a=[...b.querySelectorAll('[data-study-path]')];return {n:b.querySelectorAll('details').length,refs:a.length,good:a.every(x=>x.hasAttribute('href')?/^(vscode|cursor):/.test(x.href)&&x.href.endsWith(':'+x.dataset.line):x.title.includes('本机未安装')),text:b.innerText};})()`);
      assert.ok(result.n&&result.good&&result.text.includes("旧笔记对读"));total+=result.n;refs+=result.refs;
    }
    await p.evalJS("(()=>{const e=document.querySelector('[data-study-editor]');e.value='cursor';e.dispatchEvent(new Event('change'));})()");
    await p.wait("document.querySelector('#chapter-reading a[href^=\"cursor:\"]')","Cursor 跳转地址");
    assert.ok(await p.evalJS("window.studyOriginal===document.querySelector('#original-frame').contentDocument"));
    await p.evalJS("(()=>{const s=document.querySelector('[data-study-editor]');s.value='cursor';s.dispatchEvent(new Event('change'));})()");
    await p.wait("document.querySelector('#chapter-reading [data-study-path]').href.startsWith('cursor:')","切换本地编辑器");
    assert.ok(await p.evalJS("document.querySelector('#original-frame').contentDocument===window.studyOriginal"));
    await p.evalJS("document.querySelector('[data-all]').click()");
    assert.equal(await p.evalJS("document.querySelectorAll('#responses article').length"),3);
    await p.evalJS("(()=>{const s=document.querySelector('#chapter');s.value='s09';s.dispatchEvent(new Event('change'));})()");
    await p.wait("document.querySelector('#chapter-reading').hidden","其他章不出现试点卡");
    for(const href of destinations){
      await p.call("Page.navigate",{url:href});
      await p.wait("document.querySelector('main h1') && document.readyState==='complete'","独立研读正文");
      docs.push(await p.evalJS("({title:document.title,lines:document.querySelector('main').innerText.length,code:document.querySelectorAll('pre').length})"));
    }
    assert.equal(docs.length,3);assert.ok(docs[0].code>=2);
    const result={total,refs,documents:docs,errors:p.errors,blocked:[...p.blocked]};
    assert.deepEqual(result.errors,[]);assert.deepEqual(result.blocked,[]);return result;
  }finally{await p.close();}
}

async function main() {
  const browser = await launch();
  try {
    const now = new Date().toISOString();
    if(mode==='source-study'){
      const report=await exerciseSourceStudy(browser);
      await writeFile(path.join(research,'s10-source-study-browser.json'),JSON.stringify({browser:browser.version,...report},null,2)+'\n');
      console.log('PASS s10 source study',report.total,report.refs,report.documents.length);return;
    }
    if(mode==='primary'){
      const report=await exercisePrimaryCourses(browser);
      await writeFile(path.join(research,'primary-courses-browser.json'),JSON.stringify({verifiedAt:now,browser:browser.version,...report},null,2)+'\n');
      assert.deepEqual(report.errors,[]);assert.deepEqual(report.blocked,[]);
      console.log('PASS four primary courses',report.courses);return;
    }
    if(mode==="practice"){
      const result=await exercisePractice(browser);
      assert.deepEqual(result.errors,[]);assert.deepEqual(result.blocked,[]);
      await writeFile(path.join(research,"practice-browser.json"),JSON.stringify({verifiedAt:now,browser:browser.version,local,...result},null,2)+"\n");
      console.log("PASS practice",result.checked.length,"chapters",result.resolved.length,"anchor pairs");
      return;
    }
    if(mode==="reader"){
      const report=await exerciseReader(browser);
      await writeFile(path.join(research,"original-verification-reader.json"),JSON.stringify({verifiedAt:now,browser:browser.version,local,...report},null,2)+"\n");
      console.log("Reader",report.points,"anchors",report.anchorFindings,report.errors);
      assert.equal(report.anchorFindings.length,0);assert.equal(report.errors.length,0);assert.equal(report.blocked.length,0);return;
    }
    if (mode === "online") {
      const previous=process.env.CHECK_ROUTES&&existsSync(refFile)?JSON.parse(await readFile(refFile,"utf8")).pages:{};
      const pages = await captureAll(browser, upstream, false,previous);
      await writeFile(refFile, JSON.stringify({ upstream, capturedAt: now, browser: browser.version, pages }, null, 2) + "\n");
      assert.ok(Object.values(pages).every(page => !page.error), "原站页面获取不完整，请检查逐章记录。");
      return;
    }
    assert.ok(["verify","capture-local","compare"].includes(mode));
    const previous = mode==="compare"?JSON.parse(await readFile(diffFile,"utf8")):null;
    const archive=process.env.CHECK_ROUTES&&existsSync(diffFile)?JSON.parse(await readFile(diffFile,"utf8")):null;
    const held=archive?.pages||{};
    for (const page of Object.values(held)) page.origin ??=archive.local;
    const pages = previous?.pages || await captureAll(browser, local, true,held);
    if(mode==="capture-local"){
      await writeFile(diffFile,JSON.stringify({verifiedAt:now,browser:browser.version,local,pages},null,2)+"\n");
      return;
    }
    const reference = JSON.parse(await readFile(refFile, "utf8"));
    const differences = discrepancies(reference.pages, pages);
    await writeFile(diffFile, JSON.stringify({ verifiedAt: previous?.verifiedAt||now, browser: previous?.browser||browser.version, baseline: reference.capturedAt,
      reference: upstream, local:previous?.local||local,differences, pages }, null, 2) + "\n");
    console.log("differences", differences.map(x => x.slice(0,3)));
    assert.equal(differences.length, 0);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
