/* NEXZO V142 — route the Assistant's existing menu button into the shared site drawer. */
(function(){'use strict';
 function bind(){
   const button=document.getElementById('navOpen');
   if(!button||button.dataset.nxSharedDrawerBound==='true')return;
   button.dataset.nxSharedDrawerBound='true';
   button.setAttribute('aria-controls','nx-navigation-drawer');
   button.addEventListener('click',function(event){
     if(!window.NEXZONavigation)return;
     event.preventDefault();event.stopImmediatePropagation();
     window.NEXZONavigation.toggle();
   },true);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
 window.addEventListener('load',bind,{once:true});
})();
