/* NEXZO Today v205 — user-facing Student Autopilot experiment. */
(function(){'use strict';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=s=>s==='critical'?'🔴':s==='high'?'🟠':'🟡';
function planItems(intel){
 const raw=intel?.raw?.todayPlan?.items||[];
 if(raw.length)return raw.slice(0,3).map((x,i)=>({title:x.task||x.title||`Study block ${i+1}`,minutes:Number(x.minutes)||30,subject:x.subject||intel?.decision?.nextAction?.subject||'Study'}));
 const n=intel?.decision?.nextAction;if(!n)return[];
 return [{title:n.action||n.title,minutes:Number(n.duration)||30,subject:n.subject||'Study'}];
}
function render(){
 const host=document.getElementById('nxPulseV203');
 const intel=window.NEXZOIntelligence?.snapshot?.(); if(!host||!intel)return;
 const {twin,radar,pulse,decision}=intel,n=decision.nextAction,a=pulse.topAlert,plan=planItems(intel);
 const reason=(n?.why||[]).length?n.why.slice(0,3):[a?.detail, twin.careerGoal?`Aligned with ${twin.careerGoal}`:null, pulse.overdueTasks?`${pulse.overdueTasks} overdue Planner task(s)`:null].filter(Boolean);
 host.className='nx-today-v205';
 host.innerHTML=`
 <div class="nx-today-top">
  <div><span class="nx-today-kicker">⚡ NEXZO TODAY · STUDENT AUTOPILOT</span><h2>You don't need to decide what to study next.</h2><p>NEXZO checks your learning state, deadlines and workload, then gives you one clear next move.</p></div>
  <div class="nx-live"><i></i> LIVE FROM YOUR NEXZO DATA</div>
 </div>
 <div class="nx-today-main">
  <article class="nx-priority">
   <small>WHAT NEEDS ATTENTION</small>
   ${a?`<h3>${icon(a.severity)} ${E(a.title)}</h3><p>${E(a.detail)}</p>`:`<h3>🟢 Nothing urgent detected</h3><p>Add an exam, backlog, assessed topic or Planner task and NEXZO will watch it.</p>`}
   <div class="nx-mini-stats"><span><b>${radar.critical+radar.high}</b> risks</span><span><b>${pulse.overdueTasks}</b> overdue</span><span><b>${pulse.pendingTasks}</b> pending</span></div>
  </article>
  <article class="nx-next">
   <small>🎯 YOUR BEST NEXT MOVE</small>
   ${n?`<h3>${E(n.title)}</h3><p>${E(n.action)}</p><div class="nx-next-meta"><span>⏱ ${n.duration} min</span><span>✨ ${n.match}% match</span><span>📚 ${E(n.subject||'Study')}</span></div><div class="nx-main-actions"><a class="primary" href="personalization.html">▶ Start now</a><button id="nxAcceptPlan" type="button">＋ Put today's plan in Planner</button></div>`:`<h3>Tell NEXZO what you're working toward</h3><p>Complete your Learning Twin once. After that, NEXZO can prioritize your day automatically.</p><a class="nx-setup" href="personalization.html">Set up my learning profile →</a>`}
  </article>
 </div>
 <div class="nx-plan-row">
  <div class="nx-plan-head"><div><small>AUTOPILOT PLAN</small><h3>Today's suggested study blocks</h3></div><span>${pulse.capacityMinutes} min available today</span></div>
  <div class="nx-blocks">${plan.length?plan.map((x,i)=>`<div class="nx-block"><b>${i+1}</b><div><strong>${E(x.title)}</strong><small>${E(x.subject)} · ${x.minutes} min</small></div></div>`).join(''):'<p class="nx-empty">No plan yet — add subjects, goals or tasks to generate one.</p>'}</div>
 </div>
 <details class="nx-why"><summary>How did NEXZO decide this? <span>Twin → Radar → Decision Engine</span></summary><div class="nx-why-grid"><div><b>🧠 Learning Twin</b><p>${twin.assessedTopics} assessed · ${twin.weakTopics} weak · ${twin.strongTopics} strong · ${twin.pendingTasks} pending</p></div><div><b>📡 Radar</b><p>${a?E(a.title):'No urgent risk detected.'}</p></div><div><b>🎯 Decision Engine</b><p>${reason.length?reason.map(E).join(' · '):'Waiting for more learning evidence.'}</p></div><div><b>⚡ Pulse</b><p>${pulse.capacityMinutes} min capacity · ${pulse.pendingTasks} pending · ${radar.critical+radar.high} active risks</p></div></div></details>`;
 const btn=document.getElementById('nxAcceptPlan'); if(btn)btn.onclick=()=>acceptPlan(btn,plan);
}
async function acceptPlan(btn,plan){
 if(!plan.length)return;
 const store=window.NEXZOTaskStore;if(!store?.upsert){btn.textContent='Planner is still loading…';return;}
 btn.disabled=true;const now=Date.now();
 try{
  for(let i=0;i<plan.length;i++){
   const x=plan[i];
   await Promise.resolve(store.upsert({id:`autopilot_${now}_${i}`,title:x.title,subject:x.subject,type:'NEXZO Autopilot',status:'pending',completed:false,progress:0,duration:x.minutes,estimatedMinutes:x.minutes,createdAtMs:now+i,updatedAtMs:now+i,source:'nexzo-autopilot-v205'},{cloud:true,immediate:true}));
  }
  await Promise.resolve(store.flush?.());
  btn.textContent='✓ Added to Planner'; btn.classList.add('done');
 }catch(e){console.error('[NEXZO Today] planner add failed',e);btn.disabled=false;btn.textContent='Could not save — try again';}
}
function init(){render();['nexzo:personalization-ready','nexzo:personalization-updated','nexzo:personalization-sync','nexzo:intelligence-ready','nexzo:tasks-updated'].forEach(n=>window.addEventListener(n,()=>setTimeout(render,40)));setTimeout(render,700)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
