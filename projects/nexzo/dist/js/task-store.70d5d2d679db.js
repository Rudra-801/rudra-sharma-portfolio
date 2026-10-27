/* NEXZO Task Store v2.2 — canonical local state with throttled Firestore sync. */
(function(){
  'use strict';
  let cacheAvailable=true;
  const cacheWrite=(key,value)=>{try{localStorage.setItem(key,value);return true;}catch{cacheAvailable=false;window.dispatchEvent(new CustomEvent('nexzo:cache-status',{detail:{state:'unavailable',message:'Device cache is full. Cloud data remains authoritative.'}}));return false;}};
  if(window.NEXZOTaskStore) return;

  const PRIMARY='nexzo_tasks_v2';
  const COMPAT='nexzo_planner_tasks_v6';
  const scopedKey=base=>`${base}:${owner()}`;
  const LEGACY=['nexzo_planner_tasks_v5','nexzo_planner_tasks_v4','nexzoTasks','nexzoUnifiedTasks','nexzoTasksV3','nexzoPlannerTasks','plannerTasks','tasks'];
  const MIGRATION='nexzo_task_store_migrated_v2';
  const CLOUD_DELAY=1200;
  const MAX_ACTIVE_SESSION_MS=12*60*60*1000;
  let items=[];
  let listeners=new Set();
  let cloudTimer=null;
  let cloudPromise=Promise.resolve(false);
  let cloudRetry=0;
  let applying=false;
  let dirty=false;
  let revision=0;
  let currentOwner='local';
  let syncState='local';
  let inFlight=null;
  const pendingKey=()=>`nexzo_tasks_sync_pending:${owner()}`;

  const parse=(raw,fallback=[])=>{try{const value=JSON.parse(raw);return value??fallback}catch{return fallback}};
  const num=value=>Number.isFinite(Number(value))?Number(value):0;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const service=()=>window.NEXZODataService;
  const owner=()=>service()?.getUser?.()?.uid||localStorage.getItem('nexzo_canonical_cache_owner')||'local';
  const localDateKey=value=>{
    const date=value instanceof Date?new Date(value):new Date(Number(value)||value||Date.now());
    if(Number.isNaN(date.getTime())) return '';
    const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  };
  const migrationKey=()=>`${MIGRATION}:${owner()}`;

  function taskId(task,index=0){
    return String(task?.id||task?._id||task?.taskId||`task_${Date.now()}_${index}_${Math.random().toString(36).slice(2,8)}`);
  }
  function dateMs(value){
    if(!value) return null;
    if(typeof value?.toMillis==='function') return value.toMillis();
    const n=Number(value);
    if(Number.isFinite(n)&&n>100000000000) return n;
    const parsed=new Date(value).getTime();
    return Number.isFinite(parsed)?parsed:null;
  }
  function plannedMinutes(task){
    const hours=String(task?.hours||task?.dailyHours||'').toLowerCase();
    const amount=Math.max(0,num(hours.match(/[\d.]+/)?.[0]));
    const daily=hours.includes('minute')?amount:hours.includes('hour')?amount*60:0;
    const days=Math.max(1,num(String(task?.duration||task?.durationDays||'1').match(/[\d.]+/)?.[0])||1);
    return Math.max(0,num(task?.plannedMinutes),daily*days);
  }
  function normalize(task,index=0){
    const completed=Boolean(task?.completed||task?.done||String(task?.status||'').toLowerCase()==='completed'||num(task?.progress)>=100);
    const submissionLocked=Boolean(task?.submissionLocked);
    const terminal=completed||submissionLocked;
    const lastStartedRaw=num(task?.lastStarted);
    const running=Boolean(!terminal&&task?.running&&lastStartedRaw&&Date.now()-lastStartedRaw<=MAX_ACTIVE_SESSION_MS);
    const rawStatus=String(task?.status||'').toLowerCase();
    const status=completed?'completed':submissionLocked?(task?.score!=null?'needs-improvement':'submitted'):running?'in-progress':['pending','paused','overdue','in-progress','submitted','needs-improvement'].includes(rawStatus)?rawStatus:'pending';
    const createdAtMs=num(task?.createdAtMs)||dateMs(task?.createdAt)||dateMs(task?.created)||Date.now();
    const completedAtMs=completed?(num(task?.completedAtMs)||dateMs(task?.completedAt)||dateMs(task?.verifiedAt)||num(task?.updatedAtMs)||dateMs(task?.updatedAt)||createdAtMs):0;
    const deadline=String(task?.deadline||task?.scheduledDate||task?.dueDate||'').slice(0,10);
    const deadlineTime=String(task?.deadlineTime||'23:59').slice(0,5)||'23:59';
    const legacyDeadlineMs=deadline?new Date(`${deadline}T${deadlineTime}:00`).getTime():null;
    const deadlineMs=num(task?.deadlineMs)||num(task?.deadlineAtMs)||dateMs(task?.deadlineAt)||(Number.isFinite(legacyDeadlineMs)?legacyDeadlineMs:null);
    const sessions=Array.isArray(task?.sessions)
      ? task.sessions.map(session=>({
          startedAt:num(session.startedAt),
          endedAt:num(session.endedAt),
          durationMs:Math.min(MAX_ACTIVE_SESSION_MS,Math.max(0,num(session.durationMs)||(num(session.endedAt)-num(session.startedAt))))
        })).filter(session=>session.durationMs>=0)
      : [];
    const sessionTotal=sessions.reduce((sum,session)=>sum+session.durationMs,0);
    const legacyRaw=Math.max(0,num(task?.elapsed)||num(task?.actualMinutes)*60000);
    const legacyCap=Math.max(MAX_ACTIVE_SESSION_MS,plannedMinutes(task)*2*60000);
    const elapsed=sessions.length?sessionTotal:Math.min(legacyRaw,legacyCap);
    return {
      ...task,
      system:Boolean(task?.system||task?.isFocusSession),
      isFocusSession:Boolean(task?.isFocusSession),
      id:taskId(task,index),
      uid:task?.uid||owner(),
      title:String(task?.title||task?.name||'Study Task').slice(0,160),
      subject:String(task?.subject||task?.track||'General').slice(0,80),
      type:String(task?.type||task?.taskType||'Study').slice(0,70),
      taskType:String(task?.taskType||task?.type||'Study').slice(0,70),
      level:String(task?.level||task?.difficulty||'Beginner').slice(0,40),
      difficulty:String(task?.difficulty||task?.level||'Beginner').slice(0,40),
      completed,
      done:completed,
      submissionLocked,
      status,
      progress:completed?100:Math.max(0,Math.min(99,num(task?.progress))),
      elapsed,
      actualMinutes:Math.max(0,Math.round(elapsed/60000)),
      running,
      lastStarted:running?lastStartedRaw:null,
      createdAtMs,
      completedAtMs,
      completedAt:completed?(task?.completedAt||new Date(completedAtMs).toISOString()):task?.completedAt,
      created:task?.created||new Date(createdAtMs).toISOString(),
      updatedAtServerMs:dateMs(task?.updatedAt)||num(task?.updatedAtServerMs)||0,
      localRevision:Math.max(0,num(task?.localRevision)),
      updatedAtMs:num(task?.updatedAtMs)||dateMs(task?.updatedAt)||Date.now(),
      deadlineMs,
      deadline:deadline||(deadlineMs?localDateKey(deadlineMs):''),
      deadlineTime,deadlineAt:deadlineMs?new Date(deadlineMs).toISOString():null,
      sessions
    };
  }
  function signature(list){
    return JSON.stringify(list.map(task=>[task.id,task.updatedAtMs,task.status,task.progress,task.elapsed,task.score]).sort());
  }
  function merge(sources){
    const map=new Map();
    sources.flat().filter(Boolean).map(normalize).forEach(task=>{
      const previous=map.get(task.id);
      if(!previous){map.set(task.id,task);return;}
      // A delayed pre-submission snapshot must never undo an immutable evaluation.
      const evaluated=t=>Boolean(t.submissionLocked&&t.score!=null);
      if(evaluated(previous)!==evaluated(task)){
        if(evaluated(task))map.set(task.id,task);
        return;
      }
      const aServer=num(task.updatedAtServerMs),bServer=num(previous.updatedAtServerMs);
      const wins=aServer!==bServer?aServer>bServer:
        num(task.localRevision)!==num(previous.localRevision)?num(task.localRevision)>num(previous.localRevision):
        num(task.updatedAtMs)>=num(previous.updatedAtMs);
      if(wins) map.set(task.id,task);
    });
    return [...map.values()].sort((a,b)=>num(b.createdAtMs)-num(a.createdAtMs));
  }
  function publicItems(){return items.filter(task=>!task.system&&!task.isFocusSession);}
  function getAll(options={}){return clone(options.includeSystem?items:publicItems());}

  function emit(source){
    const detail={source,tasks:getAll(),stats:stats()};
    listeners.forEach(listener=>{try{listener(detail)}catch(error){console.error(error)}});
    window.dispatchEvent(new CustomEvent('nexzo:task-store',{detail}));
    window.dispatchEvent(new CustomEvent('nexzo:tasks-updated',{detail:{...detail,source:source==='cloud'?'task-store-cloud':'task-store'}}));
  }
  function writeLocal(source='local'){
    items=items.map(normalize);
    const payload=JSON.stringify(items);
    applying=true;
    try{
      cacheWrite(scopedKey(PRIMARY),payload);
      cacheWrite(scopedKey(COMPAT),payload);
    }finally{applying=false;}
    emit(source);
  }
  function markDirty(){dirty=true;revision+=1;syncState='pending';cacheWrite(pendingKey(),'1');}

  async function pushCloud(targetRevision=revision){
    if(inFlight){await inFlight;return dirty?pushCloud(revision):true;}
    const dataService=service();
    if(!dataService?.saveTasks||!dataService?.getUser?.()){
      cloudRetry+=1;
      if(cloudRetry<=10){
        clearTimeout(cloudTimer);
        cloudTimer=setTimeout(()=>{cloudPromise=pushCloud(targetRevision);},Math.min(10000,1200*cloudRetry));
      }
      return false;
    }
    const targetOwner=owner();
    try{
      inFlight=Promise.resolve(dataService.saveTasks(clone(items)));
      const saved=await inFlight;
      if(saved!==true)throw new Error('Cloud write was not acknowledged.');
      if(owner()!==targetOwner)return false;
      cloudRetry=0;
      if(revision===targetRevision){dirty=false;syncState='cloud';localStorage.removeItem(pendingKey());}
      cacheWrite('nexzo_last_sync',new Date().toISOString());
      emit('cloud-saved');
      return true;
    }catch(error){
      if(owner()!==targetOwner)return false;
      syncState='pending';
      cloudRetry+=1;
      if(cloudRetry<=5){
        clearTimeout(cloudTimer);
        cloudTimer=setTimeout(()=>{cloudPromise=pushCloud(revision);},Math.min(10000,1800*cloudRetry));
      }
      // Cloud retries are background state, not a user-facing failure. Keep the local
      // task authoritative until a later retry succeeds; do not spam every page with
      // a global toast during startup/offline development. Planner can expose sync
      // state contextually when the user actually needs it.
      return false;
    }finally{inFlight=null;}
  }
  function scheduleCloud(immediate=false){
    clearTimeout(cloudTimer);
    const targetRevision=revision;
    if(immediate){
      cloudPromise=pushCloud(targetRevision);
      return cloudPromise;
    }
    cloudPromise=new Promise(resolve=>{
      cloudTimer=setTimeout(()=>pushCloud(targetRevision).then(resolve),CLOUD_DELAY);
    });
    return cloudPromise;
  }

  function load(){
    currentOwner=owner();
    dirty=localStorage.getItem(pendingKey())==='1';
    syncState=dirty?'pending':'local';
    const scopedRaw=localStorage.getItem(scopedKey(PRIMARY));
    const legacyRaw=localStorage.getItem(PRIMARY);
    const knownLegacyOwner=localStorage.getItem('nexzo_legacy_cache_owner')||localStorage.getItem('nexzo_canonical_cache_owner')||'';
    const mayMigrateLegacy=currentOwner==='local'||knownLegacyOwner===currentOwner;
    const primary=parse(scopedRaw || (mayMigrateLegacy?legacyRaw:null) || '[]',[]);
    if(!scopedRaw && legacyRaw && mayMigrateLegacy && currentOwner!=='local'){
      cacheWrite(scopedKey(PRIMARY),legacyRaw);
      cacheWrite('nexzo_legacy_cache_owner',currentOwner);
    }
    const migrated=localStorage.getItem(migrationKey())==='1';
    const legacy=(migrated||!mayMigrateLegacy)?[]:LEGACY.map(key=>parse(localStorage.getItem(key)||'[]',[])).filter(Array.isArray);
    const cloud=service()?.getTasks?.()||[];
    items=merge([primary,cloud,...legacy]);
    if(!migrated){
      cacheWrite(migrationKey(),'1');
      if(legacy.some(list=>list.length)&&currentOwner!=='local') markDirty();
    }
    writeLocal('initial');
    if(dirty) scheduleCloud();
  }

  function setAll(list,{cloud=true}={}){
    const systemRows=items.filter(task=>task.system||task.isFocusSession);
    items=merge([Array.isArray(list)?list:[],systemRows]);
    if(cloud) markDirty();
    writeLocal('set-all');
    if(cloud) scheduleCloud();
    return getAll();
  }
  function upsert(task,{cloud=true,immediate=false}={}){
    const previous=items.find(item=>item.id===String(task?.id||task?._id||''));
    const normalized=normalize({...task,uid:owner(),localRevision:Math.max(num(previous?.localRevision),num(task?.localRevision))+1,updatedAtMs:Date.now()});
    const index=items.findIndex(item=>item.id===normalized.id);
    if(index>=0) items[index]=normalized; else items.unshift(normalized);
    if(cloud) markDirty();
    writeLocal('upsert');
    if(cloud) scheduleCloud(immediate);
    return clone(normalized);
  }
  async function remove(){
    const error=new Error('Task deletion is disabled. Complete or archive the task instead.');
    window.NEXZOShell?.toast?.(error.message,'error');
    throw error;
  }
  function subscribe(listener){
    listeners.add(listener);
    listener({source:'initial',tasks:getAll(),stats:stats()});
    return()=>listeners.delete(listener);
  }
  function elapsedMs(task,now=Date.now()){
    return Math.max(0,num(task.elapsed))+(task.running&&num(task.lastStarted)?Math.max(0,now-num(task.lastStarted)):0);
  }
  function configuredWeekStart(date=new Date()){
    const settings=window.NEXZOShell?.readSettings?.()||{};
    const monday=String(settings.weekStart||'Monday').toLowerCase()==='monday';
    const value=new Date(date);value.setHours(0,0,0,0);
    const day=value.getDay();value.setDate(value.getDate()+(monday?(day===0?-6:1-day):-day));
    return value.getTime();
  }
  function recordedMinutes(task){
    const elapsedMinutes=Math.max(0,num(task?.elapsed))/60000;
    return Math.max(
      0,
      num(task?.actualMinutes),
      num(task?.elapsedMinutes),
      num(task?.timeSpentMinutes),
      num(task?.studyMinutes),
      elapsedMinutes
    );
  }
  function sessionsFor(task){
    const rows=Array.isArray(task.sessions)?task.sessions.map(session=>({
      startedAt:num(session?.startedAt)||num(task?.createdAtMs)||Date.now(),
      endedAt:num(session?.endedAt)||num(task?.updatedAtMs)||Date.now(),
      durationMs:Math.max(0,num(session?.durationMs)||(num(session?.endedAt)-num(session?.startedAt)))
    })).filter(session=>session.durationMs>0):[];
    if(!task.submissionLocked&&task.running&&num(task.lastStarted)) rows.push({startedAt:num(task.lastStarted),endedAt:Date.now(),durationMs:Date.now()-num(task.lastStarted)});
    if(!rows.length){
      const minutes=recordedMinutes(task);
      if(minutes>0){
        const endedAt=num(task?.completedAtMs)||num(task?.updatedAtMs)||num(task?.createdAtMs)||Date.now();
        rows.push({startedAt:endedAt-minutes*60000,endedAt,durationMs:minutes*60000,synthetic:true});
      }
    }
    return rows;
  }
  function stats(){
    const now=Date.now(),start=configuredWeekStart(),visible=publicItems();
    const completed=visible.filter(task=>task.completed||task.status==='completed');
    let totalMs=0,weekMs=0;const byDay={};
    items.forEach(task=>sessionsFor(task).forEach(session=>{
      const duration=Math.max(0,num(session.durationMs));
      totalMs+=duration;
      if(num(session.endedAt)>=start) weekMs+=duration;
      const key=localDateKey(num(session.endedAt)||now);
      if(key) byDay[key]=(byDay[key]||0)+duration;
    }));
    // Accuracy is the mean of every real evaluated attempt, not only passed/completed tasks.
    // A genuine 0/10 is valid evidence and must not disappear because it is falsy.
    const evaluated=visible.filter(task=>{
      const raw=task.score ?? task.aiScore ?? task.evalScore ?? task.evaluation?.score;
      const hasScore=raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(Number(raw));
      const hasEvaluation=Boolean(task.evaluatedAtMs||task.submittedAtMs||task.evaluationMode||task.evaluationSource||task.submissionLocked||task.evaluation);
      return hasScore&&hasEvaluation;
    });
    const scores=evaluated.map(task=>{
      const raw=task.score ?? task.aiScore ?? task.evalScore ?? task.evaluation?.score;
      const score=Math.max(0,Number(raw)||0);
      return Math.max(0,Math.min(100,score<=10?score*10:score));
    });
    const activeDates=[...new Set(completed.map(task=>num(task.completedAtMs)||dateMs(task.completedAt)||dateMs(task.verifiedAt)||num(task.updatedAtMs)||dateMs(task.updatedAt)).filter(Boolean).map(localDateKey))];
    let streak=0;let cursor=new Date();cursor.setHours(0,0,0,0);
    for(let index=0;index<366;index+=1){
      const key=localDateKey(cursor);
      if(activeDates.includes(key)){streak+=1;cursor.setDate(cursor.getDate()-1);continue;}
      if(index===0){cursor.setDate(cursor.getDate()-1);continue;}
      break;
    }
    return {
      total:visible.length,
      completed:completed.length,
      pending:Math.max(0,visible.length-completed.length),
      running:visible.filter(task=>task.running).length,
      paused:visible.filter(task=>task.status==='paused').length,
      overdue:visible.filter(task=>!task.completed&&!task.submissionLocked&&task.deadlineMs&&task.deadlineMs<now).length,
      totalMinutes:Math.round(totalMs/60000),
      weekMinutes:Math.round(weekMs/60000),
      accuracy:scores.length?Math.round(scores.reduce((sum,value)=>sum+value,0)/scores.length):0,
      progress:visible.length?Math.round(completed.length/visible.length*100):0,
      streak,
      byDay
    };
  }
  function recordFocusSession(minutes=25,endedAt=Date.now()){
    const durationMs=Math.max(60000,Math.round(num(minutes)*60000));
    const end=num(endedAt)||Date.now(),start=end-durationMs;
    return upsert({
      id:`focus_${end}`,
      system:true,
      isFocusSession:true,
      title:'Focus Session',subject:'Focus',type:'Focus',status:'completed',completed:true,progress:100,
      elapsed:durationMs,actualMinutes:Math.round(durationMs/60000),createdAtMs:start,updatedAtMs:end,completedAtMs:end,
      sessions:[{startedAt:start,endedAt:end,durationMs}]
    },{cloud:true,immediate:true});
  }
  function syncCloud(eventTasks){
    const incomingOwner=owner();
    const cloud=Array.isArray(eventTasks)?eventTasks:(service()?.getTasks?.()||[]);
    const ownerChanged=incomingOwner!==currentOwner;
    const normalizedCloud=cloud.map(task=>normalize({...task,uid:incomingOwner}));
    const cached=ownerChanged?parse(localStorage.getItem(`${PRIMARY}:${incomingOwner}`)||'[]',[]):items;
    if(ownerChanged){clearTimeout(cloudTimer);dirty=localStorage.getItem(pendingKey())==='1';syncState=dirty?'pending':'local';revision+=1;}
    const retained=dirty?cached:cached.filter(t=>t.serverVerified&&t.evaluationId&&normalizedCloud.some(c=>c.id===t.id));
    const next=merge([retained,normalizedCloud]);
    if(!dirty&&service()?.getUser?.())syncState='cloud';
    currentOwner=incomingOwner;window.NEXZOSharedState?.setOwner?.(incomingOwner);
    cacheWrite(migrationKey(),'1');
    if(signature(next)!==signature(items)||ownerChanged){
      items=next;
      writeLocal('cloud');
    }
  }
  async function flush(){
    if(!dirty) return true;
    return scheduleCloud(true);
  }

  load();
  window.addEventListener('nexzo:tasks-updated',event=>{
    if(event.detail?.source==='firestore') syncCloud(event.detail?.tasks);
  });
  window.addEventListener('nexzo:data-ready',()=>syncCloud());
  window.addEventListener('storage',event=>{
    if(event.key===scopedKey(PRIMARY)&&!applying){items=merge([parse(event.newValue||'[]',[])]);emit('storage');}
  });

  window.NEXZOTaskStore=Object.freeze({getAll,snapshot:getAll,setAll,upsert,remove,subscribe,stats,elapsedMs,recordedMinutes,normalize,recordFocusSession,flush,syncStatus:()=>({state:service()?.getUser?.()?syncState:'local',pending:dirty,cacheAvailable}),PRIMARY_KEY:PRIMARY});
})();
