/* NEXZO Shared State v13 — UID-scoped preferences/profile cache and cross-tab sync. */
(function(){
  'use strict';
  if(window.NEXZOSharedState)return;
  const parse=(raw,fallback)=>{try{return JSON.parse(raw)??fallback}catch{return fallback}};
  let uid='local';
  const scoped=(key,id=uid)=>`${key}:${id||'local'}`;
  const currentUid=()=>window.NEXZODataService?.getUser?.()?.uid||window.NEXZOFirebase?.currentUser?.uid||uid||'local';
  function setOwner(next){const value=String(next||'local');if(value===uid)return;uid=value;window.dispatchEvent(new CustomEvent('nexzo:owner-changed',{detail:{uid}}));}
  function get(key,fallback=null,{global=false}={}){return parse(localStorage.getItem(global?key:scoped(key))??'',fallback)}
  function set(key,value,{global=false}={}){localStorage.setItem(global?key:scoped(key),JSON.stringify(value));window.dispatchEvent(new CustomEvent('nexzo:state-changed',{detail:{key,value,uid,global}}));return value}
  function remove(key,{global=false}={}){localStorage.removeItem(global?key:scoped(key));}
  function migrate(key,fallback){
    const target=scoped(key), legacy=localStorage.getItem(key);
    if(localStorage.getItem(target)==null && legacy!=null){
      const knownOwner=localStorage.getItem('nexzo_legacy_cache_owner')||localStorage.getItem('nexzo_canonical_cache_owner')||'';
      const active=currentUid();
      // Never attach anonymous legacy data to a different authenticated account.
      if(active==='local'||knownOwner===active){
        localStorage.setItem(target,legacy);
        if(active!=='local') localStorage.setItem('nexzo_legacy_cache_owner',active);
      }
    }
    return get(key,fallback)
  }
  function profile(){return migrate('nexzo_profile_v13',{})}
  function settings(){return migrate('nexzo_settings_v13',{})}
  function updateProfile(patch){return set('nexzo_profile_v13',{...profile(),...(patch||{}),updatedAtMs:Date.now()})}
  function updateSettings(patch){return set('nexzo_settings_v13',{...settings(),...(patch||{}),updatedAtMs:Date.now()})}
  window.addEventListener('storage',e=>{if(!e.key)return;window.dispatchEvent(new CustomEvent('nexzo:cross-tab-sync',{detail:{key:e.key,newValue:e.newValue}}));});
  window.addEventListener('nexzo:data-ready',e=>setOwner(e.detail?.uid));
  window.addEventListener('nexzo:owner-changed',()=>{});
  window.NEXZOSharedState=Object.freeze({get,set,remove,migrate,profile,settings,updateProfile,updateSettings,setOwner,currentUid,scoped});
})();
