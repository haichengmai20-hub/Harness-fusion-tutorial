async function boot(){
"use strict";
const $ = (selector, scope = document) => scope.querySelector(selector);
const h = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]);
const pretty = value => JSON.stringify(value, null, 2) ?? "—";
const fw = {hermes:"Hermes",dsh:"dsh",agentscope:"AgentScope"};
const tabs = {learn:"学习",sim:"模拟",source:"源码",explore:"深入探索"};
const level = {native:"原生实现",composed:"组合实现","no-direct-equivalent":"无直接对应",unverified:"待核验"};
const tier = {"document-reviewed":"已核对文档","source-reviewed":"已核对源码","offline-tested":"框架离线实测","live-tested":"真模型实测"};
const icons = {
  learn:'<path d="M3 5q5-2 9 1 4-3 9-1v14q-5-2-9 1-4-3-9-1zM12 6v14"/>',
  sim:'<path d="m8 4 12 8-12 8z"/>', source:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-16-3 20"/>',
  explore:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
  loop:'<path d="M4 9a8 8 0 0 1 14-4l2 2m0-5v5h-5M20 15a8 8 0 0 1-14 4l-2-2m0 5v-5h5"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',prev:'<path d="M20 12H5m6-6-6 6 6 6"/>',
  layers:'<path d="m3 8 9-5 9 5-9 5zm0 5 9 5 9-5m-18 5 9 5 9-5"/>',
  terminal:'<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m6 9 3 3-3 3m6 0h5"/>',
  external:'<path d="M14 3h7v7m0-7L10 14m0-9H5q-2 0-2 2v12q0 2 2 2h12q2 0 2-2v-5"/>'
};
const icon = (key,size=17) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key]}</svg>`;
const keys = ["chapters","mappings","runs","code"];
let data;
if ($("#packed")) data = JSON.parse($("#packed").textContent);
else data = Object.fromEntries(await Promise.all(keys.map(async key=>{
  const response = await fetch(`data/${key}.json`);
  if (!response.ok) throw new Error(key);
  return [key,await response.json()];
})));
const {chapters,mappings,runs,code} = data;
const ids = chapters.map(c=>c.id);
const valid = (value, options, fallback) => options.includes(value) ? value : fallback;
const getStored = (key,fallback) => { try {return JSON.parse(localStorage.getItem("harness-lab:v1:"+key)) ?? fallback;} catch { return fallback; } };
const save = (key,value) => { try {localStorage.setItem("harness-lab:v1:"+key,JSON.stringify(value));} catch {} };
let viewed = new Set(getStored("viewed",[])), passed = new Set(getStored("passed",[]));
let attempt = null, timer = null, route, mobileOpen = false;
let concealFuture = Boolean(getStored("conceal",false));
function parse(){
  const params = new URLSearchParams(location.hash.startsWith("#?") ? location.hash.slice(2) : location.search);
  const c = valid(params.get("chapter"),ids,"s01");
  const sc = valid(params.get("scenario"),["normal","failure"],"normal");
  const timeline = runs[c][sc];
  const marker = params.get("step") || "";
  const idx = timeline.findIndex((ev,i)=>eventKey(timeline,i)===marker);
  return {chapter:c,harness:valid(params.get("harness"),Object.keys(fw),"hermes"),tab:valid(params.get("tab"),Object.keys(tabs),"learn"),scenario:sc,index:Math.max(0,idx),codeView:valid(params.get("view"),["diff","full","origin"],"diff")};
}
function eventKey(events,i) {
  const key = events[i].semanticStep;
  const occurrence = events.slice(0,i+1).filter(ev=>ev.semanticStep===key).length;
  return `${key}.${occurrence}`;
}
function url(r){
  const p = new URLSearchParams({chapter:r.chapter,harness:r.harness,tab:r.tab,scenario:r.scenario});
  if (r.index) p.set("step",eventKey(runs[r.chapter][r.scenario],r.index));
  if (r.tab==="source" && r.codeView!=="diff") p.set("view",r.codeView);
  return (location.protocol==="file:"?"#?":"?")+p.toString();
}
function stop(){ if(timer) clearInterval(timer); timer=null; }
function nav(patch,replace=false,autoplay=false){
  const changedChapter = patch.chapter && patch.chapter!==route.chapter;
  if(!autoplay) stop();
  if(changedChapter){attempt=null;mobileOpen=false;}
  route = {...route,...patch};
  const href = url(route);
  try {
    if((location.protocol==="file:"?location.hash:location.search)!==href) history[replace?"replaceState":"pushState"](null,"",href);
  } catch {location.assign(new URL(href,location.href));return;}
  render();
  if(changedChapter) {window.scrollTo({top:0}); $("#lesson").focus({preventScroll:true});}
}
function cLink(c,label,cls=""){
  if(!c) return "";
  return `<a class="${cls}" data-chapter="${c.id}" href="${h(url({...route,chapter:c.id,index:0}))}">${label}</a>`;
}
function fwButtons(){
  return `<div class="switch" aria-label="框架视角">${Object.entries(fw).map(([k,v])=>`<button data-fw="${k}" aria-pressed="${route.harness===k}">${v}</button>`).join("")}</div>`;
}
function side(c){
  const groups = [];
  for (const ch of chapters){
    if(!groups.length || groups.at(-1).name!==ch.group) groups.push({name:ch.group,items:[]});
    groups.at(-1).items.push(ch);
  }
  $("#sidebar").innerHTML=`<div class="side-heading">${icon("layers")} 课程目录 <span>20 章</span></div><nav>${groups.map(group=>`<div class="side-group">${h(group.name)}</div>${group.items.map(ch=>cLink(ch,`<span class="chap-no">${ch.id.slice(1)}</span><span>${h(ch.title)}</span>${passed.has(ch.id)?'<i class="pass" aria-label="练习已通过">✓</i>':""}`,ch.id===c.id?"chapter active":"chapter")).join("")}`).join("")}</nav><div class="progress"><div>学习进度 <b>${viewed.size} / 20</b></div><progress max="20" value="${viewed.size}"></progress><small>已读 ${viewed.size} 章 · 练习通过 ${passed.size} 章</small></div>`;
  $("#sidebar").classList.toggle("open",mobileOpen);
  $("#menu").setAttribute("aria-expanded",String(mobileOpen));
  $("#sidebar .chapter.active")?.setAttribute("aria-current","page");
}
// Each course increment attaches to one stable part of the minimal loop.
const chapterStage = [2,3,3,3,6,6,0,0,0,1,3,6,6,6,6,6,6,3,3,5];
const stageNames = ["消息上下文","调用模型","判断下一步","执行工具","最终回复","任务验收","任务与协作"];
function stageOf(e){
  const key = e.semanticStep;
  if(key==="assistant-finished") return 4;
  if(key==="outcome-checked") return 5;
  if(key==="tool-requested") return 2;
  if(key==="request-built") return 1;
  if(/^(tool-f|tools-listed|hook-|permission-|retry-|state-reconciled|workspace-|merge-|regression-)/.test(key)) return 3;
  if(/^(user-input|catalog-|skill-|history-|context-|session-|memory-|config-)/.test(key)) return 0;
  return 6;
}
function diagram(c,n,ev){
  const sim=route.tab==="sim", focus=sim?stageOf(ev):chapterStage[n];
  const compact=window.matchMedia("(max-width: 600px)").matches;
  const names=["messages[]","model","tool_call?","dispatch()","return","assert","work state"];
  const boxes=compact
    ? [[12,74,137],[185,74,137],[185,148,137],[12,148,137],[185,222,137],[12,222,137],[12,6,137]]
    : [[26,68,142],[224,68,142],[426,68,148],[636,68,142],[426,158,148],[636,158,142],[26,158,142]];
  const connections=compact
    ? ["M149 100h31","M253 127v16","M185 174h-31","M253 201v16","M185 248h-31","M79 148v-16","M79 59v10"]
    : ["M168 94H218","M366 94H420","M574 94H630","M499 121v32","M574 184h56","M707 68V40q0-8-8-8H104q-8 0-8 8v22","M96 158v-30"];
  const labels=compact
    ? [[167,165,"有"],[270,216,"无"],[106,143,"回传"]]
    : [[385,25,"工具结果回到下一轮"],[604,83,"有"],[516,145,"无"]];
  const nodes=boxes.map(([x,y,w],i)=>`<g data-stage="${i}" class="node ${i===focus?"hot":i===6&&n<4?"later":""}" tabindex="0" role="button" aria-label="${stageNames[i]}，查看本场景对应事件"><rect x="${x}" y="${y}" width="${w}" height="53" rx="8"/><circle cx="${x+17}" cy="${y+18}" r="3"/><text x="${x+27}" y="${y+23}" class="node-name">${stageNames[i]}</text><text x="${x+17}" y="${y+42}" class="node-code">${names[i]}</text></g>`).join("");
  return `<section class="diagram"><div class="diagram-head"><h2>${icon("loop",17)} 运行全貌</h2><span><i></i>${sim?"当前事件":"本章接点"}</span></div>
    <div class="map-scroll"><svg viewBox="${compact?"0 0 334 282":"0 0 810 224"}" role="group" aria-label="Agent Loop 的消息、模型、工具分支与最终回复">
    <defs><marker id="tip" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 8 4 0 8" fill="none" stroke="#bda9dd" stroke-width="1.3"/></marker></defs>
    <g fill="none" stroke="#bda9dd" stroke-width="1.65" marker-end="url(#tip)">${connections.map((p,i)=>`<path d="${p}" ${i>=4?'stroke-dasharray="4 3"':""}/>`).join("")}</g>
    <g class="edge-text">${labels.map(([x,y,label])=>`<text x="${x}" y="${y}" text-anchor="middle">${label}</text>`).join("")}</g>${nodes}</svg></div>
    <div class="diagram-foot"><span>${h(c.id.toUpperCase())} <b>／</b> ${h(c.checkpoint)}</span><button data-open="sim">查看轨迹 ${icon("arrow",15)}</button></div></section>`;
}
function sourceLink(card){
  const url = String(card.url||"");
  return /^https?:\/\//i.test(url)?`<a class="source-link" href="${h(url)}" target="_blank" rel="noopener noreferrer">${icon("external",14)} ${h(card.source || "查看上游来源")}</a>`:`<span class="muted">${h(card.source || "暂无固定来源")}</span>`;
}
function frame(c,mode="full"){
  const card = mappings[c.id][route.harness];
  return `<section id="framework-impl" class="frame-card"><div class="split-head"><h2>${icon("layers")} ${h(fw[route.harness])} 实现</h2></div>
    <div class="frame-body"><div class="evidence"><span>${h(level[card.support]??card.support)}</span>${card.evidence.map(t=>`<small>${h(tier[t]??t)}</small>`).join("")}</div>
    <h3>${h(card.title)}</h3><p>${h(card.body)}</p>
    <dl class="facts">${(mode==="sim"?[["状态归属",card.state],["对照位置",card.checkpoint]]:[["执行入口",card.entry],["状态归属",card.state],["对照位置",card.checkpoint]]).map(([k,v])=>`<div><dt>${k}</dt><dd>${h(v)}</dd></div>`).join("")}</dl>${sourceLink(card)}</div></section>`;
}
function lesson(c){
  return `<section class="content-section"><h2>本章新增了什么</h2><p class="lead">${h(c.mechanism)}</p><div class="io"><div><label>上游输入</label><p>${h(c.input)}</p></div>${icon("arrow")}<div><label>下游输出</label><p>${h(c.output)}</p></div></div></section>
    <section class="content-section"><h2>跟着购物车走一遍</h2><p class="muted">${h(c.previous)}</p><ol class="walk">${c.walkthrough.map(s=>`<li>${h(s)}</li>`).join("")}</ol><button class="action" data-open="sim">${icon("sim",15)} 进入单步实验</button></section>
    ${frame(c)}<details class="all-mech"><summary>累积到本章的机制</summary><ol>${chapters.map((v,i)=>`<li class="${i>ids.indexOf(c.id)?"future":""}">${cLink(v,`${v.id} · ${h(v.zh)}`)}<small>${v.id===c.id?"本章新增":i<ids.indexOf(c.id)?"已引入":"后续章节"}</small></li>`).join("")}</ol></details>`;
}
function sim(c,events,ev){
  const i = route.index;
  const card = mappings[c.id][route.harness];
  const anchor = card.anchors?.[ev.semanticStep];
  const scenarioNames = {
    s01:["运行检查","跳过检查"],s02:["有效调用","未知工具与参数错误"],
    s03:["允许写入","拒绝写入"],s04:["前后回调正常","前置回调异常"]
  };
  const labels = scenarioNames[c.id] || ["正常路径","失败对照"];
  const table = value => `<pre class="state-json" tabindex="0">${h(pretty(value))}</pre>`;
  return `<section class="content-section"><div class="split-head"><h2>轨迹实验台</h2><span class="mode">教学模拟 · 确定性回放</span></div><p class="muted">购物车使用同一份初始快照。切换框架可对照源码位置，时间线来自共同教学程序。</p>
    <div class="sim-controls"><div class="switch" aria-label="实验场景">${["normal","failure"].map(k=>`<button data-scenario="${k}" aria-pressed="${k===route.scenario}">${labels[k==="normal"?0:1]}</button>`).join("")}</div>
    <div class="play-controls"><button data-sim="reset">重置</button><button data-sim="back" ${i===0?"disabled":""}>上一步</button><button data-sim="step" ${i===events.length-1?"disabled":""}>单步 →</button><button class="action" data-sim="play">${timer?"暂停":"播放"}</button></div></div>
    <div class="predict"><label><input type="checkbox" data-conceal ${concealFuture?"checked":""}> 先预测，隐藏后续事件</label><span>${h(c.checkpoint)}</span></div>
    <div class="trace-grid"><div class="timeline" role="group" aria-label="事件时间线">${events.map((e,j)=>`<button data-seq="${j}" aria-current="${j===i?"step":"false"}"><span>${String(j+1).padStart(2,"0")}</span><div>${concealFuture&&j>i?"等待单步揭晓":h(e.title||e.eventType)}<small>${concealFuture&&j>i?"…":h(e.semanticStep)}</small></div></button>`).join("")}</div><article class="event"><div class="mono muted">EVENT ${i+1} / ${events.length}</div><h3>${h(ev.title||ev.eventType)}</h3><p>${h(ev.note||ev.semanticStep)}</p>${ev.toolCallId?`<div class="callid">toolCallId · ${h(ev.toolCallId)}</div>`:""}<h4>本步载荷</h4>${Object.keys(ev.payload||{}).length?table(ev.payload):'<p class="muted">本步观测见下方执行前后状态。</p>'}<button class="text-action" data-event-source>定位教学源码 ${icon("arrow",14)}</button></article></div>
    <div class="anchor-note"><strong>${h(fw[route.harness])} · 当前事件</strong><p>${h(anchor||"这一教学事件尚无单独核实的框架检查点。可在下方实现卡查阅整章依据。")}</p></div>
    <div class="state-pair"><div><h3>执行前</h3>${table(ev.before)}</div><div><h3>执行后</h3>${table(ev.after)}</div></div>
    <details><summary>原始教学事件与来源</summary>${table(ev)}</details></section>${frame(c,"sim")}`;
}
function source(c,ev){
  const doc = code[c.id];
  const text = route.codeView==="full"?doc.code:doc.diff;
  const [filePath, symbolName=""] = String(ev.sourceRef||"").split("#");
  const fileName = filePath.split("/").at(-1);
  const symbol = symbolName.split(".").at(-1);
  const lines = (text||"").split("\n");
  const start = lines.indexOf("# ── "+fileName+" ──");
  const nextFile = lines.findIndex((line,i)=>i>start && line.startsWith("# ── "));
  const target = route.codeView==="full" && symbol && start>=0
    ? lines.findIndex((line,i)=>i>start && (nextFile<0 || i<nextFile) && line.trimStart().startsWith("def "+symbol+"("))
    : -1;
  return `<section class="content-section"><div class="split-head"><h2>源码对照</h2><div class="switch" aria-label="源码视图">${[["diff","本章增量"],["full","累计代码"],["origin","框架来源"]].map(([k,label])=>`<button data-code="${k}" aria-pressed="${route.codeView===k}">${label}</button>`).join("")}</div></div>
    ${route.codeView==="origin"?"":`<div class="code-head"><span>${icon("terminal",16)} ${h(route.codeView==="full"?`s01 → ${c.id} 累计教学实现`:doc.path)}</span><small>${route.codeView==="full"?"Python":"Unified diff"}</small></div><pre class="code" tabindex="0"><code>${lines.map((line,i)=>`<span class="line ${i===target?"target":route.codeView==="diff"&&line[0]==="+"?"added":route.codeView==="diff"&&line[0]==="-"?"removed":""}" ${i===target?'id="source-target"':""}><i aria-hidden="true">${i+1}</i>${h(line)||" "}</span>`).join("")}</code></pre>
    <div class="code-note">当前教学事件 <code>${h(ev.sourceRef||ev.semanticStep)}</code>${target>=0?` <a href="#source-target" data-scroll="source-target">定位定义行</a>`:""} · ${cLink(chapters[0],"返回最小 Loop")}</div>`}</section>${frame(c)}`;
}
function explore(c){
  return `<section class="content-section"><h2>失败与边界</h2><p class="lead">${h(c.failure)}</p><button class="action" data-failure>查看失败轨迹 ${icon("arrow",14)}</button></section>
    <section id="framework-impl" class="content-section"><h2>用同一个问题比较三家</h2><div class="compare">${Object.entries(fw).map(([k,v])=>{const m=mappings[c.id][k];return `<article><h3>${v}</h3><small>${h(level[m.support])}</small><p>${h(m.checkpoint)}</p>${sourceLink(m)}</article>`;}).join("")}</div></section>
    <section class="quiz"><h2>理解检查</h2><p>${h(c.question)}</p><div class="answers">${c.options.map((opt,i)=>`<button data-answer="${i}" aria-pressed="${attempt===i}"><span>${String.fromCharCode(65+i)}</span>${h(opt)}</button>`).join("")}</div><div class="feedback" role="status">${attempt===null?(passed.has(c.id)?"本章练习已通过，可重新作答。":"先作答，再看解释。"):(attempt===c.answer?"回答正确。":"再看一次判据。")+h(c.explanation)}</div></section>`;
}
function render(){
  const oldFocus=document.activeElement;
  const focusAttr=oldFocus && [...oldFocus.attributes].find(a=>a.name.startsWith("data-"));
  const navTop=$("#sidebar nav")?.scrollTop;
  const n=ids.indexOf(route.chapter), c=chapters[n];
  const events = runs[c.id][route.scenario], ev = events[route.index];
  $("#reader-back").href="index.html?mode=original&chapter="+c.id+"&harness="+route.harness;
  document.title=`${c.id.toUpperCase()} ${c.title} · Harness 研习室`;
  if(!viewed.has(c.id)) {viewed.add(c.id);save("viewed",[...viewed]);}
  side(c);
  if(navTop!==undefined) $("#sidebar nav").scrollTop=navTop;
  const activeChapter=$("#sidebar .active"), scroller=$("#sidebar nav");
  if(activeChapter && scroller.clientHeight) {
    const item=activeChapter.getBoundingClientRect(), viewport=scroller.getBoundingClientRect();
    if(item.bottom>viewport.bottom || item.top<viewport.top) scroller.scrollTop+=item.top-viewport.top-scroller.clientHeight/2;
  }
  $("#crumb").innerHTML=`课程 <span>/</span> ${h(c.group)} <span>/</span> <b>${h(c.id.toUpperCase())}</b>`;
  $("#lesson").innerHTML=`
    <div class="lesson-heading"><div class="chapter-kicker"><i></i> 第 ${String(n+1).padStart(2,"0")} 章 <span>/ 20</span></div>
    <h1>${h(c.title)}</h1><div class="subtitle">${h(c.zh)}</div><p>${h(c.problem)}</p></div>
    ${diagram(c,n,ev)}
    <nav class="tabs" aria-label="学习模式">${Object.entries(tabs).map(([key,label])=>`<button data-tab="${key}" aria-current="${key===route.tab?"page":"false"}">${icon(key)} ${label}</button>`).join("")}</nav>
    <div class="focus-bar"><span>框架视角</span>${fwButtons()}<a href="#framework-impl" data-scroll="framework-impl">${h(mappings[c.id][route.harness].title)} ↓</a></div>
    <div id="panel">${route.tab==="learn"?lesson(c):route.tab==="sim"?sim(c,events,ev):route.tab==="source"?source(c,ev):explore(c)}</div>
    <footer><p>${h(c.next)}</p><div>${cLink(chapters[n-1],`${icon("prev")} 上一章 · ${h(chapters[n-1]?.title)}`,"nav-link")}${cLink(chapters[n+1],`下一章 · ${h(chapters[n+1]?.title)} ${icon("arrow")}`,"nav-link next")}</div></footer>`;
  if(focusAttr && !document.contains(oldFocus)) {
    const found=document.querySelector(`[${focusAttr.name}="${CSS.escape(focusAttr.value)}"]`);
    if(found && !found.disabled) found.focus({preventScroll:true});
  }
  const selected=$(".timeline [aria-current=step]");
  if(selected){const box=selected.parentElement;box.scrollTop=Math.max(0,selected.offsetTop-box.clientHeight/2+selected.offsetHeight/2);}
}
function panelScroll(){ $(".tabs").scrollIntoView({block:"start"}); }
function handle(el){
  const d=el.dataset;
  if("scroll" in d) {document.getElementById(d.scroll)?.scrollIntoView({block:"center"});return;}
  if("chapter" in d) {nav({chapter:d.chapter,index:0});return;}
  if("tab" in d) {nav({tab:d.tab});return;}
  if("fw" in d) {nav({harness:d.fw});return;}
  if("open" in d) {nav({tab:d.open});panelScroll();return;}
  if("failure" in d) {nav({tab:"sim",scenario:"failure",index:0});panelScroll();return;}
  if("code" in d) {nav({codeView:d.code});return;}
  if("eventSource" in d) {nav({tab:"source",codeView:"full"});($("#source-target")||$(".code-head"))?.scrollIntoView({block:"center"});return;}
  if("answer" in d){
    attempt=Number(d.answer);
    if(attempt===chapters[ids.indexOf(route.chapter)].answer){passed.add(route.chapter);save("passed",[...passed]);}
    render();return;
  }
  if("scenario" in d){nav({scenario:d.scenario,index:0});return;}
  if("seq" in d){nav({index:Number(d.seq)},true);return;}
  const events=runs[route.chapter][route.scenario];
  if("stage" in d){
    const match=events.findIndex(e=>stageOf(e)===Number(d.stage));
    if(match!==-1){nav({tab:"sim",index:match});panelScroll();}
    else {const msg=`当前场景没有“${stageNames[Number(d.stage)]}”的独立事件。`;$(".diagram-foot span").textContent=msg;$("#announce").textContent=msg;}
    return;
  }
  if("sim" in d){
    if(d.sim==="play"){
      if(timer){stop();render();return;}
      if(route.index===events.length-1) nav({index:0},true);
      timer=setInterval(()=>{
        const i=route.index+1;
        if(i>=events.length-1) stop();
        nav({index:Math.min(i,events.length-1)},true,true);
      },1150);render();
    } else nav({index:d.sim==="reset"?0:d.sim==="back"?Math.max(0,route.index-1):Math.min(route.index+1,events.length-1)},true);
  }
}
document.addEventListener("click",e=>{
  const target=e.target.closest("[data-scroll],[data-chapter],[data-tab],[data-fw],[data-open],[data-failure],[data-code],[data-event-source],[data-answer],[data-scenario],[data-seq],[data-stage],[data-sim]");
  if(!target||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
  e.preventDefault();handle(target);
});
document.addEventListener("change",e=>{
  if(e.target.matches("[data-conceal]")){stop();concealFuture=e.target.checked;save("conceal",concealFuture);render();}
});
document.addEventListener("keydown",e=>{
  if(["Enter"," "].includes(e.key)&&e.target.matches("g[data-stage]")){e.preventDefault();handle(e.target);}
  if(e.key==="Escape" && mobileOpen){mobileOpen=false;side(chapters[ids.indexOf(route.chapter)]);$("#menu").focus();}
});
$("#menu").onclick=()=>{mobileOpen=!mobileOpen;side(chapters[ids.indexOf(route.chapter)]);};
window.addEventListener("popstate",()=>{stop();attempt=null;route=parse();render();});
window.matchMedia("(max-width: 600px)").addEventListener("change",()=>render());
route=parse(); render();
}

boot().catch(error => {
  document.querySelector('#lesson').textContent = '课程数据加载失败。请打开 dist/index.html，或在项目目录运行 python study.py serve。' + String(error.message);
});

