/* NEXZO Settings Controller v5 — only working controls, confirmed cloud saves, safe account actions. */
(function(){
'use strict';
if(document.body?.dataset.page!=='settings'||window.__NEXZO_SETTINGS_V5__)return;window.__NEXZO_SETTINGS_V5__=true;
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const panels=['general','preferences','notifications','privacy','account','about'];let active='general',saving=false;
const mgr=()=>window.NEXZOSettings,s=()=>mgr()?.get()||{},toast=(m,t='info')=>window.NEXZOShell?.toast?.(m,t);
const scopeBadge=key=>mgr()?.isDeviceKey?.(key)?'<em class="settings-v5-scope device">This device</em>':'<em class="settings-v5-scope cloud">NEXZO account</em>';
const opts=(key,values,labels={})=>`<div class="settings-v3-segmented">${values.map(v=>`<button type="button" class="${s()[key]===v?'active':''}" data-set="${key}" data-value="${v}" aria-pressed="${s()[key]===v}">${labels[v]||v}</button>`).join('')}</div>`;
const row=(icon,title,desc,control,key='')=>`<div class="settings-v3-setting-row"><div class="settings-v3-setting-info"><span class="settings-v3-setting-icon">${icon}</span><div class="settings-v3-setting-copy"><b>${title}</b><small>${desc}</small>${key?scopeBadge(key):''}</div></div><div class="settings-v5-control">${control}</div></div>`;
const toggle=(key,title,desc,icon)=>row(icon,title,desc,`<button type="button" class="settings-v4-toggle" data-toggle="${key}" role="switch" aria-checked="${!!s()[key]}" aria-pressed="${!!s()[key]}">${s()[key]?'ON':'OFF'}</button>`,key);
const select=(key,title,desc,icon,values)=>row(icon,title,desc,`<select data-select="${key}" aria-label="${esc(title)}">${values.map(v=>`<option ${s()[key]===v?'selected':''}>${v}</option>`).join('')}</select>`,key);
const card=(title,desc,body,accent='purple')=>`<article class="settings-v3-card" data-accent-card="${accent}"><div class="settings-v3-card-title"><span class="settings-v3-title-icon">◉</span><div><h2>${title}</h2><p>${desc}</p></div></div>${body}</article>`;

function general(){
  const accents=window.NEXZOSettings?.accents||{};
  return card('Appearance','Black Gold is the canonical NEXZO theme. System follows your operating system while keeping NEXZO branding.',
    row('◐','Theme','Choose the NEXZO Black Gold theme or follow system light/dark appearance.',opts('mode',['black-gold','system'],{'black-gold':'Black Gold',system:'System'}),'mode')+
    row('🎨','Accent','Changes interactive highlights without replacing the NEXZO gold brand.',`<div class="settings-v3-color-grid">${Object.entries(accents).map(([name,color])=>`<button type="button" class="${s().accent===name?'active':''}" data-set="accent" data-value="${name}" style="--swatch:${color}" aria-pressed="${s().accent===name}"><i></i><span>${name[0].toUpperCase()+name.slice(1)}</span></button>`).join('')}</div>`,'accent')+
    row('Aa','Font size','Adjust readable content size without browser zoom.',opts('font',['small','medium','large','xl'],{small:'Small',medium:'Medium',large:'Large',xl:'XL'}),'font')+
    row('▦','Interface density','Controls page/card spacing.',opts('density',['compact','comfortable','spacious'],{compact:'Compact',comfortable:'Comfortable',spacious:'Spacious'}),'density')+
    row('✦','Motion','Reduced disables non-essential motion; Off removes decorative animations.',opts('motion',['smooth','reduced','off'],{smooth:'Smooth',reduced:'Reduced',off:'Off'}),'motion')+
    row('☰','Sidebar','Choose how much navigation detail is shown.',opts('sidebar',['expanded','compact','icons'],{expanded:'Expanded',compact:'Compact',icons:'Icons only'}),'sidebar')
  );
}
function preferences(){return card('Study Preferences','Account study defaults persist under your Firebase UID; audio behavior is device-specific.',
  select('defaultStudyTime','Default study time','Default duration used when a workflow needs a study target.','⏱',['30 Min','1 Hour','2 Hours','3 Hours','4 Hours'])+
  select('weekStart','Week starts on','Used by weekly charts and reports.','📅',['Monday','Sunday'])+
  select('language','Language','Preferred interface/AI language context.','🌐',['English','Hindi','Hinglish'])+
  select('timeZone','Timezone','Used for reminders and daily reset calculations.','⌚',['Asia/Kolkata','UTC','Asia/Dubai','Europe/London','America/New_York'])+
  toggle('focusMode','Focus mode','Reduces non-essential interface distractions.','🎯')+
  toggle('readAloud','Read-aloud preference','When enabled, Study Assistant may offer/continue spoken responses on this device.','🔈')
);}
function notifications(){return card('Notifications','In-app preferences are cloud-saved. Browser permission remains controlled by this browser.',
  toggle('inAppNotifications','In-app notifications','Master switch for NEXZO notification surfaces.','🔔')+
  toggle('notifyTasks','Task reminders','Upcoming and overdue Planner tasks.','📅')+
  toggle('notifyCommunity','Community activity','Replies, group messages and relevant activity.','👥')+
  toggle('notifyStreak','Streak reminders','Warn before the study streak is at risk.','🔥')+
  toggle('sound','Notification sound','Play optional notification/action sounds on this device.','🔊')+
  row('🌐','Browser notifications','Permission is requested only after you click Enable. Remote push needs the configured Firebase Web Push key.',`<div class="settings-v5-inline"><button class="btn" id="requestPermission">Enable</button><small class="settings-v4-note" id="permissionState">${'Notification'in window?Notification.permission:'Unsupported'}</small></div>`)
);}
function privacy(){return card('Privacy & Personalization','These choices control what NEXZO may use for personalization and whether Study Assistant history is retained.',
  toggle('privacyConsent','Privacy consent','Records your acknowledgement of NEXZO privacy controls for this account.','🛡')+
  toggle('personalizationConsent','Personalization consent','Allow learning activity to be used for personalized NEXZO guidance.','🧠')+
  toggle('personalization','AI personalization','When OFF, stored learning context should not be included in new AI requests.','🤖')+
  toggle('aiHistory','AI history','Allow Study Assistant conversations to be stored/synced for future sessions.','💬')+
  select('profileVisibility','Profile visibility','Controls intended social visibility. Features that cannot enforce a mode will not claim otherwise.','👤',['Public','Friends only','Private'])+
  toggle('activityStatus','Activity status','Allow social features to show active/recent activity when implemented.','⚡')+
  row('🧹','Clear AI history','Deletes Study Assistant history from this device and your Firestore aiChats collection after confirmation.',`<button class="btn danger-soft" id="clearAIHistory">Clear AI history</button>`)+
  row('🍪','Consent center','Review the optional privacy choices used by the shared consent UI.',`<button class="btn" id="manageConsent">Manage consent</button>`)
);}
async function authInfo(){try{const {auth}=await window.NEXZOFirebase.getAuthContext();return auth.currentUser}catch{return null}}
function account(){return card('Account','Account actions never claim server-side deletion unless a backend/admin actually performs it.','<div id="accountDynamic">Loading account…</div>','gold')}
function about(){return card('About NEXZO','Personalized recommender and study workspace for university students.',
  row('◇','Version','Settings and data-safety contract.','<b>5.0.0</b>')+
  row('✦','Study Assistant','Open the connected learning assistant.','<a class="btn" href="ai-assistant.html">Open Study Assistant</a>')+
  row('🔒','Privacy & Terms','Review current project policies.','<span class="settings-v4-links"><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="data-deletion.html">Data deletion</a></span>')
);}
const renderers={general,preferences,notifications,privacy,account,about};
function render(name=active){active=panels.includes(name)?name:'general';document.querySelectorAll('#settingsV3Tabs [data-panel]').forEach(b=>b.classList.toggle('active',b.dataset.panel===active));$('settingsV3Content').innerHTML=renderers[active]();bindDynamic();if(active==='account')renderAccount();updatePreview();}

async function saveSetting(key,value){
  if(saving)return;saving=true;const controls=[...document.querySelectorAll('[data-set],[data-toggle],[data-select]')];controls.forEach(el=>el.disabled=true);
  try{
    const result=await mgr().saveConfirmed({[key]:value});render(active);
    if(result.confirmed&&result.scope==='cloud')toast('Saved to your NEXZO account.','success');
    else if(result.confirmed)toast('Saved on this device.','success');
    else toast(result.status==='auth-required'?'Sign in is required to save this account setting.':'Change kept on this device, but cloud save was not confirmed.','error');
  }catch(error){render(active);toast(error?.message||'Setting could not be saved.','error');}
  finally{saving=false;}
}
function confirmModal(title,text,onYes,{phrase=''}={}){
  const modal=document.createElement('div');modal.className='settings-v4-modal';
  modal.innerHTML=`<div role="dialog" aria-modal="true" aria-labelledby="settingsConfirmTitle"><h2 id="settingsConfirmTitle">${esc(title)}</h2><p>${esc(text)}</p>${phrase?`<label class="settings-v5-confirm-label">Type <b>${esc(phrase)}</b> to continue<input id="settingsConfirmPhrase" autocomplete="off" spellcheck="false"></label>`:''}<div class="settings-v4-modal-actions"><button class="btn" data-no>Cancel</button><button class="btn danger" data-yes ${phrase?'disabled':''}>Continue</button></div></div>`;
  document.body.appendChild(modal);const no=modal.querySelector('[data-no]'),yes=modal.querySelector('[data-yes]'),input=modal.querySelector('#settingsConfirmPhrase');
  const close=()=>modal.remove();no.onclick=close;modal.addEventListener('click',e=>{if(e.target===modal)close()});
  if(input){input.addEventListener('input',()=>{yes.disabled=input.value.trim()!==phrase});input.focus();}
  yes.onclick=async()=>{yes.disabled=true;try{await onYes();close()}catch(error){yes.disabled=false;toast(error?.message||'Action failed.','error')}};
}
function bindDynamic(){
  document.querySelectorAll('[data-set]').forEach(b=>b.onclick=()=>saveSetting(b.dataset.set,b.dataset.value));
  document.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>saveSetting(b.dataset.toggle,!s()[b.dataset.toggle]));
  document.querySelectorAll('[data-select]').forEach(el=>el.onchange=()=>saveSetting(el.dataset.select,el.value));
  $('requestPermission')?.addEventListener('click',async()=>{const result=await window.NEXZOConsent?.enablePush?.(),status=result?.status||('Notification'in window?Notification.permission:'unsupported');$('permissionState').textContent=status==='ready'?'Push ready':status==='permission-granted'?'Allowed · remote push not configured':status;toast(status==='ready'?'Browser/push notifications are ready.':status==='permission-granted'?'Browser permission granted; remote push still needs the configured Web Push key.':`Notification status: ${status}`,status==='ready'?'success':'info');});
  $('manageConsent')?.addEventListener('click',()=>window.NEXZOConsent?.open?.());
  $('clearAIHistory')?.addEventListener('click',()=>confirmModal('Clear AI history?','This deletes Study Assistant conversation history from this device and from your account aiChats collection. Planner, profile, XP and academic progress are not deleted.',clearAIHistory,{phrase:'CLEAR'}));
}
async function renderAccount(){
  const host=$('accountDynamic'),u=await authInfo();if(!u){host.innerHTML='<p>No Firebase user is signed in.</p>';return;}
  const photo=u.photoURL?`<img src="${esc(u.photoURL)}" alt="Profile">`:`<span class="settings-v4-avatar">${esc((u.displayName||u.email||'N')[0])}</span>`;
  host.innerHTML=
    row('👤','Signed-in account','Firebase Authentication is the authoritative account identity.',`<div class="settings-v4-account">${photo}<div><b>${esc(u.displayName||'No display name')}</b><small>${esc(u.email||'')}</small><small>UID: ${esc(u.uid)}</small></div></div>`)+
    row('✉️','Email verification','Send Firebase email verification if the account is unverified.',`<button class="btn" id="verifyEmail" ${u.emailVerified?'disabled':''}>${u.emailVerified?'Verified':'Send verification'}</button>`)+
    row('🔐','Password reset','Send a password-reset link to the signed-in email.',`<button class="btn" id="passwordReset">Send reset link</button>`)+
    row('⇧','Export device snapshot','Downloads the NEXZO data currently available to this browser. It is not claimed as a complete server export.',`<button class="btn" id="exportData">Download JSON</button>`)+
    row('🧪','Connection check','Checks Auth, Firestore and the configured NEXZO backend without writing test documents.',`<button class="btn" id="connectionCheck">Run check</button><div class="settings-component-status" id="componentStatus"></div>`)+
    row('🗑','Request account deletion','Creates an explicit deletion request under your UID. It does not falsely claim that Firebase Auth/Firestore data was already erased.',`<button class="btn danger" id="deleteAccountRequest">Request deletion</button>`);
  bindAccount(u);
}
async function connectionTest(){
  const out=$('componentStatus');if(out)out.innerHTML='<span>Testing…</span>';let auth='Disconnected',fire='Not checked',backend='Offline',model='Not reported';
  try{const c=await window.NEXZOFirebase.getContext({auth:true,firestore:true});auth=c.auth.currentUser?'Connected':'Disconnected';if(c.auth.currentUser){try{const fs=c.firestoreTools,snap=await fs.getDoc(fs.doc(c.db,'users',c.auth.currentUser.uid,'settings','main'));fire=snap.exists()?'Connected':'Connected · no settings doc yet';}catch(error){fire=error.code==='permission-denied'?'Permission denied':'Unavailable';}}}catch{}
  try{const base=window.NEXZO_CONFIG?.API_BASE_URL||document.querySelector('meta[name="nexzo-api-base-url"]')?.content||'';if(base){const root=base.replace(/\/api\/?$/,'');const response=await fetch(`${root}/ready`,{cache:'no-store',signal:AbortSignal.timeout?.(6000)});const data=await response.json().catch(()=>({}));backend=response.ok?'Ready':`HTTP ${response.status}`;model=data.gemini?.status||data.model?.status||data.ai?.status||'Not reported';}}catch{}
  if(out)out.innerHTML=`<span>Firebase Auth <b>${esc(auth)}</b></span><span>Firestore <b>${esc(fire)}</b></span><span>NEXZO backend <b>${esc(backend)}</b></span><span>AI service <b>${esc(model)}</b></span>`;
}
function collectExport(){
  const pick=re=>Object.fromEntries(Object.keys(localStorage).filter(k=>re.test(k)).map(k=>[k,(()=>{try{return JSON.parse(localStorage.getItem(k))}catch{return localStorage.getItem(k)}})()]));
  return {exportedAt:new Date().toISOString(),scope:'device-snapshot',user:window.NEXZOShell?.identity?.(),settings:s(),profile:pick(/profile/i),tasks:pick(/task|planner/i),rewards:window.NEXZOGamificationEngine?.summary?.()||pick(/gamification|reward|xp|coin/i),achievements:pick(/achievement/i),communityCache:pick(/community|post|group/i),aiHistoryCache:pick(/ai.*chat|chat.*history/i)};
}
function bindAccount(user){
  $('verifyEmail').onclick=async()=>{try{const {tools}=await window.NEXZOFirebase.getAuthContext();await tools.sendEmailVerification(user);toast('Verification email sent.','success')}catch(error){toast(error.message,'error')}};
  $('passwordReset').onclick=async()=>{try{const {auth,tools}=await window.NEXZOFirebase.getAuthContext();await tools.sendPasswordResetEmail(auth,user.email);toast('Password reset email sent.','success')}catch(error){toast(error.message,'error')}};
  $('exportData').onclick=exportUserData;$('connectionCheck').onclick=connectionTest;
  $('deleteAccountRequest').onclick=()=>confirmModal('Request account deletion?','This records a pending deletion request for administrator/backend processing. It will not immediately erase your account or cloud data.',()=>requestAccountDeletion(user),{phrase:'DELETE'});
}
async function requestAccountDeletion(user){
  const c=await window.NEXZOFirebase.getContext({auth:true,firestore:true});if(!c.auth.currentUser||c.auth.currentUser.uid!==user.uid)throw new Error('Signed-in account changed. Retry the request.');
  const fs=c.firestoreTools,requestId=`delete_${Date.now()}`,ref=fs.doc(c.db,'users',user.uid,'accountRequests',requestId),payload={uid:user.uid,type:'delete-account',status:'pending',source:'settings',requestedAtMs:Date.now(),requestedAt:fs.serverTimestamp()};
  await fs.setDoc(ref,payload);const verify=await fs.getDoc(ref);if(!verify.exists())throw new Error('Deletion request could not be confirmed.');
  toast('Deletion request recorded. Your account has not been deleted yet.','success');
}
async function clearAIHistory(){
  let cloudDeleted=0;const user=await authInfo();
  if(user){const c=await window.NEXZOFirebase.getContext({auth:true,firestore:true}),fs=c.firestoreTools,snapshot=await fs.getDocs(fs.collection(c.db,'users',user.uid,'aiChats'));if(snapshot.size){let batch=fs.writeBatch(c.db),count=0;for(const docSnap of snapshot.docs){batch.delete(docSnap.ref);count++;if(count%450===0){await batch.commit();batch=fs.writeBatch(c.db);}}if(count%450!==0)await batch.commit();cloudDeleted=count;}}
  for(const key of Object.keys(localStorage)){if(/(?:nexzo|ai).*(?:session|chat|history)|nexzo\.ai\.clean/i.test(key))localStorage.removeItem(key);}
  try{indexedDB.deleteDatabase('nexzo-assistant-projects-v1')}catch{}
  window.dispatchEvent(new CustomEvent('nexzo:ai-history-cleared',{detail:{cloudDeleted}}));toast(`AI history cleared${user?` (${cloudDeleted} cloud conversation${cloudDeleted===1?'':'s'})`:''}.`,'success');
}
function clearTemporaryCache(){confirmModal('Clear local device cache?','Only temporary browser caches and diagnostic/runtime cache keys are removed. Cloud profile, Level, XP, tasks, academic progress, posts and Study Groups are not deleted.',async()=>{if('caches'in window){for(const name of await caches.keys())await caches.delete(name)}for(const key of Object.keys(localStorage)){if(/^(?:nexzo:)?(?:cache|temp|runtime_cache|runtime_log|diagnostic|error_log)/i.test(key))localStorage.removeItem(key)}toast('Local temporary cache cleared.','success')},{phrase:'CLEAR'});}
function resetUserSettings(){confirmModal('Reset NEXZO settings?','Device appearance and cloud preference controls return to defaults. Tasks, XP, profile, posts and academic progress are not changed.',async()=>{const result=await mgr().resetDefaults();render('general');if(result.confirmed)toast(result.scope==='cloud'?'Settings reset and confirmed in Firestore.':'Device settings reset.','success');else toast('Defaults applied locally, but cloud confirmation failed.','error')},{phrase:'RESET'});}
async function syncUserSettings(){const button=$('settingsSync');try{if(button)button.disabled=true;const result=await mgr().sync();toast(result.confirmed?'Settings sync confirmed.':'Cloud settings were not confirmed. Your device copy is unchanged.',result.confirmed?'success':'error')}finally{if(button)button.disabled=false}}
function exportUserData(){window.NEXZOShell?.download?.('nexzo-device-data-export.json',JSON.stringify(collectExport(),null,2),'application/json');toast('Device snapshot export created.','success')}
function logoutUser(){confirmModal('Log out of NEXZO?','Cloud data remains associated with your Firebase account.',async()=>{const c=await window.NEXZOFirebase?.getAuthContext?.();if(c?.auth&&c?.tools?.signOut)await c.tools.signOut(c.auth);else if(window.NEXZOShell?.logout)await window.NEXZOShell.logout();location.href='login.html';});}
function bindQuickActions(){$('settingsClearCache')?.addEventListener('click',clearTemporaryCache);$('settingsReset')?.addEventListener('click',resetUserSettings);$('settingsSync')?.addEventListener('click',syncUserSettings);$('settingsExport')?.addEventListener('click',exportUserData);$('settingsLogout')?.addEventListener('click',logoutUser);}
function updatePreview(){const value=s();if($('settingsPreviewText'))$('settingsPreviewText').textContent=`${value.mode} • ${value.motion} motion • ${value.density}`;$('settingsPreviewProgress')?.style.setProperty('width',value.density==='compact'?'45%':value.density==='spacious'?'90%':'70%');}
function init(){bindQuickActions();document.querySelectorAll('#settingsV3Tabs [data-panel]').forEach(b=>b.onclick=()=>render(b.dataset.panel));let searchTimer=0;$('settingsGlobalSearch')?.addEventListener('input',e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{const q=e.target.value.trim().toLowerCase();if(!q)return;const map={theme:'general',gold:'general',motion:'general',font:'general',study:'preferences',language:'preferences',read:'preferences',notification:'notifications',sound:'notifications',privacy:'privacy',personal:'privacy',history:'privacy',account:'account',password:'account',delete:'account'};const hit=Object.entries(map).find(([key])=>q.includes(key));if(hit)render(hit[1]);},180)});window.openSettingsPanelV3=render;render();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
