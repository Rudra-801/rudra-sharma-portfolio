/* NEXZO performance runtime v2 — low-cost rendering safeguards. */
(function(){
  'use strict';
  if(window.__NEXZO_PERFORMANCE_RUNTIME__) return;
  window.__NEXZO_PERFORMANCE_RUNTIME__=true;
  const root=document.documentElement;
  const lowPower=(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4)||(navigator.deviceMemory&&navigator.deviceMemory<=4);
  if(lowPower) root.classList.add('nx-performance-mode');
  // Do not force global performance mode for Academics. Global mode pauses animations
  // from the shared runtime and can leave delayed workspace sections invisible.
  // Academics gets targeted low-cost overrides below instead.
  const perfStyle=document.createElement('style');
  perfStyle.id='nxPerformanceOverrides';
  perfStyle.textContent=`
    html.nx-performance-mode *, html.nx-performance-mode *::before, html.nx-performance-mode *::after{animation-duration:.001ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important}
    html.nx-performance-mode .bg-orb,html.nx-performance-mode .particle,html.nx-performance-mode .particles{display:none!important}
    html.nx-performance-mode body[data-shell-ready="true"] #nxShellTopbar.nx-shell-topbar{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    .academics-page .nx-acad-modal{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background:rgba(1,3,7,.94)!important}
    .academics-page .nx-subject-card::before,.academics-page .nx-subject-card::after,.academics-page .nx-acad-hero::before,.academics-page .nx-acad-hero::after,.academics-page .nx-next-card::before{animation:none!important;filter:none!important}
    .academics-page .nx-subject-card,.academics-page .nx-preview-topic,.academics-page .nx-topic-browser-item{transition:border-color .12s ease,background-color .12s ease!important}
    .academics-page .nx-subject-card:hover,.academics-page .nx-preview-topic:hover{transform:none!important;filter:none!important}
    .academics-page .nx-catalog-grid .nx-subject-card{content-visibility:auto;contain-intrinsic-size:240px}
    .academics-page .nx-topic-browser-item{content-visibility:auto;contain-intrinsic-size:70px}
    .academics-page .nx-acad-modal .nx-topic-focus-clean,.academics-page .nx-acad-modal .nx-workspace-tools-clean,.academics-page .nx-acad-modal .nx-topic-browser,.academics-page .nx-acad-modal #courseWorkspaceContent{content-visibility:visible!important;contain:none!important;opacity:1!important;transform:none!important}
    html.nx-page-hidden *,html.nx-page-hidden *::before,html.nx-page-hidden *::after{animation-play-state:paused!important}
  `;
  document.head.appendChild(perfStyle);
  const applyVisibility=()=>root.classList.toggle('nx-page-hidden',document.hidden);
  document.addEventListener('visibilitychange',applyVisibility,{passive:true});applyVisibility();
  function boot(){
    document.querySelectorAll('img:not([loading])').forEach(img=>{const critical=!!img.closest('.brand,.topbar,header,.hero,.nx-brand-lockup,.login-brand');img.loading=critical?'eager':'lazy';img.decoding='async';if(critical&&'fetchPriority'in img)img.fetchPriority='high';});
    document.querySelectorAll('video').forEach(video=>{video.preload='metadata';});
    if('IntersectionObserver' in window){
      const observer=new IntersectionObserver(entries=>entries.forEach(entry=>entry.target.classList.toggle('nx-in-viewport',entry.isIntersecting)),{rootMargin:'160px 0px'});
      document.querySelectorAll('main section,.panel,.card,.glass-card,.resource-card,.stat-card').forEach(el=>observer.observe(el));
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

  // Warm the hosted API once per browser session window. Render free instances may
  // sleep; waking them while the student is browsing deterministic pages removes a
  // large part of the perceived delay when Planner/Study Assistant is opened later.
  function warmHostedBackend(){
    try{
      const base=String(window.NEXZO_CONFIG?.PRODUCTION_API_URL||window.NEXZO_CONFIG?.API_BASE_URL||'').replace(/\/$/,'');
      if(!/^https:\/\//i.test(base))return;
      const key='nexzoBackendWarmAtV1',now=Date.now(),last=Number(sessionStorage.getItem(key)||0);
      if(now-last<240000)return;
      sessionStorage.setItem(key,String(now));
      fetch(`${base}/health`,{method:'GET',headers:{Accept:'application/json'},cache:'no-store',credentials:'omit'}).catch(()=>{});
    }catch(_){ }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(warmHostedBackend,700),{once:true});else setTimeout(warmHostedBackend,700);

  if('serviceWorker' in navigator){
    const local=/^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
    if(local){navigator.serviceWorker.getRegistrations().then(list=>Promise.all(list.map(reg=>reg.unregister()))).catch(()=>{});}
    else if(location.protocol==='https:'){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{}),{once:true});}
  }
})();
