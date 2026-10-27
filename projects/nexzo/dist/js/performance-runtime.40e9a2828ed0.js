/* NEXZO performance runtime v1 — low-cost rendering safeguards. */
(function(){
  'use strict';
  if(window.__NEXZO_PERFORMANCE_RUNTIME__) return;
  window.__NEXZO_PERFORMANCE_RUNTIME__=true;
  const root=document.documentElement;
  const lowPower=(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4)||(navigator.deviceMemory&&navigator.deviceMemory<=4);
  if(lowPower) root.classList.add('nx-performance-mode');
  const applyVisibility=()=>root.classList.toggle('nx-page-hidden',document.hidden);
  document.addEventListener('visibilitychange',applyVisibility,{passive:true});applyVisibility();
  function boot(){
    document.querySelectorAll('img:not([loading])').forEach(img=>{img.loading='lazy';img.decoding='async';});
    document.querySelectorAll('video').forEach(video=>{video.preload='metadata';});
    if('IntersectionObserver' in window){
      const observer=new IntersectionObserver(entries=>entries.forEach(entry=>entry.target.classList.toggle('nx-in-viewport',entry.isIntersecting)),{rootMargin:'160px 0px'});
      document.querySelectorAll('main section,.panel,.card,.glass-card,.resource-card,.stat-card').forEach(el=>observer.observe(el));
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

  if('serviceWorker' in navigator){
    const local=/^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
    if(local){navigator.serviceWorker.getRegistrations().then(list=>Promise.all(list.map(reg=>reg.unregister()))).catch(()=>{});}
    else if(location.protocol==='https:'){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{}),{once:true});}
  }
})();
