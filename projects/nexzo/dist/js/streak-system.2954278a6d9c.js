/* NEXZO Canonical Streak System v2 — login, verified study streaks and genuine streak-freeze days. */
(function(){
'use strict';
if(window.NEXZOStreakSystem?.version>=2)return;
const parse=(v,f)=>{try{return JSON.parse(v)||f}catch{return f}};
const pad=n=>String(n).padStart(2,'0');
const keyOf=value=>{const d=value instanceof Date?new Date(value):new Date(value||Date.now());if(Number.isNaN(d.getTime()))return'';return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const today=()=>keyOf(Date.now());
const shift=(key,delta)=>{const [y,m,d]=String(key).split('-').map(Number);const date=new Date(y,m-1,d);date.setDate(date.getDate()+delta);return keyOf(date)};
const resolveUid=()=>window.NEXZOSettings?.uid?.()||window.NEXZOSharedState?.currentUid?.()||window.NEXZOSharedState?.uid?.()||window.NEXZOFirebase?.auth?.currentUser?.uid||'guest';
const storageKey=(id=resolveUid())=>`nexzo:streaks:v2:${id}`;
const legacyStorageKey=id=>`nexzo:streaks:v1:${id}`;
const rewardKey=id=>`nexzo:rewards:v2:${id}`;
const unique=rows=>[...new Set((rows||[]).filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v))))].sort();
const currentFrom=rows=>{const set=new Set(unique(rows));if(!set.size)return 0;let cursor=today();if(!set.has(cursor)){cursor=shift(cursor,-1);if(!set.has(cursor))return 0;}let count=0;while(set.has(cursor)&&count<5000){count+=1;cursor=shift(cursor,-1)}return count};
const bestFrom=rows=>{const list=unique(rows);if(!list.length)return 0;let best=1,run=1;for(let i=1;i<list.length;i++){if(list[i]===shift(list[i-1],1))run+=1;else run=1;if(run>best)best=run}return best};
const contiguous=(end,count)=>{const out=[];let cursor=end||today();for(let i=0;i<Math.max(0,Number(count)||0);i++){out.push(cursor);cursor=shift(cursor,-1)}return out};
function migrateLegacy(id,state){let changed=false;const old=parse(localStorage.getItem(legacyStorageKey(id)),null);if(old){if(!state.loginDays.length&&Array.isArray(old.loginDays)){state.loginDays=old.loginDays;changed=true}if(!state.studyDays.length&&Array.isArray(old.studyDays)){state.studyDays=old.studyDays;changed=true}if(!Object.keys(state.studyEvidence||{}).length&&old.studyEvidence){state.studyEvidence=old.studyEvidence;changed=true}}
 const rewards=parse(localStorage.getItem(rewardKey(id)),{});
 if(!state.loginDays.length&&Number(rewards.loginStreak)>0){state.loginDays=contiguous(rewards.lastLoginDate||today(),rewards.loginStreak);changed=true}
 if(!state.studyDays.length&&Number(rewards.studyStreak)>0){state.studyDays=contiguous(rewards.lastStudyDate||today(),rewards.studyStreak);changed=true}
 return changed;
}
function normalize(s){s.loginDays=unique(s.loginDays).slice(-730);s.studyDays=unique(s.studyDays).slice(-730);s.freezeDays=unique(s.freezeDays).filter(d=>!s.studyDays.includes(d)).slice(-60);s.studyEvidence=s.studyEvidence&&typeof s.studyEvidence==='object'?s.studyEvidence:{};return s}
function load(id=resolveUid()){
 const base={version:2,uid:id,loginDays:[],studyDays:[],freezeDays:[],studyEvidence:{},updatedAtMs:0};
 const s=normalize({...base,...parse(localStorage.getItem(storageKey(id)),{})});
 if(migrateLegacy(id,s))save(s,{silent:true,cloud:false});
 return s;
}
function effectiveStudyDays(s){return unique([...(s.studyDays||[]),...(s.freezeDays||[])])}
function summary(input){const s=normalize(input||load()),effective=effectiveStudyDays(s),loginStreak=currentFrom(s.loginDays),studyStreak=currentFrom(effective),lastStudyDate=s.studyDays.at(-1)||'',lastLoginDate=s.loginDays.at(-1)||'',t=today();return Object.freeze({uid:s.uid,loginStreak,studyStreak,bestLoginStreak:bestFrom(s.loginDays),bestStudyStreak:bestFrom(effective),lastLoginDate,lastStudyDate,loginToday:s.loginDays.includes(t),studyToday:s.studyDays.includes(t),frozenToday:s.freezeDays.includes(t),freezeDays:[...s.freezeDays],studyAtRisk:studyStreak>0&&!s.studyDays.includes(t)&&!s.freezeDays.includes(t),studyEvidence:s.studyEvidence[t]||[]});}
function mirrorRewards(s){const id=s.uid||resolveUid(),raw=parse(localStorage.getItem(rewardKey(id)),null);if(!raw)return;const out=summary(s);raw.loginStreak=out.loginStreak;raw.studyStreak=out.studyStreak;raw.bestLoginStreak=out.bestLoginStreak;raw.bestStudyStreak=out.bestStudyStreak;raw.lastLoginDate=out.lastLoginDate;raw.lastStudyDate=out.lastStudyDate;localStorage.setItem(rewardKey(id),JSON.stringify(raw));}
let cloudTimer=0;function queueCloud(s){clearTimeout(cloudTimer);cloudTimer=setTimeout(async()=>{if((s.uid||resolveUid())==='guest')return;try{const c=await window.NEXZOFirebase?.getContext?.({auth:true,firestore:true});if(!c?.auth?.currentUser||c.auth.currentUser.uid!==s.uid)return;const fs=c.firestoreTools;await fs.setDoc(fs.doc(c.db,'users',s.uid,'rewards','streaks'),{uid:s.uid,loginDays:s.loginDays.slice(-730),studyDays:s.studyDays.slice(-730),freezeDays:s.freezeDays.slice(-60),studyEvidence:s.studyEvidence,updatedAtMs:Date.now(),updatedAt:fs.serverTimestamp()},{merge:true})}catch{}},1000)}
function save(s,{silent=false,cloud=true}={}){normalize(s);s.version=2;s.updatedAtMs=Date.now();localStorage.setItem(storageKey(s.uid),JSON.stringify(s));mirrorRewards(s);if(cloud)queueCloud(s);const out=summary(s);if(!silent){window.dispatchEvent(new CustomEvent('nexzo:streak-updated',{detail:out}));window.dispatchEvent(new CustomEvent('nexzo:rewards-updated',{detail:out}))}return out}
function markLogin(date=today()){const s=load();if(!s.loginDays.includes(date)){s.loginDays.push(date);return save(s)}return summary(s)}
function markStudy({date=today(),source='study',id='',label='Verified learning activity'}={}){const s=load();if(!s.studyDays.includes(date))s.studyDays.push(date);s.freezeDays=s.freezeDays.filter(d=>d!==date);const rows=Array.isArray(s.studyEvidence[date])?s.studyEvidence[date]:[];const token=id||`${source}:${label}`;if(!rows.some(x=>x.id===token))rows.push({id:token,source,label,atMs:Date.now()});s.studyEvidence[date]=rows.slice(-30);return save(s)}
function canFreeze(date=shift(today(),-1),input){const s=normalize(input||load()),target=String(date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(target))return {ok:false,reason:'invalid-date'};if(target>=today())return {ok:false,reason:'past-day-required'};if(s.studyDays.includes(target))return {ok:false,reason:'already-studied'};if(s.freezeDays.includes(target))return {ok:false,reason:'already-frozen'};const before=shift(target,-1);if(!effectiveStudyDays(s).includes(before))return {ok:false,reason:'no-streak-to-protect'};return {ok:true,date:target}}
function applyFreezeLocal(date,{cloud=false,silent=false}={}){const s=load(),check=canFreeze(date,s);if(!check.ok)return check;s.freezeDays.push(check.date);save(s,{cloud,silent});return {ok:true,date:check.date,summary:summary(s)}}
function reconcile(){const s=load(),tasks=window.NEXZOTaskStore?.getAll?.()||[];for(const task of tasks){const completed=task.completed===true||String(task.status||'').toLowerCase()==='completed';if(!completed)continue;const date=keyOf(task.completedAtMs||task.completedAt||task.updatedAtMs);if(!date)continue;const minutes=Math.max(Number(task.actualMinutes)||0,(Number(task.elapsed)||0)/60000);if(task.isFocusSession&&minutes<25)continue;if(!s.studyDays.includes(date))s.studyDays.push(date);s.freezeDays=s.freezeDays.filter(d=>d!==date);const rows=Array.isArray(s.studyEvidence[date])?s.studyEvidence[date]:[];const id=`task:${task.id||task.createdAtMs}`;if(!rows.some(x=>x.id===id))rows.push({id,source:task.isFocusSession?'focus':'planner',label:task.title||'Completed task',atMs:Number(task.completedAtMs)||Date.now()});s.studyEvidence[date]=rows.slice(-30)}
 const rewards=parse(localStorage.getItem(rewardKey(s.uid)),{});for(const row of rewards.ledger||[]){if(!['planner','focus','academics','academics_resource','ai','ai_quiz'].includes(row.source))continue;const date=row.date||keyOf(row.createdAtMs);if(!date)continue;if(!s.studyDays.includes(date))s.studyDays.push(date);s.freezeDays=s.freezeDays.filter(d=>d!==date);const rows=Array.isArray(s.studyEvidence[date])?s.studyEvidence[date]:[];const id=`xp:${row.id||row.actionId}`;if(!rows.some(x=>x.id===id))rows.push({id,source:row.source,label:row.reason||'Verified learning activity',atMs:Number(row.createdAtMs)||Date.now()});s.studyEvidence[date]=rows.slice(-30)}
 return save(s,{silent:true});
}
function setCounts({login=0,study=0,uid:targetUid}={}){const s=load(targetUid||resolveUid());s.loginDays=contiguous(today(),login);s.studyDays=contiguous(today(),study);s.freezeDays=[];return save(s)}
async function hydrate(){const id=resolveUid();if(id==='guest')return summary(load(id));try{const c=await window.NEXZOFirebase?.getContext?.({auth:true,firestore:true});if(!c?.auth?.currentUser||c.auth.currentUser.uid!==id)return summary(load(id));const fs=c.firestoreTools,snap=await fs.getDoc(fs.doc(c.db,'users',id,'rewards','streaks'));if(snap.exists()){const cloud=snap.data()||{},local=load(id);const merged=normalize({...local,loginDays:unique([...(local.loginDays||[]),...(cloud.loginDays||[])]),studyDays:unique([...(local.studyDays||[]),...(cloud.studyDays||[])]),freezeDays:unique([...(local.freezeDays||[]),...(cloud.freezeDays||[])]),studyEvidence:{...(cloud.studyEvidence||{}),...(local.studyEvidence||{})}});save(merged,{silent:true,cloud:false})}}catch{}return summary(load(id))}
function init(){markLogin();setTimeout(()=>{hydrate().then(()=>{reconcile();window.dispatchEvent(new CustomEvent('nexzo:streak-updated',{detail:summary()}))})},800);window.addEventListener('nexzo:tasks-updated',()=>setTimeout(reconcile,100));}
window.NEXZOStreakSystem=Object.freeze({version:2,summary,markLogin,markStudy,reconcile,setCounts,today,keyOf,shift,canFreeze,applyFreezeLocal,load});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
