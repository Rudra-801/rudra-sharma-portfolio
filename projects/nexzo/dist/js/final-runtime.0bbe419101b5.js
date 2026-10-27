(()=>{
'use strict';if(window.__NEXZO_FINAL_RUNTIME__)return;window.__NEXZO_FINAL_RUNTIME__=true;
const $=s=>document.querySelector(s);const permission=e=>/permission-denied|missing or insufficient permissions/i.test(String(e?.message||e||''));
function normalizeSettings(){const b=document.body;if(!b)return;if(b.dataset.sidebarMode==='iconOnly')b.dataset.sidebarMode='icons';document.querySelectorAll('.settings-v3-backend-control code,.settings-v3-backend-url,#settingsBackendUrl').forEach(n=>n.remove());}
window.addEventListener('unhandledrejection',e=>{if(!permission(e.reason))return;e.preventDefault();window.NEXZOShell?.toast?.('Cloud sync is unavailable. Changes remain saved on this device.','info');});
function init(){normalizeSettings();const save=$('#saveEdit');if(save)save.addEventListener('click',()=>setTimeout(()=>{if(save.disabled){save.disabled=false;save.textContent='Save Profile';}},12000),{passive:true});}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();window.addEventListener('nexzo:settings-changed',normalizeSettings);
})();