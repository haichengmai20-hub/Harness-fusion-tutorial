const nav = document.querySelector("#outline");
const menu = document.querySelector("#catalog");
menu.onclick = () => menu.setAttribute("aria-expanded",String(nav.classList.toggle("open")));
document.addEventListener("keydown",event=>{
  if(event.key==="Escape"&&nav.classList.contains("open")){nav.classList.remove("open");menu.setAttribute("aria-expanded","false");menu.focus();}
});
document.addEventListener("click",async event=>{
  const btn=event.target.closest("button");
  if(!btn)return;
  if(btn.hasAttribute("data-choice")){
    const root=btn.closest("[data-tab-set]");
    for(const choice of root.querySelector(":scope>.tab-list").children)choice.setAttribute("aria-pressed",String(choice===btn));
    for(const panel of root.querySelectorAll(":scope>[data-panel]"))panel.hidden=panel.dataset.panel!==btn.dataset.choice;
  }
  if(btn.hasAttribute("data-copy")){
    const value=btn.closest(".code-example").querySelector("pre code").textContent;
    try{await navigator.clipboard.writeText(value);btn.textContent="已复制";}
    catch{const range=document.createRange();range.selectNodeContents(btn.closest(".code-example").querySelector("pre"));const selected=window.getSelection();selected.removeAllRanges();selected.addRange(range);btn.textContent="已选中";}
  }
});
const current=nav.querySelector("[aria-current=page]");
if(current)nav.scrollTop=Math.max(0,current.offsetTop-nav.clientHeight/2);
