/* Home reads canonical stores. No XP awards or student writes. */
(function(){
'use strict';
if(document.body?.dataset.page!=='home')return;
const abort=new AbortController();let uid=null;
const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
function render(){
 const snapshot=window.NEXZOStateAuthority?.snapshot?.()||{},stats=snapshot.stats;
 set('homeLevelV5',uid&&snapshot.level?.level?'Lv. '+snapshot.level.level:'Your next chapter');
 set('homeTaskCountV5',uid&&stats?String(Math.max(0,Number(stats.tasksToday)||0)):'—');
 set('homeProgressV5',uid&&stats?Math.max(0,Math.min(100,Number(stats.progress)||0))+'%':'—');
 const game=window.NEXZOGamificationEngine?.summary?.(),achievements=Array.isArray(game?.achievements)?game.achievements.length:snapshot.profile?.achievementsCount;
 set('homeAchievementsV5',uid&&Number.isFinite(Number(achievements))?String(achievements):'—');
 const list=document.getElementById('journeyTasks');if(!list)return;
 const tasks=uid?(window.NEXZOTaskStore?.getAll?.()||[]).filter(t=>!t.completed&&!t.done&&t.status!=='completed').slice(0,4):[];
 list.replaceChildren();
 if(!tasks.length){const li=document.createElement('li');li.className='empty';li.textContent=uid?'No pending tasks in your loaded Planner. Open Planner to organise your next session.':'Sign in to see your own Planner tasks and progress. No demo tasks are shown.';list.append(li);return;}
 tasks.forEach((task,i)=>{const li=document.createElement('li'),number=document.createElement('small'),link=document.createElement('a'),meta=document.createElement('small');number.textContent=String(i+1).padStart(2,'0');link.href='planner.html';link.textContent=task.title||'Study task';meta.textContent=task.deadline||task.scheduledDate||'Unscheduled';li.append(number,link,meta);list.append(li);});
}
let authUnsub;
async function connect(){try{const c=await window.NEXZOFirebase.getAuthContext();if(abort.signal.aborted)return;authUnsub=c.tools.onAuthStateChanged(c.auth,user=>{uid=user?.uid||null;render();});}catch{set('homeLevelV5','Account unavailable');}}
['nexzo:tasks-updated','nexzo:task-store','nexzo:profile-updated','nexzo:stats-updated','nexzo:rewards-updated','nexzo:achievement-unlocked','nexzo:data-ready','nexzo:auth-ready','storage'].forEach(name=>window.addEventListener(name,render,{signal:abort.signal}));
// Home chrome must never sit on top of lower chapters. Fade it once the visitor leaves the arrival area,
// then restore it near the top. Hidden chrome cannot intercept clicks.
const homeChrome=[document.querySelector('.journey-header'),document.querySelector('.chapter-progress')].filter(Boolean);
let chromeRaf=0;
function syncHomeChrome(){
 chromeRaf=0;
 const hidden=window.scrollY>Math.max(110,window.innerHeight*0.18);
 document.body.classList.toggle('home-chrome-faded',hidden);
 homeChrome.forEach(el=>el.setAttribute('aria-hidden',hidden?'true':'false'));
}
window.addEventListener('scroll',()=>{if(!chromeRaf)chromeRaf=requestAnimationFrame(syncHomeChrome)},{passive:true,signal:abort.signal});
window.addEventListener('resize',syncHomeChrome,{passive:true,signal:abort.signal});
syncHomeChrome();
window.addEventListener('pagehide',()=>{abort.abort();authUnsub?.();},{once:true});render();connect();
})();
