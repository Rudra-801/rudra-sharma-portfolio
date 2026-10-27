/* NEXZO Living Pet V4
 *
 * This runtime preserves the V4 brain behind a lazy Three.js GLTF adapter.  The current
 * original Nyro GLB provides genuine skinned geometry and animation clips.
 */
(() => {
  'use strict';
  if (window.__NEXZO_LIVING_PET_V4__) return;
  if (document.body?.dataset?.page !== 'ai') return;

  const STATES = Object.freeze([
    'BOOT', 'IDLE', 'CURIOUS', 'LOOKING', 'BLINK', 'THINKING', 'WORKING',
    'STUDYING', 'HAPPY', 'EXCITED', 'CELEBRATE', 'PLAY', 'EAT', 'SLEEPY',
    'SLEEPING', 'WAKE', 'SAD', 'LOW_ENERGY'
  ]);
  const PRIORITY = Object.freeze({
    BOOT: 100, CELEBRATE: 90, WAKE: 85, SLEEPING: 80, SLEEPY: 75,
    THINKING: 70, WORKING: 68, STUDYING: 68, EXCITED: 64, HAPPY: 60,
    CURIOUS: 55, LOOKING: 45, BLINK: 40, EAT: 38, PLAY: 36, SAD: 34,
    LOW_ENERGY: 32, IDLE: 10
  });
  const MOOD_FOR = Object.freeze({
    BOOT: 'curious', IDLE: 'calm', CURIOUS: 'curious', LOOKING: 'curious',
    BLINK: 'calm', THINKING: 'focused', WORKING: 'focused', STUDYING: 'focused',
    HAPPY: 'happy', EXCITED: 'excited', CELEBRATE: 'excited', PLAY: 'playful',
    EAT: 'content', SLEEPY: 'sleepy', SLEEPING: 'sleeping', WAKE: 'curious',
    SAD: 'supportive', LOW_ENERGY: 'tired'
  });
  const LABEL_FOR = Object.freeze({
    BOOT: 'Waking up', IDLE: 'Ready', CURIOUS: 'Curious', LOOKING: 'Looking around',
    BLINK: 'Blinking', THINKING: 'Thinking', WORKING: 'Working', STUDYING: 'Studying',
    HAPPY: 'Happy', EXCITED: 'Excited', CELEBRATE: 'Celebrating', PLAY: 'Playing',
    EAT: 'Refuelling', SLEEPY: 'Sleepy', SLEEPING: 'Resting', WAKE: 'Welcome back',
    SAD: 'Here with you', LOW_ENERGY: 'Needs a break'
  });
  const TRANSIENT = new Set(['BOOT', 'BLINK', 'HAPPY', 'EXCITED', 'CELEBRATE', 'PLAY', 'EAT', 'WAKE', 'LOOKING']);
  const STORAGE_PREFIX = 'nexzo.pet.living.v4:';
  const V3_KEY = 'nexzo.pet.living.v1';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const now = () => Date.now();
  const authUser = () => window.NEXZOFirebaseUser || window.__NEXZO_AUTH_USER__ || null;
  const uid = () => authUser()?.uid || window.NEXZOSettings?.uid?.() || window.NEXZOSharedState?.currentUid?.() || 'guest';
  const keyFor = id => `${STORAGE_PREFIX}${id || 'guest'}`;

  const companion = document.getElementById('nexzoCompanion');
  const stage = companion?.querySelector('.pet-stage');
  if (!companion || !stage) return;
  const labels = {
    name: document.getElementById('activePetName'), mood: document.getElementById('petMood'),
    level: document.getElementById('activePetLevel'), xp: document.getElementById('activePetXp'),
    xpBar: document.getElementById('activePetXpBar'), presence: document.getElementById('petPresenceText'),
    speech: document.getElementById('companionText'), detail: document.getElementById('companionDetail')
  };
  let bus = new AbortController();
  const lifecycle = new AbortController();
  const runtime = { version: 4, model: null, renderer: null, state: 'BOOT', stateSince: now(), stateToken: 0,
    stateTimer: 0, blinkTimer: 0, idleTimer: 0, sleepTimer: 0, wakeTimer: 0, cloudTimer: 0, uid: uid(),
    enabled: true, disposed: false, activityAt: now(), lastPointerAt: 0, pointer: { x: 0, y: 0, near: false },
    pet: null, observer: null, rewardLedger: new Map() };

  const DEFAULT_PET = Object.freeze({
    schemaVersion: 4, petId: 'nyro', name: 'Nyro', personality: 'Curious', mood: 'calm',
    energy: 82, bond: 12, petXP: 0, petLevel: 1, lastInteraction: now(), lastActive: now(),
    selectedPet: 'nyro', unlockedPets: ['nyro']
  });
  function normalizePet(value = {}) {
    const next = { ...DEFAULT_PET, ...value };
    next.schemaVersion = 4;
    // V4 currently ships one genuine model. Keep persisted identity aligned
    // with that model so an older image-pet selection can never produce a
    // Mizu/Aeri label beside the Nyro GLB.
    next.petId = 'nyro';
    next.selectedPet = 'nyro';
    next.name = String(next.name || 'Nyro').slice(0, 40);
    next.personality = String(next.personality || 'Curious').slice(0, 40);
    next.mood = String(next.mood || 'calm').slice(0, 24);
    next.energy = clamp(finite(next.energy, 82), 0, 100);
    next.bond = clamp(finite(next.bond, 12), 0, 100);
    next.petXP = Math.max(0, Math.floor(finite(next.petXP, 0)));
    next.petLevel = clamp(Math.floor(finite(next.petLevel, Math.floor(next.petXP / 500) + 1)), 1, 100);
    next.lastInteraction = Math.max(0, finite(next.lastInteraction, now()));
    next.lastActive = Math.max(0, finite(next.lastActive, now()));
    next.unlockedPets = [...new Set((Array.isArray(next.unlockedPets) ? next.unlockedPets : ['nyro']).map(v => String(v).slice(0, 40)))];
    next.unlockedPets = ['nyro'];
    return next;
  }
  function readLocal(id) {
    try {
      const raw = localStorage.getItem(keyFor(id));
      if (raw) return normalizePet(JSON.parse(raw));
      if (id === 'guest') {
        const old = JSON.parse(localStorage.getItem(V3_KEY) || 'null');
        if (old) return normalizePet({ ...old, petId: old.petId || old.kind || 'nyro', selectedPet: old.selectedPet || old.kind || 'nyro' });
      }
    } catch (_) { /* corrupt local state is ignored, never fatal to the app */ }
    return normalizePet();
  }
  function saveLocal() {
    runtime.pet.lastActive = now();
    try {
      localStorage.setItem(keyFor(runtime.uid), JSON.stringify(runtime.pet));
      localStorage.setItem('nexzo.pet.kind', runtime.pet.selectedPet);
    } catch (_) { /* storage can be disabled */ }
  }
  function renderLabels() {
    const pet = runtime.pet;
    if (!pet) return;
    if (labels.name) labels.name.textContent = pet.name;
    if (labels.level) labels.level.textContent = `Pet Lv. ${pet.petLevel}`;
    if (labels.xp) labels.xp.textContent = `${pet.petXP.toLocaleString()} pet XP`;
    if (labels.xpBar) labels.xpBar.style.width = `${clamp((pet.petXP % 500) / 5, 0, 100)}%`;
    if (labels.mood) labels.mood.textContent = `${pet.personality} · ${LABEL_FOR[runtime.state] || 'Ready'}`;
    if (labels.presence) labels.presence.textContent = `${pet.name} · ${LABEL_FOR[runtime.state] || 'Ready'}`;
    if (labels.detail) labels.detail.textContent = `Energy ${Math.round(pet.energy)}% · Bond ${Math.round(pet.bond)}%`;
    companion.dataset.petState = runtime.state.toLowerCase();
    companion.dataset.livingState = runtime.state.toLowerCase();
    companion.dataset.petKind = 'nexy';
    stage.setAttribute('aria-label', 'Interact with Nyro');
    companion.dataset.petRuntime = 'v4';
    companion.dataset.petModel = runtime.model ? 'gltf' : 'loading';
    updatePetZoneStats();
  }
  function updatePetZoneStats() {
    const zone = document.getElementById('petZoneModal');
    if (!zone || !runtime.pet) return;
    let stats = zone.querySelector('#petV4Stats');
    if (!stats) {
      stats = document.createElement('div'); stats.id = 'petV4Stats'; stats.className = 'pet-v4-stats';
      stats.setAttribute('aria-live', 'polite');
      zone.querySelector('.pet-zone-preview')?.appendChild(stats);
    }
    const p = runtime.pet;
    stats.innerHTML = `<span><b>Mood</b><em>${String(p.mood)}</em></span><span><b>Energy</b><em>${Math.round(p.energy)}%</em></span><span><b>Bond</b><em>${Math.round(p.bond)}%</em></span><span><b>Pet XP</b><em>${p.petXP.toLocaleString()}</em></span>`;
  }

  function settings() { return window.NEXZOSettings?.get?.() || {}; }
  function applySettings() {
    const s = settings();
    setRuntimeEnabled(s.livingCompanion !== false);
    companion.dataset.petEnabled = String(runtime.enabled); companion.style.setProperty('display',runtime.enabled?'block':'none','important');
    companion.dataset.petMotion = s.petMotion || (s.motion === 'off' ? 'reduced' : s.motion === 'reduced' ? 'reduced' : 'full');
    companion.dataset.petReactions = String(s.petReactions !== false);
    renderLabels();
  }
  function reducedMotion() {
    const s = settings();
    return s.petMotion === 'reduced' || s.motion === 'reduced' || s.motion === 'off' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }
  function reactionsOn() { return settings().petReactions !== false && runtime.enabled; }

  class Real3DAdapter {
    constructor(host) { this.host=host;this.inner=null;this.loading=null;this.wanted=false;this.dead=false; }
    async start() {
      this.wanted=true;if(this.inner){this.inner.start();return;}if(this.loading)return;
      this.loading=import('../assets/pet/nyro/renderer.js?v=20260928').then(m=>m.createRenderer(this.host,runtime,reducedMotion)).then(renderer=>{
        if(this.dead||!this.wanted){renderer.dispose();return;}
        this.inner=renderer;runtime.model=renderer.evidence;renderLabels();renderer.start();
        const zone=document.getElementById('petZoneModal'), preview=zone?.querySelector('.pet-zone-preview');
        if(zone&&preview){
          const slot=document.createElement('div');slot.style.height='260px';preview.prepend(slot);
          const sync=()=>{const target=zone.hidden?this.host:slot;if(renderer.canvas.parentElement!==target)renderer.relocate(target);document.body.classList.toggle('pet-zone-open',!zone.hidden);};
          this.zoneObserver=new MutationObserver(sync);this.zoneObserver.observe(zone,{attributes:true,attributeFilter:['hidden']});sync();
          const pick=zone.querySelector('[data-zone-pet="nexy"]');if(pick)pick.innerHTML='<b>Nyro</b><small>3D companion · Preview</small>';
          const note=zone.querySelector('.pet-zone-list>p');if(note)note.textContent='Nyro is the only available 3D companion. Other companions are not yet implemented.';
          const actions=document.createElement('div');for(const [title,action] of [['Play','play'],['Feed','feed'],['Rest','rest']]){const b=document.createElement('button');b.type='button';b.textContent=title;b.addEventListener('click',()=>care(action),{signal:bus.signal});actions.append(b);}slot.after(actions);this.zoneExtras=[slot,actions];
        }
      }).catch(()=>{this.host.setAttribute('aria-label','3D companion unavailable on this device');}).finally(()=>{this.loading=null;});
    }
    stop(){this.wanted=false;this.inner?.stop();}
    dispose(){this.dead=true;this.wanted=false;this.zoneObserver?.disconnect();this.zoneExtras?.forEach(e=>e.remove());this.inner?.dispose();this.inner=null;}
  }

  function setSpeech(short, detail) {
    if (labels.speech && short) labels.speech.textContent = short;
    if (labels.detail && detail) labels.detail.textContent = detail;
  }
  function clearStateTimer() { clearTimeout(runtime.stateTimer); runtime.stateTimer = 0; }
  function transition(next, options = {}) {
    if (!STATES.includes(next) || runtime.disposed || !runtime.enabled) return false;
    if (next === 'IDLE' && runtime.pet && runtime.pet.energy < 20) next = 'LOW_ENERGY';
    const force = options.force === true;
    if (!force && next !== runtime.state && PRIORITY[next] < PRIORITY[runtime.state] && now() < runtime.stateSince + 700) return false;
    clearStateTimer(); runtime.stateToken += 1; runtime.state = next; runtime.stateSince = now();
    runtime.pet.mood = MOOD_FOR[next] || runtime.pet.mood; companion.dataset.livingState = next.toLowerCase(); renderLabels();
    if (options.speech) setSpeech(options.speech[0], options.speech[1]);
    const duration = options.duration ?? (TRANSIENT.has(next) ? (next === 'CELEBRATE' ? 2200 : 1000) : 0);
    if (duration > 0) { const token = runtime.stateToken; runtime.stateTimer = setTimeout(() => { if (token === runtime.stateToken && !runtime.disposed) transition('IDLE', { force: true }); }, duration); }
    return true;
  }
  function interaction(kind = 'tap') {
    runtime.activityAt = now(); runtime.pet.lastInteraction = now(); runtime.pet.energy = clamp(runtime.pet.energy + (kind === 'tap' ? 1 : 0), 0, 100); runtime.pet.bond = clamp(runtime.pet.bond + .4, 0, 100); saveLocal();
    if (runtime.state === 'SLEEPING' || runtime.state === 'SLEEPY') transition('WAKE', { force: true, speech: ['Welcome back', 'I noticed you returned.'] });
    else if (reactionsOn()) transition(kind === 'tap' ? 'CURIOUS' : 'HAPPY', { force: true, speech: ['I noticed that', `${runtime.pet.name} is with you.`] });
    scheduleSleep();
  }
  function reward(amount, mood = 'HAPPY', rewardKey = '') {
    if (!runtime.pet || !Number.isFinite(Number(amount))) return;
    if (rewardKey) {
      const issuedAt = runtime.rewardLedger.get(rewardKey) || 0;
      if (issuedAt && now() - issuedAt < 15 * 60 * 1000) return;
      runtime.rewardLedger.set(rewardKey, now());
      if (runtime.rewardLedger.size > 80) runtime.rewardLedger.delete(runtime.rewardLedger.keys().next().value);
    }
    runtime.pet.petXP += Math.max(0, Math.floor(Number(amount))); runtime.pet.petLevel = clamp(Math.floor(runtime.pet.petXP / 500) + 1, 1, 100); runtime.pet.bond = clamp(runtime.pet.bond + 1, 0, 100); saveLocal();
    if (reactionsOn()) transition(mood, { force: true }); else renderLabels(); queueCloud();
  }
  function onActivity() {
    const wasSleeping = runtime.state === 'SLEEPING' || runtime.state === 'SLEEPY'; runtime.activityAt = now();
    if (wasSleeping) transition('WAKE', { force: true }); scheduleSleep();
  }
  function scheduleBlink() {
    clearTimeout(runtime.blinkTimer); if (runtime.disposed || !runtime.enabled || document.hidden) return;
    runtime.blinkTimer = setTimeout(() => { if (!document.hidden && runtime.enabled && reactionsOn() && runtime.state !== 'SLEEPING') transition('BLINK', { force: true, duration: 180 }); scheduleBlink(); }, 3500 + Math.random() * 5200);
  }
  function scheduleAutonomy() {
    clearTimeout(runtime.idleTimer); if (runtime.disposed || !runtime.enabled || document.hidden) return;
    runtime.idleTimer = setTimeout(() => {
      if (!document.hidden && runtime.enabled && reactionsOn() && runtime.state === 'IDLE' && now() - runtime.activityAt > 5000) {
        const options = ['CURIOUS', 'LOOKING', 'LOOKING', 'IDLE']; transition(options[Math.floor(Math.random() * options.length)], { force: true, duration: 1400 });
      }
      scheduleAutonomy();
    }, 5200 + Math.random() * 6500);
  }
  function scheduleSleep() {
    clearTimeout(runtime.sleepTimer); if (runtime.disposed || !runtime.enabled || document.hidden) return;
    runtime.sleepTimer = setTimeout(() => { if (!document.hidden && runtime.enabled && now() - runtime.activityAt >= 8 * 60 * 1000) { transition('SLEEPY', { force: true, duration: 1600 }); clearTimeout(runtime.wakeTimer); runtime.wakeTimer = setTimeout(() => { if (!runtime.disposed && now() - runtime.activityAt >= 8 * 60 * 1000) transition('SLEEPING', { force: true }); }, 1700); } }, 8 * 60 * 1000);
  }
  function handleEvent(type, detail) {
    if (type === 'nexzo:assistant-thinking' || (type === 'nexzo:ai-status' && /thinking|connecting/i.test(String(detail?.state || detail?.status || '')))) return transition('THINKING', { force: true });
    if(type==='nexzo:ai-status' && /generating|answering|working/i.test(String(detail?.state||detail?.status||''))) return transition('WORKING',{force:true});
    if (type === 'nexzo:assistant-answer' || type === 'nexzo:ai-question-answered') return transition('HAPPY', { force: true });
    if (type === 'nexzo:study-start') return transition('STUDYING', { force: true });
    if (type === 'nexzo:study-complete' || type === 'nexzo:focus-complete') { reward(20, 'HAPPY', `study:${detail?.sessionId || detail?.id || Math.floor(now() / 10000)}`); return; }
    if (type === 'nexzo:quiz-pass' || (type === 'nexzo:academics-quiz' && finite(detail?.score, 0) >= 60)) { reward(25, 'CELEBRATE', `quiz:${detail?.attemptId || detail?.id || Math.floor(now() / 10000)}`); return; }
    if (type === 'nexzo:quiz-improve') { reward(20, 'EXCITED', `quiz-improve:${detail?.attemptId || detail?.id || Math.floor(now() / 10000)}`); return; }
    if (type === 'nexzo:task-complete' || type === 'nexzo:task-completed') { reward(15, 'CELEBRATE', `task:${detail?.taskId || detail?.id || Math.floor(now() / 10000)}`); return; }
    if (type === 'nexzo:achievement' || type === 'nexzo:streak') { reward(35, 'EXCITED', `${type}:${detail?.id || detail?.key || Math.floor(now() / 10000)}`); return; }
    if (type === 'nexzo:user-idle') { transition('SLEEPY', { force: true }); return; }
    if (type === 'nexzo:user-return') { onActivity(); return; }
    if (type === 'pet:celebrate') { transition('CELEBRATE', { force: true }); return; }
    if (type === 'nexzo:settings-changed') { applySettings(); return; }
    if (type === 'nexzo:auth-ready' || type === 'nexzo:auth-state-changed' || type === 'nexzo:user-signed-in') { switchUser(type === 'nexzo:auth-ready' && detail?.signedIn === false ? 'guest' : detail?.uid || uid()); }
  }
  function bindEvents() {
    const events = ['nexzo:assistant-thinking', 'nexzo:assistant-answer', 'nexzo:study-start', 'nexzo:study-complete', 'nexzo:quiz-pass', 'nexzo:quiz-improve', 'nexzo:task-complete', 'nexzo:task-completed', 'nexzo:achievement', 'nexzo:streak', 'nexzo:user-idle', 'nexzo:user-return', 'nexzo:ai-status', 'nexzo:ai-question-answered', 'nexzo:focus-complete', 'nexzo:academics-quiz', 'pet:celebrate', 'nexzo:settings-changed', 'nexzo:auth-ready', 'nexzo:auth-state-changed', 'nexzo:user-signed-in'];
    events.forEach(type => window.addEventListener(type, event => handleEvent(type, event.detail || {}), { signal: bus.signal }));
    window.addEventListener('pointermove', event => {
      const rect = stage.getBoundingClientRect(); const x = (event.clientX - (rect.left + rect.width / 2)) / Math.max(rect.width / 2, 1); const y = (event.clientY - (rect.top + rect.height / 2)) / Math.max(rect.height / 2, 1);
      const near = Math.abs(x) <= 1.5 && Math.abs(y) <= 1.5; runtime.pointer = { x: clamp(x, -1, 1), y: clamp(y, -1, 1), near }; runtime.lastPointerAt = now(); if (near) onActivity();
    }, { signal: bus.signal, passive: true });
    ['keydown', 'pointerdown', 'touchstart'].forEach(type => window.addEventListener(type, onActivity, { signal: bus.signal, passive: true }));
    stage.addEventListener('click', () => interaction('tap'), { signal: bus.signal });
    stage.addEventListener('touchstart', () => interaction('touch'), { signal: bus.signal, passive: true });
    companion.addEventListener('pet:celebrate', () => handleEvent('pet:celebrate', {}), { signal: bus.signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { stopRuntime(); } else if(runtime.enabled) { onActivity(); startRuntime(); } }, { signal: bus.signal });
    document.addEventListener('click', event => {
      const choice = event.target.closest?.('[data-pet-choice],[data-zone-pet]');
      if (!choice) return; const selected = choice.dataset.petChoice || choice.dataset.zonePet; if (!selected) return;
      if (selected !== 'nexy') return;
      runtime.pet.selectedPet = 'nyro'; runtime.pet.petId = 'nyro'; runtime.pet.unlockedPets = ['nyro']; saveLocal(); renderLabels(); queueCloud();
    }, { signal: bus.signal });
    window.addEventListener('nexzo:pet-care', event => care(event.detail?.action), { signal: bus.signal });
    window.addEventListener('nexzo:appearance-applied', applySettings, { signal: bus.signal });
  }
  function care(action) {
    if (!runtime.pet) return;
    if (action === 'feed') { runtime.pet.energy = clamp(runtime.pet.energy + 18, 0, 100); runtime.pet.mood = 'content'; transition('EAT', { force: true, duration: 900 }); }
    else if (action === 'play') { runtime.pet.energy = clamp(runtime.pet.energy - 5, 0, 100); runtime.pet.bond = clamp(runtime.pet.bond + 3, 0, 100); transition('PLAY', { force: true, duration: 1200 }); }
    else if (action === 'rest') { runtime.pet.energy = clamp(runtime.pet.energy + 8, 0, 100); transition('SLEEPY', { force: true, duration: 1300 }); }
    else if (action === 'info') { renderLabels(); }
    runtime.pet.lastInteraction = now(); saveLocal(); queueCloud(); renderLabels();
  }
  function startRuntime() {
    if (!runtime.enabled || runtime.disposed || document.hidden) return;
    runtime.renderer?.start();
    if (!runtime.blinkTimer) scheduleBlink();
    if (!runtime.idleTimer) scheduleAutonomy();
    if (!runtime.sleepTimer) scheduleSleep();
  }
  function stopRuntime() {
    runtime.renderer?.stop();
    clearTimeout(runtime.blinkTimer); clearTimeout(runtime.idleTimer); clearTimeout(runtime.sleepTimer); clearTimeout(runtime.wakeTimer);
    runtime.blinkTimer = runtime.idleTimer = runtime.sleepTimer = runtime.wakeTimer = 0;
  }
  function setRuntimeEnabled(enabled) {
    runtime.enabled = Boolean(enabled);
    companion.dataset.petEnabled = String(runtime.enabled); companion.style.setProperty('display',runtime.enabled?'block':'none','important');
    if (runtime.enabled) {
      if(bus.signal.aborted){bus=new AbortController();bindEvents();}
      if (!runtime.renderer || runtime.renderer.dead) runtime.renderer=new Real3DAdapter(stage);
      startRuntime();
    } else {
      stopRuntime();clearStateTimer();bus.abort();runtime.renderer?.dispose();
    }
  }
  function queueCloud() {
    clearTimeout(runtime.cloudTimer); if (runtime.uid === 'guest') return;
    runtime.cloudTimer = setTimeout(() => persistCloud(), 700);
  }
  async function persistCloud() {
    try {
      const context = await window.NEXZOFirebase?.getContext?.({ auth: true, firestore: true }); const user = context?.auth?.currentUser;
      if (!user || user.uid !== runtime.uid) return;
      const fs = context.firestoreTools, ref = fs.doc(context.db, 'users', user.uid, 'pet', 'main');
      await fs.setDoc(ref, { ...runtime.pet, uid: user.uid, schemaVersion: 4, updatedAtMs: now(), updatedAt: fs.serverTimestamp() }, { merge: true });
    } catch (_) { /* local state remains authoritative until cloud is available */ }
  }
  async function hydrateCloud() {
    try {
      const context = await window.NEXZOFirebase?.getContext?.({ auth: true, firestore: true }); const user = context?.auth?.currentUser;
      if (!user) return; switchUser(user.uid);
      const fs = context.firestoreTools, snap = await fs.getDoc(fs.doc(context.db, 'users', user.uid, 'pet', 'main'));
      if (snap.exists()) { runtime.pet = normalizePet({ ...runtime.pet, ...(snap.data() || {}) }); saveLocal(); renderLabels(); }
    } catch (_) { /* Firebase is optional for the local companion */ }
  }
  function switchUser(nextUid) {
    const id = String(nextUid || 'guest'); if (id === runtime.uid && runtime.pet) return;
    runtime.uid = id; runtime.pet = readLocal(id); renderLabels(); hydrateCloud();
  }
  function dispose() {
    if (runtime.disposed) return; runtime.disposed = true; clearStateTimer(); clearTimeout(runtime.blinkTimer); clearTimeout(runtime.idleTimer); clearTimeout(runtime.sleepTimer); clearTimeout(runtime.cloudTimer);
    stopRuntime();bus.abort();lifecycle.abort();runtime.observer?.disconnect(); runtime.renderer?.dispose(); runtime.renderer = null; companion.dataset.petRuntime = 'none';
  }
  function init() {
    // The server-rendered shell keeps the companion hidden until a runtime is
    // ready. V4 is the sole active runtime, so reveal it only after mounting
    // the renderer and mark the layout explicitly for the existing placement CSS.
    companion.hidden = false; companion.removeAttribute('hidden'); companion.style.removeProperty('display'); companion.setAttribute('aria-hidden', 'false'); companion.dataset.layout = 'living';
    runtime.pet = readLocal(runtime.uid); runtime.model = null; runtime.renderer = new Real3DAdapter(stage); bindEvents(); applySettings(); renderLabels(); transition('BOOT', { force: true, duration: 700 });
    setTimeout(() => { if (!runtime.disposed) transition('IDLE', { force: true }); }, 720); scheduleBlink(); scheduleAutonomy(); scheduleSleep(); hydrateCloud();
    runtime.observer = new MutationObserver(() => {
      // Legacy roster code may still mirror an old image-pet preference onto
      // data-pet-kind. V4 owns the visible companion identity and only exposes
      // the Nyro model until equivalent GLBs exist.
      if (companion.dataset.petKind !== 'nexy') companion.dataset.petKind = 'nexy';
      if (stage.getAttribute('aria-label') !== 'Interact with Nyro') stage.setAttribute('aria-label', 'Interact with Nyro');
      if (runtime.pet.selectedPet !== 'nyro' || runtime.pet.petId !== 'nyro') {
        runtime.pet.selectedPet = 'nyro'; runtime.pet.petId = 'nyro'; runtime.pet.unlockedPets = ['nyro']; saveLocal(); renderLabels(); queueCloud();
      }
    });
    runtime.observer.observe(companion, { attributes: true, attributeFilter: ['data-pet-kind'] });
    runtime.observer.observe(stage, { attributes: true, attributeFilter: ['aria-label'] });
    startRuntime();
  }
  window.__NEXZO_LIVING_PET_V4__ = runtime;
  window.addEventListener('nexzo:settings-changed',()=>{if(bus.signal.aborted&&!runtime.disposed)applySettings();},{signal:lifecycle.signal});
  window.addEventListener('pagehide',dispose,{signal:lifecycle.signal,once:true});
  window.NEXZOLivingPetV4 = Object.freeze({ version: 4, states: STATES, snapshot: () => ({ ...runtime.pet, state: runtime.state, enabled: runtime.enabled, model: runtime.model || null }), transition, care, reward, setEnabled: enabled => { if (window.NEXZOSettings?.set) window.NEXZOSettings.set({ livingCompanion: Boolean(enabled) }, { syncCloud: false }); else setRuntimeEnabled(enabled); }, dispose, renderer: () => runtime.renderer });
  init();
})();
