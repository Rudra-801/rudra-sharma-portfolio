/* NEXZO Student Digital Twin v181 — additive intelligence layer; preserves existing UI and data. */
(function(){
'use strict';
if(window.__NEXZO_STUDENT_TWIN_V181__)return; window.__NEXZO_STUDENT_TWIN_V181__=true;
const page=document.body?.dataset?.page||'', $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const clamp=n=>Math.max(0,Math.min(100,Number(n)||0));
const owner=()=>window.NEXZODataService?.getUser?.()?.uid||localStorage.getItem('nexzo_canonical_cache_owner')||'local';
function academicsState(){try{return JSON.parse(localStorage.getItem(`nexzo_academics_v240:${owner()}`)||'{}')||{}}catch{return{}}}
function pSnap(){try{return window.NEXZOPersonalization?.snapshot?.()||{}}catch{return{}}}
function sSnap(){try{return window.NEXZOStateAuthority?.snapshot?.()||{}}catch{return{}}}
function twin(){
 const p=pSnap(), s=sSnap(), mastery=Object.values(p.mastery||{}), assessed=mastery.filter(x=>x.assessed);
 const avg=assessed.length?Math.round(assessed.reduce((a,x)=>a+clamp(x.score),0)/assessed.length):0;
 const weak=assessed.filter(x=>x.score<55).sort((a,b)=>a.score-b.score);
 const strong=assessed.filter(x=>x.score>=75).sort((a,b)=>b.score-a.score);
 const stats=s.stats||{}, tasks=window.NEXZOTaskStore?.getAll?.()||[];
 const pending=tasks.filter(t=>!t.completed), overdue=pending.filter(t=>Number(t.deadlineMs)>0&&Number(t.deadlineMs)<Date.now());
 const capacity=Math.max(30,Number(p.profile?.dailyMinutes)||120);
 const consistency=clamp((stats.streak||0)*8 + (stats.progress||0)*.45);
 const risk=clamp((weak.length*11)+(overdue.length*14)+(pending.length>6?18:0)+(avg?Math.max(0,55-avg):8));
 return {p,s,mastery,assessed,avg,weak,strong,stats,tasks,pending,overdue,capacity,consistency:Math.round(consistency),risk:Math.round(risk),next:p.todayPlan?.items?.[0]||p.recommendations?.[0]||null};
}
window.NEXZOStudentTwin=Object.freeze({version:181,snapshot:twin});
function mount(after,html){const el=document.createElement('section');el.className='nx181';el.innerHTML=html; after?.insertAdjacentElement?.('afterend',el); return el}
function fmtTopic(x){return esc(x?.topic||x?.subject||'Start a verified assessment')}
function dashboard(){
 if($('.nx181'))return; const host=$('.dashboard-page main')||$('main')||$('.dashboard-page'); if(!host)return;
 const t=twin(), name=esc(t.s.profile?.name||t.s.profile?.username||'Your');
 const section=document.createElement('section'); section.className='nx181 nx181-dashboard';
 section.innerHTML=`<div class="nx181-head"><div><span class="nx181-kicker">NEXZO INTELLIGENCE</span><h2>${name} Learning Twin</h2><p>Live model built from verified learning evidence and planner activity.</p></div><span class="nx181-live"><i></i> LIVE</span></div>
 <div class="nx181-grid">
  <article class="nx181-card nx181-twin"><div class="nx181-ring" style="--p:${t.avg}"><b>${t.assessed.length?t.avg:'—'}${t.assessed.length?'%':''}</b><small>verified mastery</small></div><div><h3>Student Digital Twin</h3><p><b>Strong:</b> ${t.strong.length?t.strong.slice(0,2).map(fmtTopic).join(', '):'Not enough evidence yet'}</p><p><b>Needs work:</b> ${t.weak.length?t.weak.slice(0,2).map(fmtTopic).join(', '):'No verified weak topic yet'}</p><div class="nx181-tags"><span>Consistency ${t.consistency}%</span><span>Risk ${t.risk}%</span><span>${t.pending.length} pending</span></div></div></article>
  <article class="nx181-card nx181-sim"><span class="nx181-kicker">FUTURE SIMULATOR</span><h3>What if I study consistently?</h3><div class="nx181-controls"><label>Daily study <b id="nx181Hours">1.0h</b><input id="nx181Study" type="range" min="0.5" max="3" value="1" step="0.5"></label><label>For <b id="nx181Days">30 days</b><input id="nx181Period" type="range" min="7" max="60" value="30" step="1"></label></div><div class="nx181-forecast"><span>Current <b>${t.assessed.length?t.avg:'—'}${t.assessed.length?'%':''}</b></span><span>Estimated <b id="nx181Estimate">—</b></span></div><small>Scenario estimate, not a guaranteed academic outcome.</small></article>
 </div>`;
 const anchor=$('.nx-dash-personalized')||$('.dash-study-overview-exact')||$('.dash-stats-exact');
 if(anchor) anchor.insertAdjacentElement('afterend',section); else host.append(section);
 const study=$('#nx181Study'), days=$('#nx181Period'), out=$('#nx181Estimate');
 function sim(){const h=+study.value,d=+days.value;const base=t.assessed.length?t.avg:20; const evidence=Math.min(28,Math.sqrt(h*d)*3.1); const drag=t.risk*.045; out.textContent=Math.round(clamp(base+evidence-drag))+'%';$('#nx181Hours').textContent=h.toFixed(1)+'h';$('#nx181Days').textContent=d+' days'}
 study.oninput=days.oninput=sim;sim();
}
function knowledgeMap(){
 if($('.nx181'))return; const host=$('.academics-page main')||$('main')||$('.academics-page');if(!host)return;
 const t=twin(), list=t.assessed.length?t.assessed.slice().sort((a,b)=>(b.lastActivityMs||0)-(a.lastActivityMs||0)).slice(0,8):[];
 const sec=document.createElement('section');sec.className='nx181 nx181-map';sec.innerHTML=`<div class="nx181-head"><div><span class="nx181-kicker">PERSONAL KNOWLEDGE MAP</span><h2>Your verified learning path</h2><p>Nodes change only when NEXZO receives learning evidence.</p></div><a href="planner.html" class="nx181-link">Open Planner →</a></div><div class="nx181-nodes">${list.length?list.map((x,i)=>`<button class="nx181-node ${x.score>=75?'strong':x.score>=55?'mid':'weak'}" data-topic="${esc(x.topic)}"><span>${i+1}</span><b>${fmtTopic(x)}</b><small>${Math.round(x.score)}% · ${esc(x.status)}</small></button>`).join('<i class="nx181-line"></i>'):`<div class="nx181-empty"><b>No verified map yet.</b><span>Complete a quiz or Smart Evaluation and your personal map will build automatically.</span></div>`}</div>`;
 const panels=[...document.querySelectorAll('.nx-acad-panel')];
 const anchor=panels.at(-1)||$('.nx-acad-tabs')||$('.nx-acad-hero');
 if(anchor) anchor.insertAdjacentElement('afterend',sec); else host.append(sec);
 sec.querySelectorAll('.nx181-node').forEach(b=>b.onclick=()=>window.NEXZOShell?.toast?.(`${b.dataset.topic}: open the topic workspace below to continue.`,`info`));
}
function recovery(){
 if($('.nx181-recovery'))return;const host=$('.planner-page main')||$('main')||$('.planner-page');if(!host)return;const t=twin();
 const sec=document.createElement('section');sec.className='nx181 nx181-recovery nx181-native-strip';const behind=t.overdue.length||t.pending.length>=4;
 sec.innerHTML=`<div class="nx181-native-head"><div><span class="nx181-kicker">NEXZO · ADAPTIVE RECOVERY</span><h2>${behind?'Recovery plan':'Planner health'}</h2><p>${behind?'NEXZO can rebalance upcoming work without deleting existing tasks.':'Your current plan is under control.'}</p></div>${behind?'<button id="nx181Preview" class="nx181-btn">Preview recovery plan</button>':'<span class="nx181-ok">✓ On track</span>'}</div><div class="nx181-native-tabs" aria-label="Planner intelligence"><div><b>${t.pending.length}</b><span>Pending</span></div><div><b>${t.overdue.length}</b><span>Overdue</span></div><div><b>${t.consistency}%</b><span>Consistency</span></div><div><b>${t.risk}%</b><span>Recovery risk</span></div></div><div id="nx181RecoveryPlan"></div>`;
 const anchor=$('.planner-shell .stats')||$('.planner-shell .planner-head')||$('.planner-head'); if(anchor)anchor.insertAdjacentElement('afterend',sec);else host.append(sec);
 async function curriculumContext(){
  try{
   const res=await fetch('data/mriirs-cse-2023-27.json',{cache:'no-store'});if(!res.ok)throw new Error('curriculum');
   const data=await res.json(),courses=Array.isArray(data?.courses)?data.courses:[];
   const a=academicsState(),selected=new Set(Array.isArray(a?.selected)?a.selected:[]);
   let rows=courses.filter(c=>selected.has(`${c.semesterSuggested}:${c.code}`));
   if(!rows.length){const wanted=new Set((t.p?.profile?.subjects||[]).map(x=>String(x).toLowerCase()));rows=courses.filter(c=>wanted.has(String(c.title).toLowerCase()))}
   return rows.length?rows:courses.filter(c=>/data structures|digital electronics|machine learning|database|computer network|operating system/i.test(c.title)).slice(0,8);
  }catch{return[]}
 }
 function topicRows(courses){return courses.flatMap(c=>(c.units||[]).flatMap(u=>(u.topics||[]).map(topic=>({subject:c.title,code:c.code,unit:u.title,topic}))));}
 function pickRecovery(rows,index){
  const weak=t.weak[index];if(weak){const needle=String(weak.subject||weak.topic||'').toLowerCase();const hit=rows.find(x=>`${x.subject} ${x.unit} ${x.topic}`.toLowerCase().includes(needle));if(hit)return hit}
  const pending=t.pending[index];if(pending){const needle=String(pending.subject||'').toLowerCase();const candidates=rows.filter(x=>x.subject.toLowerCase().includes(needle)||needle.includes(x.subject.toLowerCase()));if(candidates.length)return candidates[index%candidates.length]}
  return rows.length?rows[index%rows.length]:null;
 }
 $('#nx181Preview')?.addEventListener('click',async()=>{
  const plan=$('#nx181RecoveryPlan');plan.innerHTML='<div class="nx181-plan"><small>Reading your MRIIRS syllabus and preparing recovery topics…</small></div>';
  const courses=await curriculumContext(),rows=topicRows(courses),count=Math.min(3,Math.max(1,t.weak.length||t.overdue.length||t.pending.length||1));
  const items=Array.from({length:count},(_,i)=>{const x=pickRecovery(rows,i);return x?{...x,minutes:[35,45,40][i]||40,date:new Date(Date.now()+(i+1)*86400000).toISOString().slice(0,10)}:null}).filter(Boolean);
  if(!items.length){plan.innerHTML='<div class="nx181-plan"><small>No syllabus-backed recovery topic is available yet. Select your current subjects in Academics first.</small></div>';return}
  plan.innerHTML=`<div class="nx181-plan">${items.map((x,i)=>`<div><span>Day ${i+1} · ${esc(x.code)}</span><b>${esc(x.subject)} — ${esc(x.topic)}</b><small>${esc(x.unit)} · ${x.minutes} min · ${x.date}</small></div>`).join('')}<button id="nx181Apply" class="nx181-btn">Generate MCQs & add to Planner</button><small>Questions are generated from these syllabus topics. No generic General/Revision fallback is used.</small></div>`;
  let previews=null,busy=false;
  $('#nx181Apply').textContent='Generate MCQ previews';
  $('#nx181Apply').onclick=async()=>{
   if(busy)return;busy=true;const btn=$('#nx181Apply');btn.disabled=true;
   const uid=window.NEXZODataService?.getUser?.()?.uid;
   try{
    if(!previews){
      const generated=[];
      for(const x of items){const p=await window.NEXZOAI.planner({subject:x.subject.replace(/^(?:Recovery:\s*)+/i,''),taskType:'MCQ Practice',level:'Beginner',questionCount:'5 MCQs',courseCode:x.code,unit:x.unit,topic:x.topic});if(!p.planId)throw new Error('Question preview was not confirmed.');generated.push({x,p});}
      if(window.NEXZODataService?.getUser?.()?.uid!==uid)throw new Error('Account changed.');
      previews=generated;
      plan.querySelectorAll('.nx181-plan>div').forEach((host,i)=>{const content=document.createElement('pre');content.textContent=previews[i].p.tasks.flatMap(t=>t.questions).join('\n\n');content.style.whiteSpace='pre-wrap';host.append(content);});
      btn.textContent='Create these previewed recovery tasks';return;
    }
    let made=0;
    for(const {x,p} of previews){
      const subject=x.subject.replace(/^(?:Recovery:\s*)+/i,''),now=Date.now(),task={id:`recovery_${p.planId}`,title:`Recovery: ${subject} - MCQ Practice`,subject,type:'MCQ Practice',level:'Beginner',questionPlanId:p.planId,generatedQuestions:p.tasks.flatMap(t=>t.questions),unit:x.unit,topic:x.topic,syllabus:{courseCode:x.code,unit:x.unit,topic:x.topic},status:'pending',done:false,completed:false,questions:'5 MCQs',questionCount:5,progress:0,deadline:x.date,scheduledDate:x.date,deadlineTime:'23:59',plannedMinutes:x.minutes,createdAtMs:now,updatedAtMs:now,recovery:true};
      const saved=await window.NEXZOBackendStore.putTask(task.id,task);if(window.NEXZODataService?.getUser?.()?.uid!==uid||!saved.ok)throw new Error('Cloud task confirmation failed.');window.NEXZOTaskStore.upsert(saved.task,{cloud:false});made++;
    }
    btn.textContent='Saved to your account';btn.dataset.finished='true';window.NEXZOShell?.toast?.(`${made} recovery tasks saved.`, 'success');
   }catch(e){if(!previews?.length)previews=null;window.NEXZOShell?.toast?.(e.message,'error');btn.textContent=previews?'Retry saving previewed tasks':'Retry generation';}
   finally{busy=false;btn.disabled=btn.dataset.finished==='true';}
  };
 });
}
function career(){
 if($('.nx181-career'))return;const host=$('.career-page main')||$('main')||$('.career-page');if(!host)return;const t=twin();const sec=document.createElement('section');sec.className='nx181 nx181-career nx181-native-strip';
 sec.innerHTML=`<div class="nx181-native-head"><div><span class="nx181-kicker">NEXZO · LEARNING EVIDENCE</span><h2>Academic → Career bridge</h2><p>${t.assessed.length?`${t.assessed.length} verified topic${t.assessed.length===1?'':'s'} are informing your career recommendations.`:'Complete verified academic assessments to unlock evidence-aware recommendations.'}</p></div></div><div class="nx181-native-tabs" aria-label="Career learning evidence"><div><b>${t.assessed.length}</b><span>Verified topics</span></div><div><b>${t.assessed.length?t.avg+'%':'—'}</b><span>Readiness</span></div><div><b>${t.weak.length}</b><span>Skill gaps</span></div><div><b>${t.strong.length}</b><span>Strong topics</span></div></div>`;
 const anchor=$('.career-v242-feature-strip')||$('.career-v242-heading');if(anchor)anchor.insertAdjacentElement('afterend',sec);else host.append(sec);
}
function profile(){
 if($('.nx181-profile'))return;const host=$('.profile-page main')||$('main')||$('.profile-page');if(!host)return;const t=twin();const sec=document.createElement('section');sec.className='nx181 nx181-profile nx181-native-strip';
 sec.innerHTML=`<div class="nx181-native-head"><div><span class="nx181-kicker">NEXZO · LEARNING TWIN</span><h2>Your learning evidence</h2><p>Verified study activity feeds your live NEXZO profile.</p></div></div><div class="nx181-native-tabs" aria-label="Learning Twin metrics"><div><b>${t.assessed.length?t.avg+'%':'—'}</b><span>Verified mastery</span></div><div><b>${t.consistency}%</b><span>Consistency</span></div><div><b>${t.weak.length}</b><span>Weak topics</span></div><div><b>${t.stats.streak||0}</b><span>Study streak</span></div></div>`;
 const anchor=$('.profile-page .profile-hero')||$('.profile-top');if(anchor)anchor.insertAdjacentElement('afterend',sec);else host.append(sec);
}
function init(){setTimeout(()=>{({dashboard,academics:knowledgeMap,planner:recovery,career,profile}[page]||(()=>{}))()},700)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
['nexzo:personalization-ready','nexzo:task-store','nexzo:academics-updated'].forEach(e=>window.addEventListener(e,()=>{}));
})();
