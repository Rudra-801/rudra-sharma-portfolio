/* NEXZO Today v208 — integrated Student OS: Drop Anything + Exam Intelligence + Autopilot. */
(function(){'use strict';
if(window.NEXZOTodayV208)return;
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uidSafe=s=>String(s||'').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80);
const apiBase=()=>String(window.NEXZO_CONFIG?.API_BASE_URL||'https://nexzo-backend.onrender.com/api').replace(/\/$/,'');
let semester={schemaVersion:208,sources:[],subjects:[],deadlines:[],topics:[],questionSignals:[],updatedAtMs:0};
let loadingSemester=false;
const severityIcon=s=>s==='critical'?'🔴':s==='high'?'🟠':s==='medium'?'🟡':'🟢';
function uniqueStrings(rows){return [...new Set((rows||[]).map(x=>String(x||'').trim()).filter(Boolean))].slice(0,80)}
function daysUntil(d){const t=new Date(d||'').getTime();return Number.isFinite(t)?Math.ceil((t-Date.now())/86400000):9999}
function normalizeDeadline(x={}){const date=String(x.date||x.deadline||'').slice(0,10);return {title:String(x.title||x.name||'Untitled').slice(0,160),subject:String(x.subject||'').slice(0,100),date,type:String(x.type||'other').toLowerCase().slice(0,40),source:String(x.source||'').slice(0,160)}}
function mergeSemester(parsed,fileName){
 const src={name:fileName,type:String(parsed.documentType||'other'),summary:String(parsed.summary||'').slice(0,500),addedAtMs:Date.now()};
 semester.sources=[src,...(semester.sources||[]).filter(x=>x.name!==fileName)].slice(0,25);
 semester.subjects=uniqueStrings([...(semester.subjects||[]),...(parsed.subjects||[])]);
 semester.topics=uniqueStrings([...(semester.topics||[]),...(parsed.topics||[])]);
 const incoming=(parsed.deadlines||[]).map(x=>normalizeDeadline({...x,source:fileName})).filter(x=>x.date||x.title);
 const map=new Map();[...(semester.deadlines||[]),...incoming].forEach(x=>{const d=normalizeDeadline(x);map.set(`${d.subject}|${d.title}|${d.date}|${d.type}`.toLowerCase(),d)});semester.deadlines=[...map.values()].slice(0,120);
 const q=(parsed.questionSignals||parsed.examTopics||[]).map(x=>({topic:String(x.topic||x.name||'').slice(0,120),subject:String(x.subject||'').slice(0,100),count:Math.max(1,Number(x.count)||1),source:fileName})).filter(x=>x.topic);
 semester.questionSignals=[...(semester.questionSignals||[]),...q].slice(-300);
 semester.updatedAtMs=Date.now();
}
async function authToken(){const c=await window.NEXZOFirebase.getContext({auth:true});const u=c.auth.currentUser;if(!u)throw new Error('Sign in required.');return u.getIdToken()}
function jsonFromReply(reply){
 let s=String(reply||'').trim();const fenced=s.match(/```(?:json)?\s*([\s\S]*?)```/i);if(fenced)s=fenced[1].trim();
 try{return JSON.parse(s)}catch{}
 const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a>=0&&b>a){try{return JSON.parse(s.slice(a,b+1))}catch{}}
 throw new Error('NEXZO could not read structured college data from this file.');
}
async function analyzeFile(file){
 if(file.size>5*1024*1024)throw new Error(`${file.name}: maximum file size is 5 MB.`);
 const fd=new FormData();fd.append('file',file);fd.append('prompt',`You are NEXZO Student Inbox. Extract ONLY factual student/college information from this uploaded file. Return ONLY valid JSON, no markdown and no explanation, using exactly this shape: {"documentType":"syllabus|timetable|assignment|date-sheet|notice|notes|question-paper|other","summary":"one short sentence","subjects":["subject names"],"deadlines":[{"title":"what is due or exam name","subject":"subject if known","date":"YYYY-MM-DD if explicitly available else empty string","type":"assignment|exam|class|submission|other"}],"topics":["syllabus or learning topics explicitly present"],"questionSignals":[{"topic":"topic represented by a question in a question paper","subject":"subject if known","count":1}]}. Never invent a date, subject, topic or deadline. For a timetable, add class entries only when a real date is explicitly present; otherwise keep timetable details in summary. For question papers, classify visible questions into topics and use questionSignals. File name: ${file.name}`);
 const r=await fetch(`${apiBase()}/ai/analyze`,{method:'POST',headers:{Authorization:`Bearer ${await authToken()}`},body:fd});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.message||`Analysis failed (${r.status})`);return jsonFromReply(body.reply);
}
async function loadSemester(){if(loadingSemester)return;loadingSemester=true;try{const r=await window.NEXZOBackendStore?.getState?.('semester');if(r?.data)semester={...semester,...r.data}}catch(e){console.warn('[NEXZO v208] semester load',e.message)}finally{loadingSemester=false;render()}}
async function saveSemester(){if(!window.NEXZOBackendStore?.putState)throw new Error('Backend store is unavailable.');const r=await window.NEXZOBackendStore.putState('semester',semester);semester={...semester,...(r.data||{})};return r}
function planItems(intel){const raw=intel?.raw?.todayPlan?.items||[];if(raw.length)return raw.slice(0,3).map((x,i)=>({title:x.task||x.title||`Study block ${i+1}`,minutes:Number(x.minutes)||30,subject:x.subject||intel?.decision?.nextAction?.subject||'Study'}));const n=intel?.decision?.nextAction;if(!n)return[];return [{title:n.action||n.title,minutes:Number(n.duration)||30,subject:n.subject||'Study'}]}
function examIntel(intel){
 const mastery=Object.values(intel?.raw?.mastery||{});const sigMap=new Map();(semester.questionSignals||[]).forEach(s=>{const k=String(s.topic||'').trim();if(!k)return;const old=sigMap.get(k)||{topic:k,count:0,subject:s.subject||''};old.count+=Number(s.count)||1;if(!old.subject)old.subject=s.subject||'';sigMap.set(k,old)});
 const top=[...sigMap.values()].sort((a,b)=>b.count-a.count).slice(0,5).map(x=>{const m=mastery.find(v=>String(v.topic||'').toLowerCase().includes(x.topic.toLowerCase())||x.topic.toLowerCase().includes(String(v.topic||'').toLowerCase()));return {...x,mastery:m?.assessed?Math.round(m.score):null}});
 const exams=(semester.deadlines||[]).filter(d=>d.type==='exam'&&d.date).map(d=>({...d,days:daysUntil(d.date)})).filter(d=>d.days>=0&&d.days<=60).sort((a,b)=>a.days-b.days);
 return {top,exams};
}
function render(){
 const host=document.getElementById('nxPulseV203');const intel=window.NEXZOIntelligence?.snapshot?.();if(!host||!intel)return;
 const {twin,radar,pulse,decision}=intel,n=decision.nextAction,a=pulse.topAlert,plan=planItems(intel),ex=examIntel(intel);const last=semester.sources?.[0];
 host.className='nx-today-v208';
 host.innerHTML=`
 <div class="nxos-head">
   <div><span class="nxos-kicker">NEXZO STUDENT OS <i></i> LIVE</span><h2>Your college life, turned into the next right action.</h2><p>Drop the messy stuff once. NEXZO extracts what matters, watches your deadlines and prepares what you should do next.</p></div>
   <div class="nxos-head-actions"><a href="planner.html">Open Planner</a><a class="primary" href="ai-assistant.html">Ask NEXZO ✦</a></div>
 </div>
 <div class="nxos-grid">
   <article class="nxos-drop" id="nxDropZone" tabindex="0" role="button" aria-label="Upload college files">
     <input id="nxDropInput" type="file" hidden multiple accept="image/png,image/jpeg,image/webp,application/pdf,.txt,.md,.docx,.pptx,.xlsx">
     <div class="nxos-drop-icon">↥</div><div><span>DROP ANYTHING</span><h3>Turn college chaos into usable data.</h3><p>Timetable screenshot, syllabus, date sheet, assignment, notice, notes or question paper.</p></div>
     <button id="nxChooseFiles" type="button">Choose files</button>
     <small id="nxDropStatus">${last?`Last imported: ${E(last.name)}`:'Nothing imported yet · up to 4 files at a time'}</small>
   </article>
   <article class="nxos-now">
     <div class="nxos-label">⚡ NEXZO TODAY</div>
     <small>WHAT SHOULD I DO NOW?</small>
     ${n?`<h3>${E(n.title)}</h3><p>${E(n.action)}</p><div class="nxos-chips"><span>⏱ ${n.duration} min</span><span>📚 ${E(n.subject||'Study')}</span><span>✨ ${n.match}% fit</span></div><div class="nxos-actions"><a class="primary" href="personalization.html">▶ Start now</a><button id="nxAcceptPlan" type="button">Add plan to Planner</button></div>`:`<h3>Give NEXZO your semester context.</h3><p>Drop your syllabus, dates or assignment above and NEXZO will start organizing your next actions.</p><a class="nxos-setup" href="personalization.html">Set preferences →</a>`}
   </article>
 </div>
 <div class="nxos-strip">
   <div class="nxos-risk"><small>📡 NEEDS ATTENTION</small>${a?`<b>${severityIcon(a.severity)} ${E(a.title)}</b><span>${E(a.detail)}</span>`:`<b>🟢 Nothing urgent detected</b><span>NEXZO will surface risks as your semester data grows.</span>`}</div>
   <div class="nxos-sem"><small>SEMESTER MEMORY</small><b>${semester.subjects?.length||0} subjects · ${semester.deadlines?.length||0} dated items</b><span>${semester.sources?.length||0} source${semester.sources?.length===1?'':'s'} understood by NEXZO</span></div>
   <div class="nxos-cap"><small>TODAY'S CAPACITY</small><b>${pulse.capacityMinutes} minutes</b><span>${pulse.pendingTasks} pending · ${pulse.overdueTasks} overdue</span></div>
 </div>
 <section class="nxos-exam">
   <div class="nxos-section-title"><div><small>🧠 EXAM INTELLIGENCE</small><h3>What is likely to matter most in your preparation?</h3></div><span>${ex.top.length?`${ex.top.reduce((s,x)=>s+x.count,0)} question signals`:'Upload question papers to activate'}</span></div>
   <div class="nxos-exam-grid">
     ${ex.top.length?ex.top.map((x,i)=>`<div class="nxos-topic"><em>#${i+1}</em><div><b>${E(x.topic)}</b><small>${E(x.subject||'Detected topic')} · seen ${x.count}×${x.mastery!=null?` · your mastery ${x.mastery}%`:''}</small></div><span class="${x.mastery!=null&&x.mastery<55?'risk':''}">${x.mastery==null?'UNASSESSED':x.mastery<55?'PRIORITY':'ON TRACK'}</span></div>`).join(''):`<div class="nxos-exam-empty"><b>Drop a previous-year paper.</b><span>NEXZO will classify its questions by topic and compare them with your measured mastery.</span></div>`}
     <div class="nxos-exam-dates"><small>UPCOMING EXAMS</small>${ex.exams.length?ex.exams.slice(0,4).map(x=>`<div><b>${E(x.subject||x.title)}</b><span>${x.days===0?'Today':`${x.days}d`} · ${E(x.date)}</span></div>`).join(''):'<p>No exam dates imported yet.</p>'}</div>
   </div>
 </section>
 <section class="nxos-plan">
   <div class="nxos-section-title"><div><small>🎯 STUDENT AUTOPILOT</small><h3>Today's suggested study blocks</h3></div><span>${pulse.capacityMinutes} min available</span></div>
   <div class="nxos-blocks">${plan.length?plan.map((x,i)=>`<div class="nxos-block"><em>0${i+1}</em><div><b>${E(x.title)}</b><small>${E(x.subject)} · ${x.minutes} min</small></div></div>`).join(''):'<div class="nxos-exam-empty"><b>No study blocks yet.</b><span>Add subjects, tasks or semester files to generate a useful day.</span></div>'}</div>
 </section>
 <details class="nxos-why"><summary>How NEXZO made this decision <span>for viva / transparency</span></summary><div><p><b>Learning Twin</b><br>${twin.assessedTopics} assessed · ${twin.weakTopics} weak · ${twin.strongTopics} strong</p><p><b>Radar</b><br>${a?E(a.title):'No urgent risk'}</p><p><b>Decision Engine</b><br>${n?E((n.why||[]).slice(0,3).join(' · ')||n.action):'Waiting for evidence'}</p><p><b>Semester Memory</b><br>${semester.sources?.length||0} imports · ${semester.deadlines?.length||0} deadlines</p></div></details>`;
 wire(host,plan);
}
function wire(host,plan){
 const dz=host.querySelector('#nxDropZone'),input=host.querySelector('#nxDropInput'),choose=host.querySelector('#nxChooseFiles');if(dz&&input){const open=e=>{e?.preventDefault();input.click()};choose?.addEventListener('click',open);dz.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click()}});['dragenter','dragover'].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.add('drag')}));['dragleave','drop'].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.remove('drag')}));dz.addEventListener('drop',e=>handleFiles([...e.dataTransfer.files].slice(0,4)));input.addEventListener('change',()=>handleFiles([...input.files].slice(0,4)));}
 const btn=host.querySelector('#nxAcceptPlan');if(btn)btn.onclick=()=>acceptPlan(btn,plan);
}
async function handleFiles(files){if(!files.length)return;const status=document.getElementById('nxDropStatus'),drop=document.getElementById('nxDropZone');drop?.classList.add('busy');let ok=0;try{for(let i=0;i<files.length;i++){if(status)status.textContent=`Understanding ${i+1}/${files.length}: ${files[i].name}…`;const parsed=await analyzeFile(files[i]);mergeSemester(parsed,files[i].name);ok++}if(status)status.textContent='Saving semester memory to NEXZO cloud…';await saveSemester();await applyToPersonalization();if(status)status.textContent=`✓ Understood ${ok} file${ok===1?'':'s'} · semester memory updated`;render()}catch(e){console.error('[NEXZO Drop Anything]',e);if(status)status.textContent=`Could not finish: ${e.message}`}finally{drop?.classList.remove('busy')}}
async function applyToPersonalization(){const p=window.NEXZOPersonalization;if(!p?.updateProfile)return;const snap=p.snapshot?.();const existing=snap?.profile||{};const examDates={...(existing.examDates||{})};(semester.deadlines||[]).filter(x=>x.type==='exam'&&x.date&&x.subject).forEach(x=>examDates[x.subject]=x.date);p.updateProfile({subjects:uniqueStrings([...(existing.subjects||[]),...(semester.subjects||[])]),examDates});try{await p.pushCloud?.()}catch(e){console.warn('[NEXZO v208] personalization sync',e.message)}}
async function acceptPlan(btn,plan){if(!plan.length)return;const store=window.NEXZOTaskStore;if(!store?.upsert){btn.textContent='Planner is loading…';return}btn.disabled=true;const now=Date.now();try{for(let i=0;i<plan.length;i++){const x=plan[i];await Promise.resolve(store.upsert({id:`autopilot_${now}_${i}`,title:x.title,subject:x.subject,type:'NEXZO Autopilot',status:'pending',completed:false,progress:0,duration:x.minutes,estimatedMinutes:x.minutes,createdAtMs:now+i,updatedAtMs:now+i,source:'nexzo-autopilot-v208'},{cloud:true,immediate:true}))}await Promise.resolve(store.flush?.());btn.textContent='✓ Added to Planner';btn.classList.add('done')}catch(e){btn.disabled=false;btn.textContent='Save failed — retry';console.error(e)}}
function init(){render();loadSemester();['nexzo:personalization-ready','nexzo:personalization-updated','nexzo:personalization-sync','nexzo:intelligence-ready','nexzo:tasks-updated'].forEach(n=>window.addEventListener(n,()=>setTimeout(render,60)));setTimeout(render,900)}
window.NEXZOTodayV208=Object.freeze({version:208,getSemester:()=>JSON.parse(JSON.stringify(semester)),render});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
