/* NEXZO Personalization Engine v151 — deterministic learning profile, events, mastery and next-best actions. */
(function(){
  'use strict';
  if(window.NEXZOPersonalization) return;
  const KEY='nexzo_personalization_v151';
  const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number(n)||0));
  const now=()=>Date.now();
  const dayKey=(d=new Date())=>{const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
  const clone=v=>JSON.parse(JSON.stringify(v));
  const esc=v=>String(v??'').trim();
  const owner=()=>window.NEXZODataService?.getUser?.()?.uid||window.NEXZOShell?.identity?.()?.uid||'local';
  const defaultState=()=>({schemaVersion:151,uid:owner(),profile:{course:'',branch:'',semester:'',subjects:[],backlogs:[],examDates:{},careerGoal:'',dailyMinutes:60,language:'Hinglish',explanationStyle:'Concise + examples',confidence:{}},checkins:{},events:[],mastery:{},mistakes:{},recommendations:[],feedback:{},memoryEnabled:true,updatedAtMs:now()});
  let state=defaultState(), cloudTimer=null, ready=false;
  function scopedKey(){return `${KEY}:${owner()}`}
  function loadLocal(){try{const raw=localStorage.getItem(scopedKey());if(raw){const x=JSON.parse(raw);state={...defaultState(),...x,profile:{...defaultState().profile,...(x.profile||{})}}}}catch{};state.uid=owner();return state}
  function saveLocal(){state.updatedAtMs=now();localStorage.setItem(scopedKey(),JSON.stringify(state));window.dispatchEvent(new CustomEvent('nexzo:personalization-updated',{detail:snapshot()}));scheduleCloud();}
  async function cloudContext(){try{const c=await window.NEXZOFirebase?.getContext?.({auth:true,firestore:true});const user=c?.auth?.currentUser;if(!user)return null;return {...c,user}}catch{return null}}
  async function loadCloud(){const c=await cloudContext();if(!c)return false;try{const ref=c.firestoreTools.doc(c.db,'users',c.user.uid,'personalization','main');const snap=await c.firestoreTools.getDoc(ref);if(snap.exists()){const remote=snap.data();if((remote.updatedAtMs||0)>(state.updatedAtMs||0)){state={...defaultState(),...remote,profile:{...defaultState().profile,...(remote.profile||{})}};localStorage.setItem(scopedKey(),JSON.stringify(state));window.dispatchEvent(new CustomEvent('nexzo:personalization-updated',{detail:snapshot()}));}}return true}catch{return false}}
  async function pushCloud(){const c=await cloudContext();if(!c)return false;try{const ref=c.firestoreTools.doc(c.db,'users',c.user.uid,'personalization','main');await c.firestoreTools.setDoc(ref,{...clone(state),uid:c.user.uid},{merge:false});return true}catch{return false}}
  function scheduleCloud(){clearTimeout(cloudTimer);cloudTimer=setTimeout(pushCloud,1200)}
  function normalizeTopic(subject,topic){return `${esc(subject)||'General'}::${esc(topic)||esc(subject)||'General'}`.toLowerCase()}
  function topicLabel(key){const [s,t]=String(key).split('::');return {subject:s.replace(/\b\w/g,c=>c.toUpperCase()),topic:t?.replace(/\b\w/g,c=>c.toUpperCase())||s}}
  function eventWeight(e){const type=String(e.type||'study');if(type==='quiz')return .34;if(type==='submission')return .32;if(type==='revision')return .2;if(type==='interview')return .22;if(type==='task')return .14;return .1}
  function recomputeMastery(){
    const by={};
    state.events.forEach(e=>{const key=e.topicKey||normalizeTopic(e.subject,e.topic);(by[key]??=[]).push(e)});
    const result={};
    Object.entries(by).forEach(([key,events])=>{
      const sorted=events.sort((a,b)=>(a.atMs||0)-(b.atMs||0));let score=50, totalW=0, weighted=0, last=0, attempts=0, wrong=0;
      sorted.slice(-30).forEach(e=>{const w=eventWeight(e)*(e.difficulty==='hard'?1.15:e.difficulty==='easy'?.9:1);const acc=Number.isFinite(Number(e.accuracy))?clamp(e.accuracy):e.maxScore?clamp(Number(e.score)/Number(e.maxScore)*100):e.completed?80:45;weighted+=acc*w;totalW+=w;attempts++;wrong+=Array.isArray(e.mistakes)?e.mistakes.length:0;last=Math.max(last,e.atMs||0)});
      if(totalW) score=weighted/totalW;
      const days=last?Math.max(0,(now()-last)/86400000):999;const decay=Math.min(18,Math.max(0,days-7)*.45);score=clamp(score-decay);
      const label=topicLabel(key);result[key]={key,...label,score:Math.round(score),status:score<35?'Critical':score<55?'Weak':score<75?'Improving':'Strong',lastActivityMs:last,attempts,mistakeCount:wrong};
    });
    // seed confidence for cold start topics
    (state.profile.subjects||[]).forEach(subject=>{const key=normalizeTopic(subject,subject);if(!result[key]){const c=clamp(state.profile.confidence?.[subject]??50);result[key]={key,subject,topic:subject,score:c,status:c<35?'Critical':c<55?'Weak':c<75?'Improving':'Strong',lastActivityMs:0,attempts:0,mistakeCount:0}}});
    state.mastery=result;return result;
  }
  function detectWeaknesses(){recomputeMastery();return Object.values(state.mastery).filter(x=>x.score<55).sort((a,b)=>a.score-b.score)}
  function buildRecommendations(){
    recomputeMastery();const today=state.checkins[dayKey()]||{};const tasks=window.NEXZOTaskStore?.getAll?.()||[];const available=Math.max(15,Number(today.availableMinutes||state.profile.dailyMinutes||60));const energy=String(today.energy||'Normal');const rows=[];
    Object.values(state.mastery).forEach(m=>{
      let urgency=100-m.score;const exam=state.profile.examDates?.[m.subject]||state.profile.examDates?.[m.subject.toLowerCase()];if(exam){const d=(new Date(exam).getTime()-now())/86400000;if(d>=0&&d<=14)urgency+=Math.max(0,40-d*2.5)}
      const pending=tasks.filter(t=>!t.completed&&String(t.subject||'').toLowerCase()===m.subject.toLowerCase()).length;urgency+=Math.min(25,pending*8);const daysSince=m.lastActivityMs?(now()-m.lastActivityMs)/86400000:30;urgency+=Math.min(15,daysSince*.5);
      const minutes=energy==='Low'?Math.min(30,available):energy==='High'?Math.min(75,available):Math.min(50,available);
      rows.push({id:`${m.key}:${dayKey()}`,subject:m.subject,topic:m.topic,mastery:m.score,priority:Math.round(urgency),durationMinutes:Math.max(15,Math.round(minutes/5)*5),action:m.score<35?'Rebuild fundamentals + guided practice':m.score<55?'Targeted practice + mistake review':m.score<75?'Mixed practice + recall':'Spaced revision',why:[`Mastery ${m.score}%`,exam?'Exam/deadline context considered':null,pending?`${pending} pending Planner task${pending>1?'s':''}`:null,m.lastActivityMs?`Last activity ${Math.round(daysSince)} day(s) ago`:'No recent practice'].filter(Boolean)});
    });
    state.recommendations=rows.sort((a,b)=>b.priority-a.priority).slice(0,8);return state.recommendations;
  }
  function updateProfile(patch){state.profile={...state.profile,...clone(patch)};buildRecommendations();saveLocal();return snapshot()}
  function dailyCheckin(data){state.checkins[dayKey()]={date:dayKey(),availableMinutes:Math.max(10,Number(data.availableMinutes)||state.profile.dailyMinutes||60),energy:['Low','Normal','High'].includes(data.energy)?data.energy:'Normal',workload:['Low','Normal','High'].includes(data.workload)?data.workload:'Normal',focus:data.focus||'Adaptive',note:esc(data.note).slice(0,300),updatedAtMs:now()};buildRecommendations();saveLocal();return clone(state.checkins[dayKey()])}
  function recordEvent(data){const e={id:data.id||crypto.randomUUID?.()||`ev_${now()}_${Math.random().toString(36).slice(2)}`,type:data.type||'study',subject:esc(data.subject)||'General',topic:esc(data.topic)||esc(data.subject)||'General',topicKey:normalizeTopic(data.subject,data.topic),score:Number(data.score)||0,maxScore:Number(data.maxScore)||0,accuracy:Number.isFinite(Number(data.accuracy))?clamp(data.accuracy):null,difficulty:data.difficulty||'medium',durationMinutes:Math.max(0,Number(data.durationMinutes)||0),completed:Boolean(data.completed),mistakes:Array.isArray(data.mistakes)?data.mistakes.map(x=>esc(x)).filter(Boolean).slice(0,10):[],source:data.source||'manual',atMs:Number(data.atMs)||now()};if(state.events.some(x=>x.id===e.id))return e;state.events.push(e);if(state.events.length>800)state.events=state.events.slice(-800);e.mistakes.forEach(m=>{const key=`${e.topicKey}::${m.toLowerCase()}`;const x=state.mistakes[key]||{concept:m,subject:e.subject,topic:e.topic,count:0,lastSeenMs:0};x.count++;x.lastSeenMs=e.atMs;state.mistakes[key]=x});buildRecommendations();saveLocal();return e}
  function importPlanner(){const tasks=window.NEXZOTaskStore?.getAll?.()||[];let added=0;tasks.filter(t=>t.completed).forEach(t=>{const id=`planner:${t.id}:${t.completedAtMs||t.updatedAtMs||0}`;if(state.events.some(e=>e.id===id))return;recordEvent({id,type:'task',subject:t.subject||'General',topic:t.title||t.subject,score:Number(t.score)||0,maxScore:t.score?10:0,accuracy:t.score?Number(t.score)*10:null,difficulty:t.difficulty||t.level||'medium',durationMinutes:Number(t.actualMinutes)||Math.round((Number(t.elapsed)||0)/60000),completed:true,source:'planner',atMs:t.completedAtMs||t.updatedAtMs||now()});added++});return added}
  function feedback(id,value){state.feedback[id]={value,atMs:now()};saveLocal()}
  function forget(section){if(section==='all'){state=defaultState()}else if(section==='events'){state.events=[];state.mastery={};state.mistakes={};state.recommendations=[]}else if(section==='profile'){state.profile=defaultState().profile}else if(section==='mistakes'){state.mistakes={}};buildRecommendations();saveLocal()}
  function snapshot(){return clone({...state,weakTopics:detectWeaknesses(),recommendations:buildRecommendations()})}
  async function init(){loadLocal();importPlanner();buildRecommendations();ready=true;window.dispatchEvent(new CustomEvent('nexzo:personalization-ready',{detail:snapshot()}));await loadCloud();importPlanner();buildRecommendations();}
  window.NEXZOPersonalization=Object.freeze({init,snapshot,updateProfile,dailyCheckin,recordEvent,importPlanner,recomputeMastery,detectWeaknesses,buildRecommendations,feedback,forget,pushCloud,get ready(){return ready}});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.addEventListener('nexzo:task-store',()=>{if(ready){importPlanner();buildRecommendations()}});
})();
