/* NEXZO Backend Store v201 — authenticated server is canonical persistence. */
(function(){'use strict';if(window.NEXZOBackendStore)return;
const base=()=>String(window.NEXZO_CONFIG?.API_BASE_URL||'https://nexzo-backend.onrender.com/api').replace(/\/$/,'');
async function token(){const c=await window.NEXZOFirebase.getContext({auth:true});const u=c.auth.currentUser;if(!u)throw Object.assign(new Error('Sign in required.'),{code:'auth/required'});return u.getIdToken();}
async function request(path,options={}){
 const owner=window.NEXZODataService?.getUser?.()?.uid;const t=await token();
 const r=await fetch(`${base()}${path}`,{...options,signal:AbortSignal.timeout(25000),cache:'no-store',headers:{'Content-Type':'application/json','Authorization':`Bearer ${t}`,...options.headers}});
 const body=await r.json().catch(()=>({}));
 if(!r.ok)throw Object.assign(new Error(body.message||`Cloud request failed (${r.status})`),{status:r.status,code:body.code});
 if(owner!==window.NEXZODataService?.getUser?.()?.uid)throw new Error('Account changed during cloud save.');
 return body;
}
const getState=domain=>request(`/user/state/${encodeURIComponent(domain)}`);
const putState=(domain,data)=>request(`/user/state/${encodeURIComponent(domain)}`,{method:'PUT',body:JSON.stringify({data})});
const getEvaluations=()=>request('/user/evaluations');
const getTasks=()=>request('/user/tasks');
const putTask=(id,data)=>request(`/user/tasks/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify({data})});
const deleteTask=id=>request(`/user/tasks/${encodeURIComponent(id)}`,{method:'DELETE'});
const learningEvent=data=>request('/user/learning-events',{method:'POST',body:JSON.stringify({data})});
window.NEXZOBackendStore=Object.freeze({version:201,getState,putState,getEvaluations,getTasks,putTask,deleteTask,learningEvent});
})();
