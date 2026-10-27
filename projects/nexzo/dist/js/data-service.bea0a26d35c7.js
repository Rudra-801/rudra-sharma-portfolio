/* NEXZO Canonical Data Service v31
   Firestore owns tasks, profile and stats. localStorage is compatibility cache only.
*/
(function () {
  'use strict';
  if (window.__NEXZO_DATA_SERVICE_V31__) return;
  window.__NEXZO_DATA_SERVICE_V31__ = true;


  const TASK_KEYS = [
    'nexzo_tasks_v2','nexzo_planner_tasks_v6','nexzo_planner_tasks_v5','nexzo_planner_tasks_v4','nexzoPlannerSeparateTasks',
    'nexzoTasks','nexzoUnifiedTasks','nexzoTasksV3','nexzoPlannerTasks','plannerTasks','tasks'
  ];
  const PROFILE_KEYS = ['nexzoProfileEditableV3','nexzoProfileV3'];
  const CACHE_OWNER = 'nexzo_canonical_cache_owner';
  const MIGRATION_KEY = 'nexzo_canonical_migration_v29';

  let auth, db, fs, user = null;
  let unsubTasks = null, unsubProfile = null, unsubStats = null, unsubSettings = null;
  let cloudTasks = [], cloudProfile = {}, cloudStats = {}, cloudSettings = {};
  let lastLocalTaskSignature = '', lastProfileSignature = '';
  let taskWriteTimer = null, profileWriteTimer = null, statsWriteTimer = null;
  let applyingCloud = false, cloudReady = false;
  let allowLocalMigrationForUser = false;

  const parse = (raw, fallback) => {
    try { const value = JSON.parse(raw); return value ?? fallback; } catch (_) { return fallback; }
  };
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const clone = value => JSON.parse(JSON.stringify(value));
  const stable = value => JSON.stringify(value, Object.keys(value || {}).sort());

  function normalizeDate(value) {
    if (!value) return null;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  function taskId(task, index = 0) {
    const existing = task?.id || task?._id || task?.taskId;
    if (existing) return String(existing);
    const seed = `${task?.title || task?.name || 'task'}|${task?.subject || ''}|${task?.createdAt || task?.date || ''}|${index}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    return `legacy_${Math.abs(hash)}`;
  }

  function normalizeTask(task, index = 0) {
    const statusRaw = String(task?.status || task?.state || task?.taskStatus || '').toLowerCase();
    const completed = Boolean(
      task?.completed === true || task?.done === true || task?.isCompleted === true ||
      /completed|complete|done|verified|finished|approved/.test(statusRaw) ||
      num(task?.progress) >= 100 || num(task?.percent) >= 100
    );
    const status = completed ? 'completed' : (/overdue/.test(statusRaw) ? 'overdue' : (/paused?|pause/.test(statusRaw) ? 'paused' : (task?.running || /progress|active|started|ongoing/.test(statusRaw) ? 'in-progress' : 'pending')));
    const elapsedMs = Math.max(0, num(task?.elapsed)) + (task?.running && num(task?.lastStarted) ? Math.max(0, Date.now() - num(task.lastStarted)) : 0);
    const actualMinutes = Math.max(
      num(task?.actualMinutes), num(task?.elapsedMinutes), num(task?.timeSpentMinutes),
      num(task?.studyMinutes), num(task?.minutes), elapsedMs / 60000
    );
    const plannedHours = Math.max(num(task?.hours), num(task?.dailyHours), num(task?.studyHours));
    const durationDays = Math.max(1, num(task?.durationDays), num(task?.duration), 1);
    const plannedMinutes = Math.round(plannedHours * 60 * durationDays);
    return {
      ...task,
      id: taskId(task, index),
      title: String(task?.title || task?.name || task?.taskName || 'Study Task').slice(0, 160),
      subject: String(task?.subject || task?.track || 'General').slice(0, 80),
      taskType: String(task?.taskType || task?.type || 'Study').slice(0, 60),
      difficulty: String(task?.difficulty || task?.level || 'Beginner').slice(0, 40),
      status,
      completed,
      progress: completed ? 100 : Math.max(0, Math.min(99, num(task?.progress) || num(task?.percent) || 0)),
      actualMinutes: Math.round(actualMinutes),
      plannedMinutes,
      createdAtMs: normalizeDate(task?.createdAt) || num(task?.createdAtMs) || normalizeDate(task?.date) || Date.now(),
      updatedAtServerMs: normalizeDate(task?.updatedAt) || num(task?.updatedAtServerMs) || 0,
      localRevision: Math.max(0,num(task?.localRevision)),
      updatedAtMs: num(task?.updatedAtMs) || normalizeDate(task?.updatedAt) || Date.now(),
      completedAtMs: completed ? (num(task?.completedAtMs) || normalizeDate(task?.completedAt) || normalizeDate(task?.updatedAt) || Date.now()) : null,
      deadlineMs: num(task?.deadlineMs) || normalizeDate(task?.deadline) || normalizeDate(task?.dueDate) || null
    };
  }

  function taskArrayScore(arr) {
    if (!Array.isArray(arr)) return -1;
    return arr.length * 100 + arr.reduce((sum, task) => sum + (task && typeof task === 'object' ? Object.keys(task).length : 0), 0);
  }

  function bestLocalTasks() {
    // Merge every legacy task array instead of trusting one page-specific key.
    // This preserves all existing tasks during the one-time migration.
    const dedup = new Map();
    for (const key of TASK_KEYS) {
      const arr = parse(localStorage.getItem(key) || '[]', []);
      if (!Array.isArray(arr)) continue;
      arr.map(normalizeTask).forEach(task => {
        const previous = dedup.get(task.id);
        if (!previous || num(task.updatedAtMs) >= num(previous.updatedAtMs)) dedup.set(task.id, task);
      });
    }
    return [...dedup.values()].sort((a,b) => num(b.createdAtMs) - num(a.createdAtMs));
  }

  function bestLocalProfile() {
    const scoped = window.NEXZOSharedState?.profile?.() || {};
    let out = scoped && typeof scoped === 'object' ? { ...scoped } : {};
    for (const key of PROFILE_KEYS) {
      const value = parse(localStorage.getItem(key) || '{}', {});
      if (!value || typeof value !== 'object') continue;
      const valueTime = num(value.serverUpdatedAtMs || value.updatedAtMs);
      const outTime = num(out.serverUpdatedAtMs || out.updatedAtMs);
      if (!Object.keys(out).length || valueTime > outTime) out = { ...out, ...value };
    }
    const legacyUser = parse(localStorage.getItem('nexzo_user') || '{}', {});
    const xp = Math.max(0, num(out.xp));
    const level = window.NEXZOLevelSystem?.resolve?.(xp)?.level || 1;
    return {
      ...out,
      name: out.name || legacyUser.name || user?.displayName || user?.email?.split('@')[0] || 'Student',
      email: out.email || user?.email || legacyUser.email || '',
      photoURL: out.photoURL || out.avatar || out.photo || user?.photoURL || '',
      xp,
      level,
      studyMinutes: Math.max(0, num(out.studyMinutes)),
      streak: Math.max(0, num(out.streak)),
      aiScore: Math.max(0, num(out.aiScore))
    };
  }

  function applyTaskCache(tasks) {
    applyingCloud = true;
    window.__NEXZO_SUPPRESS_CLOUD_WRITES__ = true;
    try {
      const value = JSON.stringify(tasks.map(task => ({ ...task })));
      TASK_KEYS.forEach(key => localStorage.setItem(key, value));
      lastLocalTaskSignature = taskSignature(tasks);
    } finally {
      window.__NEXZO_SUPPRESS_CLOUD_WRITES__ = false;
      applyingCloud = false;
    }
    window.dispatchEvent(new CustomEvent('nexzo:tasks-updated', { detail: { source: 'firestore', tasks } }));
  }

  function applyProfileCache(profile) {
    applyingCloud = true;
    window.__NEXZO_SUPPRESS_CLOUD_WRITES__ = true;
    try {
      // Never let an older/empty cloud profile erase a valid local avatar.
      const local = bestLocalProfile();
      const cloud = profile && typeof profile === 'object' ? profile : {};
      const preservedPhoto = cloud.photoURL || cloud.avatar || cloud.photo || local.photoURL || local.avatar || local.photo || localStorage.getItem('profilePhoto') || localStorage.getItem('profileImage') || user?.photoURL || '';
      const cloudXp = Number.isFinite(Number(cloud.xp)) ? Math.max(0, Number(cloud.xp)) : 0;
      const merged = {
        ...local,
        ...cloud,
        xp: cloudXp,
        level: window.NEXZOLevelSystem?.resolve?.(cloudXp)?.level || 1,
        studyMinutes: Number.isFinite(Number(cloud.studyMinutes)) ? Math.max(0, Number(cloud.studyMinutes)) : 0,
        streak: Number.isFinite(Number(cloud.streak)) ? Math.max(0, Number(cloud.streak)) : 0,
        aiScore: Number.isFinite(Number(cloud.aiScore)) ? Math.max(0, Number(cloud.aiScore)) : 0,
        photoURL: preservedPhoto,
        avatar: preservedPhoto,
        photo: preservedPhoto
      };
      const value = JSON.stringify(merged);
      PROFILE_KEYS.forEach(key => localStorage.setItem(key, value));
      if (preservedPhoto) {
        localStorage.setItem('profilePhoto', preservedPhoto);
        localStorage.setItem('profileImage', preservedPhoto);
      }
      cloudProfile = merged;
      lastProfileSignature = profileSignature(merged);
    } finally {
      window.__NEXZO_SUPPRESS_CLOUD_WRITES__ = false;
      applyingCloud = false;
    }
    window.dispatchEvent(new CustomEvent('nexzo:profile-updated', { detail: { source: 'firestore', profile } }));
  }

  function taskSignature(tasks) {
    return JSON.stringify((tasks || []).map(t => [t.id, t.updatedAtMs, t.status, t.progress, t.actualMinutes, t.completedAtMs]).sort());
  }
  function profileSignature(profile) {
    if (!profile) return '';
    return JSON.stringify([
      profile.name, profile.email, profile.photoURL || profile.avatar || '', num(profile.xp), num(profile.level),
      num(profile.studyMinutes), num(profile.streak), num(profile.aiScore), profile.updatedAtMs || 0
    ]);
  }

  function formatMinutes(minutes) {
    const total = Math.max(0, Math.round(num(minutes)));
    const h = Math.floor(total / 60), m = total % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  function computeStats(tasks, profile, previous = {}) {
    const localProgress = {
      ...parse(localStorage.getItem('nexzoPremiumProgressV4') || '{}', {}),
      ...parse(localStorage.getItem('nexzoGamification') || '{}', {}),
      ...parse(localStorage.getItem('nexzo_gamification') || '{}', {})
    };
    const authority=window.NEXZOMetricAuthority;
    const choose=(items,options)=>{
      if(authority?.choose) return authority.choose(items,options);
      // Deterministic fail-safe: preserve declared source priority and freshness; never select the largest value.
      const valid=(items||[]).filter(item=>item&&item.enabled!==false&&Number.isFinite(Number(item.value)));
      valid.sort((a,b)=>(num(b.priority)-num(a.priority))||(num(b.updatedAtMs)-num(a.updatedAtMs)));
      const fallback=num(options?.fallback);
      const value=valid.length?num(valid[0].value):fallback;
      return Math.min(options?.max??Number.POSITIVE_INFINITY,Math.max(options?.min??0,value));
    };
    const visibleTasks = tasks.filter(task => !task.system && !task.isFocusSession);
    const completed = visibleTasks.filter(task => task.completed || task.status === 'completed');
    const localPlannerTasks = bestLocalTasks();
    const taskMinutes = list => list.reduce((sum, task) => {
      const elapsedMs = Math.max(0, num(task?.elapsed)) + (task?.running && num(task?.lastStarted) ? Math.max(0, Date.now() - num(task.lastStarted)) : 0);
      const exact = Math.max(num(task?.actualMinutes), num(task?.elapsedMinutes), num(task?.timeSpentMinutes), num(task?.studyMinutes), elapsedMs / 60000);
      return sum + Math.max(0, exact);
    }, 0);
    const cloudMinutes=taskMinutes(tasks), localTaskMinutes=taskMinutes(localPlannerTasks);
    const profileUpdated=num(profile?.serverUpdatedAtMs||profile?.updatedAtMs);
    const localUpdated=num(localProgress.updatedAtMs);
    const previousUpdated=num(previous?.updatedAtMs);
    const totalStudyMinutes=Math.round(choose([
      {value:cloudMinutes,priority:100,updatedAtMs:Date.now(),enabled:visibleTasks.length>0},
      {value:localTaskMinutes,priority:90,updatedAtMs:Date.now(),enabled:localPlannerTasks.length>0},
      {value:num(profile?.studyMinutes),priority:70,updatedAtMs:profileUpdated,enabled:Boolean(profileUpdated||profile?.studyMinutes)},
      {value:num(localProgress.studyMinutes),priority:50,updatedAtMs:localUpdated,enabled:Boolean(localUpdated||localProgress.studyMinutes)},
      {value:num(previous?.totalStudyMinutes),priority:10,updatedAtMs:previousUpdated,enabled:Boolean(previousUpdated)}
    ],{fallback:0,min:0}));
    const activeDates = [...new Set(completed.map(t => t.completedAtMs).filter(Boolean).map(ms => {
      const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }))];
    let derivedStreak = 0;
    const cursor = new Date(); cursor.setHours(0,0,0,0);
    for (let i=0; i<366; i++) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-${String(cursor.getDate()).padStart(2,'0')}`;
      if (activeDates.includes(key)) { derivedStreak++; cursor.setDate(cursor.getDate()-1); continue; }
      if (i === 0) { cursor.setDate(cursor.getDate()-1); continue; }
      break;
    }
    const aiScores = completed.map(t => { const raw=Math.max(num(t.aiScore),num(t.score),num(t.evaluation?.score)); return raw<=10?raw*10:raw; }).filter(v => v > 0);
    const evaluatedAiScore=aiScores.length?Math.round(aiScores.reduce((a,b)=>a+b,0)/aiScores.length):0;
    const aiScore=Math.round(choose([
      {value:evaluatedAiScore,priority:100,updatedAtMs:Date.now(),enabled:aiScores.length>0},
      {value:num(profile?.aiScore),priority:70,updatedAtMs:profileUpdated,enabled:Boolean(profileUpdated||profile?.aiScore)},
      {value:num(previous?.aiScore),priority:10,updatedAtMs:previousUpdated,enabled:Boolean(previousUpdated)}
    ],{fallback:0,min:0,max:100}));
    const canonicalStreak=window.NEXZOStreakSystem?.summary?.()||{};
    const currentStreak=Math.max(0,Math.round(Number(canonicalStreak.studyStreak)||derivedStreak||0));
    const rewardSummary=window.NEXZOGamificationEngine?.summary?.()||{};
    const rewardXP=num(rewardSummary.totalXP);
    const xp=Math.round(choose([
      {value:rewardXP,priority:120,updatedAtMs:Date.now(),enabled:rewardXP>0},
      {value:num(profile?.xp),priority:100,updatedAtMs:profileUpdated,enabled:Boolean(profileUpdated||profile?.xp)},
      {value:num(localProgress.xp),priority:50,updatedAtMs:localUpdated,enabled:Boolean(localUpdated||localProgress.xp)},
      {value:num(previous?.xp),priority:10,updatedAtMs:previousUpdated,enabled:Boolean(previousUpdated)}
    ],{fallback:0,min:0}));
    const level=window.NEXZOLevelSystem?.resolve?.(xp)?.level||1;
    const progress = visibleTasks.length ? Math.round(completed.length / visibleTasks.length * 100) : 0;
    return {
      totalTasks: visibleTasks.length,
      completedTasks: completed.length,
      pendingTasks: Math.max(0, visibleTasks.length - completed.length),
      tasksToday: visibleTasks.filter(t => { const d = new Date(t.deadlineMs || t.createdAtMs); const now = new Date(); return d.toDateString() === now.toDateString(); }).length,
      totalStudyMinutes,
      studyTimeLabel: formatMinutes(totalStudyMinutes),
      currentStreak,
      bestStreak:Math.max(currentStreak,Number(canonicalStreak.bestStudyStreak)||0),
      aiScore,
      overallProgress: progress,
      xp,
      level,
      authorityVersion:41,
      updatedAtMs: Date.now()
    };
  }

  async function migrateIfNeeded() {
    if (!user) return;
    const marker = `${MIGRATION_KEY}:${user.uid}`;
    const tasksCol = fs.collection(db, 'users', user.uid, 'tasks');
    const taskSnap = await fs.getDocs(tasksCol);
    if (taskSnap.empty && allowLocalMigrationForUser) {
      const localTasks = bestLocalTasks();
      if (localTasks.length) {
        for(let offset=0;offset<localTasks.length;offset+=400){
          const batch=fs.writeBatch(db);
          localTasks.slice(offset,offset+400).forEach(task=>batch.set(fs.doc(tasksCol,task.id),{
            ...task,uid:user.uid,createdAt:fs.serverTimestamp(),updatedAt:fs.serverTimestamp()
          },{merge:true}));
          await batch.commit();
        }
      }
    }

    const profileRef = fs.doc(db, 'users', user.uid, 'profile', 'main');
    const profileSnap = await fs.getDoc(profileRef);
    if (!profileSnap.exists()) {
      const local = allowLocalMigrationForUser ? bestLocalProfile() : {};
      const safeProfile = {
        uid: user.uid,
        name: local.name || user.displayName || user.email?.split('@')[0] || 'Student',
        email: user.email || local.email || '',
        photoURL: local.photoURL || local.avatar || local.photo || user.photoURL || '',
        avatar: local.avatar || local.photoURL || local.photo || user.photoURL || '',
        bio: local.bio || '', username: local.username || '', country: local.country || '', role: local.role || '', interests: Array.isArray(local.interests) ? local.interests : [],
        xp: 0, level: 1, studyMinutes: 0, streak: 0, aiScore: 0
      };
      await fs.setDoc(profileRef, { ...safeProfile, createdAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp(), updatedAtMs: Date.now() }, { merge: true });
    }
    localStorage.setItem(marker, '1');
  }

  async function writeTasks(tasks, options = {}) {
    if (!user || applyingCloud || window.__NEXZO_LOGOUT_IN_PROGRESS__) return;
    const allowDelete = false; // Tasks are immutable records; archive/complete instead of deleting.
    const normalized = tasks.map(normalizeTask);
    const cloudMap = new Map(cloudTasks.map(t => [t.id, t]));
    const localMap = new Map(normalized.map(t => [t.id, t]));
    const operations=[];
    for (const task of normalized) {
      const existing=cloudMap.get(task.id);
      if (!existing || taskSignature([existing]) !== taskSignature([task])) operations.push({type:'set',ref:fs.doc(db,'users',user.uid,'tasks',task.id),data:{...task,uid:user.uid,updatedAt:fs.serverTimestamp(),updatedAtMs:Date.now()}});
    }
    if (allowDelete) for (const existing of cloudTasks) if (!localMap.has(existing.id)) operations.push({type:'delete',ref:fs.doc(db,'users',user.uid,'tasks',existing.id)});
    for(let offset=0;offset<operations.length;offset+=400){
      const batch=fs.writeBatch(db);
      operations.slice(offset,offset+400).forEach(op=>op.type==='delete'?batch.delete(op.ref):batch.set(op.ref,op.data,{merge:true}));
      await batch.commit();
    }
    if(operations.length)localStorage.setItem('nexzo_last_sync',new Date().toISOString());
  }

  async function writeProfile(profile) {
    if (!user || applyingCloud) return;
    await fs.setDoc(fs.doc(db, 'users', user.uid, 'profile', 'main'), {
      ...profile, uid: user.uid, updatedAt: fs.serverTimestamp(), updatedAtMs: Date.now()
    }, { merge: true });
  }

  async function writeStats() {
    if (!user) return;
    const stats = computeStats(cloudTasks, cloudProfile, cloudStats);
    await fs.setDoc(fs.doc(db, 'users', user.uid, 'stats', 'main'), {
      ...stats, uid: user.uid, updatedAt: fs.serverTimestamp()
    }, { merge: true });
  }

  function queueTaskWrite() {
    if (!user || applyingCloud || window.__NEXZO_LOGOUT_IN_PROGRESS__) return;
    clearTimeout(taskWriteTimer);
    taskWriteTimer = setTimeout(async () => {
      const local = bestLocalTasks();
      const sig = taskSignature(local);
      if (sig === lastLocalTaskSignature) return;
      lastLocalTaskSignature = sig;
      try { await writeTasks(local, { allowDelete: false }); } catch (error) { console.error('[NEXZO Data] Task save failed:', error); }
    }, 500);
  }

  function queueProfileWrite() {
    if (!user || applyingCloud || window.__NEXZO_LOGOUT_IN_PROGRESS__) return;
    clearTimeout(profileWriteTimer);
    profileWriteTimer = setTimeout(async () => {
      const local = bestLocalProfile();
      const sig = profileSignature(local);
      if (sig === lastProfileSignature) return;
      lastProfileSignature = sig;
      try { await writeProfile(local); } catch (error) { console.error('[NEXZO Data] Profile save failed:', error); }
    }, 600);
  }

  function queueStatsWrite() {
    clearTimeout(statsWriteTimer);
    statsWriteTimer = setTimeout(() => writeStats().catch(error => console.error('[NEXZO Data] Stats save failed:', error)), 400);
  }

  function renderStats(stats) {
    if (!stats) return;
    // DataService owns cloud persistence, not page DOM. Page controllers render the
    // live NEXZOStateAuthority snapshot, preventing last-event-wins metric races.
    window.NEXZO_CLOUD_STATS = Object.freeze({ ...stats });
    window.dispatchEvent(new CustomEvent('nexzo:stats-updated', { detail: stats }));
  }

  function stopListeners() {
    [unsubTasks, unsubProfile, unsubStats, unsubSettings].forEach(fn => { try { fn?.(); } catch (_) {} });
    unsubTasks = unsubProfile = unsubStats = unsubSettings = null;
  }

  async function startForUser(nextUser) {
    stopListeners();
    cloudReady = false;
    user = nextUser || null;
    if (!user) { window.dispatchEvent(new CustomEvent('nexzo:data-ready',{detail:{uid:'local',signedIn:false,phase:'signed-out'}})); return; }
    window.dispatchEvent(new CustomEvent('nexzo:auth-ready',{detail:{uid:user.uid,signedIn:true,user}}));
    window.dispatchEvent(new CustomEvent('nexzo:data-ready',{detail:{uid:user.uid,signedIn:true,phase:'auth'}}));

    const previousOwner = localStorage.getItem(CACHE_OWNER);
    const legacyUser = parse(localStorage.getItem('nexzo_user') || '{}', {});
    const legacyUid = String(legacyUser?.uid || '');
    allowLocalMigrationForUser = previousOwner === user.uid || (!previousOwner && legacyUid === user.uid);
    const foreignOrUnknownCache = (previousOwner && previousOwner !== user.uid) || (!previousOwner && legacyUid && legacyUid !== user.uid);
    if (foreignOrUnknownCache) {
      applyingCloud = true;
      window.__NEXZO_SUPPRESS_CLOUD_WRITES__ = true;
      try { TASK_KEYS.forEach(key => localStorage.removeItem(key)); PROFILE_KEYS.forEach(key => localStorage.removeItem(key)); }
      finally { window.__NEXZO_SUPPRESS_CLOUD_WRITES__ = false; applyingCloud = false; }
    }
    localStorage.setItem(CACHE_OWNER, user.uid);

    await migrateIfNeeded();

    unsubTasks = fs.onSnapshot(fs.query(fs.collection(db, 'users', user.uid, 'tasks'), fs.orderBy('createdAtMs', 'desc')), snap => {
      cloudTasks = snap.docs.map(doc => normalizeTask({ id: doc.id, ...doc.data() }));
      cloudReady = true;
      applyTaskCache(cloudTasks);
      window.dispatchEvent(new CustomEvent('nexzo:data-ready',{detail:{uid:user.uid,signedIn:true,phase:'tasks',tasks:clone(cloudTasks)}}));
      queueStatsWrite();
    }, error => console.error('[NEXZO Data] Task listener failed:', error));

    unsubProfile = fs.onSnapshot(fs.doc(db, 'users', user.uid, 'profile', 'main'), snap => {
      cloudProfile = snap.exists() ? { ...snap.data() } : { uid:user.uid, name:user.displayName||user.email?.split('@')[0]||'Student', email:user.email||'', photoURL:user.photoURL||'', xp:0, level:1, studyMinutes:0, streak:0, aiScore:0 };
      applyProfileCache(cloudProfile);
      queueStatsWrite();
    }, error => console.error('[NEXZO Data] Profile listener failed:', error));

    unsubStats = fs.onSnapshot(fs.doc(db, 'users', user.uid, 'stats', 'main'), snap => {
      cloudStats = snap.exists() ? { ...snap.data() } : computeStats(cloudTasks, cloudProfile, {});
      renderStats(cloudStats);
    }, error => console.error('[NEXZO Data] Stats listener failed:', error));

    unsubSettings = fs.onSnapshot(fs.doc(db, 'users', user.uid, 'settings', 'main'), snap => {
      if(!snap.exists()) return;
      cloudSettings = { ...snap.data() };
      const clean = { ...cloudSettings }; delete clean.uid; delete clean.updatedAt; delete clean.updatedAtMs;
      localStorage.setItem('nexzoSettingsV3', JSON.stringify(clean));
      localStorage.setItem('nexzo_settings', JSON.stringify(clean));
      window.dispatchEvent(new CustomEvent('nexzo:settings-cloud', { detail: clean }));
    }, error => console.error('[NEXZO Data] Settings listener failed:', error));
  }

  async function flush() {
    if (!user) return;
    clearTimeout(taskWriteTimer); clearTimeout(profileWriteTimer); clearTimeout(statsWriteTimer);
    await writeTasks(bestLocalTasks(), { allowDelete: false });
    await writeProfile(bestLocalProfile());
    await writeStats();
  }

  async function boot() {
    try {
      const context = await window.NEXZOFirebase.getContext({ auth:true, firestore:true });
      auth=context.auth;db=context.db;fs=context.firestoreTools;
      context.authTools.onAuthStateChanged(auth,startForUser);

      ['nexzo:tasks-updated','nexzo:planner-updated'].forEach(event => window.addEventListener(event, e => {
        if(e?.detail?.source === 'firestore' || e?.detail?.source === 'task-store-cloud') return;
        queueTaskWrite();
      }));
      window.addEventListener('nexzo:profile-updated', e => { if(e?.detail?.source !== 'firestore') queueProfileWrite(); });
      window.addEventListener('storage', event => {
        if (TASK_KEYS.includes(event.key)) queueTaskWrite();
        if (PROFILE_KEYS.includes(event.key)) queueProfileWrite();
      });
      // No polling: periodic local-cache writes could overwrite newer cloud data.
      // Writes happen only after explicit application events or cross-tab storage events.

      window.NEXZODataService = Object.freeze({
        flush,
        getUser: () => user,
        getTasks: () => clone(cloudTasks),
        getProfile: () => clone(cloudProfile),
        getStats: () => clone(cloudStats),
        getSettings: () => clone(cloudSettings),
        isReady: () => Boolean(user && cloudReady),
        getStatus: () => ({ signedIn:Boolean(user), cloudReady:Boolean(cloudReady), uid:user?.uid||'', lastSync:localStorage.getItem('nexzo_last_sync')||'' }),
        saveTasks: tasks => writeTasks(Array.isArray(tasks) ? tasks : [], { allowDelete: false }),
        saveProfile: profile => writeProfile(profile || {}),
        saveSettings: async settings => {
          cloudSettings={...(settings||{})};
          localStorage.setItem('nexzo_settings_cloud_pending', JSON.stringify({settings:cloudSettings,updatedAtMs:Date.now()}));
          if(!user) return {saved:'local'};
          try{
            await fs.setDoc(fs.doc(db,'users',user.uid,'settings','main'),{...(settings||{}),uid:user.uid,updatedAt:fs.serverTimestamp(),updatedAtMs:Date.now()},{merge:true});
            localStorage.removeItem('nexzo_settings_cloud_pending');
            return {saved:'cloud'};
          }catch(error){
            if(/permission-denied|missing or insufficient permissions/i.test(String(error?.code||error?.message||error)))return {saved:'local',reason:'permission'};
            throw error;
          }
        }
      });
    } catch (error) {
      console.error('[NEXZO Data] Firebase initialization failed:', error);
    }
  }

  boot();
})();
