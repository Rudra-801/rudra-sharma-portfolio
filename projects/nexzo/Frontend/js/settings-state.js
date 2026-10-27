/* NEXZO Settings State v5 — device/cloud separation with confirmed Firestore saves. */
(function(){
'use strict';
if(window.NEXZOSettings?.version>=5)return;

const DEVICE_DEFAULTS=Object.freeze({
  mode:'black-gold',accent:'gold',font:'medium',density:'comfortable',motion:'smooth',sidebar:'expanded',
  focusMode:false,sound:true,readAloud:false,diagnostics:false,assistantAvatarURL:'favicon.png',readAloudVoice:'',readAloudRate:1
});
const CLOUD_DEFAULTS=Object.freeze({
  defaultStudyTime:'1 Hour',weekStart:'Monday',language:'English',timeZone:'Asia/Kolkata',
  inAppNotifications:true,notifyTasks:true,notifyCommunity:true,notifyStreak:true,
  profileVisibility:'Private',activityStatus:true,privacyConsent:false,personalizationConsent:true,
  personalization:true,aiHistory:true,emailDigest:'Off'
});
const DEFAULTS=Object.freeze({...DEVICE_DEFAULTS,...CLOUD_DEFAULTS,autoSync:true,updatedAtMs:0});
const DEVICE_KEYS=new Set(Object.keys(DEVICE_DEFAULTS));
const CLOUD_KEYS=new Set(Object.keys(CLOUD_DEFAULTS));
const ACCENTS=Object.freeze({gold:'#d4af37',purple:'#8b5cf6',blue:'#3b82f6',cyan:'#06b6d4',green:'#22c55e',pink:'#ec4899',silver:'#94a3b8'});

let current={...DEFAULTS}, currentUid='guest', cloudState='local', initialized=false, syncTimer=0, systemThemeListener=null;
const parse=(v,f)=>{try{return JSON.parse(v)||f}catch{return f}};
const userKey=id=>`nexzo:settings:v5:${id||'guest'}`;
const deviceKey=id=>`nexzo:settings:device:v5:${id||'guest'}`;
const cloudCacheKey=id=>`nexzo:settings:cloud:v5:${id||'guest'}`;
const dirtyKey=id=>`nexzo:settings:dirty:v5:${id||'guest'}`;
const legacyKey=id=>`nexzo:settings:v4:${id||'guest'}`;

function authUser(){return window.NEXZOFirebaseUser||window.__NEXZO_AUTH_USER__||null}
function resolveUid(){return authUser()?.uid||window.NEXZOSharedState?.currentUid?.()||'guest'}
function pick(source,keys){const out={};for(const key of keys)if(Object.prototype.hasOwnProperty.call(source,key))out[key]=source[key];return out}
function normalize(value={}){
  const next={...DEFAULTS,...value};
  if(next.mode==='dark')next.mode='black-gold';
  if(!['black-gold','system'].includes(next.mode))next.mode='black-gold';
  if(!ACCENTS[next.accent])next.accent='gold';
  if(!['small','medium','large','xl'].includes(next.font))next.font='medium';
  if(!['compact','comfortable','spacious'].includes(next.density))next.density='comfortable';
  if(!['smooth','reduced','off'].includes(next.motion))next.motion='smooth';
  if(!['expanded','compact','icons'].includes(next.sidebar))next.sidebar='expanded';
  next.readAloudRate=Math.min(1.4,Math.max(.65,Number(next.readAloudRate)||1));
  next.autoSync=true;
  next.updatedAtMs=Math.max(0,Number(next.updatedAtMs)||0);
  return next;
}
function readFor(id=resolveUid()){
  const legacy=parse(localStorage.getItem(legacyKey(id)),{});
  const oldGlobal=parse(localStorage.getItem('nexzo_settings'),{});
  const combined=parse(localStorage.getItem(userKey(id)),{});
  const device=parse(localStorage.getItem(deviceKey(id)),{});
  const cloud=parse(localStorage.getItem(cloudCacheKey(id)),{});
  return normalize({...oldGlobal,...legacy,...combined,...cloud,...device});
}
function persistLocal(value=current,id=currentUid){
  const normalized=normalize(value);
  try{
    localStorage.setItem(deviceKey(id),JSON.stringify(pick(normalized,DEVICE_KEYS)));
    localStorage.setItem(cloudCacheKey(id),JSON.stringify({...pick(normalized,CLOUD_KEYS),updatedAtMs:normalized.updatedAtMs}));
    localStorage.setItem(userKey(id),JSON.stringify(normalized));
    localStorage.setItem('nexzo_settings',JSON.stringify(normalized));
  }catch{}
}
function resolvedTheme(mode){
  if(mode!=='system')return'dark';
  return matchMedia?.('(prefers-color-scheme: light)').matches?'light':'dark';
}
function apply(value=current){
  const r=document.documentElement,b=document.body;if(!b)return;
  const theme=resolvedTheme(value.mode),accent=ACCENTS[value.accent]||ACCENTS.gold;
  r.dataset.nexzoTheme=theme;r.dataset.nexzoThemeMode=value.mode;r.dataset.nexzoAccent=value.accent;
  r.dataset.fontSize=value.font;r.dataset.density=value.density;r.dataset.sidebarMode=value.sidebar;
  r.style.colorScheme=theme;r.style.setProperty('--nx-user-accent',accent);r.style.setProperty('--nx-accent',accent);
  b.dataset.nexzoTheme=theme;b.dataset.nexzoThemeMode=value.mode;b.dataset.density=value.density;b.dataset.sidebarMode=value.sidebar;
  b.dataset.nexzoMotion=value.motion;b.dataset.fontSize=value.font;b.dataset.focusMode=value.focusMode?'on':'off';
  b.classList.toggle('nx-motion-off',value.motion==='off');b.classList.toggle('nx-motion-reduced',value.motion==='reduced');
  b.classList.toggle('nx-theme-light',theme==='light');b.classList.toggle('nx-black-gold',value.mode==='black-gold');
  b.classList.toggle('nx-focus-mode',value.focusMode===true);
  requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('nexzo:appearance-applied',{detail:{theme,mode:value.mode,accent:value.accent,sidebar:value.sidebar,font:value.font,density:value.density,motion:value.motion}})));
}
function emit(source='local'){window.dispatchEvent(new CustomEvent('nexzo:settings-changed',{detail:{...current,source,cloudState}}))}
async function cloudContext(){
  const c=await window.NEXZOFirebase?.getContext?.({auth:true,firestore:true});
  if(!c?.auth?.currentUser)throw Object.assign(new Error('Sign in is required to save account settings.'),{code:'auth/not-signed-in'});
  if(c.auth.currentUser.uid!==currentUid)throw Object.assign(new Error('Authenticated user changed while saving settings.'),{code:'auth/user-mismatch'});
  return c;
}
function applyPatch(patch={}){
  current=normalize({...current,...patch,updatedAtMs:Date.now()});
  persistLocal(current);apply(current);emit('local');return {...current};
}
function splitPatch(patch={}){
  const device={},cloud={},unknown={};
  for(const [key,value] of Object.entries(patch)){
    if(DEVICE_KEYS.has(key))device[key]=value;else if(CLOUD_KEYS.has(key))cloud[key]=value;else if(key!=='updatedAtMs'&&key!=='autoSync')unknown[key]=value;
  }
  return {device,cloud,unknown};
}
async function sync(){
  clearTimeout(syncTimer);
  if(currentUid==='guest'){cloudState='auth-required';return {status:cloudState,confirmed:false,scope:'cloud'};}
  try{
    const c=await cloudContext(),fs=c.firestoreTools,ref=fs.doc(c.db,'users',currentUid,'settings','main');
    const payload={uid:currentUid,schemaVersion:5,...pick(current,CLOUD_KEYS),updatedAtMs:current.updatedAtMs,updatedAt:fs.serverTimestamp()};
    await fs.setDoc(ref,payload,{merge:true});
    const verify=await fs.getDoc(ref);
    if(!verify.exists())throw new Error('Settings write was not readable after save.');
    const saved=verify.data()||{};
    if(Number(saved.updatedAtMs||0)<Number(current.updatedAtMs||0))throw new Error('Settings confirmation is older than the current change.');
    cloudState='connected';localStorage.removeItem(dirtyKey(currentUid));emit('cloud-confirmed');
    return {status:cloudState,confirmed:true,scope:'cloud',updatedAtMs:saved.updatedAtMs};
  }catch(error){
    cloudState=error?.code==='permission-denied'?'permission-denied':error?.code?.startsWith?.('auth/')?'auth-required':navigator.onLine?'unavailable':'offline';
    try{localStorage.setItem(dirtyKey(currentUid),'1')}catch{}
    window.dispatchEvent(new CustomEvent('nexzo:cloud-status',{detail:{area:'settings',status:cloudState,message:error?.message||'Settings cloud save failed.'}}));
    return {status:cloudState,confirmed:false,scope:'cloud',error};
  }
}
function scheduleSync(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>sync(),700)}
function set(patch,{syncCloud=true}={}){
  const {cloud}=splitPatch(patch);const value=applyPatch(patch);
  if(syncCloud&&Object.keys(cloud).length&&currentUid!=='guest')scheduleSync();
  return value;
}
async function saveConfirmed(patch={}){
  const {device,cloud,unknown}=splitPatch(patch);applyPatch({...device,...cloud,...unknown});
  if(!Object.keys(cloud).length)return {status:'device',confirmed:true,scope:'device',settings:{...current}};
  const result=await sync();return {...result,settings:{...current}};
}
async function hydrate(user){
  currentUid=user?.uid||resolveUid();current=readFor(currentUid);apply(current);emit('local-hydrate');
  if(!user){cloudState='local';return current;}
  try{
    const c=await cloudContext(),fs=c.firestoreTools,snap=await fs.getDoc(fs.doc(c.db,'users',currentUid,'settings','main'));
    if(snap.exists()){
      const cloud=snap.data()||{},localUpdated=Number(current.updatedAtMs||0),cloudUpdated=Number(cloud.updatedAtMs||0),dirty=localStorage.getItem(dirtyKey(currentUid))==='1';
      if(!dirty&&cloudUpdated>=localUpdated){current=normalize({...current,...pick(cloud,CLOUD_KEYS),updatedAtMs:cloudUpdated});persistLocal(current);apply(current);emit('cloud-hydrate');}
      else if(dirty||localUpdated>cloudUpdated)scheduleSync();
    }else if(Object.keys(pick(current,CLOUD_KEYS)).length)scheduleSync();
    cloudState='connected';
  }catch(error){cloudState=error?.code==='permission-denied'?'permission-denied':'offline';}
  return current;
}
function notify(title,body){if(!current.inAppNotifications)return;if(Notification?.permission==='granted')new Notification(title,{body,icon:'favicon.png'});}
function resetDefaults(){return saveConfirmed({...DEFAULTS,updatedAtMs:Date.now()})}
async function init(){
  if(initialized)return;initialized=true;currentUid=resolveUid();current=readFor(currentUid);apply(current);
  try{
    const media=matchMedia('(prefers-color-scheme: light)');systemThemeListener=()=>current.mode==='system'&&apply(current);media.addEventListener?.('change',systemThemeListener);
  }catch{}
  try{const {auth,tools}=await window.NEXZOFirebase.getAuthContext();tools.onAuthStateChanged(auth,u=>{window.NEXZOFirebaseUser=u;hydrate(u)});}catch{hydrate(null)}
  window.addEventListener('online',()=>{if(currentUid!=='guest'&&localStorage.getItem(dirtyKey(currentUid))==='1')sync();});
}

window.addEventListener('nexzo:community-reply',e=>{if(current.notifyCommunity)notify('NEXZO Community',e.detail?.message||'New community activity');});
window.addEventListener('nexzo:streak-at-risk',e=>{if(current.notifyStreak)notify('Study streak reminder',e.detail?.message||'Complete a study activity to protect your streak.');});
window.addEventListener('nexzo:task-reminder',e=>{if(current.notifyTasks)notify('Planner reminder',e.detail?.message||'A Planner task is due soon.');});

window.NEXZOSettings=Object.freeze({
  version:5,defaults:DEFAULTS,deviceDefaults:DEVICE_DEFAULTS,cloudDefaults:CLOUD_DEFAULTS,deviceKeys:[...DEVICE_KEYS],cloudKeys:[...CLOUD_KEYS],accents:ACCENTS,
  get:()=>({...current}),set,saveConfirmed,sync,hydrate,apply,resetDefaults,status:()=>cloudState,uid:()=>currentUid,isDeviceKey:key=>DEVICE_KEYS.has(key),isCloudKey:key=>CLOUD_KEYS.has(key),init
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
