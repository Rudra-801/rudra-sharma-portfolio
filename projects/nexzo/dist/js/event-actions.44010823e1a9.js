/* NEXZO declarative event actions v16 — removes inline handlers and enables strict CSP. */
(function(){'use strict';if(window.__NEXZO_EVENT_ACTIONS__)return;window.__NEXZO_EVENT_ACTIONS__=true;
const parse=raw=>{try{return JSON.parse(raw||'[]')}catch{return []}};
function key(type,suffix=''){return `nx${type[0].toUpperCase()+type.slice(1)}${suffix}`}
function invoke(el,type,event){const href=el.dataset[key(type,'Href')];if(href){location.href=href;return;}const target=el.dataset[key(type,'Target')];if(target){const node=document.getElementById(target);const action=el.dataset[key(type,'TargetAction')]||'click';node?.[action]?.();return;}const name=el.dataset[key(type)];if(!name)return;const fn=window[name];if(typeof fn!=='function'){console.warn(`[NEXZO] Action unavailable: ${name}`);return;}const pass=el.dataset[key(type,'Pass')];const args=pass==='this'?[el]:pass==='event'?[event]:parse(el.dataset[key(type,'Args')]);return fn(...args)}
document.addEventListener('click',e=>{const el=e.target.closest('[data-nx-click],[data-nx-click-href],[data-nx-click-target]');if(el){e.preventDefault();invoke(el,'click',e)}});
document.addEventListener('change',e=>{const el=e.target.closest('[data-nx-change],[data-nx-change-href],[data-nx-change-target]');if(el)invoke(el,'change',e)});
document.addEventListener('keydown',e=>{const el=e.target.closest('[data-nx-keydown],[data-nx-keydown-href],[data-nx-keydown-target]');if(el)invoke(el,'keydown',e)});
})();
