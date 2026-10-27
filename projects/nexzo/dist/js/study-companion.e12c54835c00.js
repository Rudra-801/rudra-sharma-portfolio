(()=>{'use strict';
const pet=document.getElementById('nexzoCompanion');
const stage=pet?.querySelector('.pet-stage');
const closeBtn=pet?.querySelector('.pet-close');
const mood=document.getElementById('petMood');
const presence=document.getElementById('petPresenceText');
if(!pet||!stage)return;
const docked=pet.dataset.layout==='panel';

const stateCopy={
  ready:['Ready','Ready to help'],
  reading:['Reading','Checking your files'],
  searching:['Searching','Looking for the best answer'],
  running:['Working','Running a tool'],
  generating:['Creating','Making something for you'],
  saving:['Saving','Keeping your progress safe'],
  error:['Oops','Something needs attention']
};
let dragged=false, pointerId=null, startX=0,startY=0,baseLeft=0,baseBottom=0;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const currentState=()=>document.body.dataset.agentState||'ready';

function syncState(){
  const state=currentState();
  pet.dataset.petState=state;
  const [short,long]=stateCopy[state]||stateCopy.ready;
  if(mood)mood.textContent=long;
  if(presence)presence.textContent=short;
}
function setOpen(open){
  if(docked){pet.classList.remove('is-open');stage.setAttribute('aria-expanded','true');return;}
  pet.classList.toggle('is-open',!!open);
  stage.setAttribute('aria-expanded',open?'true':'false');
  localStorage.setItem('nexzo.pet.open',open?'1':'0');
}
function restorePosition(){
  if(docked)return;
  try{
    const raw=JSON.parse(localStorage.getItem('nexzo.pet.position')||'null');
    if(!raw||!Number.isFinite(raw.left)||!Number.isFinite(raw.bottom))return;
    pet.style.left=`${clamp(raw.left,8,Math.max(8,innerWidth-90))}px`;
    pet.style.bottom=`${clamp(raw.bottom,8,Math.max(8,innerHeight-100))}px`;
  }catch{}
}
function savePosition(){
  if(docked)return;
  const r=pet.getBoundingClientRect();
  localStorage.setItem('nexzo.pet.position',JSON.stringify({left:Math.round(r.left),bottom:Math.round(innerHeight-r.bottom)}));
}
function resetEyes(){pet.style.setProperty('--pet-eye-x','0px');pet.style.setProperty('--pet-eye-y','0px');}

// Decorative pointer-follow/parallax was removed in v240. Dragging remains functional.
resetEyes();stage.style.transform='';
stage.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  if(docked){react('wave');return;}
  pointerId=e.pointerId;dragged=false;startX=e.clientX;startY=e.clientY;
  const r=pet.getBoundingClientRect();baseLeft=r.left;baseBottom=innerHeight-r.bottom;
  stage.setPointerCapture?.(e.pointerId);pet.classList.add('is-grabbing');
});
stage.addEventListener('pointermove',e=>{
  if(pointerId!==e.pointerId)return;
  const dx=e.clientX-startX,dy=e.clientY-startY;
  if(Math.hypot(dx,dy)>5)dragged=true;
  if(!dragged)return;
  const left=clamp(baseLeft+dx,8,Math.max(8,innerWidth-90));
  const bottom=clamp(baseBottom-dy,8,Math.max(8,innerHeight-100));
  pet.style.left=`${left}px`;pet.style.bottom=`${bottom}px`;
});
stage.addEventListener('pointerup',e=>{
  if(pointerId!==e.pointerId)return;
  stage.releasePointerCapture?.(e.pointerId);pet.classList.remove('is-grabbing');pointerId=null;
  if(dragged){savePosition();return;}
  // Floating companion opens the real Pet Zone. It must not behave like a
  // decorative button that only jumps when touched.
  if(pet.dataset.layout==='float')return;
  pet.classList.add('is-reacting');setTimeout(()=>pet.classList.remove('is-reacting'),420);
  react('wave');
  setOpen(!pet.classList.contains('is-open'));
});
stage.addEventListener('pointercancel',()=>{pointerId=null;pet.classList.remove('is-grabbing');});
stage.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setOpen(!pet.classList.contains('is-open'));}});
closeBtn?.addEventListener('click',()=>setOpen(false));
document.addEventListener('click',e=>{if(pet.classList.contains('is-open')&&!pet.contains(e.target))setOpen(false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(false);});
window.addEventListener('resize',()=>{restorePosition();if(!docked&&innerWidth<760)setOpen(false);});

pet.querySelectorAll('[data-companion-mode]').forEach(button=>button.addEventListener('click',()=>{
  const mode=button.dataset.companionMode||'chat';
  document.querySelector(`[data-study-mode="${mode}"]`)?.click();
  document.getElementById('input')?.focus();setOpen(false);
}));
pet.querySelectorAll('[data-pet-prompt]').forEach(button=>button.addEventListener('click',()=>{
  const input=document.getElementById('input');if(!input)return;
  input.value=button.dataset.petPrompt||'';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();setOpen(false);
}));
pet.querySelectorAll('[data-pet-tool]').forEach(button=>button.addEventListener('click',()=>{
  const input=document.getElementById('input');if(!input)return;
  input.value='Help me review, debug, or improve my code.';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();setOpen(false);
}));
pet.querySelectorAll('[data-pet-attach]').forEach(button=>button.addEventListener('click',()=>{document.getElementById('fileInput')?.click();setOpen(false);}));

new MutationObserver(syncState).observe(document.body,{attributes:true,attributeFilter:['data-agent-state']});
restorePosition();syncState();
if(!docked&&localStorage.getItem('nexzo.pet.open')==='1'&&innerWidth>=760)setOpen(true);

// A restrained idle blink keeps the pet alive without distracting from study.
setInterval(()=>{if(document.hidden||pet.classList.contains('is-open'))return;pet.classList.add('is-blinking');setTimeout(()=>pet.classList.remove('is-blinking'),180);},6200);

// Small personality layer: local-only reactions, no network dependency.
const reactions=[
  ['Ready','Ready when you are.'],
  ['Hi!','Need a hand?'],
  ['Focused','Let’s get one thing done.'],
  ['Curious','Show me what you’re working on.']
];
let reactionIndex=0;
function react(kind='happy'){
  pet.classList.remove('is-happy','is-curious','is-waving','is-bouncing');
  const classes=kind==='wave'?['is-happy','is-waving']:kind==='curious'?['is-curious']:['is-happy','is-bouncing'];
  classes.forEach(c=>pet.classList.add(c));
  setTimeout(()=>classes.forEach(c=>pet.classList.remove(c)),900);
}
function cycleReaction(){
  reactionIndex=(reactionIndex+1)%reactions.length;
  const [short,long]=reactions[reactionIndex];
  if(presence)presence.textContent=short;
  if(mood)mood.textContent=long;
  react(reactionIndex===1?'wave':reactionIndex===3?'curious':'happy');
  setTimeout(syncState,2600);
}
stage.addEventListener('dblclick',e=>{
  e.preventDefault();
  if(docked){cycleReaction();return;}
  localStorage.removeItem('nexzo.pet.position');
  pet.style.left='';pet.style.bottom='';
  react('wave');
});
stage.addEventListener('contextmenu',e=>{e.preventDefault();cycleReaction();});
pet.addEventListener('pet:celebrate',()=>react('wave'));

// Context-aware companion nudges. These stay local and only surface when the user is idle.
let lastActivity=Date.now(),lastNudge=0;
['pointerdown','keydown','input','scroll'].forEach(type=>document.addEventListener(type,()=>{lastActivity=Date.now();},{passive:true}));
function smartNudge(){
  if(document.hidden||pet.classList.contains('is-open')||currentState()!=='ready')return;
  const now=Date.now();if(now-lastActivity<90000||now-lastNudge<8*60*1000)return;
  let short='Ready',long='Need a hand?';
  try{
    const snap=window.NEXZOPersonalization?.snapshot?.();
    const weak=snap?.weakTopics?.[0]?.topic||snap?.weaknesses?.[0]?.topic;
    const rec=snap?.recommendations?.[0]?.title||snap?.recommendations?.[0]?.text;
    if(weak){short='Practice';long=`Want to review ${String(weak).slice(0,34)}?`;}
    else if(rec){short='Next step';long=String(rec).slice(0,54);}
  }catch{}
  if(presence)presence.textContent=short;if(mood)mood.textContent=long;react('curious');lastNudge=now;
  setTimeout(syncState,9000);
}
setInterval(smartNudge,30000);
window.addEventListener('nexzo:personalization-updated',()=>{if(currentState()==='ready')setTimeout(smartNudge,1200)});
window.addEventListener('nexzo:ai-question-answered',()=>{react('happy');lastActivity=Date.now();});
window.addEventListener('nexzo:task-completed',()=>{react('wave');if(presence)presence.textContent='Nice!';if(mood)mood.textContent='Task completed — keep going.';setTimeout(syncState,3500);});
})();

// v173 welcome shortcuts: preserve the single conversational surface.
document.addEventListener('click',event=>{
  const promptBtn=event.target.closest('[data-welcome-prompt]');
  if(promptBtn){
    const input=document.getElementById('input');
    if(input){input.value=promptBtn.dataset.welcomePrompt||'';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
    return;
  }
  if(event.target.closest('[data-welcome-attach="file"]')) document.getElementById('fileInput')?.click();
});
