
(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function close(){document.querySelector('.assistant-quick-modal')?.remove();}
  function modal(title,body){
    close();
    const root=document.createElement('div'); root.className='assistant-quick-modal';
    root.innerHTML=`<section class="assistant-quick-panel" role="dialog" aria-modal="true"><div class="assistant-quick-head"><h2>${esc(title)}</h2><button class="assistant-quick-close" aria-label="Close">×</button></div>${body}</section>`;
    root.addEventListener('click',e=>{if(e.target===root||e.target.closest('.assistant-quick-close'))close()});
    document.body.appendChild(root); return root;
  }
  function openSearch(){
    const links=[['Home','Home.html'],['Campus','campus.html'],['Academics','academics.html'],['Career','career.html'],['Planner','planner.html'],['Community','community.html'],['Dashboard','dashboard.html'],['Hub','hub.html'],['Settings','settings.html'],['Profile','profile.html']];
    const root=modal('Search NEXZO',`<input class="assistant-quick-input" placeholder="Search pages..." autofocus><div class="assistant-quick-links">${links.map(([n,h])=>`<a href="${h}" data-name="${n.toLowerCase()}">${n}</a>`).join('')}</div>`);
    const input=root.querySelector('input'); const items=[...root.querySelectorAll('[data-name]')];
    input?.addEventListener('input',()=>{const q=input.value.trim().toLowerCase();items.forEach(a=>a.hidden=q&&!a.dataset.name.includes(q))}); setTimeout(()=>input?.focus(),0);
  }
  function notifications(){
    let list=[]; try{list=JSON.parse(localStorage.getItem('nexzo_notifications_v2')||'[]')}catch(_){}
    modal('Notifications',list.length?list.slice(0,12).map(n=>`<article class="assistant-note-row"><b>${esc(n.title||'Notification')}</b>${n.body?`<div>${esc(n.body)}</div>`:''}</article>`).join(''):'<div class="assistant-note-row">No notifications yet.</div>');
  }
  function badge(){
    let list=[];try{list=JSON.parse(localStorage.getItem('nexzo_notifications_v2')||'[]')}catch(_){}
    const count=list.filter(n=>!n.read).length,b=$('.assistant-badge');if(b){b.textContent=count>99?'99+':String(count);b.hidden=!count}
  }
  function boot(){
    const actions=$('.top-actions'); if(!actions||actions.dataset.v134==='1')return; actions.dataset.v134='1';
    // Keep the existing timer and profile. New Chat remains available in the left rail.
    $('#historyOpen')?.remove(); $('#newChat')?.remove();
    const timer=$('#timerBtn'), profile=$('.profile-chip');
    const search=document.createElement('button');search.type='button';search.className='assistant-global-action assistant-search';search.title='Search';search.setAttribute('aria-label','Search');search.textContent='⌕';
    const bell=document.createElement('button');bell.type='button';bell.className='assistant-global-action assistant-bell';bell.title='Notifications';bell.setAttribute('aria-label','Notifications');bell.innerHTML='🔔<em class="assistant-badge" hidden>0</em>';
    const sparkle=document.createElement('button');sparkle.type='button';sparkle.className='assistant-global-action assistant-sparkle';sparkle.title='New chat';sparkle.setAttribute('aria-label','New chat');sparkle.textContent='✦';
    actions.insertBefore(search,timer||profile); actions.insertBefore(bell,timer||profile);
    if(timer) actions.insertBefore(sparkle,profile); else actions.insertBefore(sparkle,profile);
    search.addEventListener('click',openSearch);bell.addEventListener('click',notifications);sparkle.addEventListener('click',()=>$('#railNewChat')?.click());
    badge();window.addEventListener('storage',badge);window.addEventListener('nexzo:notifications-updated',badge);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
