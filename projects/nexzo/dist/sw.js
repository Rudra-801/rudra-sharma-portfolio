/* NEXZO production service worker. Manifest values are injected by build_production.py.
   Keeps the production app shell/offline cache and Firebase background notifications
   in the same worker registered as ./sw.js. */
const CACHE_NAME='nexzo-v17-dbfeee99583f';
const PRECACHE=["./", "./Home.html", "./css/page-404.4a90da232b8d.css", "./css/page-Home.d44d27f3c766.css", "./css/page-academics.9896250ad02c.css", "./css/page-admin.5928dcb11acb.css", "./css/page-ai-assistant.3dcf64cf11b5.css", "./css/page-campus.71e78de1eaaa.css", "./css/page-career.b3e6acd8f18b.css", "./css/page-community.f9011eb452da.css", "./css/page-dashboard.8501206449bd.css", "./css/page-data-deletion.d56c04a7c8d0.css", "./css/page-index.e8f0de0f3df0.css", "./css/page-login.44f71b931ea2.css", "./css/page-messages.957d88b792ff.css", "./css/page-nexzo-hub.37097c43aba0.css", "./css/page-offline.d56c04a7c8d0.css", "./css/page-personalization.daf5c0885665.css", "./css/page-planner.4a60629156b7.css", "./css/page-privacy.d56c04a7c8d0.css", "./css/page-profile.c796fc123476.css", "./css/page-settings.6c7bcc78acf2.css", "./css/page-signup.44f71b931ea2.css", "./css/page-terms.d56c04a7c8d0.css", "./css/style.6414bbbe7f8b.css", "./data-deletion.html", "./favicon.png", "./js/academic-notes.1b7754409ef8.js", "./js/academics-controller.690aeccc2102.js", "./js/admin-dashboard.979b73b994b8.js", "./js/ai-clean.9d83052936e4.js", "./js/ai-service.0b65947f7940.js", "./js/app-shell.a5d20dca51e0.js", "./js/assistant-finish-v217.e092e7ae0b88.js", "./js/assistant-finish-v219.fb7660685320.js", "./js/assistant-finish-v221.514e76a59ac9.js", "./js/assistant-redesign-v230.a7351e5e574b.js", "./js/assistant-redesign-v231.af2ece448753.js", "./js/assistant-shell-v142.5cdc97b0811b.js", "./js/assistant-v134-final.b6a3f0aa7a8f.js", "./js/auth-controller.f642f0950298.js", "./js/auth-guard.7c9400012b44.js", "./js/backend-store-v201.aad55e050d8d.js", "./js/campus-live-v1.86ffd4de5c76.js", "./js/career-controller.3b05fcc55df1.js", "./js/community-contracts.4822d11bae18.js", "./js/community-maintenance.17b16c6c8610.js", "./js/community-report-queue.7e660c8140bd.js", "./js/community-safety.3f4b1ac02efa.js", "./js/community-service.bd12fdcb82f3.js", "./js/config.49c3ae0216c9.js", "./js/consent-interactions-v129.b226d20ff1a4.js", "./js/custom-select-v128.9df9bdfaed25.js", "./js/dashboard-controller.a55f2535f138.js", "./js/data-service.19a7f3758365.js", "./js/engagement-hub.8926b1fa6b7f.js", "./js/event-actions.44010823e1a9.js", "./js/final-runtime.0bbe419101b5.js", "./js/firebase-client.5674754c18da.js", "./js/gamification-system.31979460172e.js", "./js/home-controller.e807e01aca37.js", "./js/home-trajectory.a93b90f57718.js", "./js/hub-polish-v215.56c4704f6c0e.js", "./js/level-system.504d314a2f55.js", "./js/level-up-controller.d0afb4c5a97d.js", "./js/living-pet-v4.e785f6176b3b.js", "./js/living-pet.1917633deee6.js", "./js/messages-v146.05d3c1136414.js", "./js/metric-authority.d5323fddeb8f.js", "./js/nexzo-home-shell.e8f440ebb383.js", "./js/nexzo-intelligence-v203.67ca65eb5676.js", "./js/nexzo-pulse-v203.0dd613fb4744.js", "./js/nexzo-today-v205.1d1e363dfa30.js", "./js/nexzo-today-v208.9477001c18ed.js", "./js/nexzo-today-v209.eb1d001aa75a.js", "./js/nx-pet-open-fix.d707bc5b89fa.js", "./js/nx-pet-popup.c651dff5db32.js", "./js/nx-search-fix.2f53c777c1df.js", "./js/offline-page.fd7f19135556.js", "./js/performance-runtime.39a399549dd9.js", "./js/personalization-dashboard-v151.762b98a6fc1c.js", "./js/personalization-dashboard-v204.762b98a6fc1c.js", "./js/personalization-dashboard-v205.e51823cb49ff.js", "./js/personalization-engine-v151.b523756740e9.js", "./js/personalization-engine-v152.f43993080fda.js", "./js/personalization-home-v152.e5fa7b71ede0.js", "./js/personalization-page-v151.9e1322cfefca.js", "./js/planner-controller.c007b1475fb2.js", "./js/planner-data.260a1e5c53bb.js", "./js/profile-authority.3fe1207d737d.js", "./js/profile-controller.d0fcf4f582cf.js", "./js/profile-storage.3dde151c98ce.js", "./js/runtime-observability.23a39528607f.js", "./js/settings-controller.f3a9b13076d8.js", "./js/settings-state.bbb0efe8cc9e.js", "./js/shared-state.cd4682560d3c.js", "./js/state-authority.93fc1d23bf02.js", "./js/streak-system.2954278a6d9c.js", "./js/student-digital-twin-v181.f26a4a92425f.js", "./js/study-companion.e12c54835c00.js", "./js/task-integrity.e1591c740b4b.js", "./js/task-store.70d5d2d679db.js", "./js/unit-mastery-gate-v236.193756362e2b.js", "./js/unit-mastery-gate-v237.40140aaa1e4a.js", "./login.html", "./manifest.webmanifest", "./offline.html", "./privacy.html", "./terms.html"];

self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE_NAME)
    .then(cache=>cache.addAll(PRECACHE))
    .then(()=>self.skipWaiting())
));

self.addEventListener('activate',event=>event.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys
      .filter(key=>key.startsWith('nexzo-')&&key!==CACHE_NAME)
      .map(key=>caches.delete(key))))
    .then(()=>self.clients.claim())
));

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  const navigation=request.mode==='navigate'||request.destination==='document';
  if(navigation){
    event.respondWith(
      fetch(request)
        .then(response=>{
          if(response.ok)caches.open(CACHE_NAME).then(cache=>cache.put(request,response.clone()));
          return response;
        })
        .catch(async()=>await caches.match(request)||await caches.match('./offline.html')||await caches.match('./Home.html'))
    );
    return;
  }
  event.respondWith(
    caches.match(request).then(cached=>cached||fetch(request).then(response=>{
      if(response.ok&&['style','script','image','font'].includes(request.destination)){
        caches.open(CACHE_NAME).then(cache=>cache.put(request,response.clone()));
      }
      return response;
    }))
  );
});

/* Firebase Web config is public client configuration, not a service-account secret.
   Any failure here must not break the core cache/offline worker. */
try{
  importScripts(
    'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js'
  );
  firebase.initializeApp({
    apiKey:'AIzaSyALYRXOXr_jb8djjgNi_eu6AKheQUWvRoA',
    authDomain:'personalized-recommendersystem.firebaseapp.com',
    projectId:'personalized-recommendersystem',
    storageBucket:'personalized-recommendersystem.firebasestorage.app',
    messagingSenderId:'251161281833',
    appId:'1:251161281833:web:37ca8f03e0eb787ef8a338'
  });
  const messaging=firebase.messaging();
  messaging.onBackgroundMessage(payload=>{
    const notification=payload?.notification||{};
    const data=payload?.data||{};
    return self.registration.showNotification(notification.title||'NEXZO',{
      body:notification.body||data.body||'You have a new update.',
      icon:'./favicon.png',
      badge:'./favicon.png',
      data:{url:data.url||'./Home.html'}
    });
  });
}catch(_){
  /* Background messaging is optional; offline/cache behavior remains available. */
}

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  let target='./Home.html';
  try{
    const requested=event.notification?.data?.url||target;
    const resolved=new URL(requested,self.location.origin);
    if(resolved.origin===self.location.origin)target=resolved.href;
  }catch(_){/* keep safe Home fallback */}
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const client of list){
      if('focus' in client){
        if('navigate' in client)client.navigate(target).catch(()=>{});
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  }));
});
