/* NEXZO Academics v243 — topic-specific study workspace with verified AI attempts. */
(function(){
'use strict';
if(document.body?.dataset.page!=='academics'||window.__NEXZO_ACADEMICS_V243__)return;
window.__NEXZO_ACADEMICS_V243__=true;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const owner=()=>window.NEXZODataService?.getUser?.()?.uid||window.NEXZOSettings?.uid?.()||localStorage.getItem('nexzo_canonical_cache_owner')||'local';
const stateKey=()=>`nexzo_academics_v240:${owner()}`;
const deviceSelectionKey='nexzo_academics_selection_v243';
const defaults=()=>({schemaVersion:240,selected:[],progress:{},attempts:{},topicEvidence:{},files:[],selection:{courseKey:'',unitIndex:0,topicIndex:0,difficulty:'Intermediate',questionCount:5},updatedAtMs:0});
let catalog=[],state=defaults(),activeCourse=null,managerDraft=new Set(),cloudTimer=0,verifyBusy=false,topicBrowserExpanded=false,ownerRefreshTimer=0;
const toast=(m,t='info')=>window.NEXZOShell?.toast?.(m,t)||console.log(m);
const clone=v=>JSON.parse(JSON.stringify(v));
function safeParse(raw,f){try{return JSON.parse(raw)||f}catch{return f}}
function normalizeState(raw){const x=raw&&typeof raw==='object'?raw:{};return {...defaults(),...x,selected:Array.isArray(x.selected)?x.selected:[],progress:x.progress||{},attempts:x.attempts||{},topicEvidence:x.topicEvidence||{},files:Array.isArray(x.files)?x.files:[],selection:{...defaults().selection,...(x.selection||{})}}}
function loadLocal(){state=normalizeState(safeParse(localStorage.getItem(stateKey()),{}));if(!state.selected.length){const cached=safeParse(localStorage.getItem(deviceSelectionKey),[]);if(Array.isArray(cached))state.selected=cached.filter(Boolean)}}
function academicSnapshot(){return clone({selected:state.selected,progress:state.progress,attempts:state.attempts,selection:state.selection,courses:selectedCourses()})}
function saveLocal({cloud=true}={}){state.schemaVersion=240;state.updatedAtMs=Date.now();localStorage.setItem(stateKey(),JSON.stringify(state));localStorage.setItem(deviceSelectionKey,JSON.stringify(state.selected));window.dispatchEvent(new CustomEvent('nexzo:academics-updated',{detail:academicSnapshot()}));if(cloud&&owner()!=='local'&&window.NEXZOBackendStore?.putState){clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>window.NEXZOBackendStore.putState('academics',state).catch(error=>window.dispatchEvent(new CustomEvent('nexzo:cloud-status',{detail:{area:'academics',status:'offline',message:error?.message}}))),750)}}
async function saveCloudNow(){
 clearTimeout(cloudTimer);saveLocal({cloud:false});
 const writeOwner=owner(),snapshot=clone(state),backend=window.NEXZOBackendStore;
 if(writeOwner==='local'||!backend?.putState)return {cloud:false,local:true};
 try{
  if(!backend.getState)throw new Error('Academics cloud read-back is unavailable.');
  await backend.putState('academics',snapshot);
  const check=await backend.getState('academics'),remote=normalizeState(check?.data);
  if(owner()!==writeOwner)throw new Error('Account changed during Academics save.');
  const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().reduce((o,k)=>(o[k]=v[k],o),{}):v);
  for(const key of ['selected','progress','attempts','topicEvidence','files','selection']){
   if(canonical(snapshot[key])!==canonical(remote[key]))throw new Error(`Academics cloud confirmation did not match saved ${key}.`);
  }
  return {cloud:true,local:true};
 }catch(error){window.dispatchEvent(new CustomEvent('nexzo:cloud-status',{detail:{area:'academics',status:'offline',message:error?.message}}));return {cloud:false,local:true,error};}
}
async function hydrateCloud(){
 const uid=owner();if(uid==='local'||!window.NEXZOBackendStore?.getState)return;
 try{
  const out=await window.NEXZOBackendStore.getState('academics');if(owner()!==uid)return;
  const remote=normalizeState(out?.data);if(Number(remote.updatedAtMs)>Number(state.updatedAtMs))state=remote;
  const saved=await window.NEXZOBackendStore.getEvaluations();if(owner()!==uid)return;
  for(const r of saved.evaluations||[]){if(!r.serverVerified||!r.academic||!r.topicKey)continue;
   const prior=state.attempts[r.topicKey]||[];if(!prior.some(a=>a.id===r.evaluationId))state.attempts[r.topicKey]=[{...r,id:r.evaluationId,uid,courseKey:r.academic.courseKey,unitIndex:r.academic.unitIndex,topicIndex:r.academic.topicIndex,difficulty:r.academic.level,evaluationSource:r.source,submittedAtMs:r.evaluatedAtMs},...prior].sort((a,b)=>b.submittedAtMs-a.submittedAtMs).slice(0,20);
   const latest=state.attempts[r.topicKey][0];state.progress[r.topicKey]=latest.score>=8?3:latest.score>=5?2:1;
  }
  localStorage.setItem(stateKey(),JSON.stringify(state));renderAll();
 }catch(error){window.dispatchEvent(new CustomEvent('nexzo:cloud-status',{detail:{area:'academics',status:'offline',message:error.message}}));}
}
function courseKey(c){return `${c.semesterSuggested}:${c.code}`}
function topicKey(c,ui,ti){return `${courseKey(c)}:u${ui}:t${ti}`}
function getCourse(k){return catalog.find(c=>courseKey(c)===k)}
function isStudyCourse(c){const h=`${c.type} ${c.title} ${c.code}`.toLowerCase();return !/lab|practical|internship|summer internship|professional communication|professional practice|quantitative aptitude|personality development|sports|yoga|industrial project|project phase/.test(h)}
function selectedCourses(){const set=new Set(state.selected);return catalog.filter(c=>isStudyCourse(c)&&set.has(courseKey(c)))}
function progressLevel(v){if(v===true)return 1;const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(3,n)):0}
function courseProgress(c){const topics=(c.units||[]).flatMap(u=>u.topics?.length?u.topics:[u.title]).length;if(!topics)return 0;let earned=0;(c.units||[]).forEach((u,ui)=>(u.topics?.length?u.topics:[u.title]).forEach((_,ti)=>earned+=progressLevel(state.progress[topicKey(c,ui,ti)])));return Math.round(earned/(topics*3)*100)}
function courseType(c){return /elective|domain|open course|mooc/i.test(`${c.type} ${c.title}`)?'elective':'core'}
function courseMeta(c){const topicCount=(c.units||[]).reduce((n,u)=>n+(u.topics?.length||1),0);return [c.credits!==''?`${c.credits} credits`:null,topicCount?`${topicCount} topics`:'Outline pending',courseType(c)].filter(Boolean)}
function card(c,{catalogMode=false}={}){const selected=state.selected.includes(courseKey(c)),progress=courseProgress(c);return `<article class="nx-subject-card"><div class="nx-card-top"><span class="nx-course-code">${esc(c.code)}</span></div><h3>${esc(c.title)}</h3><div class="nx-course-meta">${courseMeta(c).map(x=>`<span>${esc(x)}</span>`).join('')}</div>${catalogMode?'':`<div class="nx-course-progress"><i style="width:${progress}%"></i></div><div class="nx-course-meta"><span>${progress}% verified mastery</span></div>`}<div class="nx-card-actions"><button type="button" data-open-course="${esc(courseKey(c))}">${catalogMode?'View syllabus':'Continue'}</button>${catalogMode?`<button type="button" data-toggle-subject="${esc(courseKey(c))}">${selected?'✓ Added':'＋ Add'}</button>`:`<button type="button" data-course-planner="${esc(courseKey(c))}">Add next topic</button>`}</div></article>`}
function findNextTopic(c){for(let ui=0;ui<(c.units||[]).length;ui++){const u=c.units[ui],topics=u.topics?.length?u.topics:[u.title];for(let ti=0;ti<topics.length;ti++)if(progressLevel(state.progress[topicKey(c,ui,ti)])<3)return{ui,ti,unit:u,topic:topics[ti]}}return null}
function renderMine(){const grid=$('#mySubjectGrid'),rows=selectedCourses();if(!grid)return;grid.innerHTML=rows.length?rows.map(c=>card(c)).join(''):`<div class="nx-empty"><div><i>▦</i><h3>Your subject workspace is ready</h3><p>Choose the subjects you are currently studying.</p><button class="nx-acad-primary" type="button" data-open-curriculum>Choose My Subjects</button></div></div>`;renderNext(rows);document.querySelector('#nxAcadCoursePreview')?.remove()}
function renderNext(rows=selectedCourses()){const box=$('#academicNextAction');if(!box)return;if(!rows.length){box.innerHTML='<div class="nx-next-icon">◎</div><div><span>RECOMMENDED NEXT ACTION</span><h2>Choose your current subjects</h2><p>Select only what you study now.</p></div><button type="button" data-open-curriculum>Choose subjects</button>';return}const c=[...rows].sort((a,b)=>courseProgress(a)-courseProgress(b))[0];box.innerHTML=`<div class="nx-next-icon">◎</div><div><span>RECOMMENDED NEXT ACTION</span><h2>Continue ${esc(c.title)}</h2><p>${courseProgress(c)}% verified mastery · Open the subject to choose what you want to study.</p></div><button type="button" data-open-course="${esc(courseKey(c))}">Open subject</button>`}
function filteredCatalog(){const q=($('#curriculumSearch')?.value||'').trim().toLowerCase(),type=$('#curriculumType')?.value||'all';return catalog.filter(c=>isStudyCourse(c)&&(type==='all'||courseType(c)===type)&&(!q||`${c.code} ${c.title} ${c.type}`.toLowerCase().includes(q)))}
function renderCatalog(){const rows=filteredCatalog(),grid=$('#curriculumGrid');if(!grid)return;$('#catalogSummary').textContent=`${rows.length} course${rows.length===1?'':'s'} found`;grid.innerHTML=rows.length?rows.map(c=>card(c,{catalogMode:true})).join(''):'<div class="nx-empty"><div><i>⌕</i><h3>No matching subject</h3><p>Try another course name, code or filter.</p></div></div>'}
function renderProgress(){const rows=selectedCourses(),vals=rows.map(courseProgress),avg=vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):0,topics=rows.reduce((n,c)=>n+(c.units||[]).reduce((m,u)=>m+(u.topics?.length||1),0),0),mastered=rows.reduce((n,c)=>n+Object.keys(state.progress).filter(k=>k.startsWith(courseKey(c)+':')&&progressLevel(state.progress[k])===3).length,0);if($('#academicProgressStats'))$('#academicProgressStats').innerHTML=[['Active subjects',rows.length],['Syllabus topics',topics],['Topics mastered',Math.min(mastered,topics)],['Verified mastery',`${avg}%`]].map(([l,v])=>`<article class="nx-stat"><span>${l}</span><strong>${v}</strong></article>`).join('');if($('#academicProgressList'))$('#academicProgressList').innerHTML=rows.length?rows.map(c=>`<div class="nx-progress-row"><div><b>${esc(c.title)}</b><small>${esc(c.code)}</small></div><i style="--progress:${courseProgress(c)}%"></i><strong>${courseProgress(c)}%</strong></div>`).join(''):'<div class="nx-empty"><div><h3>No subjects selected</h3><p>Add your current subjects to start progress tracking.</p></div></div>'}
function renderManager(){const q=($('#managerSearch')?.value||'').trim().toLowerCase(),rows=catalog.filter(c=>isStudyCourse(c)&&(!q||`${c.code} ${c.title}`.toLowerCase().includes(q)));const list=$('#managerSubjectList'),count=$('#managerSelectionCount');if(list)list.innerHTML=rows.map(c=>`<label class="nx-manager-item"><input type="checkbox" value="${esc(courseKey(c))}" ${managerDraft.has(courseKey(c))?'checked':''}><span><b>${esc(c.title)}</b><small>${esc(c.code)} · ${esc(courseType(c))}</small></span></label>`).join('');if(count)count.textContent=`${managerDraft.size} selected`}
function flatTopics(c){return (c.units||[]).flatMap((u,ui)=>(u.topics?.length?u.topics:[u.title]).map((topic,ti)=>({topic:String(topic),ui,ti,unit:u,key:topicKey(c,ui,ti)})))}
function renderCoursePreview(rows){let box=$('#nxAcadCoursePreview');if(!rows.length){box?.remove();return}const c=rows[0],topics=flatTopics(c),next=findNextTopic(c),featured=topics.filter(x=>progressLevel(state.progress[x.key])<3).slice(0,4);if(!box){box=document.createElement('section');box.id='nxAcadCoursePreview';box.className='nx-acad-course-preview';$('#mySubjectGrid')?.after(box)}const cards=(featured.length?featured:topics.slice(0,4));box.innerHTML=`<div class="nx-preview-head"><div><span class="nx-acad-kicker">${esc(c.code)} · CURRENT SUBJECT</span><h2>${esc(c.title)}</h2><p>Pick a topic and continue with notes, practice, quizzes and verified progress.</p></div><div class="nx-preview-progress"><strong>${courseProgress(c)}%</strong><span>verified mastery</span></div></div><div class="nx-preview-topics">${cards.map((x,i)=>`<article class="nx-preview-topic ${['gold','purple','cyan','green'][i%4]}"><div class="nx-preview-unit-art">${['✦','⌘','◈','◉'][i%4]}</div><span>TOPIC ${i+1}</span><h3>${esc(x.topic)}</h3><p>${progressLevel(state.progress[x.key])===3?'Verified mastery':progressLevel(state.progress[x.key])===2?'Practice completed':progressLevel(state.progress[x.key])===1?'Reviewed':'Ready to study'}</p><button type="button" data-open-course="${esc(courseKey(c))}" data-select-topic="${x.ui}:${x.ti}">Study topic</button></article>`).join('')}</div>${next?`<div class="nx-preview-continue"><span>Recommended next</span><b>${esc(next.topic)}</b><button type="button" data-open-course="${esc(courseKey(c))}" data-select-topic="${next.ui}:${next.ti}">Continue</button></div>`:''}` }
function renderAll(){renderMine();renderCatalog();renderProgress()}
function openManager(){managerDraft=new Set(state.selected);renderManager();const status=$('#managerSaveStatus');if(status){status.textContent='';status.className='nx-manager-save-status'}showModal('#curriculumManager')}
async function commitManagerSubjects(){
 const btn=$('#saveMySubjectsBtn'),status=$('#managerSaveStatus');
 if(btn?.disabled)return;
 const next=[...managerDraft].filter(k=>!!getCourse(k));
 if(!next.length){if(status){status.textContent='Choose at least one subject before saving.';status.className='nx-manager-save-status bad'}toast('Choose at least one subject.','error');return}
 const previous=[...state.selected];
 if(btn){btn.disabled=true;btn.textContent='Saving…'}
 if(status){status.textContent='Saving your curriculum…';status.className='nx-manager-save-status'}
 try{
   // Make the user-facing action work immediately and persist through reload,
   // then verify cloud sync separately. This avoids a Render cold start making
   // the Save button look broken while still never calling local state cloud-saved.
   state.selected=next;syncPersonalization();saveLocal({cloud:false});renderAll();
   if(status){status.textContent='Saved on this device. Syncing with your NEXZO account…';status.className='nx-manager-save-status warn'}
   toast('Subjects saved. Syncing with your account…','info');
   closeModals();

   const persisted=await saveCloudNow();
   if(persisted.cloud){toast('My Subjects synced to your NEXZO account.','success');window.dispatchEvent(new CustomEvent('nexzo:academics-sync',{detail:{status:'synced',selected:[...state.selected]}}));}
   else{
     toast('Subjects are saved on this device. Cloud sync is unavailable right now and will be retried when NEXZO reconnects.','info');
     window.dispatchEvent(new CustomEvent('nexzo:academics-sync',{detail:{status:'local-only',selected:[...state.selected],message:persisted.error?.message||''}}));
   }
 }catch(error){
   // Only roll back when local persistence itself failed. Cloud failure alone is
   // handled above and must not make the selected curriculum disappear again.
   state.selected=previous;
   try{saveLocal({cloud:false});renderAll()}catch(_){ }
   if(status){status.textContent=error?.message||'Subjects could not be saved.';status.className='nx-manager-save-status bad'}
   toast(error?.message||'Subjects could not be saved.','error')
 }finally{if(btn){btn.disabled=false;btn.textContent='Save My Subjects'}}
}
function showModal(sel){const m=$(sel);if(m){m.hidden=false;document.body.classList.add('nx-modal-open')}}
function closeModals(){$$('.nx-acad-modal').forEach(m=>m.hidden=true);document.body.classList.remove('nx-modal-open')}
async function toggleSubject(k,button=null){
  if(!getCourse(k))return;
  const i=state.selected.indexOf(k),removing=i>=0;
  if(button){button.disabled=true;button.setAttribute('aria-busy','true');button.textContent=removing?'Removing…':'Adding…'}
  removing?state.selected.splice(i,1):state.selected.push(k);
  managerDraft=new Set(state.selected);syncPersonalization();saveLocal({cloud:false});renderAll();
  const signedIn=!!window.NEXZODataService?.getUser?.();
  if(!signedIn){toast(removing?'Subject removed on this device.':'Subject added on this device. Sign in for cloud sync.','info');return}
  const persisted=await saveCloudNow();
  if(persisted.cloud)toast(removing?'Subject removed and confirmed in your account.':'Subject added and confirmed in your account.','success');
  else toast(removing?'Subject removed on this device; cloud confirmation is pending.':'Subject added on this device; cloud confirmation is pending.','error');
}
function syncPersonalization(){try{window.NEXZOPersonalization?.updateProfile?.({subjects:selectedCourses().map(c=>c.title)})}catch{}}
function topicAt(c,ui,ti){const unit=c?.units?.[ui];if(!unit)return null;const topics=unit.topics?.length?unit.topics:[unit.title];return topics[ti]==null?null:{unit,topic:String(topics[ti]),ui,ti}}
function stableHash(text){let h=2166136261;for(const ch of String(text||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(36)}
function topicQuestions(course,ui,ti){const x=topicAt(course,ui,ti),p=notesForTopic(course,ui,ti);return (p?.practice||[]).map((text,i)=>({id:`${topicKey(course,ui,ti)}:${i}`,text}));}
let practicePreview=null;
const noteEngine=()=>window.NEXZOAcademicNotes;
function notesForTopic(c,ui,ti){const x=topicAt(c,ui,ti),pack=noteEngine()?.lookup(c.title,x.topic);return pack?{...pack,title:x.topic,context:`${x.unit.label}: ${x.unit.title}`}:null;}
function noteCacheKey(c,x){return noteEngine().cacheKey(c,x,state.selection.difficulty);}
async function connectedStudyPack(c,x){
 const curated=notesForTopic(c,x.ui,x.ti);if(curated)return curated;
 const key=noteCacheKey(c,x),cached=noteEngine().cached(localStorage,key);if(cached)return {...cached,title:x.topic,context:`${x.unit.label}: ${x.unit.title}`};
 if(!window.NEXZOAI?.notes)throw new Error('Study notes service is unavailable.');
 const r=await window.NEXZOAI.notes({courseKey:courseKey(c),unitIndex:x.ui,topicIndex:x.ti,level:state.selection.difficulty});
 if(!noteEngine().valid(r.notes)||r.notes.context?.topic!==x.topic||r.notes.context?.unit!==x.unit.title)throw new Error('Study notes failed topic/content validation.');
 noteEngine().cache(localStorage,key,r.notes);return {...r.notes,title:x.topic,context:`${x.unit.label}: ${x.unit.title}`};
}
function noteDiagram(d){
 if(!d)return '';
 if(d.kind==='flow'&&Array.isArray(d.nodes))return `<figure class="nx-note-figure"><div class="nx-note-figure-flow">${d.nodes.map((v,i)=>`${i?'<span aria-hidden="true">→</span>':''}<span class="nx-note-node">${esc(v)}</span>`).join('')}</div></figure>`;
 if(d.kind==='gantt'&&d.labels?.length===d.durations?.length){let time=0;return `<figure class="nx-note-figure"><figcaption>Scheduling Gantt chart</figcaption><div class="nx-note-gantt">${d.labels.map((l,i)=>{const start=time;time+=Number(d.durations[i]);return `<div style="flex:${Number(d.durations[i])}"><b>${esc(l)}</b><small>${start}–${time}</small></div>`}).join('')}</div></figure>`;}
 if(d.kind==='graph'&&Array.isArray(d.nodes)&&d.nodes.length<=12){const points=d.nodes.map((_,i)=>[40+(i%3)*130,35+Math.floor(i/3)*80]);return `<figure class="nx-note-figure"><svg viewBox="0 0 360 ${40+Math.ceil(d.nodes.length/3)*80}" role="img" aria-label="${esc('Graph: '+d.nodes.join(', '))}">${(d.edges||[]).filter(e=>points[e[0]]&&points[e[1]]).map(([a,b])=>`<line x1="${points[a][0]}" y1="${points[a][1]}" x2="${points[b][0]}" y2="${points[b][1]}" stroke="#d8b45a"/>`).join('')}${d.nodes.map((n,i)=>`<circle cx="${points[i][0]}" cy="${points[i][1]}" r="23" fill="#111" stroke="#d8b45a"/><text x="${points[i][0]}" y="${points[i][1]+5}" text-anchor="middle" fill="#f2ecd9">${esc(n)}</text>`).join('')}</svg></figure>`;}return '';
}
function studyNotesMarkup(n){
 const section=(title,values)=>values?.length?`<section><h4>${title}</h4><ul>${values.map(v=>`<li>${esc(v)}</li>`).join('')}</ul></section>`:'';
 return `<article class="nx-tool-output nx-rich-notes"><header class="nx-notes-hero"><span>STUDY NOTES · ${esc(n.source==='curated-local'?'Curated content':'Generated content')}</span><h3>${esc(n.title)}</h3><p>${esc(n.context)}</p></header><section><h4>Concept</h4><p>${esc(n.overview)}</p></section>${n.concepts?.length?`<section>${n.concepts.map(([k,v])=>`<h4>${esc(k)}</h4><p>${esc(v)}</p>`).join('')}</section>`:''}${section('Working / method',n.working)}${section('Formulae / rules',n.formulae)}${noteDiagram(n.diagram)}${n.example?`<section class="nx-note-example"><h4>Worked example</h4><p>${esc(n.example)}</p></section>`:''}${n.code?`<section><h4>${esc(n.code.language)} example</h4><pre><code>${esc(n.code.text)}</code></pre></section>`:''}${(n.tables||[]).map(t=>`<div class="nx-note-table"><table><caption>${esc(t.caption)}</caption><thead><tr>${t.headers.map(v=>`<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('')}${section('Practice',n.practice)}${n.answers?.length?`<details><summary>Solutions</summary>${section('Answers',n.answers)}</details>`:''}${section('Applications',n.applications)}${section('Limitations / common mistakes',n.limits)}${section('Quick revision',n.revision)}</article>`;
}
async function hydrateStudyNotes(c,x,kind='notes'){
 const host=$('#nxStudyNotesBody');if(!host)return;
 const uid=owner(),difficulty=state.selection.difficulty,questionCount=state.selection.questionCount;
 try{
 if(kind==='practice'){
   practicePreview=null;
   const academic={courseKey:courseKey(c),unitIndex:x.ui,topicIndex:x.ti,level:difficulty};
   const p=await window.NEXZOAI.practice({...academic,questionCount});
   if(!document.body.contains(host)||owner()!==uid)return;
   const questions=p.tasks?.flatMap(t=>t.questions||[]);
   if(!p.planId||questions?.length!==questionCount)throw new Error('Practice preview could not be confirmed.');
   practicePreview={planId:p.planId,academic,uid,questions};
   host.innerHTML=`<div class="nx-tool-output">${questions.map((q,i)=>`<article><b>Q${i+1}</b> ${esc(q)}</article>`).join('')}</div><label class="nx-answer-box">Your answer<textarea id="nxTopicAnswer" rows="8">${esc(state.topicEvidence[topicKey(c,x.ui,x.ti)]?.draftAnswer||'')}</textarea></label><button type="button" data-verify-topic="${x.ui}:${x.ti}">Evaluate answer</button><div id="nxTopicVerifyStatus" class="nx-verify-status"></div>`;
   return;
 }
 const pack=await connectedStudyPack(c,x);if(!document.body.contains(host))return;
 if(kind==='revision')host.innerHTML=`<div class="nx-tool-output"><h3>${esc(x.topic)}</h3><ul>${(pack.revision||[]).map(v=>`<li>${esc(v)}</li>`).join('')}</ul></div>`;
 else host.innerHTML=studyNotesMarkup(pack);
 }catch(e){if(document.body.contains(host))host.innerHTML=`<p role="alert">${esc(noteEngine().serviceMessage(e))}</p><button type="button" data-notes-retry="${esc(kind)}">Retry</button>`;}
}

function topicBrief(topic,unit,course){
 const curated=window.NEXZOAcademicNotes?.lookup(course.title,topic);
 return curated?.overview||`Syllabus context: ${course.title} / ${unit?.title||course.title}. Open Study Notes for validated content on this exact topic.`;
}
function workspaceMarkup(c){
 const selected=state.selection.courseKey===courseKey(c)?state.selection:{...state.selection,courseKey:courseKey(c),unitIndex:0,topicIndex:0};
 const all=flatTopics(c);if(!all.length)return `<span class="nx-acad-kicker">${esc(c.code)}</span><h2 id="workspaceTitle">${esc(c.title)}</h2><div class="nx-empty"><p>No syllabus topics are available for this course yet.</p></div>`;
 let current=all.find(x=>x.ui===Number(selected.unitIndex)&&x.ti===Number(selected.topicIndex))||all[0];
 const ctx=topicAt(c,current.ui,current.ti),key=topicKey(c,current.ui,current.ti),attempt=state.attempts[key]?.[0],brief=topicBrief(ctx.topic,ctx.unit,c);
 state.selection={...selected,courseKey:courseKey(c),unitIndex:current.ui,topicIndex:current.ti};
 const visible=topicBrowserExpanded?all:all.slice(0,9);
 return `<span class="nx-acad-kicker">${esc(c.code)} · TOPIC EXPLORER</span><h2 id="workspaceTitle">${esc(c.title)}</h2><p class="nx-workspace-intro">Pick one topic and study it with concise notes, practice, quizzes and verified progress.</p><div class="nx-topic-controls nx-topic-controls-clean"><label>Topic<select data-acad-select="topicFlat">${all.map(x=>`<option value="${x.ui}:${x.ti}" ${x.ui===current.ui&&x.ti===current.ti?'selected':''}>${esc(x.topic)}</option>`).join('')}</select></label><label>Difficulty<select data-acad-select="difficulty">${['Beginner','Intermediate','Advanced'].map(v=>`<option ${v===state.selection.difficulty?'selected':''}>${v}</option>`).join('')}</select></label><label>Questions<select data-acad-select="questionCount">${[3,5,10].map(v=>`<option value="${v}" ${Number(state.selection.questionCount)===v?'selected':''}>${v}</option>`).join('')}</select></label></div><section class="nx-topic-focus nx-topic-focus-clean"><div class="nx-topic-focus-copy"><span>SELECTED TOPIC</span><h3>${esc(ctx.topic)}</h3><p class="nx-topic-brief">${esc(brief)}</p><div class="nx-topic-progress-line">${progressLevel(state.progress[key])}/3 mastery · ${attempt?`Last verified score: ${esc(attempt.score)}/10`:'No verified attempt yet'}</div></div><div class="nx-topic-state">${progressLevel(state.progress[key])===3?'Verified':progressLevel(state.progress[key])===2?'Practised':progressLevel(state.progress[key])===1?'Reviewed':'Ready'}</div></section><div class="nx-workspace-tools nx-workspace-tools-clean"><button class="nx-tool-gold" data-topic-tool="notes">▤ <span>Study Notes</span></button><button class="nx-tool-purple" data-topic-tool="practice">✎ <span>Practice</span></button><button class="nx-tool-cyan" data-topic-tool="quiz">◉ <span>Take Quiz</span></button><button class="nx-tool-green" data-topic-tool="revision">↻ <span>Revision</span></button><button data-topic-tool="resources">▶ <span>Resources</span></button><button data-topic-tool="assistant">✦ <span>Ask NEXZO</span></button><button data-topic-tool="planner">＋ <span>Add to Planner</span></button></div><section class="nx-topic-browser"><div class="nx-topic-browser-head"><div><span>TOPICS</span><h3>Choose what you want to study next</h3></div><small>${all.length} topics</small></div><div class="nx-topic-browser-grid">${visible.map(x=>{const p=progressLevel(state.progress[x.key]),b=topicBrief(x.topic,x.unit,c);return `<button type="button" class="nx-topic-tile ${x.ui===current.ui&&x.ti===current.ti?'active':''}" data-pick-topic="${x.ui}:${x.ti}"><span class="nx-topic-tile-copy"><b>${esc(x.topic)}</b><em>${esc(b)}</em></span><small>${p===3?'Verified':p===2?'Practised':p===1?'Reviewed':'Ready'}</small></button>`}).join('')}</div>${all.length>9?`<button type="button" class="nx-topic-view-all" data-topic-view-all>${topicBrowserExpanded?'Show fewer topics':`View all ${all.length} topics`}</button>`:''}</section>`
}
function openCourse(k,{unitIndex=null,topicIndex=null,topicRef=null}={}){const c=getCourse(k);if(!c)return;activeCourse=c;topicBrowserExpanded=false;if(topicRef){const [ui,ti]=String(topicRef).split(':').map(Number);state.selection.unitIndex=Number.isFinite(ui)?ui:0;state.selection.topicIndex=Number.isFinite(ti)?ti:0}else{if(unitIndex!=null)state.selection.unitIndex=Number(unitIndex)||0;if(topicIndex!=null)state.selection.topicIndex=Number(topicIndex)||0}state.selection.courseKey=k;saveLocal();$('#courseWorkspaceContent').innerHTML=workspaceMarkup(c);showModal('#courseWorkspace')}
function currentTopic(){return activeCourse?topicAt(activeCourse,state.selection.unitIndex,state.selection.topicIndex):null}
function renderTool(kind){const c=activeCourse,x=currentTopic();if(!c||!x)return;
 if(['notes','revision','practice'].includes(kind)){
 $('#academicToolContent').innerHTML=`<span class="nx-acad-kicker">${esc(c.code)} · ${esc(x.topic)}</span><h2 id="academicToolTitle">${esc(kind==='notes'?'Study Notes':kind==='revision'?'Revision':'Practice')} · ${esc(x.topic)}</h2><div id="nxStudyNotesBody" role="status">Loading topic content…</div>`;
 showModal('#academicToolModal');hydrateStudyNotes(c,x,kind);return;
 }
 $('#academicToolContent').innerHTML=`<h2 id="academicToolTitle">Resources · ${esc(x.topic)}</h2><p>Ask NEXZO for an explanation or use your course materials.</p><button data-topic-tool="assistant">Ask NEXZO</button><a target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${encodeURIComponent(c.title+' '+x.topic)}">Optional video search</a>`;showModal('#academicToolModal');
}
function normalizeEval(data){if(data?.score==null||!Number.isFinite(Number(data.score))||Number(data.score)<0||Number(data.score)>10||typeof data.feedback!=='string'||!data.feedback.trim())throw new Error('Evaluator returned no valid score/feedback. Nothing was marked verified.');const metric=(...vals)=>{const v=vals.find(x=>x!==undefined&&x!==null&&x!=='');return Number.isFinite(Number(v))?Math.max(0,Math.min(100,Number(v))):null};return {score:Number(data.score),feedback:String(data.feedback),strengths:Array.isArray(data.strengths)?data.strengths:[data.strengths].filter(Boolean),improvements:Array.isArray(data.improvements)?data.improvements:[data.improvements].filter(Boolean),correctness:metric(data.correctness,data.correct),understanding:metric(data.understanding,data.comprehension),completeness:metric(data.completeness,data.complete),presentation:metric(data.presentation,data.clarity),source:'connected-ai'}}
async function verifyTopic(ui,ti){
 if(verifyBusy||!activeCourse)return;
 const course=activeCourse,difficulty=state.selection.difficulty,uid=owner(),ctx=topicAt(course,ui,ti),key=topicKey(course,ui,ti);
 const textarea=$('#nxTopicAnswer'),status=$('#nxTopicVerifyStatus'),answer=String(textarea?.value||'').trim(),preview=practicePreview;
 if(answer.length<20)return toast('Write a meaningful answer before verification.','error');
 state.topicEvidence[key]={...(state.topicEvidence[key]||{}),draftAnswer:answer,draftUpdatedAtMs:Date.now()};saveLocal();verifyBusy=true;
 if(status){status.textContent='Checking your actual practice answers…';status.className='nx-verify-status loading';}
 try{
  if(!preview||preview.uid!==uid||preview.academic.courseKey!==courseKey(course)||preview.academic.unitIndex!==ui||preview.academic.topicIndex!==ti||preview.academic.level!==difficulty)throw new Error('Open practice for the current topic before evaluating.');
  const receipt=await window.NEXZOAI.evaluate({academic:preview.academic,practicePlanId:preview.planId,answer});
  if(owner()!==uid||!receipt.persisted||!receipt.serverVerified)throw new Error('Evaluation cloud confirmation failed.');
  try{await window.NEXZOGamificationEngine?.refreshVerifiedRewards?.();}catch(error){window.dispatchEvent(new CustomEvent('nexzo:cloud-status',{detail:{area:'rewards',status:'offline',message:error.message}}));}
  if(owner()!==uid)return;
  const result=normalizeEval(receipt),now=receipt.evaluatedAtMs;
  const attempt={id:receipt.evaluationId,uid,courseKey:courseKey(course),courseCode:course.code,courseTitle:course.title,unitIndex:ui,unitTitle:ctx.unit.title,topicIndex:ti,topic:ctx.topic,difficulty,questions:receipt.questions,answer,score:result.score,feedback:result.feedback,strengths:result.strengths,improvements:result.improvements,correctness:result.correctness,understanding:result.understanding,completeness:result.completeness,presentation:result.presentation,evaluationSource:result.source,submittedAtMs:now,serverVerified:true};
  state.attempts[key]=[attempt,...(state.attempts[key]||[]).filter(a=>a.id!==attempt.id)].slice(0,20);
  state.topicEvidence[key]={status:'verified',draftAnswer:'',verifiedAtMs:now,lastAttemptId:attempt.id};state.progress[key]=result.score>=8?3:result.score>=5?2:1;
  const persisted=await saveCloudNow();
  if(owner()!==uid)return;
  window.dispatchEvent(new CustomEvent('nexzo:academic-practice-complete',{detail:{id:attempt.id,subject:course.title,score:Math.round(result.score*10),amount:0,serverAwarded:true,evaluationId:receipt.evaluationId}}));
  if(status&&document.body.contains(status)){
   status.className=`nx-verify-status ${result.score>=5?'good':'bad'}`;
   status.innerHTML=`<b>Overall: ${result.score.toFixed(1)}/10</b><br>${esc(result.feedback)}<br>${[['Correctness',result.correctness],['Understanding',result.understanding],['Completeness',result.completeness],['Presentation',result.presentation]].map(([l,v])=>`${l}: ${v==null?'Not provided':`${esc(v)}%`}`).join(' · ')}<br><small>Evaluation saved to your account. ${persisted.cloud?'Academic view synced.':'Academic view sync pending; refresh will restore the server receipt.'}</small>`;
  }
  renderMine();renderProgress();
 }catch(error){
  if(owner()!==uid)return;
  const providerFailure=['AI_QUOTA_EXCEEDED','PROVIDER_TIMEOUT','AUTH_CONFIGURATION_ERROR','MODEL_UNAVAILABLE','INVALID_AI_RESPONSE'].includes(error?.code);
  if(status&&document.body.contains(status)){status.className='nx-verify-status bad';status.innerHTML=`${providerFailure?'No score, mastery or XP was awarded.':'Evaluation result is not confirmed. Retry safely or refresh to check your saved result.'}<br>${esc(error?.message||error)}<br><small>Your answer is preserved for retry.</small>`;}
  toast('Evaluation unavailable. Your answer was preserved.','error');
 }finally{verifyBusy=false;}
}

function plannerTaskId(c,ui,ti,type='study'){return `acad_${stableHash(`${courseKey(c)}|${ui}|${ti}|${type}`)}`}
async function addPlanner(c,{ui=state.selection.unitIndex,ti=state.selection.topicIndex,type='study'}={}){const ctx=topicAt(c,ui,ti)||findNextTopic(c);if(!ctx)return toast('No syllabus topic is available for this course.','error');const store=window.NEXZOTaskStore;if(!store?.upsert)return toast('Planner is still loading. Try again.','error');const id=plannerTaskId(c,ctx.ui,ctx.ti,type),exists=store.getAll?.().some(t=>t.id===id&&!t.completed);if(exists)return toast('This topic is already in Planner.','info');const title=type==='project'?`Project: ${ctx.topic}`:`Study ${ctx.topic}`;store.upsert({id,title,subject:c.title,type:type==='project'?'Project Work':'Syllabus Study',status:'pending',completed:false,progress:0,duration:'30 Min',estimatedMinutes:30,difficulty:state.selection.difficulty,courseCode:c.code,unitTitle:ctx.unit.title,topic:ctx.topic,source:'academics-v240',createdAtMs:Date.now(),updatedAtMs:Date.now()},{cloud:true,immediate:true});const local=store.getAll?.().find(t=>t.id===id);if(!local)return toast('Planner did not retain this topic. Please retry.','error');const signedIn=!!window.NEXZODataService?.getUser?.();if(!signedIn)return toast('Topic added to Planner on this device. Sign in for cloud sync.','info');const ok=await store.flush?.();if(!ok)return toast('Topic is kept on this device, but Planner cloud confirmation failed. Retry when online.','error');try{const confirmed=await window.NEXZODataService.confirmTask(id);if(!confirmed||confirmed.subject!==c.title||confirmed.topic!==ctx.topic)throw new Error('Saved task did not match this topic.');toast('Topic confirmed in Planner.','success')}catch(error){toast('Topic is kept on this device, but cloud read-back failed. Retry when online.','error')}}
function launchAssistant(c,mode='explain'){const x=currentTopic()||findNextTopic(c);if(!x)return;const prompt={explain:`Explain the syllabus topic “${x.topic}” from ${c.title} (${c.code}), unit “${x.unit.title}”. Give a precise explanation, one worked example, common mistakes and a short revision recap.`,quiz:`Quiz me only on “${x.topic}” from ${c.title} (${c.code}) at ${state.selection.difficulty} level. Ask one question at a time and verify each answer.`,notes:`Create concise exam-ready notes only for “${x.topic}” from unit “${x.unit.title}” in ${c.title}. Separate known concepts, examples, exam points and limitations; do not invent course facts.`}[mode]||'';localStorage.setItem('nexzo.ai.launch',JSON.stringify({mode:mode==='quiz'?'quiz':'explain',prompt,at:Date.now(),academicContext:{code:c.code,title:c.title,unit:x.unit.title,topic:x.topic,difficulty:state.selection.difficulty}}));location.href=`ai-assistant.html?mode=${encodeURIComponent(mode==='quiz'?'quiz':'explain')}`}
function addFiles(list){if(!activeCourse)return;const k=courseKey(activeCourse);[...list].forEach(f=>state.files.unshift({id:`file_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,courseKey:k,name:f.name,size:f.size,type:f.type,addedAtMs:Date.now()}));state.files=state.files.slice(0,100);saveLocal();toast('File metadata linked to this subject. File bytes are not called cloud-saved here.','success')}
function openFiles(){if(!activeCourse)return;const files=state.files.filter(f=>f.courseKey===courseKey(activeCourse));$('#academicToolContent').innerHTML=`<span class="nx-acad-kicker">${esc(activeCourse.code)}</span><h2 id="academicToolTitle">My Study Files · ${esc(activeCourse.title)}</h2><div class="nx-file-drop"><b>Attach local PYQ/notes metadata</b><p>NEXZO records the file name/type/size in this workspace. It does not claim the file bytes are uploaded unless a storage upload is implemented.</p><input id="academicFileInput" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,image/*" multiple></div><div class="nx-file-list">${files.length?files.map(f=>`<div class="nx-file-row"><span>▤ ${esc(f.name)} · ${Math.round(Number(f.size||0)/1024)} KB</span><button data-remove-file="${esc(f.id)}">Remove</button></div>`).join(''):'<small>No files linked yet.</small>'}</div>`;showModal('#academicToolModal')}
function bind(){document.addEventListener('click',async e=>{const tab=e.target.closest('[data-acad-tab]');if(e.target.closest('[data-notes-retry]'))return renderTool(e.target.closest('[data-notes-retry]').dataset.notesRetry);if(tab){$$('[data-acad-tab]').forEach(b=>b.classList.toggle('active',b===tab));$$('[data-acad-panel]').forEach(p=>{const on=p.dataset.acadPanel===tab.dataset.acadTab;p.hidden=!on;p.classList.toggle('active',on)});if(tab.dataset.acadTab==='catalog')renderCatalog();return}if(e.target.closest('[data-open-curriculum]')||e.target.closest('#manageCurriculumBtn'))return openManager();if(e.target.closest('#saveMySubjectsBtn')){e.preventDefault();return commitManagerSubjects();}if(e.target.closest('[data-close-acad-modal]')||e.target.classList.contains('nx-acad-modal'))return closeModals();const open=e.target.closest('[data-open-course]');if(open)return openCourse(open.dataset.openCourse,{unitIndex:open.dataset.selectUnit,topicRef:open.dataset.selectTopic});const toggle=e.target.closest('[data-toggle-subject]');if(toggle)return toggleSubject(toggle.dataset.toggleSubject,toggle);const planner=e.target.closest('[data-course-planner]');if(planner){const c=getCourse(planner.dataset.coursePlanner);if(c){activeCourse=c;const next=findNextTopic(c);return addPlanner(c,next?{ui:next.ui,ti:next.ti}:{})}}const unit=e.target.closest('[data-unit-toggle]');if(unit){const body=$(`[data-unit-body="${unit.dataset.unitToggle}"]`);if(body)body.hidden=!body.hidden;return}const pick=e.target.closest('[data-pick-topic]');if(pick&&activeCourse){const [ui,ti]=pick.dataset.pickTopic.split(':').map(Number);state.selection={...state.selection,courseKey:courseKey(activeCourse),unitIndex:ui,topicIndex:ti};saveLocal();$('#courseWorkspaceContent').innerHTML=workspaceMarkup(activeCourse);return}const viewAll=e.target.closest('[data-topic-view-all]');if(viewAll&&activeCourse){topicBrowserExpanded=!topicBrowserExpanded;$('#courseWorkspaceContent').innerHTML=workspaceMarkup(activeCourse);return}const tool=e.target.closest('[data-topic-tool]');if(tool&&activeCourse){const kind=tool.dataset.topicTool;if(kind==='assistant')return launchAssistant(activeCourse,'explain');if(kind==='quiz')return launchAssistant(activeCourse,'quiz');if(kind==='planner')return addPlanner(activeCourse,{type:e.target.closest('[data-topic-ai-project]')?'project':'study'});return renderTool(kind)}const verify=e.target.closest('[data-verify-topic]');if(verify&&activeCourse){const [ui,ti]=verify.dataset.verifyTopic.split(':').map(Number);return verifyTopic(ui,ti)}if(e.target.closest('[data-topic-ai-pack]')&&activeCourse)return launchAssistant(activeCourse,'notes');const remove=e.target.closest('[data-remove-file]');if(remove){state.files=state.files.filter(f=>f.id!==remove.dataset.removeFile);saveLocal();return openFiles()}const legacyTool=e.target.closest('[data-acad-tool]');if(legacyTool){if(legacyTool.dataset.acadTool==='pyq')return openFiles();if(activeCourse)return renderTool(legacyTool.dataset.acadTool==='quiz'?'practice':legacyTool.dataset.acadTool==='video'?'resources':legacyTool.dataset.acadTool)} });
 document.addEventListener('change',e=>{if(e.target.matches('#managerSubjectList input[type="checkbox"]')){e.target.checked?managerDraft.add(e.target.value):managerDraft.delete(e.target.value);$('#managerSelectionCount').textContent=`${managerDraft.size} selected`;return}if(e.target.matches('[data-acad-select]')&&activeCourse){const key=e.target.dataset.acadSelect;if(key==='topicFlat'){const [ui,ti]=String(e.target.value).split(':').map(Number);state.selection.unitIndex=Number.isFinite(ui)?ui:0;state.selection.topicIndex=Number.isFinite(ti)?ti:0}else if(key==='questionCount')state.selection.questionCount=Number(e.target.value)||5;else state.selection[key]=e.target.value;saveLocal();$('#courseWorkspaceContent').innerHTML=workspaceMarkup(activeCourse);return}if(e.target.matches('[data-topic-progress]')&&activeCourse){const [ui,ti]=e.target.dataset.topicProgress.split(':').map(Number);state.progress[topicKey(activeCourse,ui,ti)]=progressLevel(e.target.value);saveLocal();renderAll();return}if(e.target.matches('#academicFileInput'))return addFiles(e.target.files)});
 let managerSearchTimer=0,catalogSearchTimer=0;$('#managerSearch')?.addEventListener('input',()=>{clearTimeout(managerSearchTimer);managerSearchTimer=setTimeout(renderManager,140)});$('#curriculumSearch')?.addEventListener('input',()=>{clearTimeout(catalogSearchTimer);catalogSearchTimer=setTimeout(renderCatalog,140)});$('#curriculumType')?.addEventListener('change',renderCatalog);document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModals()})}
async function init(){window.NEXZOShell?.layout?.('Academics');loadLocal();bind();let authSwitchBusy=false;const refreshOwner=async()=>{if(authSwitchBusy)return;authSwitchBusy=true;try{loadLocal();renderAll();await hydrateCloud();}finally{authSwitchBusy=false}};const queueOwnerRefresh=()=>{clearTimeout(ownerRefreshTimer);ownerRefreshTimer=setTimeout(refreshOwner,120)};window.addEventListener('nexzo:auth-ready',queueOwnerRefresh,{passive:true});window.addEventListener('nexzo:data-ready',queueOwnerRefresh,{passive:true});try{const r=await fetch('data/mriirs-cse-2023-27.json',{cache:'no-store'});if(!r.ok)throw new Error(`Curriculum ${r.status}`);const p=await r.json();catalog=Array.isArray(p.courses)?p.courses:[];renderAll();await hydrateCloud()}catch(error){if($('#mySubjectGrid'))$('#mySubjectGrid').innerHTML=`<div class="nx-empty"><div><h3>Curriculum could not load</h3><p>${esc(error.message)}. Run NEXZO through a local web server instead of opening HTML directly.</p></div></div>`}}
window.NEXZOAcademics=Object.freeze({version:254,snapshot:academicSnapshot,openCourse,openManager,topicQuestions,plannerTaskId,normalizeEval});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
