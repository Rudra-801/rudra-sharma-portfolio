/* NEXZO State Authority v44 — one live metrics snapshot for every page. */
(function(){
  'use strict';
  if(window.NEXZOStateAuthority?.version>=44)return;
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  const stamp=v=>Math.max(0,num(v?.serverUpdatedAtMs),num(v?.updatedAtMs),num(v?.updatedAt?.toMillis?.()),num(v?.updatedAt?.seconds)*1000);
  const dateKey=value=>{const raw=String(value||'');if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;const d=new Date(Number(value)||value||Date.now());if(Number.isNaN(d.getTime()))return'';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const todayKey=()=>dateKey(Date.now());
  const prefer=(primary,fallback)=>{primary=obj(primary);fallback=obj(fallback);if(!Object.keys(primary).length)return fallback;if(!Object.keys(fallback).length)return primary;return stamp(primary)>=stamp(fallback)?{...fallback,...primary}:{...primary,...fallback};};

  function rawProfile(){
    const cloud=obj(window.NEXZODataService?.getProfile?.());
    const scoped=obj(window.NEXZOSharedState?.profile?.());
    return prefer(cloud,scoped);
  }
  function rewardState(){return obj(window.NEXZOGamificationEngine?.summary?.());}
  function canonicalXP(profile=rawProfile()){
    const rewards=rewardState();
    const maxLevelXP=Math.max(0,num(window.NEXZOLevelSystem?.xpGoals?.[99]));
    const profileXP=Math.max(0,num(profile.xp));
    // Older verified profiles may carry Level 100 independently of XP. Preserve that
    // same-account state instead of allowing a temporary/offline reward snapshot to
    // visually downgrade Profile/Hub/Planner to a low level.
    const uid=String(profile.uid||window.NEXZOSharedState?.uid?.()||'guest');
    const verifiedMax=localStorage.getItem(`nexzo_verified_level100:${uid}`)==='1';
    if((num(profile.level)>=100||verifiedMax)&&maxLevelXP)return Math.max(profileXP,maxLevelXP);
    if(window.NEXZOGamificationEngine?.isCloudReady?.()&&Number.isFinite(Number(rewards.totalXP)))return Math.max(0,num(rewards.totalXP));
    return profileXP;
  }
  function profile(){
    const chosen=rawProfile(),xp=canonicalXP(chosen);
    const level=window.NEXZOLevelSystem?.resolve?.(xp);
    return {...chosen,xp,level:level?.level||1,rank:level?.rank||'Starter'};
  }
  function cloudStats(){
    const cloud=obj(window.NEXZODataService?.getStats?.());
    const total=Math.max(0,num(cloud.totalTasks));
    const completed=Math.min(total,Math.max(0,num(cloud.completedTasks)));
    return {source:'cloud',total,completed,pending:Math.max(0,num(cloud.pendingTasks)||total-completed),running:Math.max(0,num(cloud.runningTasks)),paused:Math.max(0,num(cloud.pausedTasks)),overdue:Math.max(0,num(cloud.overdueTasks)),totalMinutes:Math.max(0,num(cloud.totalStudyMinutes)),weekMinutes:Math.max(0,num(cloud.weekMinutes)),streak:Math.max(0,num(cloud.currentStreak)),accuracy:Math.max(0,Math.min(100,num(cloud.aiScore))),progress:total?Math.round(completed/total*100):0,tasksToday:Math.max(0,num(cloud.tasksToday)),completedToday:Math.max(0,num(cloud.completedToday)),evaluated:Math.max(0,num(cloud.evaluatedTasks)),byDay:obj(cloud.byDay)};
  }
  function stats(){
    const store=window.NEXZOTaskStore;
    if(!store?.stats)return cloudStats();
    const task=obj(store.stats()),tasks=store.getAll?.()||[],today=todayKey();
    const scheduledToday=tasks.filter(task=>dateKey(task.scheduledDate||task.deadlineMs||task.deadline||task.createdAtMs)===today);
    const completedToday=tasks.filter(task=>(task.completed||String(task.status).toLowerCase()==='completed')&&dateKey(task.completedAtMs||task.completedAt||task.updatedAtMs)===today);
    const evaluated=tasks.filter(task=>{const raw=task.score??task.aiScore??task.evalScore??task.evaluation?.score;const hasScore=raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(Number(raw));return hasScore&&Boolean(task.evaluatedAtMs||task.submittedAtMs||task.evaluationMode||task.evaluationSource||task.submissionLocked||task.evaluation);}).length;
    const streakSummary=obj(window.NEXZOStreakSystem?.summary?.());
    const streak=Math.max(0,num(streakSummary.studyStreak),num(task.streak));
    const total=Math.max(0,num(task.total)),completed=Math.min(total,Math.max(0,num(task.completed)));
    return Object.freeze({
      source:'task-store-v42',total,completed,pending:Math.max(0,num(task.pending)||total-completed),
      running:Math.max(0,num(task.running)),paused:Math.max(0,num(task.paused)),overdue:Math.max(0,num(task.overdue)),
      totalMinutes:Math.max(0,num(task.totalMinutes)),weekMinutes:Math.max(0,num(task.weekMinutes)),
      streak,accuracy:Math.max(0,Math.min(100,num(task.accuracy))),progress:total?Math.round(completed/total*100):0,
      tasksToday:scheduledToday.length,completedToday:completedToday.length,evaluated,byDay:obj(task.byDay)
    });
  }
  function level(){const p=profile();return window.NEXZOLevelSystem?.resolve?.(p.xp)||{level:1,rank:'Starter',pct:0,xp:0};}
  function snapshot(){const p=profile(),s=stats(),l=level();return Object.freeze({version:44,profile:p,stats:s,level:l,updatedAtMs:Date.now()});}
  window.NEXZOStateAuthority=Object.freeze({version:44,profile,stats,level,snapshot,prefer,num,stamp,dateKey});
})();
