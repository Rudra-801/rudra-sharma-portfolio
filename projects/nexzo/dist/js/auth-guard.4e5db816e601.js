/* NEXZO protected-page Firebase guard v5. Validates before protected UI is revealed. */
(function(){
  'use strict';
  const protectedPages=new Set(['planner','community','dashboard','hub','settings','profile','ai']);
  protectedPages.add('personalization');
  protectedPages.add('code');
  let started=false,tokenUnsubscribe=null,refreshTimer=null,lastRefreshAt=0;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function start(){
    if(started)return;started=true;
    const page=document.body?.dataset.page||document.documentElement.dataset.page||'';
    if(!protectedPages.has(page))return;
    const e2e=/^(localhost|127\.0\.0\.1)$/.test(location.hostname)&&new URLSearchParams(location.search).get('e2e')==='1';
    if(e2e){document.documentElement.dataset.e2e='true';document.documentElement.classList.remove('nx-auth-pending');document.getElementById('nxAuthFirstPaint')?.remove();return;}
    let style=document.getElementById('nxAuthFirstPaint')||document.getElementById('nxAuthGuardStyle');
    if(!style){style=document.createElement('style');style.id='nxAuthGuardStyle';style.textContent='html.nx-auth-pending body{visibility:hidden!important}';document.head.appendChild(style)}
    document.documentElement.classList.add('nx-auth-pending');
    const reveal=()=>{document.documentElement.classList.remove('nx-auth-pending');style.remove()};
    const redirect=reason=>{localStorage.setItem('redirectPage',location.pathname.split('/').pop()||'Home.html');location.replace(`login.html${reason?`?reason=${encodeURIComponent(reason)}`:''}`)};
    const announce=user=>window.dispatchEvent(new CustomEvent('nexzo:auth-ready',{detail:{signedIn:Boolean(user),uid:user?.uid||''}}));
    const refresh=async user=>{
      let error;
      for(let attempt=0;attempt<2;attempt++){
        try{await user.getIdToken(true);lastRefreshAt=Date.now();return true}
        catch(cause){error=cause;if(!navigator.onLine)return true;if(attempt===0)await wait(1200)}
      }
      console.error('[NEXZO Auth Guard] Token refresh failed.',error);
      window.dispatchEvent(new CustomEvent('nexzo:auth-expired',{detail:{reason:'refresh-failed'}}));
      return false;
    };
    if(localStorage.getItem('loggedIn')==='guest'||localStorage.getItem('nexzo_guest_mode')==='true')return redirect('protected');
    if(!window.NEXZOFirebase?.getAuthContext){console.error('[NEXZO Auth Guard] Firebase client failed to load.');return redirect('session');}
    const timeout=setTimeout(()=>redirect('session'),15000);
    window.NEXZOFirebase.getAuthContext().then(({auth,tools})=>{
      const unsubscribe=tools.onAuthStateChanged(auth,async user=>{
        unsubscribe();clearTimeout(timeout);
        if(!user)return redirect('session');
        const password=user.providerData?.some(row=>row.providerId==='password');
        if(password&&!user.emailVerified){await tools.signOut(auth).catch(()=>{});return redirect('verify')}
        if(!await refresh(user))return redirect('session-expired');
        localStorage.setItem('loggedIn','true');localStorage.removeItem('nexzo_guest_mode');
        announce(user);reveal();
        tokenUnsubscribe=tools.onIdTokenChanged(auth,current=>{
          if(!current)return redirect('session-expired');
          localStorage.setItem('loggedIn','true');localStorage.removeItem('nexzo_guest_mode');announce(current);
        });
        refreshTimer=setInterval(async()=>{if(document.hidden||!auth.currentUser)return;if(!await refresh(auth.currentUser))redirect('session-expired')},45*60*1000);
        document.addEventListener('visibilitychange',async()=>{if(!document.hidden&&auth.currentUser&&Date.now()-lastRefreshAt>40*60*1000&&!await refresh(auth.currentUser))redirect('session-expired')});
      });
    }).catch(error=>{console.error('[NEXZO Auth Guard]',error);redirect('session')});
  }
  window.addEventListener('pagehide',()=>{tokenUnsubscribe?.();if(refreshTimer)clearInterval(refreshTimer)},{once:true});
  if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
})();
