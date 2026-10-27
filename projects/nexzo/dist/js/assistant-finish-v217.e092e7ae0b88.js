(()=>{'use strict';
if(window.__NEXZO_ASSISTANT_FINISH_V217__)return;window.__NEXZO_ASSISTANT_FINISH_V217__=true;
const $=id=>document.getElementById(id);
const pet=$('nexzoCompanion');
function reflect(){
  const wf=window.NEXZOAssistantWorkflow?.get?.()||{};
  const presence=$('petPresenceText');
  const bubble=$('petBubble');
  if(wf.active){
    if(presence)presence.textContent=wf.paused?'Workflow paused':wf.type==='quiz'?'Quiz in progress':'Interview in progress';
    if(bubble)bubble.textContent=wf.paused?'Ask me anything. Your study workflow is safe and can resume whenever you want.':`I’m tracking this ${wf.type}. You can switch topics at any time.`;
  }else{
    if(presence&&!/working|reading|searching|running/i.test(presence.textContent||''))presence.textContent='Ready';
  }
}
setInterval(reflect,900);reflect();
// Pet Zone now opens the actual right studio instead of creating a detached/clipped card.
document.addEventListener('click',e=>{const b=e.target.closest('[data-assistant-rail="pet"]');if(!b||!pet)return;pet.scrollIntoView?.({behavior:'smooth',block:'nearest'});pet.classList.add('is-open');});
})();
