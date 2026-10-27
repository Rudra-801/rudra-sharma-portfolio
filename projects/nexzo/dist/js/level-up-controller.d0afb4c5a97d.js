/* NEXZO Level-Up Controller — threshold driven rank celebration. */
(function(){
'use strict';
if(window.NEXZOLevelUpController)return;
const esc=(v)=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const uid=()=>window.NEXZOSettings?.uid?.()||window.NEXZOSharedState?.currentUid?.()||'guest';
const pendingKey=()=>`nexzo:pending-level-up:v1:${uid()}`;
const seenKey=()=>`nexzo:seen-level-up:v2:${uid()}`;
let showing=false;
function tierFor(level){const i=Math.max(0,Math.min(9,Math.floor((Number(level)-1)/10)));return window.NEXZOLevelSystem?.tierData?.[i]||{name:'NEXZO Rank',icon:'🏆',a:'#8b5cf6',b:'#22d3ee'};}
function soundAllowed(){try{return window.NEXZOSettings?.get?.().sound!==false}catch{return true}}
function playLevelSound(){
 if(!soundAllowed())return;
 try{
  const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
  const ctx=new Ctx(); const master=ctx.createGain(); master.gain.setValueAtTime(.0001,ctx.currentTime); master.gain.exponentialRampToValueAtTime(.12,ctx.currentTime+.03); master.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+1.35); master.connect(ctx.destination);
  const notes=[392,523.25,659.25,783.99,1046.5];
  notes.forEach((freq,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=i<3?'triangle':'sine';o.frequency.setValueAtTime(freq,ctx.currentTime+i*.12);g.gain.setValueAtTime(.0001,ctx.currentTime+i*.12);g.gain.exponentialRampToValueAtTime(i===4?.34:.22,ctx.currentTime+i*.12+.025);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+i*.12+.38);o.connect(g);g.connect(master);o.start(ctx.currentTime+i*.12);o.stop(ctx.currentTime+i*.12+.42)});
  const shimmer=ctx.createOscillator(),sg=ctx.createGain();shimmer.type='sine';shimmer.frequency.setValueAtTime(1318.5,ctx.currentTime+.52);shimmer.frequency.exponentialRampToValueAtTime(1760,ctx.currentTime+1.05);sg.gain.setValueAtTime(.0001,ctx.currentTime+.5);sg.gain.exponentialRampToValueAtTime(.09,ctx.currentTime+.58);sg.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+1.2);shimmer.connect(sg);sg.connect(master);shimmer.start(ctx.currentTime+.5);shimmer.stop(ctx.currentTime+1.22);
  setTimeout(()=>ctx.close().catch(()=>{}),1600);
 }catch{}
}
function close(){const el=document.getElementById('nxLevelUpBackdrop');if(!el)return;el.classList.remove('show');document.body.classList.remove('nx-levelup-open');setTimeout(()=>{el.remove();showing=false;showPending();},260);}
function share(detail){const text=`I reached Level ${detail.newLevel} (${detail.rank}) on NEXZO!`;if(navigator.share){navigator.share({title:'NEXZO Level Up',text}).catch(()=>{});return;}navigator.clipboard?.writeText(text).then(()=>window.NEXZOShell?.toast?.('Achievement copied')).catch(()=>{});}
function confetti(){const palette=['var(--tier-a)','var(--tier-b)','#fff','#facc15'];return Array.from({length:32},(_,i)=>`<i class="nx-lu-confetti" style="--x:${(i*37)%100}%;--d:${.35+(i%7)*.08}s;--r:${(i*53)%360}deg;--c:${palette[i%palette.length]}"></i>`).join('')}
function render(detail){
 if(!detail||showing)return;showing=true;
 const level=Math.max(1,Math.min(100,Number(detail.newLevel)||1));const previous=Math.max(1,Number(detail.previousLevel)||Math.max(1,level-1));const tier=tierFor(level);const badge=`assets/badges-webp/level-${level}.webp`;const resolved=window.NEXZOLevelSystem?.resolve?.(Number(detail.totalXP)||0)||{};const g=window.NEXZOGamificationEngine?.summary?.()||{};
 const earnedXP=Math.max(0,Number(detail.earnedXP)||0),earnedCoins=Math.max(0,Number(detail.earnedCoins)||0),pct=Math.max(0,Math.min(100,Number(resolved.pct)||0));const totalXP=Math.max(0,Number(detail.totalXP)||0);const nextRequired=Math.max(0,Number(resolved.nextGoal||resolved.next||resolved.required||0));const remaining=Math.max(0,nextRequired-totalXP);const rank=detail.rank||window.NEXZOLevelSystem?.rank?.(level)||tier.name;const multiplier=(window.NEXZOLevelSystem?.levelMultiplier?.(level)||1).toFixed(2);
 const node=document.createElement('div');node.id='nxLevelUpBackdrop';node.className='nexzo-level-up-backdrop';
 node.innerHTML=`<section class="nx-levelup nx-levelup-premium nx-levelup-compact" role="dialog" aria-modal="true" aria-labelledby="nxLuTitle" style="--tier-a:${tier.a};--tier-b:${tier.b}">
	  <div class="nx-lu-confetti-field" aria-hidden="true">${confetti()}</div><button class="nx-lu-close" aria-label="Close level-up popup">×</button>
	  <header class="nx-lu-compact-head"><img src="favicon.png" alt="NEXZO"><span><small>ACHIEVEMENT UNLOCKED</small><h2 id="nxLuTitle">Level ${level}</h2><p>${esc(rank)} · Keep the momentum going.</p></span></header>
	  <div class="nx-lu-compact-main"><div class="nx-lu-badge-wrap"><span class="nx-lu-badge-glow"></span><img src="${badge}" alt="Level ${level} badge"><strong>${level}</strong></div><div class="nx-lu-compact-progress"><div class="nx-lu-transition"><span>LEVEL ${previous}</span><i>→</i><strong>LEVEL ${level}</strong></div><div class="nx-lu-xp-row"><div><small>TOTAL XP</small><b>${totalXP.toLocaleString()}</b></div><div><small>${level>=100?'STATUS':`LEVEL ${level+1}`}</small><b>${level>=100?'MAX':nextRequired.toLocaleString()+' XP'}</b></div></div><div class="nx-lu-track"><i style="width:${pct}%"></i><em>${Math.round(pct)}%</em></div><p>${level>=100?'Maximum level achieved':`${remaining.toLocaleString()} XP remaining`}</p></div></div>
	  <div class="nx-lu-compact-rewards"><article><span>✨</span><div><small>XP EARNED</small><b>+${earnedXP.toLocaleString()} XP</b></div></article><article><span>🪙</span><div><small>COINS</small><b>+${earnedCoins.toLocaleString()}</b></div></article><article><span>${esc(tier.icon)}</span><div><small>BADGE</small><b>${esc(tier.name)}</b></div></article><article><span>⚡</span><div><small>MULTIPLIER</small><b>${multiplier}×</b></div></article></div>
	  <div class="nx-lu-actions"><button class="nx-lu-share">Share</button><button class="nx-lu-continue">Continue learning <span>→</span></button></div>
	 </section>`;
 document.body.appendChild(node);document.body.classList.add('nx-levelup-open');requestAnimationFrame(()=>{node.classList.add('show');playLevelSound()});
 node.querySelector('.nx-lu-close').onclick=close;node.querySelector('.nx-lu-continue').onclick=close;node.querySelector('.nx-lu-share').onclick=()=>share(detail);node.addEventListener('click',e=>{if(e.target===node)close()});const onKey=e=>{if(e.key==='Escape'){document.removeEventListener('keydown',onKey);close()}};document.addEventListener('keydown',onKey);
}
function queue(detail){if(!detail)return;let list=[],seen=[];try{list=JSON.parse(localStorage.getItem(pendingKey())||'[]');seen=JSON.parse(localStorage.getItem(seenKey())||'[]')}catch{}if(!Array.isArray(list))list=[];if(!Array.isArray(seen))seen=[];const id=detail.id||`${detail.previousLevel}-${detail.newLevel}-${detail.createdAtMs||Date.now()}`;if(seen.includes(id)||list.some(x=>x.id===id))return;list.push({...detail,id});seen.push(id);localStorage.setItem(seenKey(),JSON.stringify(seen.slice(-50)));localStorage.setItem(pendingKey(),JSON.stringify(list.slice(-3)));showPending();}
function showPending(){if(showing||!document.body)return;let list=[];try{list=JSON.parse(localStorage.getItem(pendingKey())||'[]')}catch{}if(!Array.isArray(list)||!list.length)return;const detail=list.shift();localStorage.setItem(pendingKey(),JSON.stringify(list));render(detail);}
window.addEventListener('nexzo:level-up',e=>queue(e.detail));window.NEXZOLevelUpController=Object.freeze({show:render,queue,close});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(showPending,250),{once:true});else setTimeout(showPending,250);
})();
