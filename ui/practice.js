function createPracticePanel(root, data, escape){
  const notes = new Map();
  let displayed = null;
  const storageKey = id => "original.reader.practice.v1:" + id;
  function noteFor(id){
    if(!notes.has(id)){
      let note="";
      try {note=localStorage.getItem(storageKey(id))||"";} catch {}
      notes.set(id,note);
    }
    return notes.get(id);
  }
  function renderBlocks(blocks){
    let html="", list="";
    for(const b of blocks){
      const kind=b.tag==="li"?(b.list==="ul"?"ul":"ol"):"";
      if(kind!==list || (list && b.start!==undefined)){
        if(list)html+=`</${list}>`;
        if(kind)html+=`<${kind}${kind==="ol"&&Number.isInteger(b.start)?` start="${b.start}"`:""}>`;
        list=kind;
      }
      const t=escape(b.text);
      if(kind)html+=`<li>${t}</li>`;
      else if(b.tag==="pre")html+=`<pre tabindex="0"><code>${t}</code></pre>`;
      else if(/^h[2-6]$/.test(b.tag))html+=`<h4>${t}</h4>`;
      else if(b.tag==="blockquote")html+=`<blockquote>${t}</blockquote>`;
      else html+=`<p>${t}</p>`;
    }
    return html+(list?`</${list}>`:"");
  }
  function show(id){
    root.hidden=!id;
    if(!id||id===displayed)return;
    const sections=data.practiceOriginal[id], p=data.practicePrompts[id];
    root.innerHTML=`
      <article class="practice-card" data-original-tasks>
        <h2>原课 · 试一下</h2>
        <button data-practice-original>定位左侧原题 ↗</button>
        <button data-observation-start>跳到免密钥观察 ↓</button>
        <small class="practice-guidance">以下命令用于原课配套工程。浏览器中的观察练习可直接在本页完成。</small>
        ${sections.map(section=>renderBlocks(section.blocks)).join("")}
      </article>
      <article class="practice-card observation" data-observation>
        <h2>配套观察练习</h2><p class="practice-question">${escape(p.question)}</p>
        <p>${escape(p.action)}</p>
        <button data-practice-observe>去原页观察 ↗</button>
        <label class="note-label" for="practice-note">我的预测 / 观察记录</label>
        <textarea id="practice-note" rows="3" placeholder="先写下预测，再记下你看到的字段或步骤。"></textarea>
        <small class="note-status" aria-live="polite"></small>
        <details id="practice-expected"><summary>核对参考现象</summary><p>${escape(p.expect)}</p></details>
        <button data-practice-compare>回到本题的框架对照 →</button>
      </article>
      <div id="practice-status" role="status"></div>`;
    displayed=id;
    root.querySelector("#practice-note").value=noteFor(id);
  }
  root.addEventListener("input",e=>{
    if(e.target.id!=="practice-note"||!displayed)return;
    const value=e.target.value;
    notes.set(displayed,value);
    const feedback=root.querySelector(".note-status");
    try {
      if(value)localStorage.setItem(storageKey(displayed),value);
      else localStorage.removeItem(storageKey(displayed));
      feedback.textContent=value?"已保存在本浏览器":"记录已清空";
    } catch {feedback.textContent="记录暂存在当前页面";}
  });
  root.addEventListener("click",e=>{
    if(e.target.closest("[data-observation-start]")){
      root.querySelector("[data-observation]").scrollIntoView({block:"start"});
      root.querySelector("[data-practice-observe]").focus({preventScroll:true});
    }
  });
  return show;
}

