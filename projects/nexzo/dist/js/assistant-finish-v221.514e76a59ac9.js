(()=>{'use strict';
if(window.__NEXZO_ASSISTANT_FINISH_V221__)return;window.__NEXZO_ASSISTANT_FINISH_V221__=true;
const $=id=>document.getElementById(id);
const qs=(s,r=document)=>r.querySelector(s);
const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
const input=$('input'),composer=$('composer'),searchPanel=$('assistantSearchPanel'),searchInput=$('assistantSearchInput');

function ensureSearchBackdrop(){let b=$('v221SearchBackdrop');if(!b){b=document.createElement('div');b.id='v221SearchBackdrop';b.hidden=true;document.body.appendChild(b);b.addEventListener('click',hideSearch);}return b;}
function showSearch(){const b=ensureSearchBackdrop();b.hidden=false;searchPanel.hidden=false;document.body.classList.add('v221-search-open');setTimeout(()=>{searchInput?.focus();searchInput?.select();},20);}
function hideSearch(){const b=ensureSearchBackdrop();b.hidden=true;searchPanel.hidden=true;document.body.classList.remove('v221-search-open');}
function setPrompt(text){if(!input)return;input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
function activateAdvanced(tool){const btn=qs(`#toolsPanel [data-advanced="${tool}"]`);if(btn&&!btn.disabled){btn.click();return true;}return false;}
function runSearch(query,deep=false){query=String(query||'').trim();if(!query)return;hideSearch();setPrompt(query);if(!activateAdvanced(deep?'research':'search')){$('composerToolsBtn')?.click();setTimeout(()=>qs(`#toolsPanel [data-advanced="${deep?'research':'search'}"]`)?.click(),80);}setTimeout(()=>composer?.requestSubmit?.(),150);}

// Capture these first so older finish scripts cannot open stale search UI.
document.addEventListener('click',e=>{const b=e.target.closest('[data-v219-tool="search"],#composerSearchBtn');if(!b)return;e.preventDefault();e.stopImmediatePropagation();showSearch();},true);
$('assistantSearchClose')?.addEventListener('click',e=>{e.preventDefault();hideSearch();});
$('assistantSearchForm')?.addEventListener('submit',e=>{e.preventDefault();runSearch(searchInput?.value||'',false);});
qsa('[data-search-hint]').forEach(btn=>btn.addEventListener('click',()=>{searchInput.value=btn.dataset.searchHint||'';searchInput.focus();}));
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();showSearch();}else if(e.key==='Escape'&&!searchPanel?.hidden){hideSearch();}},true);

// Dedicated, deterministic assistant rail actions.
$('railNewChat')?.addEventListener('click',e=>{e.preventDefault();$('newChat')?.click();});
$('railHistory')?.addEventListener('click',e=>{e.preventDefault();$('historyOpen')?.click();});
$('railStudyTools')?.addEventListener('click',e=>{e.preventDefault();$('composerToolsBtn')?.click();});
$('railUploads')?.addEventListener('click',e=>{e.preventDefault();$('fileInput')?.click();});

// Pet Zone is a real modal instead of trying to scroll/focus a fixed companion card.
const pet=$('nexzoCompanion'),petModal=$('petZoneModal'),petAvatar=$('petZoneAvatar'),petName=$('petZoneName'),petPersonality=$('petZonePersonality');
const names={nexy:['Nexy','🤖','Focused'],sprout:['Sprout','🌱','Calm'],flare:['Flare','🔥','Energetic'],droppy:['Droppy','💧','Friendly'],rocky:['Rocky','🪨','Reliable'],cloudie:['Cloudie','☁️','Cheerful']};
let pendingPet=localStorage.getItem('nexzo.pet.kind')||'nexy';
function syncPetZone(kind){if(!names[kind])kind='nexy';pendingPet=kind;const [name,icon,personality]=names[kind];if(petAvatar)petAvatar.textContent=icon;if(petName)petName.textContent=name;if(petPersonality)petPersonality.textContent=`${personality} · Your study companion`;qsa('[data-zone-pet]',petModal||document).forEach(b=>b.classList.toggle('active',b.dataset.zonePet===kind));}
function openPetZone(){syncPetZone(pet?.dataset.petKind||localStorage.getItem('nexzo.pet.kind')||'nexy');petModal.hidden=false;document.body.classList.add('v221-pet-zone-open');}
function closePetZone(){petModal.hidden=true;document.body.classList.remove('v221-pet-zone-open');}
$('railPetZone')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();openPetZone();},true);
$('petZoneClose')?.addEventListener('click',closePetZone);
petModal?.addEventListener('click',e=>{if(e.target===petModal)closePetZone();const pick=e.target.closest('[data-zone-pet]');if(pick)syncPetZone(pick.dataset.zonePet);});
$('petZoneUse')?.addEventListener('click',()=>{const choice=pet?.querySelector(`[data-pet-choice="${pendingPet}"]`);choice?.click();syncPetZone(pendingPet);closePetZone();pet?.classList.add('is-reacting');setTimeout(()=>pet?.classList.remove('is-reacting'),650);});

// Hard-reset legacy draggable offsets so the companion cannot leak into the left sidebar.
try{localStorage.removeItem('nexzo.pet.position');}catch{}
if(pet){pet.style.removeProperty('left');pet.style.removeProperty('bottom');pet.style.removeProperty('top');}

// Keep companion title useful and pet-specific.
function syncCompanionLabel(){if(!pet)return;const kind=pet.dataset.petKind||'nexy',meta=names[kind]||names.nexy;const head=pet.querySelector('.pet-popover-head b');if(head)head.textContent=`${meta[0]} · NEXZO Pet`;}
new MutationObserver(syncCompanionLabel).observe(pet||document.body,{attributes:true,attributeFilter:['data-pet-kind']});syncCompanionLabel();
})();

;(()=>{const pet=document.getElementById('nexzoCompanion');if(!pet)return;const clean=()=>{['left','right','top','bottom','transform','width','height'].forEach(k=>pet.style.removeProperty(k));};clean();window.addEventListener('resize',clean,{passive:true});})();
