(()=>{
  'use strict';
  if(window.__NEXZO_ASSISTANT_REDESIGN_V231__)return;
  window.__NEXZO_ASSISTANT_REDESIGN_V231__=true;
  const $=id=>document.getElementById(id);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const input=$('input');
  const setInput=text=>{if(!input)return;input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();};
  qa('[data-hero-prompt]').forEach(btn=>btn.addEventListener('click',()=>setInput(btn.dataset.heroPrompt||'')));
  // Keep the hero compact once a conversation is active, preserving chat space.
  const messages=$('messages'),hero=document.querySelector('.nx-study-hero');
  if(messages&&hero){
    const compact=()=>hero.classList.toggle('has-conversation',!!messages.querySelector('.message-row'));
    new MutationObserver(compact).observe(messages,{childList:true,subtree:true});compact();
  }

  // Make backend state visible without replacing the user's message or conversation.
  window.addEventListener('nexzo:ai-status',event=>{
    const state=event.detail?.state;
    if(state==='online')document.body.dataset.backendReady='true';
    else if(state==='offline')document.body.dataset.backendReady='false';
  });
})();
