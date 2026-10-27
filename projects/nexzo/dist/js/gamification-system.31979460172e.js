/* NEXZO Universal Rewards v3 — balanced XP, multipliers, score bonuses and anti-farming. */
(function(){
'use strict';if(window.NEXZOGamificationEngine?.version>=8)return;
const day=(time=Date.now())=>{const d=new Date(time);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
let activeUid='guest';const resolveUid=()=>window.NEXZOSettings?.uid?.()||window.NEXZOSharedState?.currentUid?.()||'guest';const uid=()=>activeUid||resolveUid();const key=(id=uid())=>`nexzo:rewards:v2:${id}`;
const parse=(v,f)=>{try{return JSON.parse(v)||f}catch{return f}};
const SHOP_ITEMS={
  'ai-evaluation-credit':{name:'AI Evaluation Credit',cost:120,kind:'unavailable',repeatable:true,requiredLevel:1,description:'Reserved for a backend entitlement flow. The current backend does not expose a quota-credit API, so NEXZO will not sell a fake credit.'},
  'mock-test-unlock':{name:'Mock Test Unlock',cost:300,kind:'unlock',repeatable:false,requiredLevel:10,description:'Unlocks the advanced 10-question role/topic mock test workspace in NEXZO Hub.'},
  'revision-pack':{name:'Revision Pack',cost:120,kind:'consumable',repeatable:true,requiredLevel:1,description:'Generates one AI-backed topic revision pack. Inventory is consumed only after generation succeeds.'},
  'streak-freeze':{name:'Streak Freeze',cost:200,kind:'consumable',repeatable:true,requiredLevel:5,description:'Protects one missed study day by recording a freeze day in the canonical streak system.'},
  'focus-booster':{name:'Focus Booster',cost:90,kind:'consumable',repeatable:true,requiredLevel:1,description:'Creates and cloud-confirms a focused 25-minute Planner session before consuming the booster.'},
  'purple-border':{name:'Purple Profile Border',cost:400,kind:'cosmetic',repeatable:false,requiredLevel:5,slot:'profileFrame'},
  'scholar-title':{name:'Scholar Title',cost:250,kind:'cosmetic',repeatable:false,requiredLevel:5,slot:'title'},
  'chat-glow':{name:'Chat Glow',cost:180,kind:'cosmetic',repeatable:false,requiredLevel:5,slot:'chat'},
  'diamond-frame':{name:'Diamond Frame',cost:800,kind:'cosmetic',repeatable:false,requiredLevel:20,slot:'profileFrame'}
};
const ACHIEVEMENTS=[
  {id:'first-login',name:'First Step',icon:'🚀',target:1,reward:10,test:s=>s.loginStreak>=1},
  {id:'streak-5',name:'Early Bird',icon:'🌅',target:5,reward:25,test:s=>s.loginStreak>=5},
  {id:'planner-10',name:'Task Master',icon:'✅',target:10,reward:40,test:s=>s.ledger.filter(x=>x.source==='planner').length>=10},
  {id:'quiz-5',name:'Quiz Master',icon:'🧠',target:5,reward:35,test:s=>s.ledger.filter(x=>x.source==='ai_quiz'||x.source==='ai').length>=5},
  {id:'community-5',name:'Community Star',icon:'🤝',target:5,reward:35,test:s=>s.ledger.filter(x=>x.source==='community_post').length>=5},
  {id:'xp-1000',name:'XP Explorer',icon:'🏆',target:1000,reward:75,test:s=>s.totalXP>=1000}
];
const defaults=()=>({version:4,xpPlanVersion:2,totalXP:0,coins:0,combo:0,loginStreak:0,studyStreak:0,bestLoginStreak:0,bestStudyStreak:0,lastLoginDate:'',lastActionAt:0,lastStudyDate:'',ledger:[],awarded:{},daily:{date:day(),caps:{},quests:{}},subjectXP:{},achievements:[],cosmetics:{owned:[],equipped:{}},inventory:{},rewardUses:{}});
const quests=()=>({
planner:{id:'planner',title:'Complete one Planner task',target:1,progress:0,reward:100,page:'planner.html'},
focus:{id:'focus',title:'Study for 25 minutes',target:1,progress:0,reward:100,page:'planner.html'},
learn:{id:'learn',title:'Complete an Academics or structured Study Assistant activity',target:1,progress:0,reward:100,page:'academics.html'}
});
function state(id=uid()){let s={...defaults(),...parse(localStorage.getItem(key(id)),{})};normalizeState(s);if(s.daily?.date!==day())s.daily={date:day(),caps:{},quests:quests()};if(!s.daily.quests||!Object.keys(s.daily.quests).length)s.daily.quests=quests();return s}
function normalizeState(s){
s.cosmetics=s.cosmetics||{owned:[],equipped:{}};
s.cosmetics.owned=Array.isArray(s.cosmetics.owned)?s.cosmetics.owned:[];
s.cosmetics.equipped=s.cosmetics.equipped||{};
s.inventory=s.inventory&&typeof s.inventory==='object'?s.inventory:{};
for(const [itemId,row] of Object.entries(s.inventory)){const item=SHOP_ITEMS[itemId];if(!item){delete s.inventory[itemId];continue;}const value=row&&typeof row==='object'?row:{};s.inventory[itemId]={quantity:Math.max(0,Math.floor(Number(value.quantity)||0)),owned:Boolean(value.owned||(!item.repeatable&&Number(value.quantity)>0)),purchasedAtMs:Math.max(0,Number(value.purchasedAtMs)||0),lastUsedAtMs:Math.max(0,Number(value.lastUsedAtMs)||0),lastPurchaseAtMs:Math.max(0,Number(value.lastPurchaseAtMs)||0)};}
s.rewardUses=s.rewardUses&&typeof s.rewardUses==='object'?s.rewardUses:{};
s.achievements=Array.isArray(s.achievements)?s.achievements:[];
s.version=4;
if(Number(s.xpPlanVersion||0)<2){
 const before=Math.max(0,Number(s.totalXP)||0);
 s.totalXP=window.NEXZOLevelSystem?.migrateLegacyXP?.(before)??Math.min(before,270000);
 s.xpPlanVersion=2;
 s.migrations={...(s.migrations||{}),balancedXpPlan:{atMs:Date.now(),fromXP:before,toXP:s.totalXP}};
}
return s
}
function applyCosmetics(input){const s=normalizeState(input||state());const root=document.documentElement;['purple-border','chat-glow','diamond-frame'].forEach(id=>root.classList.toggle(`nx-cosmetic-${id}`,Object.values(s.cosmetics.equipped).includes(id)));root.dataset.nexzoTitle=Object.values(s.cosmetics.equipped).includes('scholar-title')?'scholar':'';}
function unlockAchievements(s){normalizeState(s);let changed=false;for(const a of ACHIEVEMENTS){if(s.achievements.includes(a.id)||!a.test(s))continue;s.achievements.push(a.id);s.coins+=a.reward;s.ledger.unshift({id:`achievement-${a.id}-${Date.now()}`,uid:uid(),date:day(),createdAtMs:Date.now(),amount:0,base:0,bonus:0,coins:a.reward,source:'achievement',actionId:a.id,subject:'',reason:`Achievement unlocked: ${a.name}`});changed=true;window.dispatchEvent(new CustomEvent('nexzo:achievement-unlocked',{detail:a}));}return changed}
function emitLevelUp(beforeXP,afterXP,{earnedXP=0,earnedCoins=0,source='',reason='Learning activity'}={}){
 try{
  const before=window.NEXZOLevelSystem?.resolve?.(Number(beforeXP)||0);
  const after=window.NEXZOLevelSystem?.resolve?.(Number(afterXP)||0);
  if(!before||!after||after.level<=before.level)return null;
  const detail={id:`${uid()}-${before.level}-${after.level}-${Date.now()}`,uid:uid(),previousLevel:before.level,newLevel:after.level,totalXP:Number(afterXP)||0,earnedXP:Number(earnedXP)||0,earnedCoins:Number(earnedCoins)||0,source,reason,rank:after.rank,crossedLevels:after.level-before.level,createdAtMs:Date.now()};
  try{localStorage.setItem(`nexzo:pending-level-up:v1:${uid()}`,JSON.stringify([detail]))}catch{}
  window.dispatchEvent(new CustomEvent('nexzo:level-up',{detail}));
  return detail;
 }catch{return null}
}
function syncProfileXP(s){
 try{
  const resolved=window.NEXZOLevelSystem?.resolve?.(Number(s.totalXP)||0)||{level:1};
  const current=window.NEXZOProfileAuthority?.current?.()||{};
  if(Number(current.xp)!==Number(s.totalXP)||Number(current.level)!==Number(resolved.level)){
   window.NEXZOProfileAuthority?.save?.({...current,xp:Number(s.totalXP)||0,level:resolved.level,updatedAtMs:Date.now()});
  }
 }catch{}
}
function persist(s){normalizeState(s);unlockAchievements(s);localStorage.setItem(key(),JSON.stringify(s));applyCosmetics(s);syncProfileXP(s);window.dispatchEvent(new CustomEvent('nexzo:rewards-updated',{detail:summary(s)}));queueCloud(s);return s}
let cloudHydratedFor='';let cloudReadyFor='';
function migrateLocal(fromId,toId){if(!fromId||!toId||fromId===toId||fromId==='guest'||toId==='guest')return;const target=state(toId),source=state(fromId);if(target.totalXP||target.ledger.length||target.coins)return;if(source.totalXP||source.ledger.length||source.coins){localStorage.setItem(key(toId),JSON.stringify({...source,uid:toId,migratedFrom:fromId,migratedAtMs:Date.now()}));}}
async function refreshVerifiedRewards(){
 clearTimeout(syncTimer);
 const id=uid();if(id==='guest')return false;
 const c=await window.NEXZOFirebase.getContext({auth:true,firestore:true});
 if(c.auth.currentUser?.uid!==id)throw new Error('Account changed before reward read-back.');
 const fs=c.firestoreTools,snap=await fs.getDoc(fs.doc(c.db,'users',id,'rewards','main'));
 if(uid()!==id||c.auth.currentUser?.uid!==id)throw new Error('Account changed during reward read-back.');
 if(!snap.exists())return false;
 const record=snap.data();if(record.uid!==id)throw new Error('Reward owner did not match.');
 const next={...defaults(),...record};
 cloudReadyFor=id;cloudHydratedFor=id;localStorage.setItem(key(id),JSON.stringify(next));applyCosmetics(next);
 window.dispatchEvent(new CustomEvent('nexzo:rewards-updated',{detail:summary(next)}));
 return true;
}
async function hydrateCloud(){
 const id=uid();if(id==='guest'||cloudHydratedFor===id)return state(id);cloudHydratedFor=id;let local=state(id);
 try{
  const c=await window.NEXZOFirebase.getContext({auth:true,firestore:true});if(!c.auth.currentUser||c.auth.currentUser.uid!==id)return local;
  const fs=c.firestoreTools,snap=await fs.getDoc(fs.doc(c.db,'users',id,'rewards','main'));
  if(snap.exists()){
    const cloud={...defaults(),...(snap.data()||{})};normalizeState(cloud);
    // V154 recovery: if this exact authenticated UID still has a same-account cached
    // Level 100 state from before the V153 authority repair, preserve that verified
    // maximum instead of silently downgrading the account. This is UID-scoped and
    // never imports guest/other-account rewards.
    const cacheOwner=localStorage.getItem('nexzo_canonical_cache_owner');
    const cachedSameUid=(cacheOwner===id)?parse(localStorage.getItem(key(id)),{}):{};
    const cachedXP=Math.max(0,Number(cachedSameUid.totalXP)||0);
    const cachedLevel=window.NEXZOLevelSystem?.resolve?.(cachedXP)?.level||Number(cachedSameUid.level)||0;
    const cloudLevel=window.NEXZOLevelSystem?.resolve?.(Number(cloud.totalXP)||0)?.level||0;
    let restoredLevel100=false;
    let profileLevel=0;
    try{
      const profileSnap=await fs.getDoc(fs.doc(c.db,'users',id,'profile','main'));
      profileLevel=profileSnap.exists()?Math.max(0,Number(profileSnap.data()?.level)||0):0;
    }catch{}
    // V155 recovery: restore Level 100 only when this signed-in account already has
    // same-UID Level 100 evidence (cloud profile or owned cache). The Firestore rule
    // independently requires cloud profile Level 100 for the large XP repair write.
    if((profileLevel>=100||cachedLevel>=100) && cloudLevel<100 && !cloud.migrations?.v156Level100Restore){
      const targetXP=Number(window.NEXZOLevelSystem?.xpGoals?.[99]||270000);
      cloud.totalXP=targetXP;
      cloud.migrations={...(cloud.migrations||{}),v156Level100Restore:{atMs:Date.now(),fromCloudXP:Number(snap.data()?.totalXP)||0,fromCachedXP:cachedXP,fromProfileLevel:profileLevel,toXP:targetXP}};
      cloud.ledger=[{id:`v156-level100-restore-${Date.now()}`,uid:id,date:day(),createdAtMs:Date.now(),amount:0,base:0,bonus:0,coins:0,source:'system_repair',actionId:'v156-level100-restore',subject:'',reason:'Restored verified Level 100 account state'},...(cloud.ledger||[])].slice(0,1200);
      restoredLevel100=true;
    }
    const cloudUpdated=Math.max(Number(cloud.updatedAtMs)||0,...(cloud.ledger||[]).map(x=>Number(x.createdAtMs)||0));
    const cloudIds=new Set((cloud.ledger||[]).map(x=>x.id));
    const cacheOwned=localStorage.getItem('nexzo_canonical_cache_owner')===id;
    const unsynced=cacheOwned?(local.ledger||[]).filter(x=>!cloudIds.has(x.id)&&(Number(x.createdAtMs)||0)>cloudUpdated):[];
    if(unsynced.length){
      cloud.ledger=[...unsynced,...(cloud.ledger||[])].slice(0,1200);
      cloud.totalXP=Math.max(0,Number(cloud.totalXP)||0)+unsynced.reduce((sum,x)=>sum+Math.max(0,Number(x.amount)||0),0);
      cloud.coins=Math.max(0,Number(cloud.coins)||0)+unsynced.reduce((sum,x)=>sum+Math.max(0,Number(x.coins)||0),0);
    }
    local=cloud;cloudReadyFor=id;localStorage.setItem(key(id),JSON.stringify(local));applyCosmetics(local);syncProfileXP(local);
    window.dispatchEvent(new CustomEvent('nexzo:rewards-updated',{detail:summary(local)}));
    if(unsynced.length||restoredLevel100)queueCloud(local);
  }else{
    local=defaults();cloudReadyFor=id;localStorage.setItem(key(id),JSON.stringify(local));applyCosmetics(local);syncProfileXP(local);queueCloud(local);
  }
  return local;
 }catch(e){console.warn('[NEXZO Rewards] cloud hydrate unavailable',e);return local;}
}
function switchUser(){const next=resolveUid();if(next===activeUid)return;const previous=activeUid;activeUid=next;migrateLocal(previous,next);hydrateCloud().finally(()=>{login();mount();});}
let syncTimer=0;function queueCloud(s){clearTimeout(syncTimer);syncTimer=setTimeout(async()=>{if(uid()==='guest'||window.NEXZOSettings?.get?.().autoSync===false)return;try{const c=await window.NEXZOFirebase.getContext({auth:true,firestore:true});if(!c.auth.currentUser)return;const fs=c.firestoreTools;await fs.setDoc(fs.doc(c.db,'users',uid(),'rewards','main'),{uid:uid(),...s,updatedAtMs:Date.now(),updatedAt:fs.serverTimestamp()},{merge:true});for(const item of s.ledger.slice(0,20)){await fs.setDoc(fs.doc(c.db,'users',uid(),'xpLedger',item.id),{uid:uid(),...item},{merge:true})}}catch(e){window.dispatchEvent(new CustomEvent('nexzo:cloud-status',{detail:{area:'rewards',status:e.code==='permission-denied'?'permission-denied':'offline'}}))}},900)}
const limits={
academics:150,academics_resource:150,ai:50,ai_question:50,ai_quiz:120,ai_interview:150,
community:150,community_post:105,community_helpful:150,community_group:60,career:120,
focus:200,planner:700,daily_login:125,daily_chest:100,profile_setup:60,avatar:30,email_verify:75,
weekly_challenge:800,ai_challenge:500,exam_challenge:600
};
const LIFETIME_SOURCES=new Set(['planner','academics_resource','career','community_group','profile_setup','avatar','email_verify']);
function currentLevel(s=state()){return window.NEXZOLevelSystem?.resolve?.(Number(s.totalXP)||0)?.level||1}
function levelMultiplier(level=currentLevel()){return window.NEXZOLevelSystem?.levelMultiplier?.(level)||1}
function scoreMultiplier(score){const n=Number(score);if(!Number.isFinite(n)||n<60)return 1;if(n<75)return 1.05;if(n<90)return 1.10;return 1.20}
function difficultyBase(difficulty,fallback=60){const d=String(difficulty||'').toLowerCase();if(d.includes('expert'))return 120;if(d.includes('advanced')||d.includes('hard'))return 90;if(d.includes('beginner')||d.includes('easy'))return 40;if(d.includes('intermediate')||d.includes('medium'))return 60;return fallback}
function calculateReward(base,{level=currentLevel(),score=null,applyLevelMultiplier=true,applyScoreBonus=true}={}){
 const lm=applyLevelMultiplier?levelMultiplier(level):1,sm=applyScoreBonus?scoreMultiplier(score):1;
 return {base:Math.max(0,Math.round(Number(base)||0)),level,levelMultiplier:lm,scoreMultiplier:sm,final:Math.max(0,Math.round((Number(base)||0)*lm*sm))}
}
function updateQuest(s,id){const q=s.daily.quests[id];if(!q||q.progress>=q.target)return 0;q.progress=Math.min(q.target,q.progress+1);return q.progress===q.target?calculateReward(q.reward,{level:currentLevel(s),applyScoreBonus:false}).final:0}
function dateKey(value){const d=new Date(Number(value)||value||Date.now());if(Number.isNaN(d.getTime()))return'';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function questEvidence(s=state()){
  const today=day(),tasks=window.NEXZOTaskStore?.getAll?.()||[];
  const completedToday=tasks.filter(t=>!t.isFocusSession&&(t.completed||t.status==='completed')&&dateKey(t.completedAtMs||t.completedAt||t.updatedAtMs)===today);
  const focusMinutes=tasks.filter(t=>t.isFocusSession&&dateKey(t.completedAtMs||t.updatedAtMs)===today).reduce((sum,t)=>sum+Math.max(0,Number(t.actualMinutes||t.studyMinutes||0),Number(t.elapsed||0)/60000),0);
  const learningRows=(s.ledger||[]).filter(x=>x.date===today&&['ai_quiz','ai_interview','ai_challenge','exam_challenge','academics','academics_resource'].includes(x.source));
  return {plannerCount:completedToday.length,plannerTask:completedToday[0]||null,focusMinutes:Math.round(focusMinutes),learningCount:learningRows.length,learningRow:learningRows[0]||null};
}
function syncDailyQuests(){
  const s=state(),ev=questEvidence(s),today=day();let changed=false,bonus=0,beforeQuestXP=0,questCoins=0;
  const apply=(id,value,evidence)=>{const q=s.daily.quests[id];if(!q)return;const next=Math.min(q.target,Math.max(Number(q.progress)||0,value));if(next<=q.progress)return;q.progress=next;q.evidence=evidence;q.completedAtMs=next>=q.target?Date.now():0;changed=true;if(next>=q.target&&!s.awarded[`${today}:quest-reconcile:${id}`]){s.awarded[`${today}:quest-reconcile:${id}`]=Date.now();bonus+=calculateReward(Number(q.reward)||0,{level:currentLevel(s),applyScoreBonus:false}).final;}};
  apply('planner',ev.plannerCount?1:0,ev.plannerTask?`Completed: ${ev.plannerTask.title||'Planner task'}`:'No completed Planner task today');
  apply('focus',ev.focusMinutes>=25?1:0,`${ev.focusMinutes}/25 verified study minutes`);
  apply('learn',ev.learningCount?1:0,ev.learningRow?ev.learningRow.reason:'No verified learning activity today');
  const allDone=Object.values(s.daily.quests).every(q=>Number(q.progress)>=Number(q.target));
  if(allDone&&!s.awarded[`${today}:all-quests`]){s.awarded[`${today}:all-quests`]=Date.now();bonus+=calculateReward(150,{level:currentLevel(s),applyScoreBonus:false}).final;changed=true;}
  if(bonus){beforeQuestXP=Number(s.totalXP)||0;s.totalXP=Math.min(270000,s.totalXP+bonus);questCoins=Math.floor(bonus/10);s.coins+=questCoins;s.ledger.unshift({id:`quest-sync-${today}-${Date.now()}`,uid:uid(),date:today,createdAtMs:Date.now(),amount:bonus,base:0,bonus,source:'daily_quests',actionId:`daily-quests-${today}`,subject:'',reason:allDone?'Daily missions completed':'Daily mission verified'});}
  if(changed){s.ledger=s.ledger.slice(0,300);persist(s);if(bonus)emitLevelUp(beforeQuestXP,s.totalXP,{earnedXP:bonus,earnedCoins:questCoins,source:'daily_quests',reason:allDone?'Daily missions completed':'Daily mission verified'});}return {state:s,evidence:ev,changed,bonus};
}
async function awardXP({userId,amount=0,coins=0,source='activity',actionId='',subject='',reason='Learning activity',questId='',repeatable=false,difficulty='',score=null,applyLevelMultiplier=true,applyScoreBonus=true,suppressLevelUp=false}={}){
if(userId&&userId!==uid())return {awarded:false,reason:'wrong-user'};
amount=Math.max(0,Math.round(+amount||0));if(!amount)return {awarded:false,reason:'zero'};
let s=state();
const beforeXP=Number(s.totalXP)||0;
const uniqueScope=LIFETIME_SOURCES.has(source)?'lifetime':day();
const unique=actionId?`${uniqueScope}:${source}:${actionId}`:'';
if(unique&&s.awarded[unique])return {awarded:false,duplicate:true};
const calc=calculateReward(amount,{level:currentLevel(s),score,applyLevelMultiplier,applyScoreBonus});
const used=+(s.daily.caps[source]||0),cap=limits[source]??9999,base=Math.min(calc.final,Math.max(0,cap-used));
if(!base)return {awarded:false,capped:true};
const now=Date.now();
s.combo=now-s.lastActionAt<30*60*1000?Math.min(5,s.combo+1):1;s.lastActionAt=now;
if(['planner','focus','academics','academics_resource','ai','ai_quiz','ai_interview','ai_challenge','exam_challenge'].includes(source)){
 const streak=window.NEXZOStreakSystem?.markStudy?.({date:day(),source,id:actionId||unique,label:reason});
 if(streak){s.studyStreak=streak.studyStreak;s.bestStudyStreak=streak.bestStudyStreak;s.lastStudyDate=streak.lastStudyDate}
}
let bonus=s.combo===5&&!s.awarded[`${day()}:combo5`]?50:0;if(bonus)s.awarded[`${day()}:combo5`]=now;
const questBonus=questId?updateQuest(s,questId):0;bonus+=questBonus;
const allDone=Object.values(s.daily.quests).every(q=>q.progress>=q.target);
if(allDone&&!s.awarded[`${day()}:all-quests`]){bonus+=150;s.awarded[`${day()}:all-quests`]=now}
s.daily.caps[source]=used+base;if(unique)s.awarded[unique]=now;
const total=base+bonus;s.totalXP=Math.min(270000,s.totalXP+total);
const earnedCoins=Math.max(0,Math.round(coins||Math.floor(total/10)));s.coins+=earnedCoins;
if(subject)s.subjectXP[subject]=(s.subjectXP[subject]||0)+base;
const item={id:crypto.randomUUID?.()||`${now}-${Math.random()}`,uid:uid(),date:day(),createdAtMs:now,amount:total,base,rawBase:calc.base,bonus,coins:earnedCoins,source,actionId,subject,reason,difficulty,score,level:calc.level,levelMultiplier:calc.levelMultiplier,scoreMultiplier:calc.scoreMultiplier};
s.ledger.unshift(item);s.ledger=s.ledger.slice(0,300);persist(s);
if(!suppressLevelUp)emitLevelUp(beforeXP,s.totalXP,{earnedXP:total,earnedCoins,source,reason});
try{await window.NEXZOShell?.awardXP?.(total,reason)}catch{}
return {awarded:true,total,base,bonus,coins:s.coins,earnedCoins,item}
}

function stableId(value){let h=2166136261;for(const ch of String(value||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(36)}
async function awardVerified({userId,amount=0,coins=null,source='planner',actionId='',subject='',reason='Verified learning activity',difficulty='',score=null,applyLevelMultiplier=true,applyScoreBonus=true}={}){
  if(userId&&userId!==uid())return {awarded:false,reason:'wrong-user'};
  const id=uid();amount=Math.max(0,Math.round(Number(amount)||0));
  if(!amount||!actionId)return {awarded:false,reason:!amount?'zero':'missing-action-id'};
  if(id==='guest')return awardXP({amount,source,actionId,subject,reason,difficulty,score,applyLevelMultiplier,applyScoreBonus});
  let c;try{c=await window.NEXZOFirebase.getContext({auth:true,firestore:true});}catch(error){return {awarded:false,cloud:false,error,reason:'firestore-unavailable'}}
  if(!c?.auth?.currentUser||c.auth.currentUser.uid!==id)return {awarded:false,cloud:false,reason:'auth-required'};
  const fs=c.firestoreTools,rewardRef=fs.doc(c.db,'users',id,'rewards','main');
  const ledgerId=`verified_${stableId(`${source}|${actionId}`)}`,ledgerRef=fs.doc(c.db,'users',id,'xpLedger',ledgerId);
  let committed=null;
  try{
    await fs.runTransaction(c.db,async tx=>{
      const [ledgerSnap,rewardSnap]=await Promise.all([tx.get(ledgerRef),tx.get(rewardRef)]);
      if(ledgerSnap.exists()){committed={duplicate:true,item:ledgerSnap.data()||{}};return;}
      const local=state(id),cloud=rewardSnap.exists()?{...defaults(),...(rewardSnap.data()||{})}:{...defaults(),...local};normalizeState(cloud);
      const uniqueScope=LIFETIME_SOURCES.has(source)?'lifetime':day(),unique=`${uniqueScope}:${source}:${actionId}`;
      if(cloud.awarded?.[unique]){committed={duplicate:true,item:null};return;}
      if(cloud.daily?.date!==day())cloud.daily={date:day(),caps:{},quests:quests()};
      cloud.daily=cloud.daily||{date:day(),caps:{},quests:quests()};cloud.daily.caps=cloud.daily.caps||{};cloud.awarded=cloud.awarded||{};cloud.subjectXP=cloud.subjectXP||{};
      const level=window.NEXZOLevelSystem?.resolve?.(Number(cloud.totalXP)||0)?.level||1;
      const calc=calculateReward(amount,{level,score,applyLevelMultiplier,applyScoreBonus});
      const used=Number(cloud.daily.caps[source]||0),cap=limits[source]??9999,base=Math.min(calc.final,Math.max(0,cap-used));
      if(base<=0){committed={capped:true};return;}
      const now=Date.now(),beforeXP=Number(cloud.totalXP)||0,total=base,earnedCoins=coins==null?Math.floor(total/10):Math.max(0,Math.min(300,Math.round(Number(coins)||0)));
      cloud.totalXP=Math.min(270000,beforeXP+total);
      const actualXP=Math.max(0,cloud.totalXP-beforeXP);
      // Do not mint coins if the account is already at the XP cap.
      const actualCoins=actualXP>0?earnedCoins:0;cloud.coins=Math.max(0,Number(cloud.coins)||0)+actualCoins;
      cloud.daily.caps[source]=used+base;cloud.awarded[unique]=now;if(subject)cloud.subjectXP[subject]=(Number(cloud.subjectXP[subject])||0)+actualXP;
      const item={id:ledgerId,uid:id,date:day(),createdAtMs:now,amount:actualXP,base:actualXP,rawBase:calc.base,bonus:0,coins:actualCoins,source,actionId,subject,reason,difficulty,score,level:calc.level,levelMultiplier:calc.levelMultiplier,scoreMultiplier:calc.scoreMultiplier,verified:true};
      cloud.ledger=[item,...(Array.isArray(cloud.ledger)?cloud.ledger:[])].slice(0,300);cloud.updatedAtMs=now;
      tx.set(rewardRef,{uid:id,...cloud,updatedAt:fs.serverTimestamp()},{merge:true});
      tx.create(ledgerRef,item);
      committed={awarded:actualXP>0,total:actualXP,base:actualXP,bonus:0,coins:cloud.coins,earnedCoins:actualCoins,item,state:cloud,beforeXP};
    });
  }catch(error){window.dispatchEvent(new CustomEvent('nexzo:cloud-status',{detail:{area:'rewards',status:error?.code==='permission-denied'?'permission-denied':'offline',message:error?.message}}));return {awarded:false,cloud:false,error,reason:'transaction-failed'}}
  if(committed?.state){
    localStorage.setItem(key(id),JSON.stringify(committed.state));applyCosmetics(committed.state);syncProfileXP(committed.state);
    window.dispatchEvent(new CustomEvent('nexzo:rewards-updated',{detail:summary(committed.state)}));
    if(committed.awarded)emitLevelUp(committed.beforeXP,committed.state.totalXP,{earnedXP:committed.total,earnedCoins:committed.earnedCoins,source,reason});
  }
  return {...(committed||{awarded:false}),cloud:true};
}

function inventoryRow(s,itemId){normalizeState(s);return s.inventory[itemId]||{quantity:0,owned:false,purchasedAtMs:0,lastUsedAtMs:0,lastPurchaseAtMs:0};}
function rewardStatus(itemId,input=state()){
 const item=SHOP_ITEMS[itemId];if(!item)return {state:'unavailable',reason:'unknown-item'};const s=normalizeState(input),level=currentLevel(s),row=inventoryRow(s,itemId),equipped=Object.values(s.cosmetics?.equipped||{}).includes(itemId),owned=s.cosmetics?.owned?.includes(itemId)||row.owned;
 if(item.kind==='unavailable')return {state:'unavailable',reason:item.description,item,row,level};
 if(level<Number(item.requiredLevel||1))return {state:'locked',requiredLevel:item.requiredLevel,item,row,level};
 if(equipped)return {state:'applied',item,row,level};
 if(item.kind==='cosmetic'&&owned)return {state:'purchased',item,row,level};
 if(item.kind==='unlock'&&owned)return {state:'purchased',item,row,level};
 if(item.kind==='consumable'&&row.quantity>0)return {state:'purchased',quantity:row.quantity,item,row,level};
 if(item.kind==='consumable'&&row.lastUsedAtMs>0)return {state:'used',quantity:0,item,row,level};
 return {state:'available',item,row,level};
}
function commitRewardState(next){normalizeState(next);clearTimeout(syncTimer);cloudReadyFor=uid();localStorage.setItem(key(uid()),JSON.stringify(next));applyCosmetics(next);syncProfileXP(next);window.dispatchEvent(new CustomEvent('nexzo:rewards-updated',{detail:summary(next)}));return next;}
async function cloudRewardTransaction(mutator){
 const id=uid();if(id==='guest')return {ok:false,reason:'auth-required'};let c;try{c=await window.NEXZOFirebase.getContext({auth:true,firestore:true});}catch(error){return {ok:false,reason:'firestore-unavailable',error}}if(!c?.auth?.currentUser||c.auth.currentUser.uid!==id)return {ok:false,reason:'auth-required'};
 const fs=c.firestoreTools,ref=fs.doc(c.db,'users',id,'rewards','main');let outcome=null;
 try{await fs.runTransaction(c.db,async tx=>{const snap=await tx.get(ref),baseState=snap.exists()?{...defaults(),...(snap.data()||{})}:{...defaults(),...state(id)};normalizeState(baseState);const result=await mutator(baseState,{tx,fs,c,ref,id});if(!result?.ok){outcome=result||{ok:false,reason:'rejected'};return;}baseState.updatedAtMs=Date.now();tx.set(ref,{uid:id,...baseState,updatedAt:fs.serverTimestamp()},{merge:true});outcome={...result,state:baseState};});}
 catch(error){return {ok:false,reason:'transaction-failed',error};}
 if(outcome?.state){try{const verify=await fs.getDoc(ref);if(!verify.exists())return {ok:false,reason:'confirmation-failed'};const confirmed={...defaults(),...(verify.data()||{})};normalizeState(confirmed);commitRewardState(confirmed);outcome.state=confirmed;}catch(error){return {ok:false,reason:'confirmation-failed',error};}}
 return outcome||{ok:false,reason:'rejected'};
}
function purchasePendingKey(id,itemId){return `nexzo:reward-purchase-pending:v1:${id}:${itemId}`;}
function purchaseToken(id,itemId,provided=''){
 const k=purchasePendingKey(id,itemId);if(provided)return String(provided);
 try{const existing=localStorage.getItem(k);if(existing)return existing;const token=`${itemId}:${Date.now()}:${stableId(`${id}|${itemId}|${Math.random()}`)}`;localStorage.setItem(k,token);return token;}catch{return `${itemId}:${Date.now()}:${stableId(`${id}|${itemId}`)}`;}
}
function clearPurchaseToken(id,itemId,token){try{const k=purchasePendingKey(id,itemId);if(localStorage.getItem(k)===token)localStorage.removeItem(k);}catch{}}
async function purchaseReward({itemId,equip=true,purchaseId=''}={}){
 const item=SHOP_ITEMS[itemId];if(!item)return {ok:false,reason:'unknown-item'};if(item.kind==='unavailable')return {ok:false,reason:'unavailable',message:item.description};
 const id=uid();if(id==='guest')return {ok:false,reason:'auth-required'};const token=purchaseToken(id,itemId,purchaseId),receiptId=`purchase_${stableId(token)}`;
 const result=await cloudRewardTransaction(async(s,ctx)=>{
   const receiptRef=ctx.fs.doc(ctx.c.db,'users',ctx.id,'rewardPurchases',receiptId),receipt=await ctx.tx.get(receiptRef);
   if(receipt.exists()){const saved=receipt.data()||{};if(saved.itemId!==itemId)return {ok:false,reason:'idempotency-conflict'};return {ok:true,duplicate:true,itemId,coins:s.coins,quantity:inventoryRow(s,itemId).quantity,receiptId};}
const status=rewardStatus(itemId,s);if(status.state==='locked')return {ok:false,reason:'locked',requiredLevel:item.requiredLevel};const row=inventoryRow(s,itemId),alreadyOwned=s.cosmetics.owned.includes(itemId)||row.owned;if(!item.repeatable&&alreadyOwned){if(item.kind==='cosmetic'&&equip){s.cosmetics.equipped[item.slot||'chat']=itemId;return {ok:true,alreadyOwned:true,equipped:true,coins:s.coins};}return {ok:false,reason:'already-owned'};}if(Number(s.coins||0)<item.cost)return {ok:false,reason:'insufficient',needed:item.cost-Number(s.coins||0)};const now=Date.now();s.coins=Math.max(0,Number(s.coins||0)-item.cost);const next={...row,purchasedAtMs:row.purchasedAtMs||now,lastPurchaseAtMs:now};if(item.repeatable)next.quantity=Math.max(0,Number(row.quantity)||0)+1;else{next.owned=true;next.quantity=1;}s.inventory[itemId]=next;if(item.kind==='cosmetic'){if(!s.cosmetics.owned.includes(itemId))s.cosmetics.owned.push(itemId);if(equip)s.cosmetics.equipped[item.slot||'chat']=itemId;}const ledger={id:`shop_${stableId(`${itemId}|${now}|${ctx.id}`)}`,uid:ctx.id,date:day(),createdAtMs:now,amount:0,base:0,bonus:0,coins:-item.cost,source:'shop',actionId:itemId,subject:'',reason:`Purchased ${item.name}`};s.ledger=[ledger,...s.ledger].slice(0,300);ctx.tx.create(receiptRef,{uid:ctx.id,itemId,purchaseId:token,cost:item.cost,createdAtMs:now,createdAt:ctx.fs.serverTimestamp()});return {ok:true,itemId,coins:s.coins,quantity:next.quantity,owned:next.owned,equipped:item.kind==='cosmetic'&&equip,receiptId};});
 if(result?.ok)clearPurchaseToken(id,itemId,token);else if(['locked','insufficient','already-owned','unknown-item','unavailable','idempotency-conflict'].includes(result?.reason))clearPurchaseToken(id,itemId,token);
 return result;
}
async function equipCosmetic(itemId){const item=SHOP_ITEMS[itemId];if(!item||item.kind!=='cosmetic')return {ok:false,reason:'not-cosmetic'};return cloudRewardTransaction(s=>{const row=inventoryRow(s,itemId);if(!s.cosmetics.owned.includes(itemId)&&!row.owned)return {ok:false,reason:'not-owned'};s.cosmetics.equipped[item.slot||'chat']=itemId;return {ok:true,equipped:true,itemId};});}
async function consumeReward(itemId,{useId='',mutate=null}={}){
 const item=SHOP_ITEMS[itemId];if(!item||item.kind!=='consumable')return {ok:false,reason:item?.kind==='unavailable'?'unavailable':'not-consumable'};const token=String(useId||`${itemId}:${Date.now()}`);
 return cloudRewardTransaction(async(s,ctx)=>{const row=inventoryRow(s,itemId);if(s.rewardUses[token])return {ok:true,duplicate:true,itemId,quantity:row.quantity};if(Number(row.quantity||0)<=0)return {ok:false,reason:'empty'};if(typeof mutate==='function'){const result=await mutate(s,ctx);if(result===false||result?.ok===false)return {ok:false,reason:result?.reason||'effect-failed'};}const now=Date.now();row.quantity=Math.max(0,Number(row.quantity||0)-1);row.lastUsedAtMs=now;s.inventory[itemId]=row;s.rewardUses[token]=now;const ledger={id:`use_${stableId(token)}`,uid:ctx.id,date:day(),createdAtMs:now,amount:0,base:0,bonus:0,coins:0,source:'reward_use',actionId:itemId,subject:'',reason:`Used ${item.name}`};s.ledger=[ledger,...s.ledger].slice(0,300);return {ok:true,itemId,quantity:row.quantity,used:true};});
}
const spendCoins=options=>purchaseReward(options);
function achievementStatus(){const s=state();return ACHIEVEMENTS.map(a=>({...a,unlocked:s.achievements.includes(a.id)}));}

function login(){let s=state(),d=day();const first=!s.lastLoginDate&&!s.awarded['first-login'];const streak=window.NEXZOStreakSystem?.markLogin?.(d);if(streak){s.loginStreak=streak.loginStreak;s.bestLoginStreak=streak.bestLoginStreak;s.lastLoginDate=streak.lastLoginDate}if(s.awarded[`${d}:daily_login:${d}`]||s.lastLoginRewardDate===d)return persist(s);s.lastLoginRewardDate=d;if(first)s.awarded['first-login']=Date.now();persist(s);return awardXP({amount:25,source:'daily_login',actionId:d,reason:first?'First login':'Daily login',suppressLevelUp:true})}
function levelInfo(xp){const r=window.NEXZOLevelSystem?.resolve?.(xp)||{level:1,next:100};const next=Number(r.next??r.nextXp??r.nextLevelXp??100);return {level:r.level||1,nextXP:next,needed:r.level>=100?0:Math.max(0,next-xp),levelProgress:Number(r.pct)||0}}
function summary(input){const id=uid();const pending=!input&&id!=='guest'&&cloudReadyFor!==id;const s=pending?defaults():(input||state()),todayXP=s.ledger.filter(x=>x.createdAtMs?day(x.createdAtMs)===day():x.date===day()).reduce((a,b)=>a+b.amount,0),streak=window.NEXZOStreakSystem?.summary?.()||{};return {...s,hydrating:pending,source:pending?'cloud-pending':(id==='guest'?'guest-local':'firestore-rewards'),loginStreak:Number(streak.loginStreak??s.loginStreak)||0,studyStreak:Number(streak.studyStreak??s.studyStreak)||0,bestLoginStreak:Number(streak.bestLoginStreak??s.bestLoginStreak)||0,bestStudyStreak:Number(streak.bestStudyStreak??s.bestStudyStreak)||0,loginToday:Boolean(streak.loginToday),studyToday:Boolean(streak.studyToday),studyAtRisk:Boolean(streak.studyAtRisk),xpToday:todayXP,...levelInfo(s.totalXP),quests:Object.values(s.daily.quests),recentXP:s.ledger.slice(0,10)}}
function panelHTML(){const x=summary(),subs=Object.entries(x.subjectXP).sort((a,b)=>b[1]-a[1]);return `<section class="nx-gamification-panel" id="nxGamificationPanel"><div class="nx-game-head"><div><span>YOUR PROGRESS</span><h2>⚡ NEXZO Rewards</h2></div></div><div class="nx-game-stats"><article><b>${x.xpToday}</b><small>XP Today</small></article><article><b>${Number(x.totalXP).toLocaleString()}</b><small>Total XP</small></article><article><b>${x.coins}</b><small>Coins</small></article><article><b>${x.combo}x</b><small>Combo</small></article><article><b>${x.loginStreak}</b><small>Login Streak</small></article><article><b>${x.studyStreak}</b><small>Study Streak</small></article><article><b>${x.level}</b><small>Current Level</small></article><article><b>${x.needed}</b><small>XP to next</small></article></div><div class="nx-game-body"><div><h3>Daily Learning Quests</h3>${x.quests.map(q=>`<button type="button" class="nx-quest ${q.progress>=q.target?'done':''}" data-quest-page="${q.page}"><i>${q.progress>=q.target?'✅':'◻️'}</i><div><b>${q.title}</b><span><em style="width:${q.progress/q.target*100}%"></em></span><small>${q.progress}/${q.target} • +${q.reward} XP</small></div></button>`).join('')}</div><div><h3>Subject Mastery</h3>${subs.length?subs.map(([n,v])=>`<div class="nx-subject-xp"><span>${n}</span><b>${v} XP</b></div>`).join(''):'<p class="nx-game-empty">Real Academics and structured study activity will build mastery here.</p>'}<h3>Recent XP</h3>${x.recentXP.slice(0,6).map(i=>`<div class="nx-ledger"><span>${i.reason}</span><b>+${i.amount}</b></div>`).join('')||'<p class="nx-game-empty">No XP activity yet.</p>'}</div></div></section>`}
function mount(){if(!['dashboard','profile'].includes(document.body?.dataset.page))return;document.getElementById('nxGamificationPanel')?.remove();const main=document.querySelector('.main,main');if(main){main.insertAdjacentHTML('beforeend',panelHTML());document.getElementById('nxGamificationPanel')?.addEventListener('click',e=>{const q=e.target.closest('[data-quest-page]');if(q)location.href=q.dataset.questPage;},{once:true})}}
function hooks(){
window.addEventListener('nexzo:planner-task-completed',e=>{
 const d=e.detail||{},base=difficultyBase(d.difficulty||d.level,d.proof?60:40);
 awardXP({amount:base,source:'planner',actionId:d.id,reason:`${d.difficulty||d.level||'Planner'} task completed`,subject:d.subject,questId:'planner',difficulty:d.difficulty||d.level,score:d.score});
});
window.addEventListener('nexzo:focus-complete',e=>awardXP({amount:40,source:'focus',actionId:e.detail?.id||`${day()}:${e.detail?.startedAt||Date.now()}`,reason:'25-minute focus session',questId:'focus'}));
window.addEventListener('nexzo:ai-question-answered',e=>awardXP({amount:10,source:'ai_question',actionId:e.detail?.id||`${day()}:${Date.now()}`,reason:'Study Assistant question answered',subject:e.detail?.subject||'Study',applyScoreBonus:false}));
window.addEventListener('nexzo:ai-learning-complete',e=>awardXP({amount:e.detail?.kind==='interview'?100:50,source:e.detail?.kind==='interview'?'ai_interview':'ai_quiz',actionId:e.detail?.id,reason:e.detail?.kind==='interview'?'Mock interview completed':'Smart quiz completed',subject:e.detail?.subject||'AI/ML',questId:'learn',score:e.detail?.score}));
window.addEventListener('nexzo:academic-practice-complete',e=>!e.detail?.serverAwarded&&awardXP({amount:e.detail?.amount||15,source:'academics',actionId:e.detail?.id,reason:'Academics activity completed',subject:e.detail?.subject||'General',questId:'learn',score:e.detail?.score}));
window.addEventListener('nexzo:career-milestone',e=>awardXP({amount:30,source:'career',actionId:e.detail?.id,reason:'Career roadmap milestone completed',subject:e.detail?.role||'Career'}));
window.addEventListener('nexzo:community-posted',e=>awardXP({amount:35,source:'community_post',actionId:e.detail?.id,reason:'Community post created'}));
window.addEventListener('nexzo:community-helpful-answer',e=>awardXP({amount:50,source:'community_helpful',actionId:e.detail?.id,reason:'Helpful community answer'}));
window.addEventListener('nexzo:community-group-joined',e=>awardXP({amount:30,source:'community_group',actionId:e.detail?.id,reason:'Study group joined'}));
window.addEventListener('nexzo:profile-saved',e=>awardXP({amount:60,source:'profile_setup',actionId:'first-profile-save',reason:'Profile completed',applyLevelMultiplier:false}));
window.addEventListener('nexzo:avatar-updated',e=>awardXP({amount:30,source:'avatar',actionId:'first-avatar-upload',reason:'Profile avatar uploaded',applyLevelMultiplier:false}));
window.addEventListener('nexzo:email-verified',e=>awardXP({amount:75,source:'email_verify',actionId:'email-verified',reason:'Email verified',applyLevelMultiplier:false}));
window.addEventListener('click',event=>{const a=event.target.closest('a');if(!a)return;const page=document.body?.dataset?.page||'';const text=(a.textContent||'').trim().toLowerCase();if(page==='academics'&&(text.includes('notes')||text.includes('practice')||text.includes('pdf'))){awardXP({amount:15,source:'academics_resource',actionId:a.href,reason:'Academic resource opened',subject:document.querySelector('.subject-tab.active')?.textContent?.trim()||'General',questId:'learn'});}if(page==='career'&&text.includes('roadmap')){awardXP({amount:30,source:'career',actionId:a.href,reason:'Career roadmap opened'});}},true);
window.addEventListener('nexzo:rewards-updated',()=>setTimeout(mount,20));
window.addEventListener('nexzo:tasks-updated',()=>setTimeout(()=>{syncDailyQuests();mount()},80));
}
function init(){activeUid=resolveUid();hooks();setTimeout(()=>{if(activeUid==='guest'){applyCosmetics(state());login();syncDailyQuests();mount();return;}hydrateCloud().finally(()=>{applyCosmetics(state());login();syncDailyQuests();mount();});},700);window.addEventListener('nexzo:settings-changed',switchUser);window.addEventListener('nexzo:owner-changed',switchUser);window.addEventListener('nexzo:profile-updated',()=>setTimeout(mount,30))}window.awardXP=awardXP;window.NEXZOGamificationEngine=Object.freeze({version:8,xpPlanVersion:2,awardXP,award:awardXP,awardVerified,state,summary,refreshVerifiedRewards,isCloudReady:()=>uid()==='guest'||cloudReadyFor===uid(),mountPanel:mount,spendCoins,purchaseReward,equipCosmetic,consumeReward,rewardStatus,achievementStatus,shopItems:()=>JSON.parse(JSON.stringify(SHOP_ITEMS)),applyCosmetics,questEvidence,syncDailyQuests,calculateReward,levelMultiplier,scoreMultiplier,difficultyBase});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
