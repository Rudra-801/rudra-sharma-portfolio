/* NEXZO App Shell v2 — lean runtime for Planner, Dashboard, Community, Settings and AI. */
(function(){
  'use strict';
  if(window.__NEXZO_APP_SHELL_V2__) return;
  window.__NEXZO_APP_SHELL_V2__=true;

  const NAV=[
    ['Home','🏠','Home.html','#f59e0b'],['Academics','📚','academics.html','#a855f7'],
    ['Study Assistant','🤖','ai-assistant.html','#ff3df2'],['Career','💼','career.html','#ec4899'],
    ['Planner','📅','planner.html','#22c55e'],['Community','👥','community.html','#ef4444'],
    ['Dashboard','📊','dashboard.html','#3b82f6'],['Personalization','✦','personalization.html','#a855f7'],['NEXZO Hub','✨','nexzo-hub.html','#f97316'],['Settings','⚙️','settings.html','#06b6d4'],
    ['Profile','👤','profile.html','#a855f7']
  ];
  const SETTINGS_DEFAULTS={mode:'dark',accent:'#8b5cf6',font:'medium',density:'comfortable',anim:'smooth',sidebarMode:'expanded',defaultStudyTime:'1 Hour',weekStart:'Monday',language:'English',timeZone:'Asia/Kolkata',focusMode:false,autoSync:true,cloudBackup:true,notifyTasks:true,notifyCommunity:true,notifyStreak:true,notifyProduct:false,sound:true,emailDigest:'Weekly',profileVisibility:'Private',activityStatus:true,dataCollection:false,analytics:false,personalization:true};
  let authPromise=null,currentShellName='';

  const safeParse=(raw,fallback)=>{try{const v=JSON.parse(raw);return v??fallback}catch{return fallback}};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const byId=id=>document.getElementById(id);

  function readSettings(){if(window.NEXZOSettings)return window.NEXZOSettings.get();const shared=window.NEXZOSharedState?.settings?.()||{};return {...SETTINGS_DEFAULTS,...safeParse(localStorage.getItem('nexzo_settings')||localStorage.getItem('nexzoSettingsV3')||'{}',{}),...shared};}
  function resolveTheme(mode){return mode==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):(mode==='light'?'light':'dark');}
  function applySettings(settings=readSettings()){
    if(window.NEXZOSettings?.apply){window.NEXZOSettings.apply(settings);return;}
    const root=document.documentElement,body=document.body;if(!body)return;
    const theme=resolveTheme(settings.mode),accent=settings.accent||'#8b5cf6';
    root.dataset.nexzoTheme=theme;root.style.colorScheme=theme;root.style.setProperty('--nx-user-accent',accent);
    body.dataset.density=settings.density||'comfortable';body.dataset.sidebarMode=settings.sidebar||'expanded';body.dataset.nexzoMotion=settings.motion||'smooth';body.dataset.fontSize=settings.font||'medium';
  }

  function writeSettings(next){if(window.NEXZOSettings)return window.NEXZOSettings.set(next||{});const value={...readSettings(),...(next||{})};window.NEXZOSharedState?.updateSettings?.(value);localStorage.setItem('nexzo_settings',JSON.stringify(value));applySettings(value);window.dispatchEvent(new CustomEvent('nexzo:settings-changed',{detail:value}));return value;}

  async function authContext(){
    if(authPromise)return authPromise;
    authPromise=window.NEXZOFirebase.getAuthContext();
    return authPromise;
  }
  window.getFirebaseAuthCompat=authContext;

  function identity(){
    const profile=window.NEXZODataService?.getProfile?.()||window.NEXZOSharedState?.profile?.()||safeParse(localStorage.getItem('nexzoProfileEditableV3')||'{}',{});
    const legacy=safeParse(localStorage.getItem('nexzo_user')||'{}',{});
    const email=profile.email||legacy.email||localStorage.getItem('email')||'';
    const name=profile.name||legacy.name||localStorage.getItem('userName')||localStorage.getItem('currentUser')||(email?email.split('@')[0]:'Student');
    const photo=profile.photoURL||profile.avatar||profile.photo||localStorage.getItem('profilePhoto')||localStorage.getItem('profileImage')||'';
    return {name:String(name||'Student'),email:String(email||''),photo:String(photo||''),initial:(String(name||'N').trim()[0]||'N').toUpperCase()};
  }
  function validImage(src){return /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(src)||/^https?:\/\//i.test(src)||/^(?:\.\/)?assets\//i.test(src)||/^(?:\.\/)?(?:favicon|logo)\.(?:png|jpe?g|webp|svg)$/i.test(src);}
  function avatarMarkup(info,cls=''){return validImage(info.photo)?`<img class="${cls}" src="${esc(info.photo)}" alt="${esc(info.name)}">`:`<span class="nx-shell-avatar-letter ${cls}">${esc(info.initial)}</span>`;}

  function sidebar(activeName){
    let side=document.body?.dataset?.page==='ai'?document.querySelector('.sidebar.ai-site-drawer'):document.querySelector('.app > .sidebar');
    if(!side){side=document.createElement('aside');side.className='sidebar';document.querySelector('.app')?.prepend(side);}
    if(!side.querySelector('.brand')) side.insertAdjacentHTML('afterbegin',`<div class="brand"><img src="favicon.png" alt="NEXZO" class="logo-img logo"><div><h1>NEXZO</h1><p>PLAN • LEARN • ACHIEVE</p></div></div>`);
    let nav=side.querySelector('.nav');if(!nav){nav=document.createElement('nav');nav.className='nav';side.appendChild(nav);}
    const mobilePrimary=new Set(['Home','Academics','Planner','Community','Profile']);
    nav.innerHTML=NAV.map(([label,icon,href,color])=>`<a class="${label===activeName?'active':''}" href="${href}" data-nav-label="${esc(label)}" ${mobilePrimary.has(label)?'data-mobile-primary="true"':''} style="--c:${color}"><i>${icon}</i><span>${label}</span></a>`).join('');
    let more=side.querySelector('.nx-mobile-more');
    if(!more){more=document.createElement('button');more.type='button';more.className='nx-mobile-more';more.innerHTML='<i>•••</i><span>More</span>';side.appendChild(more);more.addEventListener('click',()=>openMobileNav(activeName));}
    more.classList.toggle('active',!mobilePrimary.has(activeName));
    side.querySelector('.nx-guest-sidebar-auth')?.remove();
    if(!isSignedIn()){
      const auth=document.createElement('section');auth.className='nx-guest-sidebar-auth';
      auth.innerHTML=`<span class="nx-guest-sidebar-icon">👤</span><div><b>Guest mode</b><small>Sign in to save progress</small></div><button type="button" data-guest-sidebar-login>Sign in</button>`;
      auth.querySelector('[data-guest-sidebar-login]').addEventListener('click',()=>goToAuth('login'));
      side.appendChild(auth);
    }
    side.dataset.shell='v2';
  }

  function closeGlobalMobileSidebar(){
    document.body.classList.remove('nx-global-sidebar-open');
    document.getElementById('nxGlobalSidebarBackdrop')?.remove();
  }
  function toggleGlobalMobileSidebar(){
    if(document.body.classList.contains('nx-global-sidebar-open')){closeGlobalMobileSidebar();return;}
    document.body.classList.add('nx-global-sidebar-open');
    let backdrop=document.getElementById('nxGlobalSidebarBackdrop');
    if(!backdrop){backdrop=document.createElement('button');backdrop.type='button';backdrop.id='nxGlobalSidebarBackdrop';backdrop.className='nx-global-sidebar-backdrop';backdrop.setAttribute('aria-label','Close navigation');document.body.appendChild(backdrop);backdrop.addEventListener('click',closeGlobalMobileSidebar);}
  }

  function updateIdentity(){
    const info=identity();
    document.querySelectorAll('[data-nx-user-name],#dashUserName,#sideName').forEach(el=>el.textContent=info.name);
    document.querySelectorAll('.compose-avatar').forEach(el=>el.textContent=info.initial);
    document.querySelectorAll('[data-nx-user-avatar]').forEach(el=>{el.innerHTML=avatarMarkup(info);el.querySelector('img')?.addEventListener('error',()=>{el.textContent=info.initial},{once:true});});
    const dashAvatar=byId('dashAvatar');if(dashAvatar){if(validImage(info.photo)){dashAvatar.src=info.photo;dashAvatar.onerror=()=>{dashAvatar.style.display='none';dashAvatar.parentElement?.insertAdjacentHTML('afterbegin',`<span class="nx-shell-avatar-letter">${esc(info.initial)}</span>`);};}else{dashAvatar.style.display='none';if(!dashAvatar.parentElement.querySelector('.nx-shell-avatar-letter'))dashAvatar.parentElement.insertAdjacentHTML('afterbegin',`<span class="nx-shell-avatar-letter">${esc(info.initial)}</span>`);}}
  }

  function toast(message,type='info',duration=2600){
    let el=byId('nxShellToast');if(!el){el=document.createElement('div');el.id='nxShellToast';el.className='nx-shell-toast';document.body.appendChild(el);}
    el.className=`nx-shell-toast show ${type}`;el.textContent=String(message||'');clearTimeout(el._timer);el._timer=setTimeout(()=>el.classList.remove('show'),duration);
  }
  function confirmAction(message){return Promise.resolve(window.confirm(message));}
  function download(name,content,type='application/json'){
    const blob=new Blob([typeof content==='string'?content:JSON.stringify(content,null,2)],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
  }
  function modal(title,bodyHtml,actions=''){
    document.getElementById('nxShellModal')?.remove();const root=document.createElement('div');root.id='nxShellModal';root.className='nx-shell-modal';root.innerHTML=`<section class="nx-shell-modal-card" role="dialog" aria-modal="true"><button class="nx-shell-modal-close" type="button">×</button><h2>${esc(title)}</h2><div class="nx-shell-modal-body">${bodyHtml}</div>${actions?`<div class="nx-shell-modal-actions">${actions}</div>`:''}</section>`;document.body.appendChild(root);root.addEventListener('click',e=>{if(e.target===root||e.target.closest('.nx-shell-modal-close'))root.remove()});return root;
  }

  const TOPBAR_PAGES=new Set(['Home','Academics','Study Assistant','Career','Planner','Community','Dashboard','NEXZO Hub','Settings','Profile']);
  const PROTECTED_HREFS=new Set(['ai-assistant.html','planner.html','community.html','dashboard.html','nexzo-hub.html','settings.html','profile.html']);
  const PROTECTED_FEATURES=Object.freeze({
    'ai-assistant.html':{label:'Study Assistant',description:'Your conversations, files and personalized study context require an account.'},
    'planner.html':{label:'Planner',description:'Tasks, timers, submissions and progress are saved to your account.'},
    'community.html':{label:'Community',description:'Posting, study groups and discussions require a verified identity.'},
    'dashboard.html':{label:'Dashboard',description:'Your private progress and learning analytics require an account.'},
    'nexzo-hub.html':{label:'NEXZO Hub',description:'Missions, XP, rewards and achievements are linked to your account.'},
    'settings.html':{label:'Settings',description:'Synced preferences are available after you log in.'},
    'profile.html':{label:'Profile',description:'Your profile, avatar and learning history require an account.'}
  });
  function isGuestSession(){return localStorage.getItem('loggedIn')==='guest'||localStorage.getItem('nexzo_guest_mode')==='true';}
  function isSignedIn(){return localStorage.getItem('loggedIn')==='true'&&!isGuestSession();}
  function normalizedPage(href=''){try{return new URL(href,location.href).pathname.split('/').pop().toLowerCase();}catch{return String(href).split(/[?#]/)[0].split('/').pop().toLowerCase();}}
  function saveProtectedTarget(href){const page=normalizedPage(href);if(PROTECTED_HREFS.has(page))localStorage.setItem('redirectPage',page);}
  function goToAuth(mode='login',target=''){if(target)saveProtectedTarget(target);location.href=mode==='signup'?'signup.html?reason=protected':'login.html?reason=protected';}
  function protectedFeature(target,fallback=''){
    const page=normalizedPage(target),known=PROTECTED_FEATURES[page];
    if(known)return known;
    const clean=String(fallback||'Protected feature').replace(/\s+/g,' ').trim().slice(0,48)||'Protected feature';
    return {label:clean,description:'Sign in to access this feature and keep your progress synchronized.'};
  }
  function openLoginRequired(target,label=''){
    const feature=protectedFeature(target,label);saveProtectedTarget(target);
    const root=modal('Login required',`<div class="nx-guest-auth-copy"><span class="nx-guest-lock">🔒</span><p><strong>${esc(feature.label)} cannot be accessed in Guest mode.</strong><span>${esc(feature.description)}</span></p></div>`,`<button type="button" class="nx-shell-action nx-guest-stay">Continue as guest</button><button type="button" class="nx-shell-action nx-guest-login-primary">Log in</button>`);
    root.querySelector('.nx-guest-stay')?.addEventListener('click',()=>{localStorage.removeItem('redirectPage');root.remove();});
    root.querySelector('.nx-guest-login-primary')?.addEventListener('click',()=>goToAuth('login',target));
    return root;
  }
  const TIMER_KEY='nexzo_shell_timer_v9';
  let timerInterval=null;

  function timerState(){
    const fallback={remaining:1500,running:false,endsAt:0};
    const state=safeParse(localStorage.getItem(TIMER_KEY)||'{}',fallback);
    if(state.running&&state.endsAt){state.remaining=Math.max(0,Math.ceil((state.endsAt-Date.now())/1000));if(!state.remaining){state.running=false;state.endsAt=0;}}
    return {...fallback,...state};
  }
  function saveTimer(state){localStorage.setItem(TIMER_KEY,JSON.stringify(state));}
  function timerText(seconds){const sec=Math.max(0,Math.floor(num(seconds)));return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;}
  function refreshTimer(){
    const state=timerState();document.querySelectorAll('[data-nx-shell-timer]').forEach(el=>el.textContent=timerText(state.remaining));
    document.querySelectorAll('[data-nx-shell-timer-btn]').forEach(el=>el.classList.toggle('is-running',state.running));
    if(!state.running&&timerInterval){clearInterval(timerInterval);timerInterval=null;}
  }
  function toggleTimer(){
    const state=timerState();
    if(state.running){state.remaining=Math.max(0,Math.ceil((state.endsAt-Date.now())/1000));state.running=false;state.endsAt=0;}
    else{if(state.remaining<=0)state.remaining=1500;state.running=true;state.endsAt=Date.now()+state.remaining*1000;}
    saveTimer(state);refreshTimer();
    if(state.running&&!timerInterval)timerInterval=setInterval(refreshTimer,1000);
  }
  function resetTimer(){saveTimer({remaining:1500,running:false,endsAt:0});refreshTimer();}

  function openMobileNav(activeName=''){
    const rows=NAV.map(([label,icon,href,color])=>`<a class="nx-mobile-nav-item ${label===activeName?'active':''}" href="${href}" data-nav-label="${esc(label)}" style="--c:${color}"><i>${icon}</i><span><b>${esc(label)}</b><small>Open ${esc(label)}</small></span><em>›</em></a>`).join('');
    const root=modal('NEXZO',`<div class="nx-mobile-nav-grid">${rows}</div>`);
    root.classList.add('nx-mobile-nav-modal');
  }

  function openSearch(){
    const root=modal('Search NEXZO',`<label class="nx-shell-search-label" for="nxShellSearchInput">Search pages</label><input id="nxShellSearchInput" class="nx-shell-search-input" placeholder="Try Planner, Academics, Profile..." autocomplete="off"><div id="nxShellSearchResults" class="nx-shell-search-results"></div>`);
    const input=root.querySelector('#nxShellSearchInput'),results=root.querySelector('#nxShellSearchResults');
    const render=()=>{const q=input.value.trim().toLowerCase();const rows=NAV.filter(x=>!q||x[0].toLowerCase().includes(q)).map(([label,icon,href])=>`<a href="${href}"><span>${icon}</span><b>${esc(label)}</b><small>Open page</small></a>`).join('');results.innerHTML=rows||'<p class="nx-shell-empty">No matching page.</p>';};
    input.addEventListener('input',render);render();setTimeout(()=>input.focus(),30);
  }
  function openNotifications(){
    const list=notifications();
    const body=list.length?list.slice(0,12).map(n=>`<article class="nx-shell-note"><b>${esc(n.title||'Notification')}</b><p>${esc(n.body||'')}</p>${n.href?`<a href="${esc(n.href)}">Open</a>`:''}</article>`).join(''):'<p class="nx-shell-empty">No notifications yet.</p>';
    const root=modal('Notifications',body,list.length?'<button type="button" class="nx-shell-action" data-clear-notifications>Clear all</button>':'');
    root.querySelector('[data-clear-notifications]')?.addEventListener('click',()=>{localStorage.removeItem('nexzo_notifications_v2');root.remove();refreshNotificationBadge();});
  }
  function refreshNotificationBadge(){const count=notifications().filter(n=>!n.read).length;document.querySelectorAll('[data-nx-shell-badge]').forEach(el=>{el.textContent=count>99?'99+':String(count);el.hidden=!count;});}

  function topbar(name){
    if(name==='Study Assistant'){document.getElementById('nxShellTopbar')?.remove();return;}
    if(!TOPBAR_PAGES.has(name))return;
    const main=document.querySelector('.app > .main')||document.querySelector('main.main')||document.querySelector('main.mentor-main');if(!main)return;
    let bar=document.getElementById('nxShellTopbar');
    if(!bar){bar=document.createElement('header');bar.id='nxShellTopbar';bar.className='nx-shell-topbar';bar.dataset.nexzoShellOwner='app-shell-v2';}
    // Structural invariant: the global quick-actions bar is a viewport-level sibling,
    // never a descendant of scrolling page content. This prevents transformed/contained
    // page wrappers from becoming the containing block for position:fixed.
    // Planner and Settings use their own scrolling .main container. Keep the quick-actions
    // inside that scroller so they leave the screen with the page instead of appearing fixed.
    // Other pages keep the document-level placement that already behaves correctly.
    const localScroller = (name==='Planner' || name==='Settings') ? main : document.body;
    if(bar.parentElement!==localScroller) localScroller.prepend(bar);
    if(localScroller===main) main.style.setProperty('position','relative','important');
    // V117/V119: page-anchored quick actions; never viewport-following.
    // and scrolls away naturally; it must never follow the viewport.
    const pageStyles={
      position:'absolute',top:'10px',right:'18px',left:'auto',bottom:'auto',
      zIndex:'2147483000',width:'auto',maxWidth:'calc(100vw - 36px)',
      margin:'0',transform:'none',translate:'none',willChange:'auto'
    };
    Object.entries(pageStyles).forEach(([prop,val])=>bar.style.setProperty(prop.replace(/[A-Z]/g,m=>'-'+m.toLowerCase()),val,'important'));
    const info=identity(),guest=!isSignedIn();
    const accountMarkup=guest?`<button type="button" class="nx-shell-guest-chip" data-guest-login aria-label="Sign in to NEXZO"><span class="nx-shell-avatar-letter nx-shell-profile-avatar">G</span><span><b>Guest mode</b><small>Sign in to save progress</small></span></button><button type="button" class="nx-shell-signin" data-guest-login>Sign in</button>`:`<a class="nx-shell-profile" href="profile.html" aria-label="Open profile">${avatarMarkup(info,'nx-shell-profile-avatar')}<span><b>${esc(info.name)}</b><small>${esc(info.email||'Student account')}</small></span></a>`;
    bar.innerHTML=`<button type="button" class="nx-global-menu-btn" data-nx-global-menu aria-label="Open navigation">☰</button><a class="nx-shell-mobile-brand" href="Home.html" aria-label="NEXZO Home"><img src="favicon.png" alt=""><span><b>NEXZO</b><small>${esc(name)}</small></span></a><nav class="nx-shell-actions" aria-label="Quick actions"><button type="button" data-nx-shell-search aria-label="Search" title="Search"><span>⌕</span></button><button type="button" data-nx-shell-notifications aria-label="Notifications" title="Notifications"><span>🔔</span><em data-nx-shell-badge hidden>0</em></button><button type="button" class="nx-shell-timer-button" data-nx-shell-timer-btn aria-label="Study timer" title="Start or pause study timer"><span>⏱</span><b data-nx-shell-timer>25:00</b></button><a href="ai-assistant.html" data-nav-label="Study Assistant" aria-label="Study Assistant" title="Study Assistant"><span>✦</span></a>${accountMarkup}</nav>`;
    bar.querySelector('[data-nx-global-menu]')?.addEventListener('click',toggleGlobalMobileSidebar);
    bar.querySelector('[data-nx-shell-search]').addEventListener('click',openSearch);
    bar.querySelector('[data-nx-shell-notifications]').addEventListener('click',openNotifications);
    bar.querySelector('[data-nx-shell-timer-btn]').addEventListener('click',toggleTimer);
    bar.querySelectorAll('[data-guest-login]').forEach(el=>el.addEventListener('click',()=>goToAuth('login')));
    document.body.classList.remove('nx-fixed-top-rail');
    refreshTimer();refreshNotificationBadge();
    if(timerState().running&&!timerInterval)timerInterval=setInterval(refreshTimer,1000);
  }

  function layout(name){
    currentShellName=name||currentShellName;
    sidebar(currentShellName);applySettings();updateIdentity();topbar(currentShellName);
    const side=document.querySelector('.app > .sidebar');
    if(side&&!side.dataset.shellClickBound){side.dataset.shellClickBound='true';side.addEventListener('click',event=>{if(event.target.closest('a')&&matchMedia('(max-width: 820px)').matches)closeGlobalMobileSidebar();});}
    document.body.dataset.shellReady='true';
  }

  function notifications(){return safeParse(localStorage.getItem('nexzo_notifications_v2')||'[]',[]);}
  function addNotification(title,body='',href=''){const list=notifications();list.unshift({id:crypto.randomUUID?.()||String(Date.now()),title,body,href,createdAtMs:Date.now(),read:false});localStorage.setItem('nexzo_notifications_v2',JSON.stringify(list.slice(0,100)));window.dispatchEvent(new CustomEvent('nexzo:notifications-updated'));}
  function notifyDevice(title,body){try{if('Notification'in window&&Notification.permission==='granted')new Notification(title,{body,icon:'favicon.png'});}catch(_){}}
  function checkTaskReminders(){
    const settings=readSettings();if(!settings.notifyTasks)return;
    const store=window.NEXZOTaskStore;if(!store?.getAll)return;
    const now=Date.now(),today=new Date().toISOString().slice(0,10);
    const sent=safeParse(localStorage.getItem('nexzo_reminder_sent_v2')||'{}',{});let changed=false;
    store.getAll().filter(t=>!t.completed&&t.deadlineMs).forEach(t=>{
      const diff=Number(t.deadlineMs)-now;if(diff>86400000)return;
      const key=`${today}:${t.id}:${diff<0?'overdue':'due'}`;if(sent[key])return;
      const title=diff<0?'Task overdue':'Task due soon';const body=`${t.title||'Study task'}${t.deadline?` • ${t.deadline}`:''}`;
      addNotification(title,body,'planner.html');notifyDevice(title,body);sent[key]=now;changed=true;
    });
    if(changed){Object.keys(sent).filter(k=>!k.startsWith(today+':')).forEach(k=>delete sent[k]);localStorage.setItem('nexzo_reminder_sent_v2',JSON.stringify(sent));}
  }

  function profileStats(){
    const p=window.NEXZOStateAuthority?.profile?.()||window.NEXZODataService?.getProfile?.()||{};
    const lv=window.NEXZOLevelSystem?.resolve?.(Math.max(0,num(p.xp)))||{level:1};
    return {xp:Math.max(0,num(p.xp)),level:lv.level,aiScore:Math.max(0,num(p.aiScore))};
  }
  async function awardXP(amount,reason='Activity'){
    const current=window.NEXZOStateAuthority?.profile?.()||window.NEXZODataService?.getProfile?.()||window.NEXZOSharedState?.profile?.()||{};
    const xp=Math.max(0,num(current.xp))+Math.max(0,Math.round(num(amount)));
    const resolved=window.NEXZOLevelSystem?.resolve?.(xp)||{level:1};
    const next={...current,xp,level:resolved.level,updatedAtMs:Date.now()};
    window.NEXZOSharedState?.updateProfile?.(next);
    localStorage.setItem('nexzoProfileEditableV3',JSON.stringify(next));
    localStorage.setItem('nexzoProfileV3',JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('nexzo:profile-updated',{detail:{source:'shell',profile:next,reason}}));
    try{await window.NEXZODataService?.saveProfile?.(next);}catch(_){}
    return next;
  }
  window.NEXZOGamification=window.NEXZOGamification||Object.freeze({
    taskComplete:score=>awardXP(50+Math.round(num(score)*5),'Task completed'),
    aiEvaluation:score=>awardXP(Math.max(5,Math.round(num(score)*2)),'AI evaluation'),
    aiQuestion:()=>awardXP(3,'AI question'),
    communityPost:()=>awardXP(15,'Community post')
  });

  async function logout(){window.__NEXZO_LOGOUT_IN_PROGRESS__=true;try{const {auth,tools}=await authContext();await tools.signOut(auth);}catch(_){}finally{['loggedIn','token','currentUser','email','nexzo_user','nexzo_active_user','nexzo_guest_mode'].forEach(k=>localStorage.removeItem(k));sessionStorage.clear();location.href='login.html';}}


  function bindGuestAccess(){
    if(window.__NEXZO_GUEST_ACCESS_BOUND__)return;window.__NEXZO_GUEST_ACCESS_BOUND__=true;
    document.addEventListener('click',event=>{
      const link=event.target.closest('a[href]');if(!link||isSignedIn())return;
      const page=normalizedPage(link.getAttribute('href')||'');if(!PROTECTED_HREFS.has(page))return;
      event.preventDefault();event.stopPropagation();
      const label=protectedFeature(page,link.dataset.navLabel||link.getAttribute('aria-label')||'').label;
      openLoginRequired(page,label);
    },true);
  }

  function boot(){bindGuestAccess();const page=document.body?.dataset.page;const names={home:'Home',academics:'Academics',code:'Code Agent',career:'Career',planner:'Planner',dashboard:'Dashboard',hub:'NEXZO Hub',community:'Community',settings:'Settings',profile:'Profile',ai:'Study Assistant'};if(names[page])layout(names[page]);applySettings();updateIdentity();setTimeout(checkTaskReminders,1800);}
  window.NEXZOShell=Object.freeze({layout,identity,updateIdentity,toast,modal,confirm:confirmAction,download,readSettings,writeSettings,applySettings,authContext,logout,notifications,addNotification,notifyDevice,profileStats,awardXP,checkTaskReminders,topbar,openSearch,openNotifications,toggleTimer,resetTimer,isGuestSession,isSignedIn,openLoginRequired,goToAuth,esc,safeParse,num,config:window.NEXZOFirebase?.config||{}});
  window.layout=layout;
  window.addEventListener('nexzo:profile-updated',()=>{updateIdentity();const page=document.body?.dataset.page;const names={home:'Home',academics:'Academics',code:'Code Agent',career:'Career',planner:'Planner',dashboard:'Dashboard',hub:'NEXZO Hub',community:'Community',settings:'Settings',profile:'Profile',ai:'Study Assistant'};if(names[page])topbar(names[page]);});window.addEventListener('nexzo:notifications-updated',refreshNotificationBadge);window.addEventListener('nexzo:settings-cloud',e=>{if(!e.detail)return;const value={...SETTINGS_DEFAULTS,...e.detail};localStorage.setItem('nexzo_settings',JSON.stringify(value));localStorage.setItem('nexzoSettingsV3',JSON.stringify(value));applySettings(value);window.dispatchEvent(new CustomEvent('nexzo:settings-changed',{detail:{...value,source:'cloud'}}));});window.addEventListener('storage',e=>{if(['nexzo_settings','nexzoSettingsV3','nexzoProfileEditableV3','profilePhoto'].includes(e.key)){applySettings();updateIdentity();}});
  window.addEventListener('nexzo:auth-ready',()=>{if(currentShellName)layout(currentShellName)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
