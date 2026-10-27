(()=>{
  'use strict';
  if(window.__NEXZO_ASSISTANT_REDESIGN_V230__)return;
  window.__NEXZO_ASSISTANT_REDESIGN_V230__=true;

  const $=id=>document.getElementById(id);
  const q=(selector,root=document)=>root.querySelector(selector);
  const qa=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const input=$('input');
  const composer=$('composer');
  const searchPanel=$('assistantSearchPanel');
  const searchInput=$('assistantSearchInput');


  const setInput=(text,{submit=false}={})=>{
    if(!input)return;
    input.value=text;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.focus();
    if(submit)setTimeout(()=>composer?.requestSubmit?.(),80);
  };

  if(input)input.placeholder='Message NEXZO — ask, solve, plan, create, search or upload…';

  /* One search entry point: the composer opens a focused overlay. */
  function searchBackdrop(){
    let backdrop=$('assistantSearchBackdrop');
    if(!backdrop){
      backdrop=document.createElement('div');
      backdrop.id='assistantSearchBackdrop';
      backdrop.hidden=true;
      document.body.appendChild(backdrop);
      backdrop.addEventListener('click',closeSearch);
    }
    return backdrop;
  }
  function openSearch(seed=''){
    if(!searchPanel)return;
    const backdrop=searchBackdrop();
    backdrop.hidden=false;
    searchPanel.hidden=false;
    document.body.classList.add('assistant-search-open');
    if(seed&&!searchInput.value)searchInput.value=seed;
    setTimeout(()=>{searchInput?.focus();if(!seed)searchInput?.select();},30);
  }
  function closeSearch(){
    const backdrop=$('assistantSearchBackdrop');
    if(backdrop)backdrop.hidden=true;
    if(searchPanel)searchPanel.hidden=true;
    document.body.classList.remove('assistant-search-open');
  }
  function runSearch(query){
    const text=String(query||'').trim();
    if(!text)return;
    closeSearch();
    setInput(text);
    const searchTool=q('#toolsPanel [data-advanced="search"]');
    if(searchTool&&!searchTool.disabled){
      searchTool.click();
      setTimeout(()=>composer?.requestSubmit?.(),130);
      return;
    }
    $('composerToolsBtn')?.click();
    setTimeout(()=>q('#toolsPanel [data-advanced="search"]')?.click(),70);
    setTimeout(()=>composer?.requestSubmit?.(),160);
  }
  $('composerSearchBtn')?.addEventListener('click',event=>{event.preventDefault();openSearch();});
  $('assistantSearchClose')?.addEventListener('click',event=>{event.preventDefault();closeSearch();});
  $('assistantSearchForm')?.addEventListener('submit',event=>{event.preventDefault();runSearch(searchInput?.value);});
  qa('[data-search-hint]').forEach(button=>button.addEventListener('click',()=>{
    if(!searchInput)return;
    searchInput.value=button.dataset.searchHint||'';
    searchInput.focus();
  }));
  document.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
      event.preventDefault();openSearch();
    }else if(event.key==='Escape'&&!searchPanel?.hidden){
      closeSearch();
    }
  });

  /* Sidebar actions reuse the real assistant controls. */
  $('railNewChat')?.addEventListener('click',()=>$('newChat')?.click());
  $('railHistory')?.addEventListener('click',()=>$('historyOpen')?.click());
  $('railStudyTools')?.addEventListener('click',()=>$('composerToolsBtn')?.click());
  $('assistantQuickAction')?.addEventListener('click',()=>$('railStudyTools')?.click());
  $('railUploads')?.addEventListener('click',()=>$('fileInput')?.click());
  $('newChat')?.addEventListener('click',closeSearch);

  /* Quick tools prepare a request without submitting it. */
  qa('[data-quick-prompt]').forEach(button=>button.addEventListener('click',()=>setInput(button.dataset.quickPrompt||'')));
  $('quickToolsViewAll')?.addEventListener('click',()=>$('composerToolsBtn')?.click());
})();
