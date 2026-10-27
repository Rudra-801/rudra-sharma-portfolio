/* NEXZO production service worker. Manifest values are injected by build_production.py.
   Keeps the production app shell/offline cache and Firebase background notifications
   in the same worker registered as ./sw.js. */
const CACHE_NAME='__CACHE_NAME__';
const PRECACHE=__PRECACHE__;

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
