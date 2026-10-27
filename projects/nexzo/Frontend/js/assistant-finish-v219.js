(()=>{'use strict';
if(window.__NEXZO_ASSISTANT_FINISH_V219__)return;window.__NEXZO_ASSISTANT_FINISH_V219__=true;
const $=id=>document.getElementById(id), input=$('input'), composer=$('composer');
function setPrompt(text){if(!input)return;input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
function click(id){$(id)?.click();}
function advanced(tool){const b=document.querySelector(`#toolsPanel [data-advanced="${tool}"]`);if(b&&!b.disabled){b.click();return true}return false;}
function runWebSearch(query){if(!query)return;setPrompt(query);if(!advanced('search')) click('composerToolsBtn');setTimeout(()=>composer?.requestSubmit?.(),80);}
const searchForm=$('assistantGlobalSearch'), searchInput=$('assistantGlobalSearchInput');
searchForm?.addEventListener('submit',e=>{e.preventDefault();runWebSearch(searchInput?.value.trim()||'');});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();searchInput?.focus();searchInput?.select();}});
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-v219-tool]');if(!b)return;
  const action=b.dataset.v219Tool;
  if(action==='search'){searchInput?.focus();return;}
  if(action==='upload'){click('fileInput');return;}
  if(action==='more'){click('composerToolsBtn');return;}
  if(action==='solve'){setPrompt('Solve this step by step: ');return;}
  if(action==='generate'){setPrompt('Generate practice questions and examples for: ');return;}
  if(action==='plan'){setPrompt('Build a practical study plan for: ');return;}
});
// Keep visible command strip synchronized with active study mode.
document.addEventListener('click',e=>{const b=e.target.closest('.assistant-command-strip [data-study-mode]');if(!b)return;document.querySelectorAll('.assistant-command-strip [data-study-mode]').forEach(x=>x.classList.toggle('active',x===b));});
// Search chip in the composer and the global search use the same live tool path.
$('composerSearchBtn')?.addEventListener('contextmenu',e=>{e.preventDefault();searchInput?.focus();});
})();
