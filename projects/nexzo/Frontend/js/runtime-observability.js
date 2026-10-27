/* NEXZO runtime observability v14 — bounded, privacy-safe client diagnostics. */
(function(){'use strict';if(window.NEXZOObservability)return;
const MAX=30,KEY='nexzo_runtime_errors_v14';
const read=()=>{try{return JSON.parse(sessionStorage.getItem(KEY)||'[]')}catch{return[]}};
function record(kind,message,source,line,column){
 const row={kind:String(kind).slice(0,30),message:String(message||'Unknown error').slice(0,500),source:String(source||location.pathname).split('?')[0].slice(-160),line:Number(line)||0,column:Number(column)||0,at:new Date().toISOString()};
 const rows=read();rows.push(row);sessionStorage.setItem(KEY,JSON.stringify(rows.slice(-MAX)));
 window.dispatchEvent(new CustomEvent('nexzo:runtime-error',{detail:row}));
}
window.addEventListener('error',e=>record('error',e.message,e.filename,e.lineno,e.colno));
window.addEventListener('unhandledrejection',e=>record('promise',e.reason?.message||e.reason||'Unhandled rejection'));
window.NEXZOObservability=Object.freeze({record,list:read,clear:()=>sessionStorage.removeItem(KEY)});
})();
