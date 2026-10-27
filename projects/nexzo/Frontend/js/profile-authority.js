/* NEXZO Profile Authority v44 — UID-scoped profile backed by canonical live metrics. */
(()=>{
  'use strict';
  const parse=(value,fallback={})=>{try{const out=JSON.parse(value);return out&&typeof out==='object'?out:fallback}catch{return fallback}};
  const num=value=>Number.isFinite(Number(value))?Number(value):0;
  const storedUid=()=>{try{return JSON.parse(localStorage.getItem('nexzo_user')||'{}')?.uid||''}catch{return ''}};
  const uid=()=>window.NEXZOFirebase?.auth?.currentUser?.uid||window.NEXZOSharedState?.uid?.()||window.NEXZOSharedState?.currentUid?.()||storedUid()||'guest';
  const key=()=>`nexzo_profile_authority_v41:${uid()}`;
  const legacyKey=()=>`nexzo_profile_authority_v39:${uid()}`;
  const maxLevelMarker=()=>`nexzo_verified_level100:${uid()}`;
  const hasHistoricalLevel100=()=>{
    if(localStorage.getItem(maxLevelMarker())==='1')return true;
    const active=String(uid());
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i)||'';
      if(!/(profile|user|progress|gamification)/i.test(k))continue;
      const v=parse(localStorage.getItem(k)||'{}',{});
      if(v&&typeof v==='object'&&num(v.level)>=100){
        const owner=String(v.uid||v.userId||active);
        if(!owner||owner===active){localStorage.setItem(maxLevelMarker(),'1');return true;}
      }
    }
    return false;
  };
  const normalize=value=>{
    const next={...(value||{})};
    next.uid=next.uid||uid();
    let xp=Math.max(0,num(next.xp));
    const maxXP=Math.max(0,num(window.NEXZOLevelSystem?.xpGoals?.[99]));
    // V189: Level 100 is a monotonic achievement. Once the same UID has verified
    // max-level evidence, a stale cloud/local snapshot can never downgrade it.
    if((num(next.level)>=100||hasHistoricalLevel100())&&maxXP){
      localStorage.setItem(maxLevelMarker(),'1');
      xp=Math.max(xp,maxXP);
      next.level=100;
    }
    next.xp=xp;
    next.level=window.NEXZOLevelSystem?.resolve?.(xp)?.level||1;
    next.updatedAtMs=Math.max(0,num(next.updatedAtMs));
    return next;
  };
  const migrateLegacy=value=>{const next={...(value||{})};const raw=Math.max(0,num(next.xp));const old=window.NEXZOLevelSystem?.resolveLegacy?.(raw);if(old&&window.NEXZOLevelSystem?.xpGoals){const goals=window.NEXZOLevelSystem.xpGoals;const start=goals[old.level-1]||0;const end=old.level>=100?start:(goals[old.level]||start);next.xp=Math.round(start+(end-start)*(old.pct/100));}next.updatedAtMs=Math.max(0,num(next.updatedAtMs));next.migratedFrom='v39';return normalize(next);};
  const newest=(a,b)=>num(a?.updatedAtMs)>=num(b?.updatedAtMs)?a:b;
  const current=()=>{
    const currentRaw=localStorage.getItem(key());
    const legacyRaw=currentRaw?null:localStorage.getItem(legacyKey());
    const stored=legacyRaw?migrateLegacy(parse(legacyRaw,{})):normalize(parse(currentRaw,{}));
    if(!currentRaw&&legacyRaw) localStorage.setItem(key(),JSON.stringify(stored));
    const sharedRaw=window.NEXZOSharedState?.profile?.()||{};
    const shared=(sharedRaw.uid&&String(sharedRaw.uid)!==String(uid()))?normalize({}):normalize(sharedRaw);
    const source=normalize(newest(stored,shared));
    return Object.freeze(source);
  };
  const publish=value=>{
    localStorage.setItem(key(),JSON.stringify(value));
    window.NEXZOSharedState?.updateProfile?.(value);
    window.dispatchEvent(new CustomEvent('nexzo:profile-updated',{detail:{source:'authority-v42',profile:value}}));
    return Object.freeze({...value});
  };
  // Local-first compatibility path for legacy callers. Cloud data remains authoritative once DataService is ready.
  const save=next=>{
    const value=normalize({...current(),...(next||{}),updatedAtMs:Date.now()});
    publish(value);
    Promise.resolve(window.NEXZODataService?.saveProfile?.(value)).catch(error=>console.warn('[NEXZO Profile] cloud save deferred',error));
    return Object.freeze({...value});
  };
  // Profile editor uses this path: do not announce a confirmed save until Firestore acknowledges it.
  const saveConfirmed=async next=>{
    const service=window.NEXZODataService;
    const signedIn=Boolean(service?.getUser?.()?.uid);
    const value=normalize({...current(),...(next||{}),uid:uid(),updatedAtMs:Date.now()});
    if(signedIn){
      await service.saveProfile(value);
      const cloud=service.getProfile?.()||{};
      if(cloud.uid&&String(cloud.uid)!==String(value.uid))throw new Error('Profile confirmation returned a different account.');
    }
    return publish(value);
  };
  const tasks=()=>window.NEXZOTaskStore?.getAll?.()||[];
  const minutes=task=>Math.max(0,num(task?.actualMinutes),num(task?.elapsedMinutes),num(task?.timeSpentMinutes),num(task?.studyMinutes),num(task?.elapsed)/60000);
  const done=task=>task?.completed===true||String(task?.status||'').toLowerCase()==='completed';
  const stats=()=>{const profile=current(),list=tasks(),canonical=window.NEXZOStateAuthority?.stats?.(),resolvedState=window.NEXZOStateAuthority?.level?.();const rewards=window.NEXZOGamificationEngine?.summary?.()||{};const fallbackMinutes=Math.round(list.reduce((sum,task)=>sum+minutes(task),0));const xp=Math.max(0,num(resolvedState?.xp??rewards.totalXP??profile.xp));const resolved=window.NEXZOLevelSystem?.resolve?.(xp)||{level:1};return Object.freeze({profile,tasks:list,completed:Math.max(0,num(canonical?.completed??list.filter(done).length)),minutes:Math.max(0,num(canonical?.totalMinutes??fallbackMinutes)),weekMinutes:Math.max(0,num(canonical?.weekMinutes)),aiScore:Math.max(0,Math.min(100,num(canonical?.accuracy??profile.aiScore))),streak:Math.max(0,num(canonical?.streak??rewards.studyStreak??profile.streak)),xp,level:resolved.level||1});};
  window.NEXZOProfileAuthority=Object.freeze({version:44,current,save,saveConfirmed,stats,tasks,uid,key,legacyKey});
})();
