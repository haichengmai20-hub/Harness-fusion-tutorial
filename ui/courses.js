function mountCourseSwitcher(data, initial, escape){
  const names={claude:"Learn Claude Code",hermes:"Hermes",dsh:"dsh",agentscope:"AgentScope"};
  const $=s=>document.querySelector(s);
  const valid=id=>Object.hasOwn(names,id);
  const storeKey="harness.reader.courses.v1.";
  function recall(key){try{return JSON.parse(localStorage.getItem(storeKey+key));}catch{return null;}}
  function save(key,value){try{localStorage.setItem(storeKey+key,JSON.stringify(value));}catch{}}
  const primary=valid(initial.get("primary"))?initial.get("primary"):
    initial.size===0 && valid(recall("last"))?recall("last"):"claude";
  const catalog=data.courses[primary];
  const others=Object.keys(names).filter(id=>id!==primary);
  const mainSelector=$("#primary-course");mainSelector.value=primary;
  const iframe=$("#original-frame");
  const mobile=()=>matchMedia("(max-width:850px)").matches;
  function urlFor(dest,params){
    const p=new URLSearchParams(params);p.set("primary",dest);
    if(dest==="claude")p.set("mode","original");
    return "?"+p.toString();
  }
  function resume(dest){
    const saved=recall("url."+dest);
    if(typeof saved==="string"&&saved.startsWith("?")){
      const p=new URLSearchParams(saved);
      p.set("resume","1");
      return urlFor(dest,p);
    }
    return urlFor(dest,dest==="claude"?{chapter:"s01",harness:primary}:{lesson:data.courses[dest].lessons[0].id,against:primary});
  }
  function remember(){
    if(!location.search && primary!=="claude")return;
    save("url."+primary,location.search||"?mode=original");save("last",primary);
  }
  window.addEventListener("pagehide",remember);
  mainSelector.addEventListener("change",()=>{const target=mainSelector.value;remember();location.assign(resume(target));});
  function related(dest,topic,index){
    if(!topic)return null;
    if(dest==="claude")return data.crosswalk[topic]?{id:topic,title:data.chapters.find(v=>v.id===topic)?.title||topic,point:index,shared:!!index}:null;
    const lessons=data.courses[dest]?.lessons||[];
    if(index)for(const l of lessons){
      const i=(l.points||[]).findIndex(p=>p.topic===topic && p.crosswalk===index);
      if(i>=0)return {id:l.id,title:l.title,point:i+1,shared:true};
    }
    for(const l of lessons){
      const i=(l.points||[]).findIndex(p=>p.topic===topic);
      if(i>=0)return {id:l.id,title:l.title,point:i+1,exact:false};
    }
    const l=lessons.find(l=>(l.topics||[]).includes(topic));
    return l?{id:l.id,title:l.title,point:1,exact:false}:null;
  }
  function switchLink(dest,topic,index,direct){
    const own=direct&&(dest==="claude"?data.chapters.find(l=>l.id===direct.lesson):
      data.courses[dest]?.lessons.find(l=>l.id===direct.lesson));
    const ref=own?{id:own.id,title:own.title,point:direct.point,exact:direct.grade==="对应"}:related(dest,topic,index);
    let url,label;
    if(!ref){
      url=dest==="claude"?urlFor(dest,{chapter:"home",harness:primary}):urlFor(dest,{lesson:"home",against:primary});
      label="打开课程首页";
    }else{
      const p=dest==="claude"?{chapter:ref.id,harness:primary}:{lesson:ref.id,against:primary};
      if(ref.point)p.point=ref.point;
      url=urlFor(dest,p);
      const targetPoint=ref.point && (dest==="claude"?data.crosswalk[ref.id]?.[ref.point-1]?.section:
        data.courses[dest].lessons.find(l=>l.id===ref.id)?.points?.[ref.point-1]?.label);
      label=(ref.exact?"同一问题":ref.shared?"共同机制的阅读位置":"相关章节")+" · "+ref.title+(targetPoint?" / "+targetPoint:"");
    }
    return `<a class="primary-link" data-promote="${dest}" href="${escape(url)}">用 ${escape(names[dest])} 作主课 → ${escape(label)}</a>`;
  }
  if(primary==="claude"){
    if(!initial.size && recall("last")==="claude" && recall("url.claude") && recall("url.claude")!=="?mode=original"){
      location.replace(resume("claude"));return {native:true};
    }
    save("last",primary);
    return {native:false,switchLink};
  }

  // The selected course owns the chapter list, paths, main document and reading position.
  const lessons=catalog.lessons,byId=new Map(lessons.map(l=>[String(l.id),l]));
  const params=new URLSearchParams(!initial.has("lesson")?(recall("url."+primary)||location.search):location.search);
  for(const [k,v] of initial)params.set(k,v);
  const preferred=params.get("lesson");
  let current=preferred==="home"?"home":byId.has(preferred)?preferred:String(lessons[0].id);
  let against=others.includes(params.get("against"))?params.get("against"):others[0];
  let all=params.get("compare")==="all",index=Math.max(0,Number.parseInt(params.get("point")||"1",10)-1)||0;
  let closed=mobile(),lastHref="",bound=null,observer=null,scheduled=0,restoreTimer=0,docEpoch=0;
  const navigationType=performance.getEntriesByType("navigation")[0]?.type;
  let scrollTarget=initial.has("point") && initial.get("resume")!=="1" &&
    (navigationType==="navigate" || !Array.isArray(recall("scroll."+primary+"."+current)));
  let desiredNavigation=null,suppressUntil=0,listeners=null;
  const lesson=()=>byId.get(current);
  const pointList=l=>(l?.points||[]);
  const point=()=>pointList(lesson())[index];
  const homePath=catalog.home;
  const norm=p=>decodeURI(p).replace(/\/index\.html?$/i,"/").replace(/\/+$/,"")||"/";
  const asUrl=p=>new URL(p,location.origin);
  const mount=norm(catalog.mount)+"/";
  function localPath(p){const u=asUrl(p);return u.origin===location.origin&&(norm(u.pathname)+"/").startsWith(mount);}
  function identify(u){
    const path=norm(u.pathname);
    const candidates=lessons.filter(l=>norm(asUrl(l.path).pathname)===path);
    const exact=candidates.find(l=>{
      const dest=asUrl(l.path);
      return dest.hash===u.hash && [...dest.searchParams].every(([k,v])=>u.searchParams.get(k)===v);
    });
    if(exact)return String(exact.id);
    if(u.hash){
      const byHash=candidates.find(l=>asUrl(l.path).hash && asUrl(l.path).hash===u.hash);
      if(byHash)return String(byHash.id);
    }
    if(candidates.length===1&&!asUrl(candidates[0].path).hash)return String(candidates[0].id);
    return "home";
  }
  function setUrl(push=false){
    const p={lesson:current,against};
    if(index)p.point=index+1;if(all)p.compare="all";
    const dest=urlFor(primary,p);
    if(location.search!==dest)history[push?"pushState":"replaceState"](null,"",dest);
    remember();
  }
  const chapterSelect=$("#chapter");
  chapterSelect.innerHTML='<option value="home">课程首页</option>';
  let group="",parent=chapterSelect;
  for(const l of lessons){
    const key=l.group||l.module||"";
    if(key!==group){
      group=key;parent=chapterSelect;
      if(key){parent=document.createElement("optgroup");parent.label=key;chapterSelect.append(parent);}
    }
    const number=l.number ?? (/^chapter-(\d+)$/.exec(l.id)?.[1]);
    parent.append(new Option((number!=null?number+" · ":"")+l.title,l.id));
  }
  const chapterName=()=>lesson()?.title||catalog.title;
  $("#home").href=urlFor(primary,{lesson:"home",against});
  iframe.title=catalog.title;
  $("#lab").hidden=true;
  $("#practice-panel").hidden=true;
  function renderTop(){
    chapterSelect.value=current;
    document.title=`${chapterName()} · ${names[primary]} 主课`;
    $(".eyebrow").textContent=names[primary]+" 主课";
    $("#side-heading").textContent=chapterName();
    const context=$("#course-context");context.hidden=false;
    const group=lesson()?.group||lesson()?.module||"";
    context.textContent=[catalog.title,group].filter(Boolean).join(" · ");
    $("#online").href=lesson()?.online||catalog.website||catalog.source;$("#online").textContent="上游来源 ↗";
    document.body.classList.toggle("closed",closed);
    $("#toggle").textContent=closed?"打开对照":mobile()?"返回主课":"收起对照";
    $("#toggle").setAttribute("aria-expanded",String(!closed));
    refreshPractice();
  }
  function refreshPractice(){
    const l=lesson(),b=$("#practice-open");
    const configured=!!(l?.practiceSelector||l?.practiceNeedle||catalog.practiceSelector);
    const hasCode=!!bound?.querySelector("pre");
    b.hidden=!l || (!configured&&!hasCode);
    b.textContent=l?.practiceLabel||catalog.practiceLabel||(configured?"本课练习":"本课示例");
    b.removeAttribute("aria-controls");
  }
  function showSide(){
    renderTop();const l=lesson(),ps=pointList(l);
    index=Math.max(0,Math.min(index,ps.length-1));const p=point();
    const selector=ps.length>1?`<label class="which">主课里的问题<select id="concept">${ps.map((v,i)=>`<option value="${i}" ${i===index?"selected":""}>${escape(v.label)}</option>`).join("")}</select></label>`:"";
    $("#questions").innerHTML=l
      ? selector+`<div class="ref"><small>${escape(names[primary])} · ${escape(p?.label||l.title)}</small><h2>${escape(p?.question||l.title)}</h2><p>${escape(p?.detail||"本节可从左侧阅读全文，尚无独立核实的逐点对照。")}</p>${p?.needle?'<button data-primary-locate>定位主课原文 ↗</button>':""}<div class="where" id="where" role="status"></div></div>`
      : `<div class="aux"><p>${escape(catalog.title)}</p><p>按这门课自己的目录选择章节，右侧将显示其他三家对同一问题的处理方式。</p><button data-first>开始第一课 →</button></div>`;
    showAnswers();
  }
  function showAnswers(){
    const p=point();
    $("#responses").innerHTML=`<div class="switches" aria-label="选择对照课程">${others.map(id=>`<button data-framework="${id}" aria-pressed="${!all&&against===id}">${names[id]}</button>`).join("")}<button data-all aria-pressed="${all}">三家并看</button></div>`+
      (all?others:[against]).map(id=>{
        const topic=p?.topic,ix=p?.crosswalk;
        const direct=data.peerLinks?.[primary]?.[current]?.[String(index+1)]?.[id];
        const row=!direct&&Number.isInteger(ix)?data.crosswalk[topic]?.[ix-1]:null;
        const map=data.mappings[topic]?.[id];
        const covered=row&&[row.match[primary],id==="claude"?"对应":row.match[id]];
        const grade=direct?.grade||(covered?(covered.includes("待核")?"部分待核":covered.includes("部分对应")?"部分对应":"机制参照"):(topic?"仅章级关联":"待核"));
        const text=direct?.text||(row?(id==="claude"?row.baseline:row.frames[id]).replaceAll("原课","Learn Claude Code 教学例"):id!=="claude"&&map?map.checkpoint:
          topic?"这门课在该主题下有相关章节，尚未核实当前问题的逐点对应。":"目前未核实这门课有直接对应的讲解。");
        const source=direct?.url||(row&&id==="claude"?`https://learn.shareai.run/zh/${topic}/`:row?.links?.[id]||map?.url);
        return `<article class="response"><header><h3>${names[id]}</h3><span class="grade ${grade==="对应"||grade==="机制参照"?"":grade.includes("待核")?"unknown":"partial"}">${escape(grade)}</span></header>${row?`<small>两课可参照的机制问题</small><p class="common-question">${escape(row.question)}</p>`:""}<p>${escape(text)}</p>${source?`<a href="${escape(source)}" target="_blank" rel="noopener noreferrer">${direct||id==="claude"?"对照出处":"固定版本源码"} ↗</a>`:""}${switchLink(id,topic,ix,direct)}</article>`;
      }).join("");
  }
  function findContent(d,needle){
    if(!needle)return null;
    const hash=lesson()?asUrl(lesson().path).hash.slice(1):"";
    const fragment=hash?d.getElementById(decodeURIComponent(hash)):null;
    const roots=fragment?[fragment]:[...d.querySelectorAll("article, main, .lesson-prose"),d.body];
    for(const base of roots.filter(el=>el?.getClientRects().length)){
      const walk=d.createTreeWalker(base,NodeFilter.SHOW_TEXT);let n;
      while((n=walk.nextNode())){
        if(n.parentElement.closest("nav,aside,header,script,style,textarea,select,button"))continue;
        const at=n.data.indexOf(needle);if(at<0)continue;
        const r=d.createRange();r.setStart(n,at);r.setEnd(n,at+needle.length);
        if(r.getClientRects().length)return r;
      }
      const flat=s=>s.replace(/\s+/g," ").trim();
      const el=[...base.querySelectorAll("h1,h2,h3,h4,summary,p,li,pre,code")].find(el=>
        !el.closest("nav,aside,header")&&el.getClientRects().length&&flat(el.textContent).includes(flat(needle)));
      if(el){const r=d.createRange();r.selectNodeContents(el);return r;}
    }
    return null;
  }
  function reveal(r){
    if(!r)return false;
    const el=r.startContainer.nodeType===Node.TEXT_NODE?r.startContainer.parentElement:r.startContainer;
    for(let p=el;p;p=p.parentElement)if(p.tagName==="DETAILS")p.open=true;
    el.scrollIntoView({block:"center"});
    const sel=r.startContainer.ownerDocument.defaultView.getSelection();sel.removeAllRanges();sel.addRange(r);
    return true;
  }
  function seek(){
    const p=point(),d=iframe.contentDocument;
    if(!p||!d)return;
    suppressUntil=Date.now()+550;
    const found=reveal(findContent(d,p.needle));
    if(mobile()&&found){closed=true;renderTop();}
    const status=$("#where");if(status)status.textContent=found?"已定位 · "+p.needle:"当前页签没有显示这个锚点，可在本课正文中查看「"+p.label+"」。";
  }
  function practice(){
    const l=lesson(),d=iframe.contentDocument;if(!l||!d)return;
    const selector=l.practiceSelector||catalog.practiceSelector;
    const candidates=selector?[...d.querySelectorAll(selector)]:[];
    let el=l.practiceNeedle?candidates.find(el=>el.textContent.includes(l.practiceNeedle)):candidates[0];
    if(!el&&l.practiceNeedle){
      const found=findContent(d,l.practiceNeedle);
      if(reveal(found)){if(mobile()){closed=true;renderTop();}return;}
    }
    if(!el)el=candidates[0]||d.querySelector("main pre,article pre,pre");
    if(el){if(el.matches("button,a,summary"))el.click();else el.scrollIntoView({block:"center"});}
    const status=$("#where");if(status)status.textContent=el?"已打开本课的练习或代码位置。":"请在主课正文查看本节示例；本页未核实可单独打开的练习控件。";
    if(el&&mobile()){closed=true;renderTop();}
  }
  function scrollKey(){return `scroll.${primary}.${current}`;}
  function positions(d){
    const regions=[...d.querySelectorAll("main,article,[class*='overflow-y'],[class*='scroll']")].filter(el=>
      el!==d.scrollingElement && el.scrollHeight>el.clientHeight+80 && /auto|scroll/.test(d.defaultView.getComputedStyle(el).overflowY));
    return [d.scrollingElement,...regions].filter(Boolean);
  }
  function saveScroll(){
    if(!bound||desiredNavigation||!lesson()||bound!==iframe.contentDocument)return;
    save(scrollKey(),positions(bound).map(el=>el.scrollTop));
  }
  function followReading(d){
    if(d!==bound || desiredNavigation || Date.now()<suppressUntil)return;
    const line=Math.min(165,iframe.clientHeight*.25);
    // Some original courses lay out several anchored chapters on a single page.
    // Read the visible chapter from its real section, never from a sidebar heading.
    const section=lessons.find(l=>{
      const url=asUrl(l.path);
      if(!url.hash||norm(url.pathname)!==norm(d.location.pathname))return false;
      const node=d.getElementById(decodeURIComponent(url.hash.slice(1)));
      if(!node||node.closest("nav,aside,header"))return false;
      const rect=node.getBoundingClientRect();return rect.height>160&&rect.top<=line&&rect.bottom>line;
    });
    if(section&&current!==String(section.id)){current=String(section.id);index=0;setUrl();showSide();}
    let best=-1,closest=-Infinity;
    pointList(lesson()).forEach((p,i)=>{
      const r=findContent(d,p.needle);if(!r)return;
      const top=r.getBoundingClientRect().top;
      if(top<=line && top>-iframe.clientHeight && top>closest){best=i;closest=top;}
    });
    if(best>=0&&best!==index){index=best;setUrl();showSide();}
    saveScroll();
  }
  function afterLayout(){
    clearTimeout(restoreTimer);const epoch=docEpoch;
    let retry=0;
    const restore=()=>{
      if(epoch!==docEpoch||!lesson()||!bound)return;
      if(scrollTarget){
        if(point()?.needle && !findContent(bound,point().needle) && ++retry<20){
          restoreTimer=setTimeout(restore,100);return;
        }
        scrollTarget=false;seek();return;
      }
      const values=recall(scrollKey());if(!Array.isArray(values))return;
      const regions=positions(bound);
      if(values.some((y,i)=>y>0 && (!regions[i] || regions[i].scrollHeight-regions[i].clientHeight+2<y)) && ++retry<20){
        restoreTimer=setTimeout(restore,100);return;
      }
      suppressUntil=Date.now()+250;
      regions.forEach((el,i)=>{if(values[i]>=0)el.scrollTop=values[i];});
    };
    restoreTimer=setTimeout(restore,120);
  }
  function synchronize(){
    scheduled=0;const d=iframe.contentDocument;
    if(!d||!d.body||!localPath(d.URL))return;
    refreshPractice();
    const u=asUrl(iframe.contentWindow.location.href);
    if(lastHref===u.href)return;
    const next=identify(u);
    if(desiredNavigation && desiredNavigation!==next && d.readyState==="loading")return;
    desiredNavigation=null;lastHref=u.href;
    if(byId.has(next))save("nativePath."+primary+"."+next,u.pathname+u.search+u.hash);
    if(next!==current){current=next;index=0;scrollTarget=false;setUrl();showSide();afterLayout();}
  }
  function schedule(){if(!scheduled)scheduled=requestAnimationFrame(synchronize);}
  function bind(){
    const d=iframe.contentDocument;if(!d?.body||!localPath(d.URL))return;
    observer?.disconnect();listeners?.abort();bound=d;docEpoch++;
    listeners=new d.defaultView.AbortController();
    const signal=listeners.signal;
    for(const event of ["pointerdown","wheel","keydown"]){
      d.addEventListener(event,()=>{clearTimeout(restoreTimer);scrollTarget=false;},{once:true,signal,passive:true});
    }
    observer=new MutationObserver(schedule);observer.observe(d.body,{childList:true,subtree:true});
    d.defaultView.addEventListener("hashchange",schedule,{signal});d.defaultView.addEventListener("popstate",schedule,{signal});
    d.addEventListener("click",e=>{
      const a=e.target.closest?.("a[href]");if(!a||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
      const u=new URL(a.href);
      if(["http:","https:"].includes(u.protocol)&&u.origin!==location.origin){
        if(a.target!=="_blank"){e.preventDefault();e.stopImmediatePropagation();window.open(u.href,"_blank","noopener,noreferrer");}
      }else if(localPath(u.href)&&identify(u)!==current){saveScroll();}
      schedule();
    },{capture:true,signal});
    let timer;
    d.addEventListener("scroll",()=>{clearTimeout(timer);timer=setTimeout(()=>followReading(d),160);},{capture:true,passive:true,signal});
    synchronize();afterLayout();
  }
  function load(keepScroll=false){
    const previous=lesson()?recall("nativePath."+primary+"."+current):null;
    const path=typeof previous==="string" && localPath(previous) && identify(asUrl(previous))===current
      ?previous:lesson()?.path||homePath;
    if(!localPath(path))throw new Error("Invalid course path");
    desiredNavigation=current;docEpoch++;lastHref="";bound=null;observer?.disconnect();suppressUntil=Date.now()+600;
    if(!keepScroll)scrollTarget=false;
    const url=asUrl(path);
    // The same-document hash can change without emitting an iframe load event.
    if(iframe.contentDocument?.URL?.split("#")[0]===url.href.split("#")[0]){
      iframe.contentWindow.location.replace(url.href);bind();
    }else iframe.src=url.href;
  }
  function choose(id){
    if(id===current)return;
    saveScroll();current=id;index=0;if(mobile())closed=true;
    showSide();setUrl(true);load();
  }
  chapterSelect.onchange=e=>choose(e.target.value);
  $("#home").onclick=e=>{e.preventDefault();choose("home");};
  $("#toggle").onclick=()=>{closed=!closed;renderTop();};$("#practice-open").onclick=practice;
  $("#companion").addEventListener("change",e=>{
    if(e.target.id!=="concept")return;
    index=Number(e.target.value);setUrl();showSide();seek();
  });
  $("#companion").addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b)return;
    if(b.hasAttribute("data-first")){choose(String(lessons[0].id));return;}
    if(b.hasAttribute("data-primary-locate")){seek();return;}
    if(b.dataset.framework||b.hasAttribute("data-all")){
      if(b.dataset.framework){against=b.dataset.framework;all=false;}else all=true;
      setUrl();showAnswers();
      $("#responses").querySelector(all?"[data-all]":`[data-framework="${against}"]`)?.focus({preventScroll:true});
    }
  });
  matchMedia("(max-width:850px)").addEventListener("change",()=>{closed=mobile();renderTop();});
  window.addEventListener("pagehide",saveScroll);
  window.addEventListener("popstate",()=>location.reload());
  iframe.addEventListener("load",bind);showSide();setUrl();load(true);
  return {native:true};
}

