(function(){'use strict';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function severityIcon(s){return s==='critical'?'🔴':s==='high'?'🟠':'🟡'}
function render(){
 const host=document.getElementById('nxPulseV203');
 const intel=window.NEXZOIntelligence?.snapshot?.();
 if(!host||!intel)return;
 const {twin,radar,pulse}=intel,n=pulse.nextAction,a=pulse.topAlert;
 host.innerHTML=`
 <div class="nx-pulse-head">
   <div><span class="nx-pulse-kicker">⚡ NEXZO PULSE · YOUR LIVE COMMAND CENTER</span><h2>What should you do right now?</h2><p>Pulse combines your Learning Twin, Radar and Decision Engine so you do not have to figure out the next step yourself.</p></div>
   <div class="nx-pulse-status"><span></span> LIVE PERSONALIZATION</div>
 </div>
 <div class="nx-pulse-architecture" aria-label="How NEXZO decides">
   <div><b>🧠 Learning Twin</b><small>Understands you</small></div><i>→</i>
   <div><b>📡 Radar</b><small>Detects risks</small></div><i>→</i>
   <div><b>🎯 Decision Engine</b><small>Ranks actions</small></div><i>→</i>
   <div class="active"><b>⚡ Pulse</b><small>Shows what matters now</small></div>
 </div>
 <div class="nx-pulse-grid nx-pulse-grid-v204">
   <article class="nx-pulse-panel nx-twin-card"><div class="nx-layer-label"><span>01</span><small>🧠 NEXZO LEARNING TWIN</small></div><h3>${E(twin.careerGoal||'Academic improvement')}</h3><p class="nx-layer-purpose">Your live academic profile — what NEXZO currently knows about your learning state.</p><div class="nx-pulse-chips"><span>${twin.assessedTopics} assessed</span><span>${twin.weakTopics} weak</span><span>${twin.strongTopics} strong</span><span>${twin.pendingTasks} pending</span></div><a class="nx-text-link" href="personalization.html">View / update my Twin →</a></article>
   <article class="nx-pulse-panel nx-radar-card"><div class="nx-layer-label"><span>02</span><small>📡 NEXZO RADAR</small></div>${a?`<h3>${severityIcon(a.severity)} ${E(a.title)}</h3><p>${E(a.detail)}</p>`:'<h3>🟢 No urgent risk detected</h3><p>Add exams, backlogs or assessed activity and Radar will detect what needs attention.</p>'}<div class="nx-pulse-chips"><span>${radar.critical} critical</span><span>${radar.high} high</span><span>${pulse.overdueTasks} overdue</span></div><div class="nx-card-caption">ROLE · Detects risk, urgency and learning gaps</div></article>
   <article class="nx-pulse-panel nx-decision-card"><div class="nx-layer-label"><span>03</span><small>🎯 NEXZO DECISION ENGINE</small></div>${n?`<h3>${E(n.title)}</h3><p>${E(n.action)}</p><div class="nx-pulse-chips"><span>⏱ ${n.duration} min</span><span>✨ ${n.match}% match</span><span>Today: ${pulse.capacityMinutes} min</span></div><div class="nx-pulse-actions"><a href="personalization.html">Start this action</a><a href="planner.html">Add / view Planner</a></div>`:'<h3>Complete your Learning Twin</h3><p>NEXZO needs a subject, backlog, interest or career goal before it can rank your next action.</p><a class="nx-pulse-setup" href="personalization.html">Set up Learning Twin</a>'}<div class="nx-card-caption">ROLE · Chooses the highest-priority next action</div></article>
   <article class="nx-pulse-panel nx-pulse-summary"><div class="nx-layer-label"><span>04</span><small>⚡ NEXZO PULSE</small></div><h3>${pulse.readiness||'Ready'} · ${pulse.capacityMinutes} min available</h3><p>Your current snapshot after combining Twin + Radar + Decision Engine.</p><div class="nx-pulse-metrics"><div><b>${pulse.pendingTasks}</b><small>Pending</small></div><div><b>${pulse.overdueTasks}</b><small>Overdue</small></div><div><b>${radar.critical+radar.high}</b><small>Risks</small></div></div><div class="nx-card-caption">ROLE · One glance view of what matters now</div></article>
 </div>`;
}
function init(){render();['nexzo:personalization-ready','nexzo:personalization-updated','nexzo:personalization-sync','nexzo:intelligence-ready','nexzo:tasks-updated'].forEach(n=>window.addEventListener(n,()=>setTimeout(render,20)))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
