/* NEXZO runtime configuration — production uses hosted backend only; local preview may use loopback. */
(function(){
  'use strict';
  window.__NEXZO_DISABLE_LEGACY_BUNDLE_SYNC__=true;
  const host=location.hostname;
  const local=host==='localhost'||host==='127.0.0.1';
  const sameOrigin=(local&&location.port==='5000')?`${location.origin}/api`:'';
  const loopback='http://127.0.0.1:5000/api';
  const localhost='http://localhost:5000/api';
  const production='https://nexzo-backend.onrender.com/api';
  const stored=local?'':''; // intentionally empty: browser storage cannot override the production API
  const meta=String(document.querySelector('meta[name="nexzo-api-base-url"]')?.content||'').trim();
  const valid=v=>/^https?:\/\/[^\s]+$/i.test(v||'')?String(v).replace(/\/$/,''):'';
  const remote=valid(meta)||production;
  const candidates=[remote,...(local?[sameOrigin,loopback,localhost]:[])].map(valid).filter((v,i,a)=>v&&a.indexOf(v)===i);
  const primary=remote;
  window.NEXZO_CONFIG=Object.freeze({
  WEB_PUSH_VAPID_KEY:'',API_BASE_URL:primary,API_CANDIDATES:candidates,LOCAL_API_URL:local?loopback:'',PRODUCTION_API_URL:production,ENVIRONMENT:local?'development':'production',IS_LOCAL_PREVIEW:local});
  window.NEXZO_API_URL=primary; window.API_BASE_URL=primary;
})();
