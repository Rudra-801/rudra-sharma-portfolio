(()=>{'use strict';
const $=id=>document.getElementById(id);
function setPrompt(text){const input=$('input');if(!input)return;input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
document.addEventListener('click',e=>{
 const prompt=e.target.closest('[data-pet-prompt]');if(prompt){setPrompt(prompt.dataset.petPrompt||'');return;}
 const attach=e.target.closest('[data-pet-attach]');if(attach){$('fileInput')?.click();return;}
 const tool=e.target.closest('[data-pet-tool]');if(tool){setPrompt('Review my code or attached project, find the issue, and suggest the safest fix.');$('input')?.focus();return;}
});
function mood(){const s=document.body.dataset.agentState||'ready';const map={ready:'Mood: Ready',reading:'Mood: Curious',searching:'Mood: Exploring',running:'Mood: Focused',generating:'Mood: Creating',saving:'Mood: Proud',error:'Mood: Concerned'};if($('petMood'))$('petMood').textContent=map[s]||'Mood: Working';}
new MutationObserver(mood).observe(document.body,{attributes:true,attributeFilter:['data-agent-state']});mood();
const file=$('fileInput');file?.addEventListener('change',()=>{const n=file.files?.length||0;if(n&&$('petFocusMeta'))$('petFocusMeta').textContent=`${n} file${n===1?'':'s'} ready to analyze.`;});
})();
