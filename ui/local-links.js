function bindStudyLinks(container){
  let editor="vscode";
  try {editor=localStorage.getItem("reader.sourceEditor")==="cursor"?"cursor":"vscode";}catch{}
  const selector=container.querySelector("[data-study-editor]");
  if(selector){
    selector.value=editor;
    selector.onchange=()=>{
      try{localStorage.setItem("reader.sourceEditor",selector.value);}catch{}
      bindStudyLinks(container);
    };
  }
  const links=[...container.querySelectorAll("[data-study-path]")];
  if(!links.length)return;
  if(!["127.0.0.1","localhost","[::1]"].includes(location.hostname))return;
  const roots=bindStudyLinks.roots ||= fetch("/__study_local__/editors.json").then(r=>r.ok?r.json():{}).catch(()=>({}));
  roots.then(map=>{
    const keys=Object.keys(map).sort((a,b)=>b.length-a.length);
    for(const link of links){
      const ref=link.dataset.studyPath;
      const key=keys.find(k=>ref.startsWith(k+"/"));
      if(!key||!map[key]){link.removeAttribute("href");link.title=ref+"（本机未安装此资料）";continue;}
      const path=map[key]+ref.slice(key.length);
      const uriPath=path.split("/").map((part,i)=>i===0&&/^[a-z]:$/i.test(part)?part:encodeURIComponent(part)).join("/");
      link.href=editor+"://file/"+uriPath.replace(/^\/+/,"")+":"+Number(link.dataset.line||1);
      link.title=path+":"+Number(link.dataset.line||1);
    }
  });
}
if(document.querySelector('main [data-study-path]'))bindStudyLinks(document);

