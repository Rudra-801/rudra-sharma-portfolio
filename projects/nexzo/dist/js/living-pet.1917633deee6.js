(()=>{
  'use strict';
  if(window.__NEXZO_LIVING_PET__) return;
  window.__NEXZO_LIVING_PET__=true;

  const $=id=>document.getElementById(id);
  const root=$('nexzoCompanion');
  const art=$('activePetArt');
  if(!root||!art) return;

  const prefersReduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LEGACY_KEY='nexzo.pet.kind';
  const CARE_KEY='nexzo.pet.living.v1';
  const pets={
    nexy:{name:'Nyro',personality:'Curious',line:'Quietly watching your progress.',asset:'assets/pets/nyro-3d.webp',traits:['Curious','Focused','Loyal','Playful']},
    sprout:{name:'Aeri',personality:'Calm',line:'Steady pace. Clear mind.',asset:'assets/pets/sprout.webp',traits:['Calm','Patient','Gentle','Observant']},
    flare:{name:'Kivo',personality:'Energetic',line:'Momentum looks good on you.',asset:'assets/pets/flare.webp',traits:['Energetic','Brave','Fast','Cheerful']},
    droppy:{name:'Mizu',personality:'Supportive',line:'No rush. One step at a time.',asset:'assets/pets/droppy.webp',traits:['Supportive','Soft','Friendly','Adaptive']},
    rocky:{name:'Brum',personality:'Steady',line:'Stay consistent. I am here.',asset:'assets/pets/rocky.webp',traits:['Steady','Reliable','Quiet','Protective']},
    cloudie:{name:'Vela',personality:'Dreamy',line:'A clear idea is forming.',asset:'assets/pets/cloudie.webp',traits:['Dreamy','Creative','Warm','Curious']}
  };

  const safeNum=(n,f)=>Number.isFinite(Number(n))?Number(n):f;
  const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,n));
  let state={
    uid:'local',kind:localStorage.getItem(LEGACY_KEY)||'nexy',nickname:'',energy:82,happiness:78,bond:12,hunger:22,petXP:0,level:1,
    mood:'happy',animation:'idle',updatedAtMs:Date.now(),lastSeenAtMs:Date.now(),lastInteractionAtMs:Date.now(),schemaVersion:1
  };
  let idleTimer=0, sleepTimer=0, cloudTimer=0, cursorNear=false, paused=document.hidden, lastStateAt=0;

  function loadLocal(){
    try{const raw=JSON.parse(localStorage.getItem(CARE_KEY)||'null');if(raw&&typeof raw==='object')state={...state,...raw};}catch{}
    if(!pets[state.kind])state.kind='nexy';
    state.energy=clamp(safeNum(state.energy,82));state.happiness=clamp(safeNum(state.happiness,78));state.bond=clamp(safeNum(state.bond,12));state.hunger=clamp(safeNum(state.hunger,22));
  }
  function saveLocal(){state.updatedAtMs=Date.now();localStorage.setItem(CARE_KEY,JSON.stringify(state));localStorage.setItem(LEGACY_KEY,state.kind);}

  async function cloudContext(){
    try{const c=await window.NEXZOFirebase?.getContext?.({auth:true,firestore:true});const user=c?.auth?.currentUser;return c&&user?{c,user}:null;}catch{return null;}
  }
  function queueCloud(){
    clearTimeout(cloudTimer);
    cloudTimer=setTimeout(async()=>{
      const ctx=await cloudContext();if(!ctx)return;
      const {c,user}=ctx;state.uid=user.uid;
      try{
        const fs=c.firestoreTools,ref=fs.doc(c.db,'users',user.uid,'pet','main');
        await fs.setDoc(ref,{uid:user.uid,schemaVersion:1,kind:state.kind,nickname:String(state.nickname||'').slice(0,32),energy:Math.round(state.energy),happiness:Math.round(state.happiness),bond:Math.round(state.bond),hunger:Math.round(state.hunger),petXP:Math.max(0,Math.round(state.petXP)),level:Math.max(1,Math.round(state.level)),mood:state.mood,lastSeenAtMs:Date.now(),updatedAtMs:Date.now(),updatedAt:fs.serverTimestamp()},{merge:true});
      }catch(error){console.debug('[NEXZO pet] cloud sync skipped',error?.code||error?.message||error);}
    },700);
  }
  async function hydrateCloud(){
    const ctx=await cloudContext();if(!ctx)return;
    const {c,user}=ctx;state.uid=user.uid;
    try{
      const fs=c.firestoreTools,ref=fs.doc(c.db,'users',user.uid,'pet','main'),snap=await fs.getDoc(ref);
      if(snap.exists()){
        const remote=snap.data()||{};
        if(Number(remote.updatedAtMs||0)>=Number(state.updatedAtMs||0)-1500)state={...state,...remote,uid:user.uid};
        saveLocal();renderIdentity();renderStats();
      }else queueCloud();
    }catch{}
  }

  const displayName=()=>state.nickname||pets[state.kind]?.name||'Nyro';
  function renderIdentity(){
    const meta=pets[state.kind]||pets.nexy;
    root.dataset.petKind=state.kind;
    art.src=meta.asset;art.alt=`${displayName()}, your NEXZO companion`; art.hidden=true;
    $('activePetName')&&($('activePetName').textContent=displayName());
    $('petZoneName')&&($('petZoneName').textContent=meta.name);
    $('petZoneAvatar')&&($('petZoneAvatar').src=meta.asset);
    $('petZonePersonality')&&($('petZonePersonality').textContent=`${meta.personality} · living companion`);
    const traits=root.querySelector('.pet-traits');if(traits)traits.innerHTML=meta.traits.map(x=>`<span>${x}</span>`).join('');
    const stage=root.querySelector('.pet-stage');stage?.setAttribute('aria-label',`Interact with ${displayName()}`);
  }
  function renderStats(){
    const mood=$('petMood');if(mood)mood.textContent=`${state.mood[0].toUpperCase()+state.mood.slice(1)} · Bond ${Math.round(state.bond)}%`;
    const detail=$('companionDetail');if(detail)detail.textContent=`Energy ${Math.round(state.energy)} · Happiness ${Math.round(state.happiness)} · Hunger ${Math.round(state.hunger)}`;
    const presence=$('petPresenceText');if(presence)presence.textContent=`${displayName()} · ${state.animation.replace(/-/g,' ')}`;
  }
  function say(text,duration=2600){
    const bubble=$('companionText');if(!bubble)return;bubble.textContent=text;
    root.classList.add('pet-has-speech');clearTimeout(say.t);say.t=setTimeout(()=>root.classList.remove('pet-has-speech'),duration);
  }

  function setAnimation(next,{force=false,duration=0}={}){
    if(paused&&!force)return;
    const now=Date.now();if(!force&&now-lastStateAt<300)return;
    lastStateAt=now;state.animation=next;root.dataset.livingState=next;root.dataset.petState=next;renderStats();
    if(duration){clearTimeout(setAnimation.t);setAnimation.t=setTimeout(()=>setAnimation('idle',{force:true}),duration);}
  }
  function reward({bond=0,happiness=0,energy=0,xp=0,mood}={}){
    state.bond=clamp(state.bond+bond);state.happiness=clamp(state.happiness+happiness);state.energy=clamp(state.energy+energy);state.petXP=Math.max(0,state.petXP+xp);state.level=Math.max(1,1+Math.floor(state.petXP/250));if(mood)state.mood=mood;state.lastInteractionAtMs=Date.now();saveLocal();queueCloud();renderStats();
  }

  const choices=[
    ['blink',1.5,650],['look-left',1,1400],['look-right',1,1400],['stretch',.65,2100],['curious',.8,1800],['sit',.8,2300]
  ];
  function randomIdle(){
    clearTimeout(idleTimer);if(paused)return;
    const total=choices.reduce((a,x)=>a+x[1],0);let r=Math.random()*total,pick=choices[0];for(const c of choices){r-=c[1];if(r<=0){pick=c;break;}}
    if(state.energy<28||state.hunger>82){setAnimation(state.energy<28?'sleepy':'hungry',{duration:2500});}
    else if(!cursorNear)setAnimation(pick[0],{duration:pick[2]});
    idleTimer=setTimeout(randomIdle,3200+Math.random()*5200);
  }

  function decay(){
    if(paused)return;
    const hours=Math.min(8,(Date.now()-Number(state.lastSeenAtMs||Date.now()))/3600000);
    if(hours>0){state.energy=clamp(state.energy-hours*.6);state.hunger=clamp(state.hunger+hours*.9);}
    state.lastSeenAtMs=Date.now();saveLocal();
  }

  function cursorMove(event){
    if(prefersReduced||paused)return;
    const stage=root.querySelector('.pet-stage');if(!stage)return;
    const r=stage.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=event.clientX-cx,dy=event.clientY-cy,dist=Math.hypot(dx,dy);
    cursorNear=dist<260;
    root.style.setProperty('--pet-look-x',`${clamp(dx/75,-3.2,3.2)}px`);root.style.setProperty('--pet-look-y',`${clamp(dy/90,-2.2,2.2)}px`);
    if(cursorNear&&dist<150&&state.animation==='idle')setAnimation('curious',{duration:1200});
  }

  root.querySelector('.pet-stage')?.addEventListener('click',event=>{
    document.getElementById('nexzoPetOrb')?.remove();
    if(event.detail===0)return;reward({bond:1.2,happiness:2,mood:'happy'});setAnimation('happy',{force:true,duration:1500});say(['Hey!','I saw that 👀','Still here.','Ready when you are.'][Math.floor(Math.random()*4)]);
  });
  root.querySelector('.pet-stage')?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();root.querySelector('.pet-stage')?.click();}});
  addEventListener('pointermove',cursorMove,{passive:true});
  addEventListener('blur',()=>{cursorNear=false;root.style.setProperty('--pet-look-x','0px');root.style.setProperty('--pet-look-y','0px');});

  root.addEventListener('pet:celebrate',()=>{reward({bond:.7,happiness:3,xp:2,mood:'excited'});setAnimation('celebrate',{force:true,duration:2200});});
  addEventListener('nexzo:ai-status',e=>{const s=e.detail?.state||'';if(['working','thinking','streaming'].includes(s))setAnimation('thinking',{force:true});else if(s==='ready')setAnimation('happy',{force:true,duration:900});});
  addEventListener('nexzo:ai-question-answered',()=>{reward({bond:.35,happiness:1,xp:1});setAnimation('proud',{force:true,duration:1400});});
  addEventListener('nexzo:level-up',()=>{reward({bond:2,happiness:5,xp:8,mood:'excited'});say('Level up! ✨');setAnimation('celebrate',{force:true,duration:3000});});
  addEventListener('nexzo:focus-complete',()=>{reward({bond:1,happiness:3,xp:3,mood:'proud'});say('Focus session complete. Nice.');setAnimation('celebrate',{force:true,duration:2200});});
  addEventListener('nexzo:academics-quiz',e=>{const score=Number(e.detail?.score||0);if(score>=8){reward({bond:1,happiness:4,xp:4,mood:'proud'});setAnimation('celebrate',{force:true,duration:2200});}else{state.mood='supportive';setAnimation('supportive',{force:true,duration:1800});say('We can improve that together.');renderStats();}});
  addEventListener('nexzo:rewards-updated',e=>{const xp=Number(e.detail?.totalXP||0);if(xp>0&&xp%1000<40)setAnimation('happy',{duration:1000});});

  document.addEventListener('visibilitychange',()=>{
    paused=document.hidden;
    if(paused){clearTimeout(idleTimer);state.lastSeenAtMs=Date.now();saveLocal();}
    else{decay();setAnimation('wake',{force:true,duration:1000});randomIdle();}
  });

  // Existing Feed / Play buttons now affect the living state too.
  root.querySelectorAll('[data-pet-care]').forEach(btn=>btn.addEventListener('click',()=>{
    const a=btn.dataset.petCare;
    if(a==='feed'){state.hunger=clamp(state.hunger-24);reward({bond:.5,happiness:2,energy:3,mood:'happy'});setAnimation('eating',{force:true,duration:2200});say('That hit the spot.');}
    if(a==='play'){state.energy=clamp(state.energy-4);reward({bond:1,happiness:5,xp:1,mood:'excited'});setAnimation('playing',{force:true,duration:2400});say('Again? 😄');}
  },{capture:true}));

  function patchLegacyNames(){
    const names={nexy:'Nyro',sprout:'Aeri',flare:'Kivo',droppy:'Mizu',rocky:'Brum',cloudie:'Vela'};
    document.querySelectorAll('[data-pet-choice],[data-zone-pet]').forEach(el=>{const key=el.dataset.petChoice||el.dataset.zonePet;const label=el.querySelector('span,b');if(label&&names[key])label.textContent=names[key];});
  }

  loadLocal();
  // Re-enable only the compact active companion. Existing large companion studio remains optional via Pet Zone.
  document.getElementById('nexzoPetOrb')?.remove();
  root.querySelector('#activePetArt')?.setAttribute('hidden','');
  root.hidden=false;root.removeAttribute('hidden');root.removeAttribute('aria-hidden');root.style.removeProperty('display');root.dataset.layout='living';
  renderIdentity();renderStats();patchLegacyNames();
  decay();hydrateCloud();randomIdle();
  setTimeout(()=>{if(Date.now()-state.lastInteractionAtMs>20*60*1000){setAnimation('sleepy',{force:true,duration:2600});}},1200);

  window.NEXZOLivingPet={
    snapshot:()=>({...state,name:displayName()}),
    setState:(s)=>setAnimation(s,{force:true}),
    celebrate:()=>root.dispatchEvent(new CustomEvent('pet:celebrate')),
    rename:(name)=>{state.nickname=String(name||'').trim().slice(0,32);saveLocal();queueCloud();renderIdentity();},
    choose:(kind)=>{if(!pets[kind])return false;state.kind=kind;state.nickname='';saveLocal();queueCloud();renderIdentity();return true;}
  };
})();
