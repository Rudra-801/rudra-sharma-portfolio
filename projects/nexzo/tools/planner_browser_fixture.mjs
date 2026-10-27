// Isolated local browser fixture. Never contacts Firebase or an AI provider.
// Scores here are TEST FIXTURES, not assessments of student work.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../Frontend');
const allowed=new Set(['shared-state.js','settings-state.js','app-shell.js','task-store.js','planner-data.js','planner-controller.js','event-actions.js','streak-system.js','gamification-system.js','level-system.js','metric-authority.js']);
const fixture=`
window.NEXZOAI={evaluate:async payload=>{const r=await fetch('/fixture-evaluate',{method:'POST',body:JSON.stringify(payload)});const data=await r.json();if(!r.ok)throw Error(data.message);return data;}};
window.addEventListener('DOMContentLoaded',()=>{const panel=document.createElement('aside');panel.style.cssText='position:fixed;bottom:0;left:0;z-index:99999;background:#111;color:#ffd85b;padding:8px;max-width:100%';document.body.append(panel);const show=()=>{const s=window.NEXZOGamificationEngine?.state();panel.textContent='ISOLATED FIXTURE — no Firebase/real AI | Planner rewards: '+(s?.ledger||[]).filter(x=>x.source==='planner').length+' | XP: '+(s?.totalXP||0)};show();setInterval(show,1000);});
`;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.json':'application/json'};
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/fixture-evaluate'){
    req.resume();setTimeout(()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({score:8,feedback:'TEST FIXTURE: saved feedback for browser persistence testing, not real AI grading.',strengths:['Fixture strength'],improvements:['Fixture improvement']}));},1500);return;
  }
  if(url.pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  if(path.basename(file)==='planner.html'){
    let html=fs.readFileSync(file,'utf8').replace(/<script\b[^>]*src="([^"]+)"[^>]*>\s*<\/script>/gi,(tag,src)=>allowed.has(src.split('/').pop().split('?')[0])?tag:'');
    html=html.replace('</head>','<script src="/fixture.js" defer></script></head>');res.end(html);return;
  }
  fs.createReadStream(file).pipe(res);
}).listen(8767,'127.0.0.1',()=>console.log('Isolated Planner fixture: http://127.0.0.1:8767/planner.html'));
