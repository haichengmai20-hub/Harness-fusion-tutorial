(function reader(){
"use strict";
const $=s=>document.querySelector(s);
const data=JSON.parse($("#reader-data").textContent);
const frameworks={hermes:"Hermes",dsh:"dsh",agentscope:"AgentScope"};
const tabs={learn:"学习",sim:"模拟",source:"源码",deep:"深入探索"};
const extras={home:"课程首页",timeline:"学习路径",compare:"版本对比",layers:"架构层"};
const titles=Object.fromEntries(data.chapters.map(c=>[c.id,c.title]));
titles.s07="Skills"; titles.s20="Comprehensive Agent Turn";
const isChapter=c=>Object.hasOwn(titles,c);
const validPage=c=>isChapter(c)||Object.hasOwn(extras,c);
const frame=$("#original-frame");
const escape=s=>String(s??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[x]);
const mobile=()=>matchMedia("(max-width:850px)").matches;
let closed=mobile(), boundDoc=null, frameObserver=null, scheduled=0, scrollTimer=0, suppressScroll=0, restoring=false;
let route, pendingJump=false, restoringTimer=0;
let practiceRequest=0;
const showPractice=createPracticePanel($("#practice-panel"),data,escape);
const initial=new URLSearchParams(location.hash.startsWith("#?")?location.hash.slice(2):location.search);
if(initial.get("mode")==="lab" || (!initial.has("mode") && Object.hasOwn({learn:1,source:1,sim:1,explore:1},initial.get("tab")))){
  location.replace("lab.html"+location.search+location.hash);return;
}
if(location.protocol==="file:"){
  $(".rail").hidden=true;$("#workspace").style.display="none";$("#file-help").hidden=false;return;
}
const courseSwitcher=mountCourseSwitcher(data,initial,escape);
if(courseSwitcher.native)return;
function path(page){return page==="home"?"/zh/":`/zh/${page}/`;}
function pageFrom(href){
  const u=new URL(href,location.href), m=/^\/zh(?:\/(s\d{2}|timeline|compare|layers))?\/?(?:index\.html)?$/.exec(u.pathname);
  return u.origin===location.origin&&m&&validPage(m[1]||"home")?m[1]||"home":null;
}
function readRoute(){
  const p=new URLSearchParams(location.search), page=p.get("chapter")||"home";
  return {page:validPage(page)?page:"home",fw:Object.hasOwn(frameworks,p.get("harness"))?p.get("harness"):"hermes",
    item:Math.max(0,parseInt(p.get("point"),10)-1||0),all:p.get("compare")==="all",practice:isChapter(page)&&p.get("practice")==="1",
    tab:Object.hasOwn(tabs,p.get("originalTab"))?p.get("originalTab"):"learn"};
}
function setURL(push=false){
  const p=new URLSearchParams({mode:"original",chapter:route.page,harness:route.fw});
  if(initial.has("primary"))p.set("primary","claude");
  if(route.item)p.set("point",route.item+1);if(route.all)p.set("compare","all");if(route.tab!=="learn")p.set("originalTab",route.tab);
  if(route.practice)p.set("practice","1");
  const target="?"+p.toString();
  if(location.search!==target)history[push?"pushState":"replaceState"](null,"",target);
}
const homePoints=[
  {section:"核心模式",find:"核心模式",question:"哪一步决定继续调用工具，哪一步可以结束回复？",
    baseline:"首页先从模型响应判断是否需要工具。读循环里的终止分支，再比较三家的收尾和等待条件。",fields:["entry","stop"]},
  {section:"消息增长",find:"消息增长",question:"工具回来了，下一轮模型怎么知道这是哪一次请求的结果？",
    baseline:"首页的动画展开 messages，新消息被加到原有历史后面。三家都要组织下一轮输入，实际保存状态的位置各有不同。",fields:["growth"]}
].map(pt=>({...pt,frames:Object.fromEntries(Object.keys(frameworks).map(k=>[k,pt.fields.map(f=>data.home[k][f]).join(" ")])),
  links:Object.fromEntries(Object.keys(frameworks).map(k=>[k,data.home[k].refs[pt.fields.includes("growth")?1:0].url])),
  match:{hermes:"部分对应",dsh:"部分对应",agentscope:"部分对应"}}));
function points(){return route.page==="home"?homePoints:(data.crosswalk[route.page]||[]);}
function active(){return points()[route.item];}
function renderTop(){
  $("#chapter").value=route.page;$("#online").href="https://learn.shareai.run"+path(route.page);
  $("#lab").href="lab.html?chapter="+(isChapter(route.page)?route.page:"s01")+"&harness="+route.fw;
  $("#lab").target="_blank";$("#lab").rel="noopener";
  $(".side-title h1").textContent=isChapter(route.page)?`${route.page.toUpperCase()} · ${titles[route.page]}`:extras[route.page];
  document.title=`${titles[route.page]||extras[route.page]} · 原课对读`;
  document.body.classList.toggle("closed",closed);$("#toggle").textContent=closed?"打开对照":mobile()?"返回原文":"收起对照";
  $("#toggle").setAttribute("aria-expanded",String(!closed));
  $("#practice-open").setAttribute("aria-expanded",String(route.practice&&!closed));
  $("#practice-open").textContent=route.practice&&!closed?"回到对照":"动手练习";
  if(closed && route.practice)$("#toggle").textContent="展开练习";
}
function renderChapterReading(){
  const box=$("#chapter-reading"),reading=data.chapterReadings[route.page];
  box.hidden=!reading||route.practice;
  if(box.hidden){box.replaceChildren();delete box.dataset.key;return;}
  const key=route.page+"."+route.item;
  if(box.dataset.key===key)return;
  box.dataset.key=key;
  const items=reading.points.filter(p=>p.point===route.item+1);
  const link=r=>`<li><a data-study-path="${escape(r.path)}" data-line="${Number(r.line)}">${escape(r.label)} · ${escape(r.path.split("/").at(-1))}:${Number(r.line)}</a></li>`;
  box.innerHTML=`<h2>源码研读</h2><div class="study-docs">${reading.documents.map(d=>`<a target="_blank" rel="noopener" href="${escape(d.url)}">${escape(d.title)} ↗</a>`).join("")}</div>
    <div class="study-settings"><small>教学版 20e7cbb · 第三方快照 6f6f12b3</small><label>本地打开 <select data-study-editor><option value="vscode">VS Code</option><option value="cursor">Cursor</option></select></label></div>
    ${items.map(p=>`<details><summary>${escape(p.title)}</summary><p><strong>${escape(p.question)}</strong></p><dl>${[["教学源码",p.tutorial],["Claude Code 快照",p.snapshot],["旧笔记对读",p.oldNote],["自己核对",p.check]].map(([k,v])=>`<dt>${k}</dt><dd>${escape(v)}</dd>`).join("")}</dl><ul>${p.refs.map(link).join("")}</ul></details>`).join("")}`;
  bindStudyLinks(box);
}
function renderSide(){
  renderTop();const list=points();route.item=Math.min(route.item,Math.max(0,list.length-1));
  showPractice(route.practice?route.page:null);
  renderChapterReading();
  $("#questions").hidden=$("#responses").hidden=route.practice;
  if(route.practice)return;
  if(!list.length){
    $("#questions").innerHTML=`<div class="aux"><small>原站公共工具页</small><p>这里可按原站方式浏览全课。从上方目录选择一章，右侧将跟随该章的具体原文问题。</p></div>`;
    $("#responses").replaceChildren();return;
  }
  const point=active();
  $("#questions").innerHTML=(list.length>1?`<label class="which">对照哪一处原文<select id="concept">${list.map((pt,i)=>`<option value="${i}" ${i===route.item?"selected":""}>${escape(pt.section)}</option>`).join("")}</select></label>`:"")+
    `<div class="ref"><small>原课问题 · ${escape(point.section)}</small><h2>${escape(point.question)}</h2><p>${escape(point.baseline)}</p><button id="locate" data-locate>定位原文 ↗</button><div id="where" class="where"></div></div>`;
  renderAnswers();renderWhere();
}
function renderAnswers(){
  const pt=active();if(!pt)return;
  const source=data.mappings[isChapter(route.page)?route.page:"s01"];
  $("#responses").innerHTML=`<div class="switches" aria-label="选择对照框架">${Object.entries(frameworks).map(([k,name])=>`<button data-framework="${k}" aria-pressed="${!route.all&&route.fw===k}">${name}</button>`).join("")}<button data-all aria-pressed="${route.all}">三家并看</button></div>`+
    (route.all?Object.keys(frameworks):[route.fw]).map(k=>{
      const m=source[k],grade=pt.match?.[k]||"待核",url=pt.links?.[k]||m.url;
      const sourceLabel=url===m.url?m.source:(new URL(url)).pathname.split("/").at(-1)+new URL(url).hash;
      return `<article class="response"><header><h3>${frameworks[k]}</h3><span class="grade ${grade.includes("部分")?"partial":grade.includes("待")?"unknown":""}">${escape(grade)}</span></header><p>${escape(pt.frames[k])}</p><a target="_blank" rel="noopener noreferrer" href="${escape(url)}">${grade==="待核"?"已排查的源码":"源码"} · ${escape(sourceLabel)} ↗</a><details><summary>查看该框架的章节背景</summary><p>${escape(m.entry)}</p><p>${escape(m.state)}</p></details>${courseSwitcher.switchLink(k,route.page==="home"?"s01":route.page,route.item+1)}</article>`;
    }).join("")+'<div class="origin-note">左侧保留 shareAI-lab 中文原页。右侧结论来自固定版本源码阅读；“部分对应”和“待核”说明当前证据能覆盖到哪里。</div>';
}
function doc(){try{return frame.contentDocument;}catch{return null;}}
function tabButtons(d){return [...d.querySelectorAll("main button")].filter(b=>Object.values(tabs).includes(b.textContent.trim()));}
function getTab(d){
  const b=tabButtons(d).find(b=>b.classList.contains("border-b-2")||b.getAttribute("aria-selected")==="true");
  return Object.keys(tabs).find(k=>tabs[k]===b?.textContent.trim())||"learn";
}
const clean=s=>s.replace(/\s+/gu," ").trim();
function findText(scope, needle, inSection=()=>true){
  if(!scope||!needle)return null;
  const d=scope.ownerDocument, needleText=clean(needle);
  const iterator=d.createTreeWalker(scope,NodeFilter.SHOW_TEXT);
  let n;
  while((n=iterator.nextNode())){
    if(!n.parentElement||!inSection(n)||n.parentElement.closest("script,style,template,nav,button,textarea"))continue;
    const pos=n.data.indexOf(needle);
    if(pos>=0){
      const r=d.createRange();r.setStart(n,pos);r.setEnd(n,pos+needle.length);return r;
    }
  }
  // Multi-node code spans and emphasis may split a single source expression.
  for(const el of scope.querySelectorAll("h1,h2,h3,h4,summary,code,th,td,p,li,pre")){
    if(inSection(el)&&clean(el.textContent).includes(needleText)){
      const r=d.createRange();r.selectNodeContents(el);return r;
    }
  }
  return null;
}
function scope(d){
  if(route.page==="home")return d.querySelector("main")||d.body;
  return d.querySelector(".prose-custom")||d.querySelector("main");
}
function rangeFor(d,p){
  if(!d||!p)return null;
  const root=scope(d);if(!root)return null;
  const headings=[...root.querySelectorAll("h1,h2,h3,h4,h5,summary")];
  const heading=headings.find(h=>clean(h.textContent)===clean(p.section));
  if(heading){
    const level=node=>Number(node.tagName[1])||6;
    const end=headings.slice(headings.indexOf(heading)+1).find(h=>level(h)<=level(heading));
    const within=node=>(heading.contains(node)||(heading.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING)) &&
       (!end||(!end.contains(node)&&(end.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_PRECEDING)));
    const inSection=findText(root,p.find,within);
    if(inSection)return inSection;
  }
  return findText(root,p.find)||findText(root,p.section);
}
function renderWhere(message){
  const where=$("#where");if(!where)return;
  where.textContent=message||(route.tab==="learn"?"锚点 · "+(active()?.find||active()?.section):`「定位原文」打开学习正文。当前原页标签为「${tabs[route.tab]}」。`);
  if(route.tab!=="learn" && !message){
    const hit=currentTabRange();
    if(hit){
      const btn=document.createElement("button");btn.type="button";btn.dataset.locateTab="";
      btn.textContent="在当前页签定位 "+hit.text;where.append(document.createElement("br"),btn);
    }
  }
}
function currentTabRange(){
  const d=doc(),p=active();if(!d||!p||getTab(d)==="learn")return null;
  const wrap=tabButtons(d)[0]?.parentElement.nextElementSibling;if(!wrap)return null;
  const identifier=p.find.match(/\b[A-Za-z_][\w.]{3,}\b/g)||[];
  const probes=[p.find,p.section,...identifier.filter(s=>s.includes("_"))];
  for(const text of probes){const r=findText(wrap,text);if(r && r.getClientRects().length)return {r,text};}
  return null;
}
function updatePane(){document.body.classList.toggle("closed",closed);renderTop();}
function moveTo(page,push=true){
  if(!validPage(page))return;
  if(route.page===page){if(mobile()){closed=true;updatePane();}return;}
  clearTimeout(scrollTimer);practiceRequest++;route={...route,page,item:0,tab:"learn",practice:isChapter(page)&&route.practice};pendingJump=false;restoring=true;
  if(mobile())closed=!route.practice;
  setURL(push);renderSide();frame.src=path(page);
}
function highlight(d,r){
  const el=r.startContainer.nodeType===Node.TEXT_NODE?r.startContainer.parentElement:r.startContainer;
  for(let par=el;par;par=par.parentElement)if(par.tagName==="DETAILS")par.open=true;
  for(let par=el.parentElement;par&&par!==d.body&&par!==d.documentElement;par=par.parentElement){
    if(par.scrollHeight>par.clientHeight && /auto|scroll/.test(d.defaultView.getComputedStyle(par).overflowY)){
      const offset=r.getBoundingClientRect().top-par.getBoundingClientRect().top;
      if(offset<0||offset>par.clientHeight-25)par.scrollTop+=offset-35;
    }
  }
  const y=r.getBoundingClientRect().top+frame.contentWindow.scrollY;
  frame.contentWindow.scrollTo({top:Math.max(0,y-95),behavior:"instant"});
  const sel=d.defaultView.getSelection();sel.removeAllRanges();sel.addRange(r);
}
function locate(){
  if(!active())return;
  if(mobile()){closed=true;updatePane();}
  const d=doc();
  if(!d || pageFrom(d.URL)!==route.page || d!==boundDoc || d.readyState!=="complete"){
    pendingJump=true;renderWhere("正在等待本章原页载入。");return;
  }
  const b=tabButtons(d).find(b=>b.textContent.trim()==="学习");
  if(getTab(d)!=="learn" && b){pendingJump=true;route.tab="learn";b.click();schedule();return;}
  const r=rangeFor(d,active());
  if(!r){renderWhere("这段原文尚未定位成功，可在原页「学习」中查找 "+(active().find||active().section));return;}
  suppressScroll=Date.now()+550;highlight(d,r);pendingJump=false;renderWhere();remember();setURL();
}
function goToPracticeEvidence(tab,needle){
  const request=++practiceRequest,id=route.page;
  let attempts=0;
  pendingJump=false;
  if(mobile()){closed=true;updatePane();}
  function jump(){
    if(request!==practiceRequest || route.page!==id || !route.practice)return;
    const d=doc();
    if(d && d===boundDoc && pageFrom(d.URL)===id && d.readyState==="complete"){
      if(getTab(d)!==tab){
        tabButtons(d).find(b=>b.textContent.trim()===tabs[tab])?.click();
      } else {
        const panel=tab==="learn"?scope(d):tabButtons(d)[0]?.parentElement.nextElementSibling;
        const r=findText(panel,needle);
        if(r && r.getClientRects().length){
          route.tab=tab;suppressScroll=Date.now()+550;highlight(d,r);remember();setURL();
          $("#practice-status").textContent="已定位到「"+tabs[tab]+"」中的 "+needle;return;
        }
      }
    }
    if(++attempts<45){setTimeout(jump,100);return;}
    const msg="当前原页未能定位到「"+needle+"」，请在「"+tabs[tab]+"」中查看。";
    $("#practice-status").textContent=msg;$("#status").textContent=msg;
  }
  jump();
}
function scrollKey(){return "original.reader.position:"+route.page+":"+route.tab;}
function remember(){
  if(restoring||!boundDoc||doc()!==boundDoc||pageFrom(boundDoc.URL)!==route.page)return;
  try{sessionStorage.setItem(scrollKey(),String(Math.round(frame.contentWindow.scrollY)));}catch{}
}
function restorePosition(){
  let y=0;try{y=Number(sessionStorage.getItem(scrollKey()))||0;}catch{}
  if(y>0){suppressScroll=Date.now()+350;frame.contentWindow.scrollTo(0,y);}
}
function followScroll(){
  remember();
  if(route.practice||restoring||Date.now()<suppressScroll||route.tab!=="learn"||!isChapter(route.page)||!boundDoc)return;
  // Only follow points in the current original subsection. Never assign a
  // preceding subsection's explanation to a later appendix by proximity.
  const readingLine=Math.min(195,frame.clientHeight*.28),root=scope(boundDoc);
  if(!root)return;
  const headings=[...root.querySelectorAll("h2,h3,h4")].filter(h=>h.getClientRects().length);
  const heading=headings.filter(h=>h.getBoundingClientRect().top<=readingLine).at(-1);
  const nextHeading=heading?headings[headings.indexOf(heading)+1]:headings[0];
  const sectionTop=heading?.getBoundingClientRect().top ?? -Infinity;
  const sectionEnd=nextHeading?.getBoundingClientRect().top ?? Infinity;
  let best=-1,top=-Infinity;
  points().forEach((p,i)=>{
    const r=rangeFor(boundDoc,p);if(!r||!r.getClientRects().length)return;
    const y=r.getBoundingClientRect().top;
    if(y>=sectionTop-4 && y<sectionEnd && y<=readingLine && y>top){best=i;top=y;}
  });
  if(best>=0&&route.item!==best){route.item=best;setURL();renderSide();}
  if(best<0 && heading)renderWhere("正在读「"+heading.textContent.trim()+"」。本栏保留选定的问题，可用“定位原文”回到它的依据。");
  else renderWhere();
}
function resync(){
  scheduled=0;const d=doc();if(!d||d!==boundDoc||!d.body)return;
  document.body.classList.toggle("original-dark",d.documentElement.classList.contains("dark"));
  const page=pageFrom(d.URL);
  if(restoring && page!==route.page)return;
  if(page&&page!==route.page){route={...route,page,item:0,tab:"learn",practice:isChapter(page)&&route.practice};setURL();renderSide();}
  const t=getTab(d);
  if(t!==route.tab&&!restoring){route.tab=t;setURL();renderWhere();}
  else if(t!=="learn"&&!restoring)renderWhere();
  if(pendingJump && getTab(d)==="learn" && scope(d))locate();
}
function schedule(){if(!scheduled)scheduled=requestAnimationFrame(resync);}
function bind(){
  const d=doc();if(!d||!d.body||!pageFrom(d.URL))return;
  if(frameObserver)frameObserver.disconnect();
  boundDoc=d;clearTimeout(restoringTimer);restoring=true;
  frameObserver=new MutationObserver(schedule);frameObserver.observe(d.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class","open"]});
  frameObserver.observe(d.documentElement,{attributes:true,attributeFilter:["class"]});schedule();
  d.addEventListener("click",e=>{
    const languageButton=e.target.closest?.("button");
    const lang={"EN":"en","日本語":"ja"}[languageButton?.textContent.trim()];
    if(lang){
      e.preventDefault();e.stopImmediatePropagation();
      window.open("https://learn.shareai.run"+path(route.page).replace("/zh/","/"+lang+"/"),"_blank","noopener,noreferrer");
      return;
    }
    const a=e.target.closest?.("a[href]");
    if(!a && !route.practice && route.tab==="learn" && isChapter(route.page)){
      const clicked=e.target.closest?.(".prose-custom code,.prose-custom h2,.prose-custom h3,.prose-custom strong");
      if(clicked){
        const idx=points().findIndex(p=>clean(clicked.textContent).includes(clean(p.find||p.section)));
        if(idx>=0 && idx!==route.item){route.item=idx;setURL();renderSide();}
      }
    }
    if(!a||e.defaultPrevented||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||a.target==="_blank")return;
    const next=pageFrom(a.href);
    if(next&&next!==route.page){e.preventDefault();e.stopImmediatePropagation();remember();moveTo(next);}
    else if(new URL(a.href).origin!==location.origin){e.preventDefault();window.open(a.href,"_blank","noopener,noreferrer");}
  },true);
  frame.contentWindow.addEventListener("scroll",()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(followScroll,110);},{passive:true});
  const desired=route.tab;
  // Let the archived app hydrate before restoring a shared original-tab URL.
  let attempt=0;
  function settle(){
    if(doc()!==d)return;
    if(desired!=="learn" && getTab(d)!==desired && attempt++<18){
      tabButtons(d).find(b=>b.textContent.trim()===tabs[desired])?.click();
      restoringTimer=setTimeout(settle,110);return;
    }
    restoring=false;route.tab=getTab(d);setURL();
    if(pendingJump)locate();else restorePosition();renderWhere();
  }
  settle();
}
$("#chapter").innerHTML=Object.entries(extras).slice(0,1).concat(Object.entries(titles),Object.entries(extras).slice(1)).map(([id,title])=>`<option value="${id}">${isChapter(id)?id.toUpperCase()+" · ":""}${escape(title)}</option>`).join("");
$("#chapter").onchange=e=>{remember();moveTo(e.target.value);};
$("#home").onclick=e=>{e.preventDefault();remember();moveTo("home");};
$("#toggle").onclick=()=>{closed=!closed;updatePane();};
$("#practice-open").onclick=()=>{
  practiceRequest++;
  route.practice=!route.practice||closed;
  closed=false;
  if(route.practice&&!isChapter(route.page))moveTo("s01");
  setURL();renderSide();$("#companion").scrollTop=0;
};
$("#companion").addEventListener("change",e=>{
  if(e.target.id!=="concept")return;
  route.item=Number(e.target.value);setURL();renderSide();locate();
});
$("#companion").addEventListener("click",e=>{
  const el=e.target.closest("button");if(!el)return;
  if(el.hasAttribute("data-practice-original")){
    goToPracticeEvidence("learn",data.practiceOriginal[route.page][0].heading);return;
  }
  if(el.hasAttribute("data-practice-observe")){
    const p=data.practicePrompts[route.page];goToPracticeEvidence(p.tab,p.needle);return;
  }
  if(el.hasAttribute("data-practice-compare")){
    practiceRequest++;route.item=data.practicePrompts[route.page].point-1;
    route.practice=false;closed=false;setURL();renderSide();$("#companion").scrollTop=0;return;
  }
  if(el.hasAttribute("data-locate")){locate();return;}
  if(el.hasAttribute("data-locate-tab")){
    const hit=currentTabRange();if(hit){if(mobile()){closed=true;updatePane();}highlight(doc(),hit.r);remember();}return;
  }
  if(el.dataset.framework||el.hasAttribute("data-all")){
    if(el.dataset.framework){route.fw=el.dataset.framework;route.all=false;}else route.all=true;
    setURL();renderTop();renderAnswers();
    $("#responses").querySelector(route.all?"[data-all]":`[data-framework="${route.fw}"]`)?.focus({preventScroll:true});
  }
});
window.addEventListener("pagehide",remember);
window.addEventListener("popstate",()=>{
  const old=route;practiceRequest++;route=readRoute();if(route.practice)closed=false;renderSide();
  if(route.page!==old.page||route.tab!==old.tab){restoring=true;frame.src=path(route.page);}
});
matchMedia("(max-width:850px)").addEventListener("change",()=>{closed=mobile();updatePane();});
frame.addEventListener("load",bind);route=readRoute();
if(route.practice)closed=false;
const navigation=performance.getEntriesByType("navigation")[0]?.type;
pendingJump=!route.practice && new URLSearchParams(location.search).has("point") && route.tab==="learn" &&
  (navigation==="navigate" || !sessionStorage.getItem(scrollKey()));
renderSide();frame.src=path(route.page);
})();
