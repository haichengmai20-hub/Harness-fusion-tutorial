"""Use a temporary Chrome profile and local server to read every static document."""
import json
import os
from html import unescape
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import subprocess
import tempfile
from threading import Event, Thread

HERE = Path(__file__).resolve().parent
CHECK_PAGE = """<!doctype html><meta charset="utf-8"><body><iframe id="f" width="710" height="840"></iframe><pre id="result"></pre>
<script>
(async () => {
  const rows = MANIFEST, result = {pages:0, points:0, codeBlocks:0, media:0, choices:0, figures:0, errors:[]};
  const f=document.querySelector('#f');
  try {
    for(const lesson of rows){
      await new Promise(done=>{f.onload=done;f.src=lesson.path;});
      const doc=f.contentDocument, article=doc.querySelector('article');
      if(!article || article.querySelector('h1')?.innerText!==lesson.heading) throw Error(lesson.id+' 标题缺失');
      result.pages++; result.codeBlocks+=article.querySelectorAll('pre').length;
      for(const p of lesson.points){
        const w=doc.createTreeWalker(article,NodeFilter.SHOW_TEXT);
        let hit=null;
        for(let n=w.nextNode();n;n=w.nextNode()){
          const offset=n.data.indexOf(p.needle);
          if(offset<0 || !n.parentElement.getClientRects().length)continue;
          const r=doc.createRange();r.setStart(n,offset);r.setEnd(n,offset+p.needle.length);
          if(r.getBoundingClientRect().height>0){hit=r;break;}
        }
        if(!hit) throw Error(lesson.id+' 可见教学点缺失 '+p.needle);
        result.points++;
      }
      for(const img of article.querySelectorAll('img')){
        img.loading='eager'; await img.decode();
        if(!img.naturalWidth)throw Error(lesson.id+' 图片未解码 '+img.src);
        result.media++;if(img.src.includes('/diagrams/'))result.figures++;
      }
      for(const set of article.querySelectorAll('[data-tab-set]')){
        const buttons=[...set.querySelector(':scope>.tab-list').children];
        for(const button of buttons){button.click();
          const panes=[...set.querySelectorAll(':scope>[data-panel]')].filter(x=>!x.hidden);
          if(panes.length!==1 || panes[0].dataset.panel!==button.dataset.choice ||
             !(panes[0].textContent||'').trim())throw Error(lesson.id+' 标签无法切换');
          result.choices++;
        }
      }
      for (const details of article.querySelectorAll('details.fold')){
        const summary=details.querySelector(':scope>summary');summary.click();
        if(!details.open)throw Error(lesson.id+' 说明无法展开');summary.click();
      }
    }
    const menu=f.contentDocument.querySelector('#catalog');menu.click();
    if(menu.getAttribute('aria-expanded')!=='true') throw Error('窄屏目录未展开');
    const offsite=performance.getEntriesByType('resource').filter(r=>new URL(r.name).origin!==location.origin);
    if(offsite.length)throw Error('发现外站资源请求');
  }catch(e){result.errors.push(String(e));}
  document.querySelector('#result').textContent=JSON.stringify(result);
  await fetch('/__finished__',{method:'POST',body:JSON.stringify(result)});
})();
</script><img alt="" hidden src="/__keep_open__">"""


def run():
    files = HERE / "site"
    manifest = json.loads((HERE / "manifest.json").read_bytes())["lessons"]
    requests = []
    finished = Event()
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(files), **kwargs)
        def do_GET(self):
            if self.path == "/__audit__":
                data = CHECK_PAGE.replace("MANIFEST", json.dumps(manifest, ensure_ascii=True).replace("<", "\\u003c")).encode()
                self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
            elif self.path == "/__keep_open__":
                finished.wait(90)
                self.send_response(204); self.end_headers()
            else:
                super().do_GET()
        def do_POST(self):
            if self.path != "/__finished__": self.send_error(404);return
            self.rfile.read(int(self.headers.get("Content-Length",0)))
            finished.set()
            self.send_response(204);self.end_headers()
        def log_error(self, *args):
            pass
        def log_request(self, code="-", size="-"):
            if isinstance(code, int) and code >= 400 and self.path != "/favicon.ico":
                requests.append([self.path, code])

    candidates = [os.environ.get("BROWSER_EXE",""), os.environ.get("ProgramFiles","")+"/Google/Chrome/Application/chrome.exe",
                  os.environ.get("ProgramFiles(x86)","")+"/Microsoft/Edge/Application/msedge.exe","/usr/bin/chromium","/usr/bin/google-chrome"]
    browser = next(p for p in candidates if Path(p).is_file())
    with ThreadingHTTPServer(("127.0.0.1",0),Handler) as server, tempfile.TemporaryDirectory(prefix="agentscope-browser-") as profile:
        Thread(target=server.serve_forever,daemon=True).start()
        target = f"http://127.0.0.1:{server.server_port}/__audit__"
        try:
            proc = subprocess.run([browser,"--headless=new","--disable-gpu","--disable-extensions","--disable-background-networking",
                                   "--no-first-run","--no-default-browser-check","--no-proxy-server",
                                   "--host-resolver-rules=EXCLUDE 127.0.0.1, EXCLUDE localhost, MAP * ~NOTFOUND","--user-data-dir="+profile,
                                   "--timeout=90000","--window-size=760,900","--dump-dom",target],
                                  capture_output=True,timeout=120,check=True)
        finally:
            server.shutdown()
    raw = re.search(r'<pre id="result">([^<]+)</pre>',proc.stdout.decode("utf8"))
    assert raw,"Chrome did not finish the course audit. "+repr((browser,proc.stdout[:310],proc.stderr[-1400:]))
    result = json.loads(unescape(raw[1]))
    assert result["pages"]==60 and result["points"]>=60 and result["figures"]==15 and result["choices"]>0, result
    assert not requests and not result["errors"], (requests,result)
    result["mode"]="真实 Chrome · 本机静态服务 · 外站域名解析已阻断"
    (HERE/"browser-verification.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print(json.dumps(result,ensure_ascii=False))


if __name__=="__main__":
    run()
