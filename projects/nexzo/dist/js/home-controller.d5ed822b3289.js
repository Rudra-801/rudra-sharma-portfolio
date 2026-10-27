/* NEXZO Home Controller v152 — live account metrics from canonical stores + Firestore community. */
(function(){
'use strict';
if(document.body?.dataset.page!=='home')return;
const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
let postCount=null,postUnsub=null,postConnectStarted=false;
function localPostCount(){try{const rows=JSON.parse(localStorage.getItem('nexzo_community_v2_posts')||'[]');return Array.isArray(rows)?rows.length:0}catch{return 0}}
function render(){
  window.NEXZOShell?.layout?.('Home');
  const snapshot=window.NEXZOStateAuthority?.snapshot?.()||{};
  const stats=snapshot.stats||window.NEXZOTaskStore?.stats?.()||{};
  const level=Math.max(1,Number(snapshot.level?.level)||1);
  const game=window.NEXZOGamificationEngine?.summary?.()||{};
  const achievements=Array.isArray(game.achievements)?game.achievements.length:Math.max(0,Number(snapshot.profile?.achievementsCount)||0);
  set('homeTaskCountV5',Math.max(0,Number(stats.tasksToday)||0));
  set('homeProgressV5',Math.max(0,Math.min(100,Number(stats.progress)||0))+'%');
  set('homePostCountV5',postCount==null?localPostCount():postCount);
  set('homeAchievementsV5',achievements);
  set('homeLevelV5','Lv. '+level);
  document.documentElement.style.setProperty('--home-xp',String(snapshot.level?.xp||0));
}
async function connectCommunityCount(){
  if(postConnectStarted||!window.NEXZOFirebase?.getContext)return;
  postConnectStarted=true;
  try{
    const c=await window.NEXZOFirebase.getContext({auth:true,firestore:true});
    const fs=c.firestoreTools;
    if(!c.auth?.currentUser){postConnectStarted=false;return;}
    try{postUnsub?.()}catch{}
    postUnsub=fs.onSnapshot(fs.collection(c.db,'posts'),snap=>{postCount=snap.size;render();window.dispatchEvent(new CustomEvent('nexzo:community-count-updated',{detail:{posts:postCount}}));},()=>{postCount=localPostCount();render()});
  }catch{postConnectStarted=false;postCount=localPostCount();render()}
}
function boot(){
  render();connectCommunityCount();
  ['nexzo:tasks-updated','nexzo:task-store','nexzo:profile-updated','nexzo:stats-updated','nexzo:rewards-updated','nexzo:achievement-unlocked','nexzo:data-ready','nexzo:auth-ready'].forEach(name=>window.addEventListener(name,()=>{render();if(name==='nexzo:data-ready'||name==='nexzo:auth-ready'){postConnectStarted=false;connectCommunityCount();}}));
  window.addEventListener('storage',render);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
