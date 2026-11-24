// Compile the documentation MDX at build time. The reader needs no npm packages.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { readFile,writeFile,mkdir,mkdtemp,copyFile,rm,realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath,pathToFileURL } from "node:url";

const here=fileURLToPath(new URL(".",import.meta.url));
const dep=createRequire(path.join(process.env.AS_DOCS_DEPS||here,"package.json"));
const {evaluate}=await import(pathToFileURL(dep.resolve("@mdx-js/mdx")));
const {default:gfm}=await import(pathToFileURL(dep.resolve("remark-gfm")));
const React=dep("react"), h=React.createElement, runtime=dep("react/jsx-runtime");
const {renderToStaticMarkup}=dep("react-dom/server");
const cfg=JSON.parse(await readFile(path.join(here,"manifest.json"),"utf8"));
const site=path.join(here,"site/agentscope-course"), base=cfg.home;
const official="https://docs.agentscope.io", prefix="/zh/versions/2.0.12/";
const bySlug=new Map(cfg.lessons.map(x=>[x.slug,x]));
const diagrams=new Map();
const text=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const simple=children=>React.Children.toArray(children).map(c=>typeof c==="string"||typeof c==="number"?String(c):simple(c.props?.children)).join("");
function link(href,lesson) {
  if(!href||href.startsWith("#")||href.startsWith("mailto:"))return href;
  const url=new URL(href,lesson.online);
  if(url.origin!==official)return url.href;
  if(url.pathname.startsWith(prefix)){
    const key=decodeURI(url.pathname.slice(prefix.length)).replace(/\/$|\.mdx$/g,"")||"index";
    if(bySlug.has(key)){
      const fragment=key==="building-blocks/middleware" && url.hash==="#ttsmiddleware" ? "#语音生成" : url.hash;
      return bySlug.get(key).path+url.search+fragment;
    }
  }
  if(url.pathname.endsWith("/2.0.12/deploy/openapi.json"))return base+"openapi.json"+url.hash;
  if(url.pathname.startsWith("/images/"))return base+url.pathname.slice(1);
  return url.href;
}
function collectCode() {
  return function transformer(ast) {
    function visit(node) {
      if(node.name==="img" && Array.isArray(node.attributes)){
        const src=node.attributes.find(a=>a.name==="src");
        if(src?.value?.startsWith("/images/"))src.value=base+src.value.slice(1);
        if(!node.attributes.some(a=>a.name==="loading"))node.attributes.push({type:"mdxJsxAttribute",name:"loading",value:"lazy"});
      }
      if(node.type==="code"){
        const data=node.data??={};data.hProperties??={};
        const caption=node.meta?.match(/^title=(["'])(.*?)\1$/)?.[2]||node.meta;
        data.hProperties["data-caption"]=caption||node.lang||"代码";
        data.hProperties["data-lang"]=node.lang||"text";
      }
      for(const child of node.children||[])visit(child);
    }
    visit(ast);
  };
}

function componentMap(lesson) {
  const used=new Map();
  function heading(tag) {return function Heading({children}){
    const raw=simple(children).toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu,"").replace(/\s+/g,"-");
    const n=used.get(raw)||0;used.set(raw,n+1);
    return h(tag,{id:n?raw+"-"+(n+1):raw},children);
  };}
  function tabbed(children,kind){
    const items=React.Children.toArray(children).filter(React.isValidElement);
    const labels=items.map((c,i)=>c.props.title||c.props.children?.props?.["data-caption"]||"示例 "+(i+1));
    return h("div",{className:"tab-set","data-tab-set":""},
      h("div",{className:"tab-list",role:"group","aria-label":kind},
        labels.map((name,i)=>h("button",{key:i,type:"button","data-choice":i,"aria-pressed":i===0},name))),
      items.map((c,i)=>h("div",{key:i,"data-panel":i,hidden:i!==0},c)));
  }
  const Tree=({children})=>h("ul",{className:"tree"},children);
  Tree.Folder=({name,children,defaultOpen})=>h("li",{},h("details",{open:!!defaultOpen},h("summary",{},name),h("ul",{},children)));
  Tree.File=({name})=>h("li",{},h("code",{},name));
  const Group=({children})=>h("div",{className:"mdx-group"},children);
  const boxes=Object.fromEntries(["Note","Tip","Warning","Info"].map((name,i)=>[name,({children})=>h("aside",{className:"notice "+name.toLowerCase()},h("strong",{},["说明","提示","注意","信息"][i]),children)]));
  function Accordion({title,description,children}){return h("details",{className:"fold"},h("summary",{},title||"展开详情",description&&h("small",{}," · "+description)),children);}
  return {...boxes,Tree,Accordion,Expandable:Accordion,AccordionGroup:Group,CardGroup:({children})=>h("div",{className:"cards"},children),
    Badge:({children})=>h("small",{className:"badge"},children),
    Card:({title,href,cta,children})=>h("div",{className:"card"},h("strong",{},href?h("a",{href:link(href,lesson)},title):title),children,
      cta&&href?h("a",{href:link(href,lesson),"data-card-cta":cta},cta):null),
    Frame:({caption,children})=>h("figure",{},children,caption&&h("figcaption",{},caption)),
    Steps:({children})=>h("div",{className:"steps"},children),
    Step:({title,children})=>h("section",{className:"step"},title&&h("h3",{},title),children),
    ParamField:({path,body,query,header,type,required,default:value,children})=>h("section",{className:"parameter","data-default":value},
      h("strong",{},h("code",{},path||body||query||header||"")," ",type&&h("small",{},type),
        required&&h("small",{}," · 必填"),value!==undefined&&h("small",{}," · 默认值 ",h("code",{},String(value)))),children),
    CodeGroup:({children})=>tabbed(children,"代码示例"),Tabs:({children})=>tabbed(children,"文档标签"),Tab:Group,
    a:({href,children,...other})=>h("a",{...other,href:link(href,lesson)},children),
    img:({src,alt,...rest})=>h("img",{...rest,src:link(src,lesson),alt:alt||"",loading:"lazy"}),
    pre:({children})=>{
      const code=simple(children), props=children.props||{}, lang=props["data-lang"]||"text";
      if(lang==="mermaid"){
        const id="diagram-"+createHash("sha256").update(code).digest("hex").slice(0,14);
        diagrams.set(id,code);
        return h("figure",{className:"diagram"},h("img",{src:base+"diagrams/"+id+".svg",alt:"本节流程图"}),
          h("details",{},h("summary",{},"查看流程图原文"),h("pre",{},children)));
      }
      return h("div",{className:"code-example"},h("div",{className:"code-bar"},h("span",{},props["data-caption"]||lang),h("button",{type:"button","data-copy":""},"复制")),
        h("pre",{tabIndex:0},children));
    },...Object.fromEntries(["h1","h2","h3","h4","h5","h6"].map(tag=>[tag,heading(tag)]))};
}
function genNavigation(lesson){
  let group="";
  return cfg.lessons.map(l=>{
    const parent=l.group!==group?'<div class="group">'+text(l.group)+'</div>':"";group=l.group;
    return parent+'<a href="'+text(l.path)+'" '+(l.id===lesson.id?'aria-current="page"':'')+'>'+text(l.title)+'</a>';
  }).join("")+'<div class="group">智能体即服务 / API</div><a href="'+base+'api/">API 参考</a>';
}
for(const [i,lesson] of cfg.lessons.entries()){
  const mdx=(await readFile(path.join(site,"mdx",lesson.slug+".mdx"),"utf8")).replace(/^---\s*\n[\s\S]*?\n---\s*\n/,"");
  const {default:Content}=await evaluate(mdx,{...runtime,remarkPlugins:[gfm,collectCode]});
  const article=renderToStaticMarkup(h(Content,{components:componentMap(lesson)}));
  const footer=[cfg.lessons[i-1],cfg.lessons[i+1]].map((l,j)=>l?'<a href="'+text(l.path)+'">'+(j?"下一节":"上一节")+' · '+text(l.title)+'</a>':"").join("");
  const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+text(lesson.title)+' · AgentScope</title><link rel="stylesheet" href="'+base+'reader.css"><script defer src="'+base+'reader.js"></script></head><body>'+
    '<header class="mast"><a href="'+base+'">AgentScope <small>中文文档</small></a><span>v2.0.12</span><button id="catalog" aria-controls="outline" aria-expanded="false">目录</button></header>'+
    '<div class="layout"><nav id="outline" aria-label="AgentScope 文档目录">'+genNavigation(lesson)+'</nav>'+
    '<main><div class="context">'+text(lesson.group)+'</div><article class="prose-custom" id="content"><h1>'+text(lesson.heading)+'</h1>'+
    (lesson.description?'<p class="dek">'+text(lesson.description)+'</p>':'')+article+'</article><footer><div class="paging">'+footer+'</div>'+
    '<div class="credits"><a href="'+text(lesson.online)+'" target="_blank" rel="noopener">在线原页</a> · <a href="'+base+'mdx/'+text(lesson.slug)+'.mdx">原始 MDX</a> · <a href="'+text(lesson.source)+'" target="_blank" rel="noopener">固定版本来源</a> · <a href="'+base+'LICENSE.txt">MIT 许可</a>'+
    (lesson.slug==="index"?' · <a href="https://github.com/lingyaolab/agentscope-py-guide" target="_blank" rel="noopener">社区版 Python 2.0.11 教程</a>':'')+'</div></footer></main></div></body></html>';
  const target=path.join(site,lesson.slug==="index"?"":lesson.slug);
  await mkdir(target,{recursive:true});await writeFile(path.join(target,"index.html"),html);
}

const spec=JSON.parse(await readFile(path.join(site,"openapi.json"),"utf8"));
const operations=Object.entries(spec.paths).flatMap(([route,methods])=>Object.entries(methods)
  .filter(([key])=>["get","put","post","patch","delete","head","options"].includes(key))
  .map(([method,op])=>'<details class="fold"><summary><strong>'+text(method.toUpperCase())+'</strong> '+text(route)+'</summary><h3>'+text(op.summary||op.operationId)+'</h3><p>'+text(op.description)+'</p><pre tabindex="0">'+text(JSON.stringify(op,null,2))+'</pre></details>'));
await mkdir(path.join(site,"api"),{recursive:true});
await writeFile(path.join(site,"api/index.html"),'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>API 参考 · AgentScope</title><link rel="stylesheet" href="'+base+'reader.css"></head><body><header class="mast"><a href="'+base+'">AgentScope 中文文档</a><span>v2.0.12</span></header><main><article class="prose-custom"><h1>API 参考</h1><p>浏览官方 OpenAPI 定义中的 '+operations.length+' 个操作。<a href="'+base+'openapi.json">完整接口、数据类型与引用</a></p>'+operations.join("")+'</article></main></body></html>');

async function renderDiagrams(){
  const chrome=[process.env.BROWSER_EXE,path.join(process.env.ProgramFiles||"","Google/Chrome/Application/chrome.exe"),
    path.join(process.env["ProgramFiles(x86)"]||"","Microsoft/Edge/Application/msedge.exe"),"/usr/bin/chromium","/usr/bin/google-chrome"].find(x=>x&&existsSync(x));
  if(!chrome)throw Error("Set BROWSER_EXE to Chrome/Edge for rendering the original Mermaid figures.");
  const tmp=await realpath(os.tmpdir()), dir=await mkdtemp(path.join(tmp,"as-offline-mermaid-"));
  try {
    const lib=path.join(path.dirname(dep.resolve("mermaid/package.json")),"dist/mermaid.min.js");
    await copyFile(lib,path.join(dir,"mermaid.min.js"));
    const pairs=JSON.stringify([...diagrams]).replaceAll("<","\\u003c");
    const driver='<!doctype html><meta charset="utf-8"><script src="mermaid.min.js"></script><body><pre id="result"></pre><script>(async()=>{const items='+pairs+';const output={};mermaid.initialize({startOnLoad:false,securityLevel:"strict",theme:"neutral",fontFamily:"Microsoft YaHei, sans-serif"});for(const [id,src] of items){try{const box=document.createElement("div");box.innerHTML=(await mermaid.render(id,src)).svg;output[id]=new XMLSerializer().serializeToString(box.firstElementChild)}catch(e){output[id]={error:String(e.message)}}}document.querySelector("#result").textContent=btoa(Array.from(new TextEncoder().encode(JSON.stringify(output)),x=>String.fromCharCode(x)).join(""));})();</script>';
    const page=path.join(dir,"render.html");await writeFile(page,driver);
    const dom=execFileSync(chrome,["--headless=new","--disable-gpu","--no-first-run","--disable-background-networking","--no-default-browser-check",
      "--user-data-dir="+path.join(dir,"profile"),"--virtual-time-budget=30000","--dump-dom",pathToFileURL(page).href],{encoding:"utf8",windowsHide:true,maxBuffer:24*1024*1024,stdio:["ignore","pipe","pipe"],timeout:90000});
    const raw=dom.match(/<pre id="result">([\w+/=]+)<\/pre>/)?.[1];
    assert.ok(raw,"Diagrams did not finish rendering.");
    const figures=JSON.parse(Buffer.from(raw,"base64").toString("utf8"));
    await mkdir(path.join(site,"diagrams"),{recursive:true});
    for(const [id,svg] of Object.entries(figures)){
      assert.ok(typeof svg==="string"&&svg.includes("<svg"),JSON.stringify([id,svg.error]));
      await writeFile(path.join(site,"diagrams",id+".svg"),svg);
    }
    assert.equal(Object.keys(figures).length,diagrams.size);
  } finally {
    const resolved=await realpath(dir);
    if(path.dirname(resolved)===tmp&&path.basename(resolved).startsWith("as-offline-mermaid-"))await rm(resolved,{recursive:true,force:true,maxRetries:3,retryDelay:200});
  }
}
if(process.env.AS_DOCS_KEEP_FIGURES==="1"){
  for(const id of diagrams.keys())assert.ok(existsSync(path.join(site,"diagrams",id+".svg")),id);
}else await renderDiagrams();
console.log(cfg.lessons.length+" MDX pages rendered; "+diagrams.size+" original Mermaid figures.");
