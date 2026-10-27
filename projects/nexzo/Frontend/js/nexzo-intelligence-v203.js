/* NEXZO Intelligence v203 — Twin + Radar + Decision Engine + Pulse. */
(function(){'use strict';if(window.NEXZOIntelligence?.version>=204)return;
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number(n)||0));
const esc=v=>String(v??'').trim();
const daysUntil=d=>{const t=new Date(d||'').getTime();return Number.isFinite(t)?Math.ceil((t-Date.now())/86400000):9999};
const pendingTasks=()=>{try{return (window.NEXZOTaskStore?.getAll?.()||[]).filter(t=>!t.completed&&!t.archived)}catch{return[]}};

function readJSON(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
function currentUid(){return window.NEXZODataService?.getUser?.()?.uid||window.NEXZOSharedState?.currentUid?.()||window.NEXZOShell?.identity?.()?.uid||'guest'}
function careerSignal(profile={}){const uid=currentUid(),cached=readJSON(`nexzo:career:v241:${uid}`)||readJSON('nexzo:career:v241:guest');const role=esc(cached?.roleName||profile.careerGoal);if(!role)return null;return {area:'Career',label:`Continue your ${role} path`,url:'career.html',kind:'career',verified:Boolean(cached?.roleName)};}
function campusSignal(){let best=null;try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i)||'';if(!key.startsWith('nexzo:campus-live:'))continue;const row=readJSON(key);if(!row?.items?.length)continue;const at=Number(row.at)||0;if(!best||at>best.at)best={at,item:row.items[0]};}}catch{}const item=best?.item;if(!item)return null;const label=esc(item.title||item.name);if(!label)return null;return {area:'Campus',label,url:'campus.html',kind:'campus',verified:true};}
function ecosystemSignals(profile,weak,pending){const out=[];const career=careerSignal(profile);if(career)out.push(career);const campus=campusSignal();if(campus)out.push(campus);const focus=weak?.[0];if(focus)out.push({area:'Community',label:`Open Community around ${focus.topic||focus.subject}`,url:'community.html',kind:'community',verified:false});if(pending?.length)out.push({area:'Planner',label:`Continue ${pending.length} pending task${pending.length===1?'':'s'}`,url:'planner.html',kind:'planner',verified:true});return out.slice(0,4);}
function build(){const p=window.NEXZOPersonalization?.snapshot?.();if(!p)return null;const profile=p.profile||{},mastery=Object.values(p.mastery||{}),assessed=mastery.filter(x=>x.assessed),pending=pendingTasks();
 const weak=assessed.filter(x=>x.score<55).sort((a,b)=>a.score-b.score);const strong=assessed.filter(x=>x.score>=75).sort((a,b)=>b.score-a.score);
 const exams=Object.entries(profile.examDates||{}).map(([subject,date])=>({subject,date,days:daysUntil(date)})).filter(x=>x.days>=0&&x.days<60).sort((a,b)=>a.days-b.days);
 const today=p.todayPlan||{capacityMinutes:Number(profile.dailyMinutes)||60,items:[]};const capacity=Number(today.capacityMinutes)||Number(profile.dailyMinutes)||60;
 const overdue=pending.filter(t=>{const d=new Date(t.dueDate||t.deadline||'').getTime();return Number.isFinite(d)&&d<Date.now()}).length;
 const twin={course:esc(profile.course),branch:esc(profile.branch),semester:esc(profile.semester),careerGoal:esc(profile.careerGoal),subjects:profile.subjects||[],backlogs:profile.backlogs||[],dailyMinutes:Number(profile.dailyMinutes)||60,assessedTopics:assessed.length,weakTopics:weak.length,strongTopics:strong.length,pendingTasks:pending.length,events:(p.events||[]).length};
 const alerts=[];
 exams.forEach(e=>{const m=mastery.find(x=>String(x.subject).toLowerCase().includes(String(e.subject).toLowerCase())||String(e.subject).toLowerCase().includes(String(x.subject).toLowerCase()));const score=m?.assessed?m.score:null;let severity=e.days<=3?'critical':e.days<=7?'high':'medium';if(score!=null&&score<45)severity='critical';alerts.push({type:'exam',severity,title:`${e.subject} exam in ${e.days===0?'today':`${e.days} day${e.days===1?'':'s'}`}`,detail:score==null?'No reliable mastery evidence yet — diagnostic/revision should be prioritized.':`Current measured mastery: ${score}%.`,score:severity==='critical'?98:severity==='high'?86:70})});
 (profile.backlogs||[]).forEach(s=>alerts.push({type:'backlog',severity:'high',title:`Backlog needs recovery: ${s}`,detail:'Backlog status increases this subject’s recommendation priority.',score:84}));
 weak.slice(0,3).forEach(m=>alerts.push({type:'mastery',severity:m.score<35?'critical':'high',title:`Weak area detected: ${m.topic}`,detail:`${m.subject} mastery is ${m.score}% from ${m.attempts||0} assessed activities.`,score:clamp(100-m.score)}));
 if(overdue)alerts.push({type:'planner',severity:overdue>=3?'critical':'high',title:`${overdue} overdue Planner task${overdue===1?'':'s'}`,detail:`You have ${pending.length} pending tasks in total.`,score:Math.min(96,72+overdue*6)});
 if(pending.length&&pending.length*30>capacity*2)alerts.push({type:'capacity',severity:'medium',title:'Planner load exceeds daily capacity',detail:`About ${pending.length} pending tasks compete for ${capacity} available minutes today.`,score:68});
 if(profile.careerGoal&&assessed.length){const weakest=weak[0];if(weakest)alerts.push({type:'career',severity:'medium',title:`Career readiness gap for ${profile.careerGoal}`,detail:`${weakest.topic} is currently one of your weakest measured areas.`,score:64});}
 alerts.sort((a,b)=>b.score-a.score);
 const rec=(p.recommendations||[])[0]||null;const planItem=(today.items||[])[0]||null;const nextAction=rec?{id:rec.id,title:rec.topic,subject:rec.subject,action:planItem?.task||rec.action,duration:Number(planItem?.minutes)||Number(rec.durationMinutes)||30,match:Number(rec.matchScore)||0,why:(rec.why||[]).slice(0,3)}:null;
 const readiness=assessed.length?Math.round(assessed.reduce((s,x)=>s+x.score,0)/assessed.length):null;const ecosystem=ecosystemSignals(profile,weak,pending);
 return {version:204,generatedAt:Date.now(),twin:{...twin,careerTarget:careerSignal(profile)?.label||'',campusFresh:Boolean(ecosystem.find(x=>x.kind==='campus'))},radar:{alerts,critical:alerts.filter(x=>x.severity==='critical').length,high:alerts.filter(x=>x.severity==='high').length},decision:{nextAction,alternatives:(p.recommendations||[]).slice(1,4),ecosystem},pulse:{capacityMinutes:capacity,pendingTasks:pending.length,overdueTasks:overdue,nextAction,topAlert:alerts[0]||null,readiness},raw:p};}
 function snapshot(){const x=build();return x?JSON.parse(JSON.stringify(x)):null}
 window.NEXZOIntelligence=Object.freeze({version:204,snapshot});
 window.dispatchEvent(new CustomEvent('nexzo:intelligence-ready',{detail:snapshot()}));
})();
