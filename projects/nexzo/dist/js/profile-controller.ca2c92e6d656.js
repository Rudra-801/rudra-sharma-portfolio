/* NEXZO Profile Controller v40 — one render pipeline, one badge engine, safe DOM updates. */
(()=>{
  'use strict';
  if(document.body?.dataset.page!=='profile') return;

  const $=selector=>document.querySelector(selector);
  const $$=selector=>Array.from(document.querySelectorAll(selector));
  const levelSystem=window.NEXZOLevelSystem;
  const xpGoals=levelSystem?.xpGoals||[];
  const tiers=levelSystem?.tierData||[];
  let activeSlide=0;
  let uploadedPhotoData='';
  let uploadedPhotoFile=null;
  let authUser=null;
  let onboardingChecked=false;
  let authResolved=false;

  const num=value=>Number.isFinite(Number(value))?Number(value):0;
  const fmt=value=>num(value).toLocaleString('en-IN');
  const setText=(selector,value)=>{const node=$(selector);if(node)node.textContent=String(value??'');};
  const setWidth=(selector,value)=>{const node=$(selector);if(node)node.style.width=`${Math.max(0,Math.min(100,num(value)))}%`;};
  const safeArray=value=>Array.isArray(value)?value:[];
  const escapeHTML=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

  function setupKey(){return `nexzo.profile.setup.v2:${window.NEXZOProfileAuthority?.uid?.()||authUser?.uid||'local'}`;}
  function profile(){
    const authority=window.NEXZOProfileAuthority?.current?.()||{};
    const cached=(()=>{try{return JSON.parse(localStorage.getItem('nexzo_user')||'{}')||{}}catch{return{}}})();
    const email=authUser?.email||authority.email||cached.email||'';
    const fallbackName=(email.split('@')[0]||'').replace(/[._-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    const configured=localStorage.getItem(setupKey())==='1'||authority.profileConfiguredByUser===true;
    const name=(configured&&(authority.name||authority.fullName))||authUser?.displayName||cached.displayName||cached.name||fallbackName||'NEXZO User';
    const username=configured?String(authority.username||authority.handle||'').replace(/^@/,'').trim():'';
    const interests=configured?safeArray(authority.interests).filter(Boolean):[];
    const customPhoto=configured?(authority.avatar||authority.photo||authority.photoURL||''):'';
    const photo=customPhoto||authUser?.photoURL||cached.photoURL||cached.photo||'';
    return {
      ...authority,
      name,
      email,
      username,
      country:configured?String(authority.country||'').trim():'',
      role:configured?String(authority.role||authority.course||'').trim():'',
      bio:configured?String(authority.bio||'').trim():'',
      photo,
      interests,
      configured,
      handle:username?`@${username}`:''
    };
  }

  function stats(){
    const authority=window.NEXZOProfileAuthority?.stats?.()||{};
    const xp=Math.max(0,num(authority.xp));
    const resolved=levelSystem.resolve(xp);
    return {
      ...resolved,
      completed:Math.max(0,num(authority.completed)),
      minutes:Math.max(0,num(authority.minutes)),
      aiScore:Math.max(0,Math.min(100,num(authority.aiScore))),
      streak:Math.max(0,num(authority.streak)),
      tasks:safeArray(authority.tasks)
    };
  }

  function rankMeta(level,xp){
    const rank=levelSystem.rank(level);
    const bands=[
      {max:3,name:'STARTER',tier:'Tier I'},
      {max:7,name:'EXPLORER',tier:'Tier II'},
      {max:14,name:'SCHOLAR',tier:'Tier III'},
      {max:24,name:'ACHIEVER',tier:'Tier IV'},
      {max:34,name:'CHAMPION',tier:'Tier V'},
      {max:44,name:'MASTER',tier:'Tier VI'},
      {max:49,name:'GRANDMASTER',tier:'Tier VII'},
      {max:60,name:'LEGEND',tier:'Tier VIII'},
      {max:70,name:'ELITE',tier:'Tier IX'},
      {max:80,name:'CONQUEROR',tier:'Tier X'},
      {max:90,name:'MYTHIC',tier:'Tier XI'},
      {max:99,name:'IMMORTAL',tier:'Tier XII'},
      {max:100,name:'ULTIMATE',tier:'Tier XIII'}
    ];
    const index=Math.max(0,bands.findIndex(item=>level<=item.max));
    const current=bands[index];
    const next=bands[index+1]||null;
    const nextLevelStart=next?xpGoals[current.max]??xp:null;
    return {
      rank,
      tier:current.tier,
      next:next?.name||'MAX RANK',
      xpLeft:next?Math.max(0,nextLevelStart-xp):0
    };
  }

  function setAvatar(selector,data){
    const node=$(selector);if(!node)return;
    node.replaceChildren();
    if(data.photo){
      const image=document.createElement('img');
      image.src=data.photo;image.alt=`${data.name} profile`;image.className='profile-avatar';
      node.appendChild(image);node.classList.remove('profile-avatar-fallback');
    }else{
      node.textContent=(data.name[0]||'S').toUpperCase();node.classList.add('profile-avatar-fallback');
    }
  }

  function badgeMarkup(level){
    const safeLevel=Math.max(1,Math.min(100,Math.floor(num(level)||1)));
    return `<img class="nexzo-badge-img" src="assets/badges-webp/level-${safeLevel}.webp" alt="Level ${safeLevel} badge" loading="${safeLevel===stats().level?'eager':'lazy'}" decoding="async">`;
  }

  function interestIcon(value){
    const text=String(value||'').toLowerCase();
    if(text.includes('ai')||text.includes('machine'))return '🤖';
    if(text.includes('dsa')||text.includes('algorithm'))return '🧩';
    if(text.includes('web'))return '🌐';
    if(text.includes('dbms')||text.includes('database'))return '🗄️';
    if(text.includes('python')||text.includes('program'))return '💻';
    return '✨';
  }

  function renderHero(data,current){
    setText('#heroName',data.name);
    setText('#heroHandle',data.handle);
    setText('#emailPill',data.email?`✉️ ${data.email}`:'');
    setText('#bioText',data.bio);
    const country=$('#countryPill');if(country){country.hidden=!data.country;country.textContent=data.country?`📍 ${data.country}`:'';}
    const role=$('#rolePill');if(role){role.hidden=!data.role;role.textContent=data.role?`🎓 ${data.role}`:'';}
    const hint=$('#completeProfileHint');if(hint)hint.hidden=data.configured;
    const pills=$('#interestPills');if(pills)pills.innerHTML=data.interests.map(item=>`<span class="mini-pill">${interestIcon(item)} ${escapeHTML(item)}</span>`).join('');
    setAvatar('#heroAvatar',data);
    const badge=$('#heroBadge');if(badge)badge.innerHTML=badgeMarkup(current.level);
    setText('#heroRank',`NEXZO ${current.rank}`);
    setText('#heroXp',current.level>=100?`${fmt(current.xp)} XP · MAX LEVEL`:`${fmt(current.earned)} / ${fmt(current.required)} XP`);
    setText('#heroPct',`${Math.round(current.pct)}%`);setWidth('#heroBar',current.pct);
    const edit=$('#editBtn');if(edit)edit.innerHTML=data.configured?'✎ Edit Profile':'✦ Complete Profile';
  }

  function renderStats(current){
    setText('#streakVal',current.streak);setText('#tasksVal',current.completed);setText('#aiVal',current.aiScore);setText('#levelVal',`Lv. ${current.level}`);
  }

  function renderRank(current){
    const meta=rankMeta(current.level,current.xp);
    setText('#rankVal',meta.rank);setText('#rankTier',meta.tier);setText('#rankNext',meta.next);setText('#rankXpLeft',meta.xpLeft?`${fmt(meta.xpLeft)} XP`:'MAX');
    setText('#currentLabel',`Level ${current.level} - ${meta.rank}`);
    setText('#xpMini',current.level>=100?`${fmt(current.xp)} XP`:`${fmt(current.earned)} / ${fmt(current.required)} XP`);
    setWidth('#bottomBar',current.pct);
    setText('#nextLabel',current.level>=100?'MAX LEVEL':`${fmt(current.next-current.xp)} XP to Level ${current.level+1}`);
  }

  function renderJourney(current){
    activeSlide=Math.max(0,Math.min(tiers.length-1,activeSlide));
    const tier=tiers[activeSlide];
    const tierBox=$('#tiers');const track=$('#track');const dots=$('#dots');const stage=$('.journey-card .stage');
    if(!tierBox||!track||!dots||!tier)return;
    tierBox.innerHTML=tiers.map((item,index)=>`<button type="button" class="tier ${index===activeSlide?'active':''}" data-slide="${index}" style="--tc:${item.a}" aria-pressed="${index===activeSlide}"><span class="ic">${item.icon}</span><span><b style="color:${item.a}">${item.range}</b><small>${escapeHTML(item.name)}</small></span></button>`).join('');
    if(stage){stage.style.setProperty('--trackA',tier.a);stage.style.setProperty('--trackB',tier.b);stage.dataset.tierTitle=`${tier.name} (${tier.range})`;}
    const start=activeSlide*10+1;
    track.className='track nexzo-final-badge-slide';
    track.innerHTML=Array.from({length:10},(_,offset)=>{
      const level=start+offset;const status=level<current.level?'done':level===current.level?'current':'locked';
      return `<article class="level level-${level} ${status}" style="--rpg-a:${tier.a};--rpg-b:${tier.b};--glow:${tier.a}" aria-label="Level ${level}, ${levelSystem.rank(level)}, ${fmt(xpGoals[level-1])} XP" aria-disabled="${status==='locked'}"><div class="level-content"><div class="level-kicker">LEVEL</div><div class="level-num">${level}</div>${badgeMarkup(level)}<div class="lrank">${levelSystem.rank(level)}</div><div class="lxp">${fmt(xpGoals[level-1])} XP</div></div>${status==='locked'?'<div class="level-lock-overlay" aria-hidden="true"><span class="level-lock-icon">🔒</span><b>LOCKED</b><small>Earn more XP</small></div>':''}</article>`;
    }).join('');
    dots.innerHTML=tiers.map((item,index)=>`<button type="button" class="dot ${index===activeSlide?'active':''}" data-slide="${index}" aria-label="Show levels ${item.range}" aria-current="${index===activeSlide?'true':'false'}"></button>`).join('');
    $$('[data-slide]').forEach(button=>button.addEventListener('click',()=>{activeSlide=num(button.dataset.slide);render();}));
  }

  function renderActivity(current){
    const container=$('#activityList');if(!container)return;
    const items=current.tasks.filter(task=>task?.completed===true||String(task?.status||'').toLowerCase()==='completed').slice(-5).reverse();
    container.innerHTML=items.length?items.map(task=>`<div class="activity"><i>✅</i><div><b>${escapeHTML(task.title||task.text||task.task||'Completed task')}</b><small>${escapeHTML(task.status||'completed')}</small></div><div class="plus">Completed</div></div>`).join(''):'<div class="dash-empty-live">No activity yet. Complete a Planner task to start your activity history.</div>';
  }

  function renderGoal(current){
    const hours=current.minutes/60;const goalPct=Math.min(100,Math.round(hours/10*100));
    const ring=$('#goalRing');if(ring)ring.style.setProperty('--p',`${goalPct}%`);
    setText('#goalPct',`${goalPct}%`);const goalLabel=current.minutes>=600?`10h / 10 Hours · Goal completed`:`${Math.floor(current.minutes/60)}h ${current.minutes%60}m / 10 Hours`;setText('#goalText',goalLabel);
  }

  function render(){
    const data=profile();const current=stats();
    activeSlide=Number.isFinite(activeSlide)?activeSlide:Math.floor((current.level-1)/10);
    renderHero(data,current);renderStats(current);renderRank(current);renderJourney(current);renderActivity(current);renderGoal(current);if(authResolved)document.body.classList.add('profile-data-ready');
  }

  function setEditPreview(){
    const name=$('#editName')?.value||'Student';const photo=$('#editPhoto')?.value||uploadedPhotoData;const preview=$('#editPreview');
    setText('#editPreviewName',name);if(!preview)return;
    preview.replaceChildren();
    if(photo){const image=document.createElement('img');image.src=photo;image.alt='Profile preview';preview.appendChild(image);preview.className='';}
    else{preview.textContent=(name[0]||'S').toUpperCase();preview.className='preview-letter';}
  }

  function openEdit(options={}){
    const data=profile();uploadedPhotoData='';uploadedPhotoFile=null;
    $('#editName').value=data.name;$('#editEmail').value=data.email;$('#editPhoto').value=data.photo;$('#editBio').value=data.bio;$('#editInterests').value=data.interests.join(', ');
    $('#editUsername').value=data.username;$('#editCountry').value=data.country;$('#editRole').value=data.role;
    const onboarding=Boolean(options.onboarding||!data.configured);
    $('#editModal')?.classList.toggle('onboarding',onboarding);
    setText('#editModalTitle',onboarding?'✦ Complete Your Profile':'✎ Edit Profile');
    setText('#editModalSubtitle',onboarding?'Your sign-in name, email and account photo are already filled. Add only what you want.':'Update your profile details and learning focus.');
    $('#skipEdit').hidden=!onboarding;
    $('#editModal')?.classList.add('show');setEditPreview();
  }
  function closeEdit(){$('#editModal')?.classList.remove('show');$('#editModal')?.classList.remove('onboarding');}
  function onboardingIds(){
    const data=profile();
    const ids=[
      authUser?.uid,
      window.NEXZOProfileAuthority?.uid?.(),
      authUser?.email,
      data?.email
    ].filter(Boolean).map(value=>String(value).trim().toLowerCase());
    return [...new Set(ids)];
  }
  function onboardingKeys(){
    const ids=onboardingIds();
    return ids.length?ids.map(id=>`nexzo.profile.onboarding.seen.v3:${id}`):[];
  }
  function onboardingSeen(){
    return localStorage.getItem('nexzo.profile.onboarding.seen.v3:any')==='1'||onboardingKeys().some(key=>localStorage.getItem(key)==='1');
  }
  function markOnboardingSeen(){
    localStorage.setItem('nexzo.profile.onboarding.seen.v3:any','1');
    onboardingKeys().forEach(key=>localStorage.setItem(key,'1'));
  }
  function skipOnboarding(){markOnboardingSeen();closeEdit();}
  function maybeOpenOnboarding(){
    if(onboardingChecked||!authResolved)return;
    onboardingChecked=true;
    const data=profile();
    if(!data.configured&&!onboardingSeen())setTimeout(()=>openEdit({onboarding:true}),250);
  }

  function normalizeUsername(value){return String(value||'').trim().toLowerCase().replace(/^@/,'');}
  async function reserveUsername(nextUsername, previousUsername){
    const handle=normalizeUsername(nextUsername), old=normalizeUsername(previousUsername);
    if(!handle) return '';
    if(!/^[a-z0-9._]{3,20}$/.test(handle)) throw new Error('Username must be 3–20 characters using letters, numbers, dot or underscore.');
    const ctx=await window.NEXZOFirebase?.getContext?.({auth:true,firestore:true});
    const user=ctx?.auth?.currentUser;if(!ctx||!user) throw new Error('Sign in before choosing a unique username.');
    const fs=ctx.firestoreTools, ref=fs.doc(ctx.db,'usernames',handle), oldRef=old&&old!==handle?fs.doc(ctx.db,'usernames',old):null;
    await fs.runTransaction(ctx.db,async tx=>{
      const snap=await tx.get(ref);
      if(snap.exists()&&snap.data()?.uid!==user.uid) throw new Error(`@${handle} is already taken. Choose another username.`);
      tx.set(ref,{uid:user.uid,username:handle,updatedAtMs:Date.now()},{merge:true});
      if(oldRef){const oldSnap=await tx.get(oldRef);if(oldSnap.exists()&&oldSnap.data()?.uid===user.uid)tx.delete(oldRef);}
    });
    return handle;
  }
  async function saveEdit(){
    const button=$('#saveEdit');const old=button?.textContent;
    if(button){button.disabled=true;button.textContent='Saving…';}
    try{
      let avatar=$('#editPhoto')?.value.trim()||uploadedPhotoData;
      if(uploadedPhotoFile&&window.NEXZOProfileStorage?.upload){try{avatar=await Promise.race([window.NEXZOProfileStorage.upload(uploadedPhotoFile),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Cloud upload timed out')),10000))]);}catch(error){console.warn('[NEXZO Profile] cloud upload deferred; local image kept',error);avatar=uploadedPhotoData||avatar;window.NEXZOShell?.toast?.('Photo saved locally; cloud upload can be retried later.','info');}}
      const currentProfile=profile();const requestedUsername=normalizeUsername($('#editUsername')?.value);const claimedUsername=await reserveUsername(requestedUsername,currentProfile.username);
      const next={name:$('#editName')?.value.trim()||currentProfile.name,email:currentProfile.email,username:claimedUsername,country:$('#editCountry')?.value.trim()||'',role:$('#editRole')?.value.trim()||'',avatar,photo:avatar,photoURL:avatar,bio:$('#editBio')?.value.trim()||'',interests:($('#editInterests')?.value||'').split(',').map(item=>item.trim()).filter(Boolean),profileConfigured:true,profileConfiguredByUser:true};
      localStorage.setItem(setupKey(),'1');
      markOnboardingSeen();
      window.NEXZOProfileAuthority?.save?.(next);window.dispatchEvent(new CustomEvent('nexzo:profile-saved',{detail:{uid:window.NEXZOProfileAuthority?.uid?.()}}));closeEdit();render();
    }catch(error){alert(error?.message||'Profile could not be saved.');}
    finally{if(button){button.disabled=false;button.textContent=old||'Save Profile';}}
  }

  $('#prev')?.addEventListener('click',()=>{activeSlide=(activeSlide+tiers.length-1)%tiers.length;render();});
  $('#next')?.addEventListener('click',()=>{activeSlide=(activeSlide+1)%tiers.length;render();});
  $('#editBtn')?.addEventListener('click',()=>openEdit());$('#editPhotoBtn')?.addEventListener('click',()=>openEdit());
  $('#closeEdit')?.addEventListener('click',closeEdit);$('#closeEditTop')?.addEventListener('click',closeEdit);$('#skipEdit')?.addEventListener('click',skipOnboarding);
  $('#editName')?.addEventListener('input',setEditPreview);$('#editPhoto')?.addEventListener('input',setEditPreview);
  $('#editFile')?.addEventListener('change',event=>{const file=event.target.files?.[0];if(!file)return;if(!/^image\/(png|jpeg|webp)$/i.test(file.type)){alert('Choose a PNG, JPG or WEBP image.');event.target.value='';return;}uploadedPhotoFile=file;const reader=new FileReader();reader.onload=()=>{uploadedPhotoData=String(reader.result||'');$('#editPhoto').value=uploadedPhotoData;setEditPreview();};reader.readAsDataURL(file);});
  $('#saveEdit')?.addEventListener('click',saveEdit);
  $('#shareBtn')?.addEventListener('click',async()=>{const text=`${profile().name} is Level ${stats().level} on NEXZO.`;try{if(navigator.share)await navigator.share({title:'My NEXZO Profile',text,url:location.href});else{await navigator.clipboard.writeText(`${text} ${location.href}`);alert('Profile link copied.');}}catch(error){if(error?.name!=='AbortError')console.warn(error);}});
  $('#editModal')?.addEventListener('click',event=>{if(event.target===$('#editModal'))closeEdit();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeEdit();});
  window.addEventListener('nexzo:profile-updated',render);window.addEventListener('nexzo:tasks-updated',render);window.addEventListener('nexzo:rewards-updated',()=>setTimeout(render,0));window.addEventListener('nexzo:stats-updated',()=>setTimeout(render,0));window.addEventListener('nexzo:owner-changed',()=>setTimeout(render,0));

  async function hydrateAuth(){
    try{
      const {auth,tools}=await window.NEXZOFirebase.getAuthContext();
      tools.onAuthStateChanged(auth,user=>{
        authUser=user||null;authResolved=true;onboardingChecked=false;
        render();maybeOpenOnboarding();
      });
    }catch(error){authResolved=true;console.warn('[NEXZO Profile] auth details unavailable',error);render();maybeOpenOnboarding();}
  }

  activeSlide=Math.floor((stats().level-1)/10);
  hydrateAuth();
  setTimeout(()=>{if(!authResolved){authResolved=true;render();}},3500);

  document.addEventListener('change',event=>{const input=event.target;if(input?.type==='file'&&(input.id||'').toLowerCase().includes('avatar'))window.dispatchEvent(new CustomEvent('nexzo:avatar-updated',{detail:{id:'profile-avatar'}}));});
})();
