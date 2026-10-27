/* NEXZO Community v2.1 — Firestore first, honest browser-offline fallback. */
(function(){
  'use strict';
  if(window.__NEXZO_COMMUNITY_V21__) return;
  window.__NEXZO_COMMUNITY_V21__=true;

  const $=(selector,parent=document)=>parent.querySelector(selector);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const parse=(raw,fallback)=>{try{return JSON.parse(raw)??fallback}catch{return fallback}};
  const uuid=()=>crypto.randomUUID?.()||`local_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const state={
    mode:'loading',user:null,posts:[],groups:[],saved:new Set(),liked:new Set(),comments:new Map(),members:new Map(),messages:new Map(),
    filter:'all',sort:'latest',resourceUrl:'',unsubs:[],memberUnsubs:new Map(),notificationUnsubs:new Map(),groupMessageUnsub:null,commentUnsub:null,identities:new Map(),draftKey:'nexzo_community_draft_v2',postNotifyReady:false
  };
  let fb=null;
  const DEFAULT_GROUP_ICON='assets/community/default-group-icon.webp';
  const DEFAULT_GROUP_WALLPAPER='assets/community/default-group-wallpaper.webp';
  const mediaURL=value=>{try{return new URL(String(value||DEFAULT_GROUP_WALLPAPER),document.baseURI).href}catch{return String(value||DEFAULT_GROUP_WALLPAPER)}};
  const BUILTIN_GROUP_WALLPAPERS=[
    {id:'nexzo-doodles',name:'NEXZO Doodles',url:'assets/community/wallpapers/nexzo-doodles.webp'},
    {id:'neon-study',name:'Neon Study',url:'assets/community/wallpapers/neon-study.webp'},
    {id:'midnight-gold',name:'Midnight Gold',url:'assets/community/wallpapers/midnight-gold.webp'},
    {id:'emerald-grid',name:'Emerald Grid',url:'assets/community/wallpapers/emerald-grid.webp'},
    {id:'blueprint',name:'Midnight Blueprint',url:'assets/community/wallpapers/blueprint.webp'},
    {id:'purple-crystal',name:'Purple Crystal',url:'assets/community/wallpapers/purple-crystal.webp'},
    {id:'teal-mountains',name:'Teal Mountains',url:'assets/community/wallpapers/teal-mountains.webp'},
    {id:'cosmic-lake',name:'Cosmic Lake',url:'assets/community/wallpapers/cosmic-lake.webp'},
    {id:'aurora-doodles',name:'Aurora Study',url:'assets/community/wallpapers/aurora-doodles.webp'},
    {id:'luxury-gold',name:'Luxury Gold',url:'assets/community/wallpapers/luxury-gold.webp'},
    {id:'dark-teal',name:'Dark Teal Tech',url:'assets/community/wallpapers/dark-teal.webp'},
    {id:'ember-study',name:'Ember Study',url:'assets/community/wallpapers/ember-study.webp'},
    {id:'neon-dsa',name:'Neon DSA',url:'assets/community/wallpapers/neon-dsa.webp'},
    {id:'dsa-warriors',name:'DSA Warriors',url:'assets/community/wallpapers/dsa-warriors.webp'},
    {id:'premium-dark',name:'Premium Dark',url:'assets/community/wallpapers/premium-dark.webp'}
  ];
  const withTimeout=(promise,ms=35000)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error('Upload timed out. Check Firebase Storage and internet connection.'),{code:'storage/timeout'})),ms))]);

  const GROUP_MEDIA_DB='nexzo-group-media-v1';
  const GROUP_MEDIA_STORE='media';
  function openMediaDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(GROUP_MEDIA_DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(GROUP_MEDIA_STORE))req.result.createObjectStore(GROUP_MEDIA_STORE);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function mediaCacheSet(groupId,kind,file){const db=await openMediaDB();await new Promise((resolve,reject)=>{const tx=db.transaction(GROUP_MEDIA_STORE,'readwrite');tx.objectStore(GROUP_MEDIA_STORE).put({blob:file,type:file.type,name:file.name,updatedAtMs:Date.now()},`${state.user?.uid||'guest'}:${groupId}:${kind}`);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}
  async function mediaCacheGet(groupId,kind){try{const db=await openMediaDB();const value=await new Promise((resolve,reject)=>{const tx=db.transaction(GROUP_MEDIA_STORE,'readonly');const req=tx.objectStore(GROUP_MEDIA_STORE).get(`${state.user?.uid||'guest'}:${groupId}:${kind}`);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});db.close();return value;}catch{return null;}}
  async function mediaCacheDelete(groupId,kind){try{const db=await openMediaDB();await new Promise((resolve,reject)=>{const tx=db.transaction(GROUP_MEDIA_STORE,'readwrite');tx.objectStore(GROUP_MEDIA_STORE).delete(`${state.user?.uid||'guest'}:${groupId}:${kind}`);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}catch{}}
  function groupMediaMetaKey(groupId){return `nexzo_group_media_meta:${state.user?.uid||'guest'}:${groupId}`;}
  function readGroupMediaMeta(groupId){return parse(localStorage.getItem(groupMediaMetaKey(groupId))||'{}',{});}
  function writeGroupMediaMeta(groupId,patch){const next={...readGroupMediaMeta(groupId),...patch,updatedAtMs:Date.now()};localStorage.setItem(groupMediaMetaKey(groupId),JSON.stringify(next));return next;}
  async function hydrateLocalGroupMedia(group){
    if(!group?.id)return group;
    const meta=readGroupMediaMeta(group.id);
    for(const [kind,field] of [['avatar','avatarURL'],['wallpaper','wallpaperURL']]){
      const pending=Boolean(meta[`${kind}Pending`]);
      const cached=await mediaCacheGet(group.id,kind);
      if(pending&&cached?.blob){
        const url=URL.createObjectURL(cached.blob);
        group[field]=url;
        group[`_${kind}LocalURL`]=url;
        group[`_${kind}Pending`]=true;
        continue;
      }
      if(!group[field]&&meta[`${kind}URL`])group[field]=meta[`${kind}URL`];
      if(!group[field]&&cached?.blob){
        const url=URL.createObjectURL(cached.blob);
        group[field]=url;
        group[`_${kind}LocalURL`]=url;
      }
    }
    return group;
  }

  function isPage(){return document.body?.dataset.page==='community'||location.pathname.toLowerCase().includes('community');}
  function identity(){
    const info=window.NEXZOShell?.identity?.()||{};
    const email=String(info.email||localStorage.getItem('email')||'local@nexzo.app');
    const name=String(info.name||localStorage.getItem('userName')||email.split('@')[0]||'Student');
    return {uid:`local:${email.toLowerCase()}`,email,displayName:name,photoURL:String(info.photo||''),username:String(localStorage.getItem('nexzo_username')||'').replace(/^@/,'')};
  }
  function offlineKey(){return `nexzo_community_offline_v2:${state.user?.uid||identity().uid}`;}
  function time(ms){return new Date(Number(ms)||Date.now()).toLocaleString();}
  function safeHttpUrl(value){try{const url=new URL(String(value||''));return ['http:','https:'].includes(url.protocol)?url.href:''}catch{return ''}}
  function userName(){return state.user?.displayName||state.user?.email?.split('@')[0]||'Student';}
  function normalizeCommunityHandle(value){return String(value||'').replace(/^@/,'').trim().toLowerCase().replace(/[^a-z0-9._]+/g,'.').replace(/^[._]+|[._]+$/g,'').replace(/\.{2,}/g,'.').slice(0,20);}
  function userHandle(){
    const preferred=normalizeCommunityHandle(state.user?.username||localStorage.getItem('nexzo_username')||'');
    if(/^[a-z0-9._]{3,20}$/.test(preferred))return preferred;
    const emailBase=normalizeCommunityHandle(state.user?.email?.split('@')[0]||'');
    if(/^[a-z0-9._]{3,20}$/.test(emailBase))return emailBase;
    const nameBase=normalizeCommunityHandle(userName()).slice(0,12);
    const suffix=String(state.user?.uid||'user').replace(/[^a-z0-9]/gi,'').toLowerCase().slice(0,6)||'user';
    const fallback=normalizeCommunityHandle(`${nameBase||'student'}.${suffix}`);
    return /^[a-z0-9._]{3,20}$/.test(fallback)?fallback:`student.${suffix}`.slice(0,20);
  }
  function membershipPayload(role='member',joinedAtMs=Date.now()){return {uid:state.user.uid,name:String(userName()||'Student').trim().slice(0,100)||'Student',username:userHandle(),photoURL:String(state.user.photoURL||'').slice(0,2048),role,joinedAtMs:Number(joinedAtMs)||Date.now()};}
  function avatarMarkup(url,name,cls='post-avatar'){const clean=safeHttpUrl(url);return `<div class="${cls}">${clean?`<img src="${esc(clean)}" alt="${esc(name||'Student')} profile photo">`:esc((name||'S')[0].toUpperCase())}</div>`;}
  function identityLine(name,handle){return `<div class="post-name-line"><b>${esc(name||'Student')}</b>${handle?`<span class="post-handle">@${esc(String(handle).replace(/^@/,''))}</span>`:''}</div>`;}
  function toast(message,type='info'){window.NEXZOShell?.toast?.(message,type);if(window.NEXZOShell?.toast)return;let el=$('#nxCommunityToast');if(!el){el=document.createElement('div');el.id='nxCommunityToast';el.className='nx-toast';document.body.appendChild(el);}el.textContent=message;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2500);}
  function ensureUser(){if(!state.user){toast('Please log in to use Community','error');return false;}return true;}
  function setModeStatus(){
    let banner=$('#nxCommunityMode');
    if(state.mode==='cloud'){banner?.remove();return;}
    if(!banner){banner=document.createElement('div');banner.id='nxCommunityMode';banner.className='nx-community-mode';$('.community-pro-top')?.appendChild(banner);}
    if(!banner)return;
    if(state.mode==='offline'){banner.className='nx-community-mode offline';banner.textContent='Offline mode — changes on this device only';}
    else{banner.className='nx-community-mode';banner.textContent='Connecting…';}
  }
  function modal(html){const root=$('#communityModalRoot')||document.body;root.innerHTML=`<div class="nx-pro-modal" id="nxRealCommunityModal"><div class="nx-pro-modal-card"><button class="modal-close" data-v32-close>×</button>${html}</div></div>`;return $('#nxRealCommunityModal');}
  function closeModal(){try{state.groupMessageUnsub?.();}catch(_){}state.groupMessageUnsub=null;try{state.commentUnsub?.();}catch(_){}state.commentUnsub=null;$('#communityModalRoot')?.replaceChildren();}

  function legacyArray(keys){
    for(const key of keys){
      const value=parse(localStorage.getItem(key)||'[]',[]);
      if(Array.isArray(value)&&value.length)return value;
    }
    return [];
  }
  function loadOffline(){
    const data=parse(localStorage.getItem(offlineKey())||'{}',{});
    const legacyPosts=legacyArray(['nexzo_community_v2_posts','nexzoCommunityPostsProject2','nexzoCommunityPostsPro','nexzoCommunityPosts']);
    const legacyGroups=legacyArray(['nexzo_community_v2_groups','nexzoStudyGroupsProject2','nexzoStudyGroupsPro','nexzoStudyGroups']);
    state.posts=Array.isArray(data.posts)&&data.posts.length?data.posts:legacyPosts;
    state.groups=Array.isArray(data.groups)&&data.groups.length?data.groups:legacyGroups;
    state.saved=new Set(Array.isArray(data.saved)?data.saved:[]);
    state.liked=new Set(Array.isArray(data.liked)?data.liked:[]);
    state.comments=new Map(Object.entries(data.comments||{}));
    state.members=new Map(Object.entries(data.members||{}).map(([key,value])=>[key,new Set(value||[])]));
    state.messages=new Map(Object.entries(data.messages||{}));
  }
  function saveOffline(force=false){
    if(state.mode!=='offline'&&!force)return;
    localStorage.setItem(offlineKey(),JSON.stringify({
      posts:state.posts,groups:state.groups,saved:[...state.saved],liked:[...state.liked],comments:Object.fromEntries(state.comments),
      members:Object.fromEntries([...state.members].map(([key,value])=>[key,[...value]])),messages:Object.fromEntries(state.messages),updatedAtMs:Date.now()
    }));
    window.dispatchEvent(new CustomEvent('nexzo:community-updated',{detail:{mode:'offline'}}));
  }
  function startOffline(reason='Cloud connection unavailable'){
    cleanupRealtime();state.mode='offline';state.user=identity();loadOffline();setModeStatus();render();
    console.warn('[NEXZO Community] Offline mode:',reason);
  }

  async function initFirebase(){
    const context=await window.NEXZOFirebase.getContext({auth:true,firestore:true,storage:true});
    fb={app:context.app,auth:context.auth,db:context.db,storage:context.storage,...context.authTools,...context.firestoreTools,...context.storageTools};
    context.authTools.onAuthStateChanged(fb.auth,user=>{
      cleanupRealtime();
      if(!user){startOffline('Firebase login unavailable');return;}
      state.user=user;
      (async()=>{try{const snap=await fb.getDoc(fb.doc(fb.db,'users',user.uid,'profile','main'));if(snap.exists()){const profile=snap.data();state.user={...user,displayName:profile.name||user.displayName,photoURL:profile.photoURL||user.photoURL||'',username:String(profile.username||'').replace(/^@/,'')};if(state.user.username)localStorage.setItem('nexzo_username',state.user.username);render();}}catch(error){console.warn('[NEXZO Community] profile identity unavailable',error)}})();
      // Load this user's browser fallback before cloud listeners start. Local joins
      // remain authoritative when Firestore rules/network are unavailable.
      loadOffline();
      state.mode='cloud';setModeStatus();subscribeAll();syncPendingReports().catch(error=>console.warn('[NEXZO Community] Report sync failed:',error));
    });
  }

  async function sendReport(payload){
    const post=state.posts.find(row=>row.id===payload.postId);
    if(!post)throw new Error('The reported post no longer exists.');
    const clean={postId:payload.postId,reporterUid:state.user.uid,reason:String(payload.reason||'').trim().slice(0,300),status:'open',createdAtMs:Number(payload.createdAtMs)||Date.now()};
    await fb.setDoc(fb.doc(fb.db,'reports',`${clean.postId}_${clean.reporterUid}`),clean);
  }
  async function syncPendingReports(){
    if(state.mode!=='cloud'||!state.user||!window.NEXZOCommunityReports)return {sent:0,failed:0};
    const result=await window.NEXZOCommunityReports.drain(localStorage,state.user.uid,sendReport);
    if(result.sent)toast(`${result.sent} offline report${result.sent===1?'':'s'} synced.`,'success');
    return result;
  }

  function cleanupRealtime(){state.unsubs.splice(0).forEach(fn=>{try{fn();}catch(_){}});state.memberUnsubs.forEach(fn=>{try{fn();}catch(_){}});state.memberUnsubs.clear();state.notificationUnsubs.forEach(fn=>{try{fn();}catch(_){}});state.notificationUnsubs.clear();state.postNotifyReady=false;try{state.commentUnsub?.();}catch(_){}try{state.groupMessageUnsub?.();}catch(_){}state.commentUnsub=null;state.groupMessageUnsub=null;}
  function subscribeAll(){
    const onError=error=>{console.warn('[NEXZO Community] realtime sync unavailable',error);if(state.mode!=='offline')startOffline(error.code==='permission-denied'?'Firestore permission denied — using local mode':error.message);};
    state.unsubs.push(fb.onSnapshot(fb.collection(fb.db,'publicProfiles'),snapshot=>{state.identities=new Map(snapshot.docs.map(doc=>{const p=doc.data();return [doc.id,{authorName:p.name||'Student',authorUsername:p.username||'',authorPhoto:p.photoURL||''}]}));render();},()=>{}));
    state.unsubs.push(fb.onSnapshot(fb.query(fb.collection(fb.db,'posts'),fb.orderBy('createdAtMs','desc'),fb.limit(50)),snapshot=>{
      state.posts=snapshot.docs.map(doc=>({id:doc.id,likes:0,replies:0,...doc.data()}));
      if(state.postNotifyReady){snapshot.docChanges().filter(change=>change.type==='added').forEach(change=>{const post={id:change.doc.id,...change.doc.data()};if(post.uid===state.user?.uid)return;const age=Date.now()-Number(post.createdAtMs||0);if(age<0||age>120000)return;const title=`New Community post • ${post.authorName||'Student'}`,body=String(post.text||'').trim().slice(0,120)||'Shared a new post in NEXZO Community';window.NEXZOShell?.addNotification?.(title,body,`community.html#post-${post.id}`);window.NEXZOShell?.notifyDevice?.(title,body);});}else state.postNotifyReady=true;
      saveOffline(true);render();
    },onError));
    state.unsubs.push(fb.onSnapshot(fb.query(fb.collection(fb.db,'groups'),fb.orderBy('createdAtMs','desc'),fb.limit(50)),async snapshot=>{const cloudGroups=snapshot.docs.map(doc=>({id:doc.id,...doc.data()}));const recovered=state.groups.filter(group=>group?.id&&!cloudGroups.some(row=>row.id===group.id));state.groups=[...cloudGroups,...recovered];await Promise.all(state.groups.map(hydrateLocalGroupMedia));saveOffline(true);syncGroupMemberListeners();render();const params=new URLSearchParams(location.search),inviteId=params.get('joinGroup');if(inviteId&&!state._inviteOpened&&state.groups.some(g=>g.id===inviteId)){state._inviteOpened=true;setTimeout(()=>openGroup(inviteId),250);}},onError));
    try{state.unsubs.push(fb.onSnapshot(fb.collectionGroup(fb.db,'members'),snapshot=>{
      // Merge cloud memberships into the browser fallback instead of replacing it.
      // This prevents a locally successful join from disappearing on refresh.
      const next=new Map([...state.members].map(([key,value])=>[key,new Set(value)]));
      snapshot.docs.forEach(doc=>{const groupId=doc.ref.parent.parent?.id;if(!groupId)return;const set=next.get(groupId)||new Set();set.add(doc.id);next.set(groupId,set);});
      state.members=next;saveOffline(true);render();
    },error=>console.warn('[NEXZO Community] member count sync unavailable',error)));}catch(error){console.warn('[NEXZO Community] member listener unavailable',error);}
    state.unsubs.push(fb.onSnapshot(fb.collection(fb.db,'users',state.user.uid,'savedPosts'),snapshot=>{state.saved=new Set(snapshot.docs.map(doc=>doc.id));render();},onError));
    try{state.unsubs.push(fb.onSnapshot(fb.query(fb.collectionGroup(fb.db,'likes'),fb.where('uid','==',state.user.uid)),snapshot=>{state.liked=new Set(snapshot.docs.map(doc=>doc.ref.parent.parent?.id).filter(Boolean));render();},()=>{}));}catch(_){}
  }

  function syncGroupMemberListeners(){
    const activeIds=new Set(state.groups.map(group=>group.id));
    state.memberUnsubs.forEach((unsubscribe,groupId)=>{if(!activeIds.has(groupId)){try{unsubscribe();}catch(_){}state.memberUnsubs.delete(groupId);state.members.delete(groupId);}});
    state.groups.forEach(group=>{
      if(state.memberUnsubs.has(group.id))return;
      try{
        const unsubscribe=fb.onSnapshot(fb.collection(fb.db,'groups',group.id,'members'),snapshot=>{
          const ids=new Set(snapshot.docs.map(doc=>doc.id));
          state.members.set(group.id,ids);
          if(ids.has(state.user?.uid))syncGroupNotificationListener(group);else if(state.notificationUnsubs.has(group.id)){try{state.notificationUnsubs.get(group.id)();}catch(_){}state.notificationUnsubs.delete(group.id);}
          group.memberCount=ids.size;
          saveOffline(true);
          renderGroups();
          const countEl=$('#v32GroupMemberCount');
          if(countEl&&$('#nxRealCommunityModal'))countEl.textContent=String(ids.size);
        },error=>console.warn('[NEXZO Community] group member listener unavailable',group.id,error));
        state.memberUnsubs.set(group.id,unsubscribe);
      }catch(error){console.warn('[NEXZO Community] could not subscribe to group members',group.id,error);}
    });
  }

  function syncGroupNotificationListener(group){
    if(!group?.id||!state.user||state.notificationUnsubs.has(group.id))return;
    const members=state.members.get(group.id);if(!members?.has(state.user.uid))return;
    let ready=false;
    try{
      const q=fb.query(fb.collection(fb.db,'groups',group.id,'messages'),fb.orderBy('createdAtMs','desc'),fb.limit(1));
      const unsubscribe=fb.onSnapshot(q,snapshot=>{
        if(!ready){ready=true;return;}
        snapshot.docChanges().filter(change=>change.type==='added').forEach(change=>{
          const message={id:change.doc.id,...change.doc.data()};if(message.uid===state.user.uid||groupPrefs(group.id).muted)return;
          const age=Date.now()-Number(message.createdAtMs||0);if(age<0||age>120000)return;
          const title=`${group.name||'Study Group'} • ${message.authorName||'Student'}`;
          const body=String(message.text||message.attachment?.name||'Sent an attachment').slice(0,120);
          const href=`community.html?joinGroup=${encodeURIComponent(group.id)}`;
          window.NEXZOShell?.addNotification?.(title,body,href);window.NEXZOShell?.notifyDevice?.(title,body);
        });
      },error=>console.warn('[NEXZO Community] group notification listener unavailable',group.id,error));
      state.notificationUnsubs.set(group.id,unsubscribe);
    }catch(error){console.warn('[NEXZO Community] could not start group notifications',group.id,error);}
  }

  function filteredPosts(){
    let posts=[...state.posts];
    if(state.filter==='mine')posts=posts.filter(post=>post.uid===state.user?.uid);
    if(state.filter==='saved')posts=posts.filter(post=>state.saved.has(post.id));
    if(state.sort==='popular')posts.sort((a,b)=>Number(b.likes||0)-Number(a.likes||0));
    else if(state.sort==='replies')posts.sort((a,b)=>Number(b.replies||0)-Number(a.replies||0));
    else posts.sort((a,b)=>Number(b.createdAtMs||0)-Number(a.createdAtMs||0));
    return posts;
  }
  function postCard(post){
    post={...post,...(state.identities.get(post.uid)||{})};
    const rows=state.comments.get(post.id)||[],mine=post.uid===state.user?.uid,liked=state.liked.has(post.id),saved=state.saved.has(post.id);
    return `<article class="community-post-card" data-post-card="${esc(post.id)}">
      <div class="post-head">${avatarMarkup(post.authorPhoto,post.authorName)}<div class="post-identity">${identityLine(post.authorName,post.authorUsername)}<small>${esc(time(post.createdAtMs))}</small></div><span class="post-category">${esc(post.category||'General')}</span></div>
      <p class="post-text">${esc(post.text||'')}</p>
      ${safeHttpUrl(post.resourceUrl)?`<a class="community-resource-link" href="${esc(safeHttpUrl(post.resourceUrl))}" target="_blank" rel="noopener noreferrer">🔗 Open attached resource</a>`:''}
      <div class="post-tags">${(post.tags||[]).map(tag=>`<span>#${esc(tag)}</span>`).join('')}</div>
      <div class="post-actions">
        <button data-v32-like="${esc(post.id)}">${liked?'❤️':'🤍'} ${Math.max(0,Number(post.likes)||0)}</button>
        <button data-v32-comment="${esc(post.id)}">💬 Comment (${Math.max(0,Number(post.replies)||0)})</button>
        <button data-v32-save="${esc(post.id)}">${saved?'✅ Saved':'🔖 Save'}</button>
        <button data-v32-share="${esc(post.id)}">↗ Share</button><button data-v42-report="${esc(post.id)}">⚑ Report</button>${mine?`<button data-v32-delete="${esc(post.id)}">🗑 Delete</button>`:''}
      </div><div class="post-replies">${rows.slice(-4).map(comment=>`<div class="post-reply"><div class="post-reply-head">${avatarMarkup(comment.authorPhoto,comment.authorName,'post-reply-avatar')}<span>${identityLine(comment.authorName,comment.authorUsername)}</span></div>${esc(comment.text||'')}</div>`).join('')}</div>
    </article>`;
  }
  function render(){
    if(!isPage())return;setModeStatus();const posts=filteredPosts(),sevenDaysAgo=Date.now()-7*86400000;
    const activeUsers=new Set(state.posts.filter(post=>Number(post.updatedAtMs||post.createdAtMs)>=sevenDaysAgo).map(post=>post.uid).filter(Boolean));
    const set=(id,value)=>{const el=$(`#${id}`);if(el)el.textContent=value;};
    set('communityTotalPosts',state.posts.length);set('communityActiveUsers',activeUsers.size);set('communityGroupCount',state.groups.length);set('communityGroupCountInline',visibleGroups().length);set('communityDiscussionCount',state.posts.reduce((sum,post)=>sum+Math.max(0,Number(post.replies)||0),0));
    const feed=$('#communityFeed');if(feed)feed.innerHTML=posts.length?posts.map(postCard).join(''):`<div class="community-empty-v2"><h3>No posts found</h3><p>Create the first discussion or change the selected filter.</p></div>`;
    renderTrending();renderContributors();renderGroups();
  }
  window.addEventListener('nexzo:stats-updated',()=>{ if(isPage() && state.mode!=='loading') render(); });

  function renderTrending(){const counts={};state.posts.forEach(post=>(post.tags?.length?post.tags:[post.category]).filter(Boolean).forEach(tag=>counts[tag]=(counts[tag]||0)+1));const rows=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6),box=$('#trendingTopics');if(box)box.innerHTML=rows.length?rows.map(([tag,count])=>`<div class="side-item"><div><b>#${esc(tag)}</b><small>${count} ${count===1?'post':'posts'}</small></div><span>🔥</span></div>`).join(''):'<div class="community-empty-mini-v2">No trends yet.</div>';}
  function renderContributors(){const map={};state.posts.forEach(raw=>{const post={...raw,...(state.identities.get(raw.uid)||{})};const key=post.uid||post.authorName;map[key]??={name:post.authorName||'Student',username:post.authorUsername||'',photo:post.authorPhoto||'',posts:0,likes:0,comments:0};map[key].posts+=1;map[key].likes+=Number(post.likes)||0;map[key].comments+=Number(post.replies)||0;});const leaders=Object.values(map).map(row=>({...row,score:row.posts*20+row.likes*2+row.comments*4})).sort((a,b)=>b.score-a.score).slice(0,5),box=$('#topContributors');if(box)box.innerHTML=leaders.length?leaders.map((row,index)=>`<div class="side-item"><div><b>${index+1}. ${esc(row.name)}${row.username?` <span class="post-handle">@${esc(row.username)}</span>`:''}</b><small>${row.posts} posts • ${row.comments} comments</small></div><span>${row.score} pts</span></div>`).join(''):'<div class="community-empty-mini-v2">No contributors yet.</div>';}
  function groupPrivacy(group){return group?.privacy==='private'?'private':'public';}
  function currentUserInGroup(group){return !!state.user&&(group?.ownerUid===state.user.uid||state.members.get(group?.id)?.has(state.user.uid));}
  function visibleGroups(){return state.groups.filter(group=>groupPrivacy(group)==='public'||currentUserInGroup(group));}
  function renderGroups(){const box=$('#studyGroupsList');if(!box)return;const rows=visibleGroups();box.innerHTML=rows.length?rows.map(group=>{const count=Math.max(Number(group.memberCount||0),state.members.get(group.id)?.size||0,1),privacy=groupPrivacy(group);return `<div class="group-pro-card"><span class="nx-group-list-icon">${privacy==='private'?'🔒':'👥'}</span><div class="nx-group-list-copy"><b>${esc(group.name||'Study Group')}</b><small>${count} ${count===1?'Member':'Members'} · ${esc(group.subject||'General')} · ${privacy==='private'?'Private':'Public'}</small></div><button data-v32-open-group="${esc(group.id)}">Open</button><span class="nx-group-list-preview">${esc(group.description||'Open the group to chat, share files and study together.')}</span></div>`;}).join(''):'<div class="community-empty-mini-v2">No public or joined groups yet. Create or join a group.</div>';}

  async function createPost(){
    if(!ensureUser())return;const input=$('#communityPostText'),raw=input?.value||'',guard=window.NEXZOCommunitySafety;
    const checked=guard?.validateText(raw,{min:3,max:2000})||{ok:raw.trim().length>=3,text:raw.trim(),message:'Write at least 3 characters.'};if(!checked.ok)return toast(checked.message,'error');
    const rate=guard?.rateLimit(localStorage,`nexzo:community:post-rate:${state.user.uid}`,{cooldownMs:12000});if(rate&&!rate.allowed)return toast(`Please wait ${Math.ceil(rate.remainingMs/1000)}s before posting again.`,'error');
    const dup=guard?.duplicate(localStorage,`nexzo:community:post-dup:${state.user.uid}`,checked.text);if(dup?.duplicate)return toast('Duplicate post blocked. Edit the message before posting again.','error');
    const text=checked.text,tags=($('#communityPostTags')?.value||'').split(',').map(tag=>tag.trim().replace(/^#/,'')).filter(Boolean).slice(0,8),now=Date.now();
    const data={uid:state.user.uid,authorName:userName(),authorUsername:userHandle(),authorPhoto:state.user.photoURL||'',text:text.slice(0,2000),tags,category:$('#communityPostCategory')?.value||'Academics',resourceUrl:safeHttpUrl(state.resourceUrl),likes:0,replies:0,createdAtMs:now,updatedAtMs:now};
    if(state.mode==='offline'){state.posts.unshift({id:uuid(),...data});saveOffline();render();}
    else await fb.addDoc(fb.collection(fb.db,'posts'),data);
    rate?.commit();dup?.commit();if(input)input.value='';if($('#communityPostTags'))$('#communityPostTags').value='';state.resourceUrl='';localStorage.removeItem(state.draftKey);toast('Post published');window.dispatchEvent(new CustomEvent('nexzo:community-posted',{detail:{id:data.id||uuid()}}));
  }
  async function toggleLike(postId){
    if(!ensureUser())return;
    if(state.mode==='offline'){
      const post=state.posts.find(row=>row.id===postId);if(!post)return;
      const liked=state.liked.has(postId);if(liked)state.liked.delete(postId);else state.liked.add(postId);post.likes=Math.max(0,Number(post.likes||0)+(liked?-1:1));post.updatedAtMs=Date.now();saveOffline();render();return;
    }
    const postRef=fb.doc(fb.db,'posts',postId),likeRef=fb.doc(fb.db,'posts',postId,'likes',state.user.uid);
    await fb.runTransaction(fb.db,async transaction=>{const [postSnap,likeSnap]=await Promise.all([transaction.get(postRef),transaction.get(likeRef)]);if(!postSnap.exists())throw new Error('Post no longer exists.');const count=Math.max(0,Number(postSnap.data()?.likes)||0);if(likeSnap.exists()){transaction.delete(likeRef);transaction.update(postRef,{likes:Math.max(0,count-1),updatedAtMs:Date.now()});}else{transaction.set(likeRef,{uid:state.user.uid,createdAtMs:Date.now()});transaction.update(postRef,{likes:count+1,updatedAtMs:Date.now()});}});
  }
  async function addComment(postId,text){
    if(!ensureUser()||!text.trim())return;const data={id:uuid(),uid:state.user.uid,authorName:userName(),authorUsername:userHandle(),authorPhoto:state.user.photoURL||'',text:text.trim().slice(0,1000),createdAtMs:Date.now()};
    if(state.mode==='offline'){const rows=state.comments.get(postId)||[];rows.push(data);state.comments.set(postId,rows);const post=state.posts.find(row=>row.id===postId);if(post){post.replies=rows.length;post.updatedAtMs=Date.now();}saveOffline();render();return;}
    const postRef=fb.doc(fb.db,'posts',postId),commentRef=fb.doc(fb.collection(fb.db,'posts',postId,'comments'));
    await fb.runTransaction(fb.db,async transaction=>{const postSnap=await transaction.get(postRef);if(!postSnap.exists())throw new Error('Post no longer exists.');const {id:_commentId,...commentData}=data;transaction.set(commentRef,commentData);transaction.update(postRef,{replies:Math.max(0,Number(postSnap.data()?.replies)||0)+1,updatedAtMs:Date.now()});});
  }
  function drawComments(postId){const rows=state.comments.get(postId)||[],box=$('#v32Comments');if(box)box.innerHTML=rows.length?rows.map(comment=>`<div class="group-chat-msg"><div class="post-reply-head">${avatarMarkup(comment.authorPhoto,comment.authorName,'post-reply-avatar')}<span>${identityLine(comment.authorName,comment.authorUsername)}</span></div>${esc(comment.text||'')}</div>`).join(''):'<div class="post-reply">No comments yet.</div>';}
  function openComments(postId){
    const post=state.posts.find(row=>row.id===postId);if(!post)return;modal(`<h2>💬 Comments</h2><p>${esc((post.text||'').slice(0,240))}</p><div id="v32Comments" class="group-chat-box"><div class="post-reply">Loading comments…</div></div><div class="group-chat-input"><input id="v32CommentInput" placeholder="Write a comment..."><button id="v32CommentSend">Send</button></div>`);
    if(state.mode==='offline')drawComments(postId);else{try{state.commentUnsub?.();}catch(_){}state.commentUnsub=fb.onSnapshot(fb.query(fb.collection(fb.db,'posts',postId,'comments'),fb.orderBy('createdAtMs','asc'),fb.limit(100)),snapshot=>{state.comments.set(postId,snapshot.docs.map(doc=>({id:doc.id,...doc.data()})));drawComments(postId);},error=>{const box=$('#v32Comments');if(box)box.innerHTML=`<div class="post-reply">${esc(error.message)}</div>`;});}
    $('#v32CommentSend').onclick=async()=>{const input=$('#v32CommentInput'),text=input?.value.trim();if(!text)return;await addComment(postId,text);input.value='';if(state.mode==='offline')drawComments(postId);};
  }
  async function toggleSave(postId){if(!ensureUser())return;if(state.mode==='offline'){state.saved.has(postId)?state.saved.delete(postId):state.saved.add(postId);saveOffline();render();return;}const ref=fb.doc(fb.db,'users',state.user.uid,'savedPosts',postId);if(state.saved.has(postId))await fb.deleteDoc(ref);else await fb.setDoc(ref,{postId,createdAtMs:Date.now()});}

  async function reportPost(postId){
    if(!ensureUser())return;
    const post=state.posts.find(row=>row.id===postId);if(!post)return toast('This post is no longer available.','error');
    const root=modal(`<div class="nx-report-modal"><span class="nx-modal-kicker">Community safety</span><h2>⚑ Report post</h2><p class="nx-modal-copy">Tell moderators why this post should be reviewed.</p><label class="nx-field-label" for="v43ReportCategory">Reason</label><select id="v43ReportCategory"><option value="spam">Spam or promotion</option><option value="abuse">Abuse or harassment</option><option value="misinformation">Misinformation</option><option value="unsafe">Unsafe content</option><option value="other">Other</option></select><label class="nx-field-label" for="v43ReportDetails">Details</label><textarea id="v43ReportDetails" maxlength="260" placeholder="Add a short explanation..."></textarea><div class="nx-modal-actions"><button class="btn" data-v43-report-cancel>Cancel</button><button class="btn primary" data-v43-report-submit>Submit report</button></div></div>`);
    root.querySelector('[data-v43-report-cancel]').onclick=closeModal;
    root.querySelector('[data-v43-report-submit]').onclick=async()=>{
      const category=$('#v43ReportCategory')?.value||'other',details=$('#v43ReportDetails')?.value||'',reason=`${category}: ${details}`.trim();
      const queue=window.NEXZOCommunityReports,checked=queue?.validate({postId,reporterUid:state.user.uid,reason});
      if(checked&&!checked.ok)return toast(checked.message,'error');
      const payload={postId,reporterUid:state.user.uid,reason:checked?.reason||reason.slice(0,300),status:'open',createdAtMs:Date.now()};
      const button=root.querySelector('[data-v43-report-submit]');button.disabled=true;button.textContent='Submitting…';
      try{
        if(state.mode==='offline'){
          const result=queue?.enqueue(localStorage,payload);if(result&&!result.ok)throw new Error(result.message);
          closeModal();toast('Report saved offline. It will sync after reconnecting.','info');
        }else{
          await sendReport(payload);closeModal();toast('Report submitted for review','success');
        }
      }catch(error){button.disabled=false;button.textContent='Submit report';toast(error.message||'Report failed','error');}
    };
  }

  async function deletePost(postId){
    if(!ensureUser()||!confirm('Delete this post?'))return;const post=state.posts.find(row=>row.id===postId);if(post?.uid!==state.user.uid)return toast('Only the post owner can delete it.','error');
    if(state.mode==='offline'){state.posts=state.posts.filter(row=>row.id!==postId);state.saved.delete(postId);state.liked.delete(postId);state.comments.delete(postId);saveOffline();render();return;}
    const [likes,comments]=await Promise.all([fb.getDocs(fb.collection(fb.db,'posts',postId,'likes')),fb.getDocs(fb.collection(fb.db,'posts',postId,'comments'))]);
    const refs=[...likes.docs,...comments.docs].map(doc=>doc.ref),groups=window.NEXZOCommunityMaintenance?.chunks(refs,450)||[refs];
    for(const group of groups){const batch=fb.writeBatch(fb.db);group.forEach(ref=>batch.delete(ref));await batch.commit();}
    const finalBatch=fb.writeBatch(fb.db);finalBatch.delete(fb.doc(fb.db,'posts',postId));await finalBatch.commit();
  }
  async function improvePost(){const input=$('#communityPostText'),text=input?.value.trim()||'';if(text.length<3)return toast('Write a draft first.','error');if(!window.NEXZOAI?.community)return toast('Study service is not configured.','error');const button=$('#communityAIImprove');if(button){button.disabled=true;button.dataset.old=button.textContent;button.textContent='Improving…';}try{const data=await window.NEXZOAI.community({postText:text});input.value=[data.title,data.summary||text].filter(Boolean).join(' — ').slice(0,2000);if(Array.isArray(data.tags)&&$('#communityPostTags'))$('#communityPostTags').value=data.tags.slice(0,8).join(', ');localStorage.setItem(state.draftKey,input.value);toast('AI improved the draft. Review before publishing.');}catch(error){toast(error.message||'AI improvement failed','error');}finally{if(button){button.disabled=false;button.textContent=button.dataset.old||'✨ Improve with AI';}}}
  function attachResource(){const url=prompt('Paste a resource URL:')?.trim();if(!url)return;try{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))throw new Error();state.resourceUrl=parsed.href;toast('Resource attached');}catch(_){toast('Enter a valid http/https URL','error');}}

  async function createGroup(){
    const existing=$('#nxRealCommunityModal');
    if(existing?.dataset?.modalType==='create-group'){closeModal();return;}
    if(existing)closeModal();
    if(!ensureUser())return;
    if(state.mode!=='cloud')return toast('Internet access is required to create a shared group.','error');
    const root=modal(`<div class="nx-group-create"><span class="nx-modal-kicker">Study group</span><h2>Create a group</h2><p class="nx-modal-copy">Choose whether anyone can discover the group or only people with your invite can join.</p><label>Group name</label><input id="v32GroupName" maxlength="100" placeholder="e.g. DSA Warriors"><label>Subject</label><input id="v32GroupSubject" maxlength="80" placeholder="e.g. Data Structures"><label>Description</label><textarea id="v32GroupDescription" maxlength="500" placeholder="What will this group study?"></textarea><label>Group privacy</label><div class="nx-group-privacy"><label><input type="radio" name="v32Privacy" value="public" checked><span><b>🌐 Public</b><small>Discoverable in Community. Signed-in students can join.</small></span></label><label><input type="radio" name="v32Privacy" value="private"><span><b>🔒 Private</b><small>Hidden from discovery. Join through the invite link.</small></span></label></div><button class="btn primary" data-v32-create-group-now>Create Group</button></div>`);
    root.dataset.modalType='create-group';
    root.querySelector('[data-v32-create-group-now]').onclick=async()=>{
      const name=$('#v32GroupName')?.value.trim(),subject=$('#v32GroupSubject')?.value.trim(),description=($('#v32GroupDescription')?.value||'').trim(),privacy=root.querySelector('input[name="v32Privacy"]:checked')?.value==='private'?'private':'public';
      if(!name||!subject)return toast('Name and subject are required.','error');
      const button=root.querySelector('[data-v32-create-group-now]');button.disabled=true;button.textContent='Creating…';
      const now=Date.now(),ref=fb.doc(fb.collection(fb.db,'groups')),inviteCode=uuid().replace(/[^a-z0-9]/gi,'').slice(-12).toUpperCase();
      try{
        const groupData={ownerUid:state.user.uid,ownerName:userName(),name:name.slice(0,100),subject:subject.slice(0,80),description:description.slice(0,500),memberCount:1,createdAtMs:now,updatedAtMs:now,avatarURL:'',wallpaperURL:'',privacy,inviteCode,permissions:{membersCanSend:true,membersCanInvite:true,membersCanEdit:false,historyVisible:true,approvalRequired:false}};
        const ownerRef=fb.doc(fb.db,'groups',ref.id,'members',state.user.uid),ownerData=membershipPayload('owner',now);
        try{const batch=fb.writeBatch(fb.db);batch.set(ref,groupData);batch.set(ownerRef,ownerData);await batch.commit();}
        catch(batchError){if(batchError?.code!=='permission-denied')throw batchError;await fb.setDoc(ref,groupData);try{await fb.setDoc(ownerRef,ownerData);}catch(memberError){await fb.deleteDoc(ref).catch(()=>{});throw memberError;}}
        closeModal();toast(`${privacy==='private'?'Private':'Public'} group created`,'success');setTimeout(()=>openGroup(ref.id),250);
      }catch(error){console.error('[NEXZO Community] create shared group failed',error);button.disabled=false;button.textContent='Create Group';toast(error?.code==='permission-denied'?'Firestore rules are blocking groups. Deploy the included rules first.':(error.message||'Could not create group.'),'error');}
    };
  }

  function messageTime(ms){
    const date=new Date(Number(ms)||Date.now());
    return date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  }
  function groupPrefsKey(groupId){return `nexzo_group_prefs:${state.user?.uid||'guest'}:${groupId}`;}
  function groupPrefs(groupId){return parse(localStorage.getItem(groupPrefsKey(groupId))||'{}',{});}
  function saveGroupPrefs(groupId,patch){localStorage.setItem(groupPrefsKey(groupId),JSON.stringify({...groupPrefs(groupId),...patch}));}
  function fileKind(file){const type=String(file?.type||'');if(type.startsWith('image/'))return type==='image/gif'?'gif':'image';if(type.startsWith('audio/'))return 'audio';return 'document';}
  function readableSize(bytes){const n=Number(bytes)||0;if(n<1024)return `${n} B`;if(n<1048576)return `${(n/1024).toFixed(1)} KB`;return `${(n/1048576).toFixed(1)} MB`;}
  function attachmentMarkup(message){const a=message.attachment;if(!a||!a.url)return '';
    if(a.kind==='image'||a.kind==='gif'||a.kind==='sticker')return `<a class="nx-message-media" href="${esc(a.url)}" target="_blank" rel="noopener"><img src="${esc(a.url)}" alt="${esc(a.name||'Shared image')}"></a>`;
    if(a.kind==='audio')return `<audio class="nx-message-audio" controls preload="metadata" src="${esc(a.url)}"></audio>`;
    return `<a class="nx-message-file" href="${esc(a.url)}" target="_blank" rel="noopener"><span>📄</span><span><b>${esc(a.name||'Document')}</b><small>${esc(a.sizeLabel||'')}</small></span><i>↗</i></a>`;
  }
  function drawGroupMessages(groupId,search=''){
    const prefs=groupPrefs(groupId),clearedAt=Number(prefs.clearedAtMs||0),term=String(search||'').trim().toLowerCase();
    let rows=(state.messages.get(groupId)||[]).filter(m=>Number(m.createdAtMs||0)>clearedAt);
    if(term)rows=rows.filter(m=>String(m.text||'').toLowerCase().includes(term)||String(m.authorName||'').toLowerCase().includes(term)||String(m.attachment?.name||'').toLowerCase().includes(term));
    const box=$('#v32GroupMessages');if(!box)return;
    if(!rows.length){box.innerHTML=`<div class="nx-chat-empty"><span>${term?'🔎':'💬'}</span><b>${term?'No matching messages':'No messages yet'}</b><small>${term?'Try another word.':'Start the group conversation.'}</small></div>`;return;}
    box.innerHTML=rows.map(message=>{const mine=message.uid===state.user?.uid;return `<div class="nx-group-message-row ${mine?'mine':'other'}"><div class="nx-group-message"><span class="nx-message-author">${mine?'You':esc(message.authorName||'Student')}${message.authorUsername?` <small>@${esc(String(message.authorUsername).replace(/^@/,''))}</small>`:''}</span>${attachmentMarkup(message)}${message.text?`<p>${esc(message.text)}</p>`:''}<time>${esc(messageTime(message.createdAtMs))}</time></div></div>`;}).join('');
    if(!term)requestAnimationFrame(()=>box.scrollTo({top:box.scrollHeight,behavior:'auto'}));
  }

  async function joinGroupCloud(groupId,group){
    const groupRef=fb.doc(fb.db,'groups',groupId),memberRef=fb.doc(fb.db,'groups',groupId,'members',state.user.uid),now=Date.now(),payload=membershipPayload('member',now);
    try{
      let created=false;
      await fb.runTransaction(fb.db,async transaction=>{
        const [groupSnap,memberSnap]=await Promise.all([transaction.get(groupRef),transaction.get(memberRef)]);
        if(!groupSnap.exists())throw new Error('This study group no longer exists.');
        if(memberSnap.exists())return;
        const current=Math.max(1,Number(groupSnap.data()?.memberCount)||1);
        transaction.set(memberRef,payload);
        transaction.update(groupRef,{memberCount:current+1,updatedAtMs:now});
        created=true;
      });
      return {created,mode:'transaction'};
    }catch(error){
      // Older deployed Firestore rules allowed the membership document but not the
      // atomic memberCount update. Keep joining functional while the new rules roll out.
      if(error?.code!=='permission-denied')throw error;
      const existing=await fb.getDoc(memberRef).catch(()=>null);
      if(existing?.exists?.())return {created:false,mode:'existing'};
      await fb.setDoc(memberRef,payload);
      console.warn('[NEXZO Community] Joined with legacy rules compatibility; deploy current firestore.rules for atomic member counts.');
      return {created:true,mode:'legacy'};
    }
  }
  async function leaveGroupCloud(groupId,group){
    if(group?.ownerUid===state.user.uid)throw new Error('The group owner cannot leave the group. Delete the group or transfer ownership first.');
    const groupRef=fb.doc(fb.db,'groups',groupId),memberRef=fb.doc(fb.db,'groups',groupId,'members',state.user.uid),now=Date.now();
    try{
      await fb.runTransaction(fb.db,async transaction=>{
        const [groupSnap,memberSnap]=await Promise.all([transaction.get(groupRef),transaction.get(memberRef)]);
        if(!memberSnap.exists())return;
        const current=Math.max(1,Number(groupSnap.exists()?groupSnap.data()?.memberCount:1)||1);
        transaction.delete(memberRef);
        if(groupSnap.exists())transaction.update(groupRef,{memberCount:Math.max(1,current-1),updatedAtMs:now});
      });
    }catch(error){
      if(error?.code!=='permission-denied')throw error;
      await fb.deleteDoc(memberRef);
      console.warn('[NEXZO Community] Left with legacy rules compatibility; deploy current firestore.rules for atomic member counts.');
    }
  }

  async function openGroup(groupId){
    if(!ensureUser())return;const group=state.groups.find(row=>row.id===groupId);if(!group)return toast('Group not found.','error');
    if(state.mode!=='cloud'){modal(`<div class="nx-group-offline"><h2>👥 ${esc(group.name)}</h2><p>Realtime groups require Firestore. Your browser is currently offline.</p><button class="btn primary" onclick="location.reload()">Retry connection</button></div>`);return;}
    const savedMediaMeta=readGroupMediaMeta(groupId);
    const initialWallpaper=mediaURL(group.wallpaperURL||savedMediaMeta.wallpaperURL||DEFAULT_GROUP_WALLPAPER);
    group.wallpaperURL=initialWallpaper;
    const memberRef=fb.doc(fb.db,'groups',groupId,'members',state.user.uid);let isMember=false,members=[];
    try{isMember=(await fb.getDoc(memberRef)).exists();}catch(error){toast('Could not check group membership.','error');return;}
    const params=new URLSearchParams(location.search),inviteAllowed=groupPrivacy(group)==='public'||isMember||group.ownerUid===state.user.uid||(params.get('joinGroup')===groupId&&params.get('code')&&params.get('code')===String(group.inviteCode||''));
    if(groupPrivacy(group)==='private'&&!inviteAllowed){modal(`<div class="nx-private-group-gate"><span class="nx-modal-kicker">Private group</span><h2>🔒 ${esc(group.name)}</h2><p>This group can only be joined using its valid invite link.</p><button class="btn" data-v32-close>Close</button></div>`);return;}
    const workspaceGroups=visibleGroups().map(row=>{const count=Math.max(Number(row.memberCount||0),state.members.get(row.id)?.size||0,1);return `<button class="nx-workspace-group ${row.id===groupId?'active':''}" data-v32-open-group="${esc(row.id)}" data-group-search-text="${esc(`${row.name||''} ${row.subject||''}`.toLowerCase())}"><span class="nx-workspace-avatar">${`<img src="${esc(row.avatarURL||DEFAULT_GROUP_ICON)}" alt="">`}</span><span><b>${esc(row.name||'Study Group')}</b><small>${count} ${count===1?'member':'members'} · ${esc(row.subject||'General')}</small></span>${row.id===groupId?'<i>LIVE</i>':''}</button>`;}).join('');
    modal(`<div class="nx-group-room nx-group-workspace"><button class="nx-study-global-close" data-v32-close aria-label="Close study group popup">×</button>
      <aside class="nx-workspace-list nx-study-popup-nav">
        <div class="nx-study-popup-title"><button data-v32-close aria-label="Close study group">←</button><div><strong>Study Group</strong><small>Community workspace</small></div></div>
        <nav class="nx-study-popup-menu" aria-label="Study group sections">
          <button class="active" data-study-view="chats"><span>💬</span><b>Chats</b></button>
          <button data-study-view="media"><span>🖼️</span><b>Media</b></button>
          <button data-study-view="profile"><span>◉</span><b>Profile</b></button>
          <button data-study-view="wallpaper"><span>🎨</span><b>Wallpaper</b></button>
          <button data-study-view="notifications"><span>🔔</span><b>Notifications</b><i id="v33MuteState">${groupPrefs(groupId).muted?'Muted':'On'}</i></button>
          <button data-study-view="quality"><span>☁</span><b>Media Upload Quality</b><i id="v33QualityState">${localStorage.getItem(`nexzo_group_media_quality:${state.user.uid}`)||'Standard'}</i></button>
        </nav>
      </aside>
      <section class="nx-workspace-chat">
        <header class="nx-group-room-head"><button class="nx-group-avatar" data-group-info aria-label="Group info">${`<img src="${esc(group.avatarURL||DEFAULT_GROUP_ICON)}" alt="${esc(group.name)} icon">`}</button><div class="nx-group-title"><h2>${esc(group.name)}</h2><p>${esc(group.subject||'Study Group')} · <span id="v32GroupMemberCount">…</span> members</p></div><button class="nx-room-action" data-menu-search aria-label="Search messages">⌕</button><span class="nx-live-dot">LIVE</span><button class="nx-room-menu-btn" data-group-menu aria-label="Group menu">⋮</button></header>
        <div id="v32GroupConnection" class="nx-group-connection">Connecting…</div>
        <div id="v32GroupSearch" class="nx-group-search" hidden><span>⌕</span><input placeholder="Search messages" autocomplete="off"><button aria-label="Close search">×</button></div>
        <div id="v32GroupMessages" class="nx-group-chat-window" style="--group-wallpaper:url('${esc(initialWallpaper)}')"></div>
        <div id="v32GroupActions" class="nx-group-actions"></div>
        <div id="v32GroupPopup" class="nx-group-popup" hidden></div>
      </section>
      <aside id="v32GroupInfo" class="nx-group-info-panel" hidden></aside>
      <input id="v32GroupFile" type="file" hidden>
    </div>`);
    const actions=$('#v32GroupActions'),connection=$('#v32GroupConnection'),popup=$('#v32GroupPopup'),info=$('#v32GroupInfo'),search=$('#v32GroupSearch'),fileInput=$('#v32GroupFile'),groupListSearch=$('#v32GroupListSearch'),messageBox=$('#v32GroupMessages');
    messageBox?.style.setProperty('--group-wallpaper',`url("${initialWallpaper}")`);
    if(messageBox){messageBox.style.backgroundImage=`linear-gradient(rgba(2,4,10,.44),rgba(2,4,10,.68)),url("${initialWallpaper}")`;messageBox.style.backgroundSize='cover';messageBox.style.backgroundPosition='center';}
    groupListSearch?.addEventListener('input',()=>{const q=groupListSearch.value.trim().toLowerCase();document.querySelectorAll('#v32WorkspaceGroups [data-group-search-text]').forEach(card=>{card.hidden=!!q&&!card.dataset.groupSearchText.includes(q);});});
    async function refreshMembers(){try{const snap=await fb.getDocs(fb.collection(fb.db,'groups',groupId,'members'));members=snap.docs.map(d=>({id:d.id,...d.data()}));group.memberCount=members.length;state.members.set(groupId,new Set(members.map(m=>m.id)));$('#v32GroupMemberCount').textContent=String(members.length);renderGroups();}catch(_){$('#v32GroupMemberCount').textContent=String(group.memberCount||1);}}
    function renderActions(){
      actions.innerHTML=isMember?`<div class="nx-group-composer"><button class="nx-compose-icon" data-attach aria-label="Attach">＋</button><button class="nx-compose-icon" data-emoji aria-label="Emoji">☺</button><input id="v32GroupMessage" maxlength="1000" autocomplete="off" placeholder="Message ${esc(group.name)}"><button class="nx-send-btn" type="button" data-v32-send-group="${esc(groupId)}" aria-label="Send message">➤</button></div>`:`<div class="nx-group-join-panel"><p>${groupPrivacy(group)==='private'?'You opened a valid private-group invite. Join to read and send messages.':'Join this public group to read and send messages.'}</p><button class="btn primary" data-v32-join-group="${esc(groupId)}">Join Group</button></div>`;
      const input=$('#v32GroupMessage');requestAnimationFrame(()=>input?.focus({preventScroll:true}));input?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();actions.querySelector('[data-v32-send-group]')?.click();}});
    }
    function subscribeMessages(){try{state.groupMessageUnsub?.();}catch(_){}state.groupMessageUnsub=null;if(!isMember){state.messages.set(groupId,[]);drawGroupMessages(groupId);connection.textContent='Join required';connection.className='nx-group-connection warning';return;}connection.textContent='● Connected';connection.className='nx-group-connection online';state.groupMessageUnsub=fb.onSnapshot(fb.query(fb.collection(fb.db,'groups',groupId,'messages'),fb.orderBy('createdAtMs','asc'),fb.limit(200)),snap=>{state.messages.set(groupId,snap.docs.map(d=>({id:d.id,...d.data()})));drawGroupMessages(groupId,$('#v32GroupSearch input')?.value||'');},error=>{connection.textContent=error?.code==='permission-denied'?'Deploy Firestore rules to use shared chat':'Chat disconnected';connection.className='nx-group-connection error';});}
    function showPopup(html,key='generic'){popup.innerHTML=html;popup.dataset.popupKey=key;popup.hidden=false;}function hidePopup(){popup.hidden=true;popup.innerHTML='';delete popup.dataset.popupKey;}function togglePopup(key,htmlFactory){if(!popup.hidden&&popup.dataset.popupKey===key){hidePopup();return false;}showPopup(typeof htmlFactory==='function'?htmlFactory():htmlFactory,key);return true;}
    function setActiveStudyView(view){document.querySelectorAll('.nx-study-popup-menu [data-study-view]').forEach(btn=>btn.classList.toggle('active',btn.dataset.studyView===view));}
    async function applyBuiltinWallpaper(url){
      if(!isOwner())return toast('Only the group owner can change the group wallpaper.','error');
      const chosen=BUILTIN_GROUP_WALLPAPERS.find(row=>row.url===url);if(!chosen)return;
      const previous=group.wallpaperURL||DEFAULT_GROUP_WALLPAPER;
      group.wallpaperURL=mediaURL(chosen.url);
      messageBox?.style.setProperty('--group-wallpaper',`url("${mediaURL(chosen.url)}")`);
      if(messageBox){messageBox.style.backgroundImage=`linear-gradient(rgba(2,4,10,.44),rgba(2,4,10,.68)),url("${mediaURL(chosen.url)}")`;messageBox.style.backgroundSize='cover';messageBox.style.backgroundPosition='center';}
      document.querySelector('.nx-info-cover')?.style.setProperty('--nx-cover',`url("${mediaURL(chosen.url)}")`);
      writeGroupMediaMeta(groupId,{wallpaperPending:true,wallpaperURL:chosen.url,wallpaperBuiltin:true});
      try{
        await withTimeout(fb.updateDoc(fb.doc(fb.db,'groups',groupId),{wallpaperURL:chosen.url,wallpaperType:'builtin',updatedAtMs:Date.now()}),15000);
        writeGroupMediaMeta(groupId,{wallpaperPending:false,wallpaperURL:chosen.url,wallpaperBuiltin:true,lastError:''});
        connection.textContent='● Wallpaper saved';connection.className='nx-group-connection online';
        toast(`${chosen.name} wallpaper saved`,'success');
      }catch(error){
        writeGroupMediaMeta(groupId,{wallpaperPending:true,wallpaperURL:chosen.url,wallpaperBuiltin:true,lastError:error?.message||'Cloud save failed'});
        connection.textContent='● Wallpaper saved on this device';connection.className='nx-group-connection warning';
        toast('Wallpaper saved on this device. Deploy Firebase rules for cross-device sync.','info');
      }
    }
    function showWallpaperPicker(){
      setActiveStudyView('wallpaper');
      const selected=group.wallpaperURL||DEFAULT_GROUP_WALLPAPER;
      showPopup(`<div class="nx-wallpaper-picker"><header><div><b>Chat wallpaper</b><small>15 built-in wallpapers · Study Group only</small></div><button data-close-popup aria-label="Close wallpaper picker">×</button></header><div class="nx-wallpaper-preview"><img src="${esc(selected)}" alt="Selected wallpaper preview"><span>Wallpaper preview</span></div><div class="nx-wallpaper-grid">${BUILTIN_GROUP_WALLPAPERS.map(w=>`<button class="${selected===w.url?'selected':''}" data-wallpaper-url="${esc(w.url)}"><i><img src="${esc(w.url)}" alt="${esc(w.name)} wallpaper" loading="lazy"></i><span>${esc(w.name)}</span></button>`).join('')}</div>${isOwner()?'<button class="nx-upload-wallpaper" data-custom-wallpaper>＋ Upload your own wallpaper</button>':'<p class="nx-wallpaper-owner-note">Only the group owner can change the wallpaper.</p>'}</div>`,'wallpaper');
    }
    function showQualityPicker(){
      setActiveStudyView('quality');const key=`nexzo_group_media_quality:${state.user.uid}`;const current=localStorage.getItem(key)||'Standard';
      showPopup(`<div class="nx-quality-picker"><header><b>Media upload quality</b><button data-close-popup>×</button></header><button data-quality="Standard" class="${current==='Standard'?'selected':''}"><span>Standard quality<small>Faster uploads and less storage.</small></span><i></i></button><button data-quality="HD" class="${current==='HD'?'selected':''}"><span>HD quality<small>Higher image quality with larger file size.</small></span><i></i></button></div>`,'quality');
    }
    function isOwner(){return group.ownerUid===state.user.uid;}
    function permissions(){return {membersCanSend:true,membersCanInvite:true,membersCanEdit:false,historyVisible:true,approvalRequired:false,...(group.permissions||{})};}
    function showMenu(){const muted=!!groupPrefs(groupId).muted;showPopup(`<button data-menu-info>ⓘ <span>Group info</span></button><button data-menu-search>⌕ <span>Search messages</span></button><button data-menu-invite>🔗 <span>Invite via link</span></button><button data-menu-wallpaper>🖼️ <span>Chat wallpaper</span></button><button data-menu-mute>🔕 <span>${muted?'Unmute':'Mute'} notifications</span></button><button data-menu-clear>⌫ <span>Clear chat for me</span></button>${isOwner()?'<button data-menu-permissions>⚙ <span>Group permissions</span></button>':''}${isMember&&!isOwner()?'<button class="danger" data-menu-exit>↪ <span>Exit group</span></button>':''}`,'menu');}
    function mediaMarkup(media){return media.slice(-12).map(m=>m.attachment.kind==='image'||m.attachment.kind==='gif'||m.attachment.kind==='sticker'?`<a href="${esc(m.attachment.url)}" target="_blank"><img src="${esc(m.attachment.url)}" alt="Shared media"></a>`:`<a class="doc" href="${esc(m.attachment.url)}" target="_blank">${m.attachment.kind==='audio'?'🎧':'📄'}</a>`).join('')||'<small>No shared media yet.</small>';}
    async function showInfo(){await refreshMembers();const media=(state.messages.get(groupId)||[]).filter(m=>m.attachment?.url);info.innerHTML=`<header><button data-info-close>←</button><b>Group info</b></header><div class="nx-info-scroll"><div class="nx-info-cover" style="--nx-cover:url('${esc(group.wallpaperURL||DEFAULT_GROUP_WALLPAPER)}')"><div class="nx-info-hero"><button class="nx-info-avatar" ${isOwner()?'data-info-avatar':''} aria-label="${isOwner()?'Change group icon':'Group icon'}">${`<img src="${esc(group.avatarURL||DEFAULT_GROUP_ICON)}" alt="${esc(group.name)} icon">`}${isOwner()?'<i>✎</i>':''}</button><h2>${esc(group.name)}</h2><p class="nx-info-meta">${groupPrivacy(group)==='private'?'🔒 Private group':'🌐 Public group'} · <b>${members.length} members</b></p><p>${esc(group.description||'No group description yet.')}</p>${isOwner()?'<div class="nx-info-media-controls"><button data-info-avatar>Change icon</button><button data-info-wallpaper>Change wallpaper</button></div>':''}</div></div><div class="nx-info-actions"><button data-info-invite>🔗<span>Invite</span></button><button data-info-search>⌕<span>Search</span></button>${isOwner()?'<button data-info-edit>✎<span>Edit</span></button>':''}</div><section><h3>Media, links and docs <span>${media.length}</span></h3><div class="nx-media-grid">${mediaMarkup(media)}</div></section><section><h3>${members.length} members <span>⌕</span></h3><div class="nx-member-list">${members.map(m=>`<div data-member-row="${esc(m.id)}"><span class="nx-member-photo">${m.photoURL?`<img src="${esc(m.photoURL)}">`:esc((m.name||'?')[0].toUpperCase())}</span><span><b>${m.id===state.user.uid?'You':esc(m.name||'Member')}</b><small>${m.role==='owner'?'Group admin':esc(m.role||'member')}</small></span>${isOwner()&&m.id!==state.user.uid?`<button class="nx-member-more" data-member-menu="${esc(m.id)}">⌄</button>`:''}</div>`).join('')}</div></section><section class="nx-info-settings"><button data-info-mute>🔔 <span>Notification settings</span><b>${groupPrefs(groupId).muted?'Muted':'On'}</b></button>${isOwner()?'<button data-info-permissions>⚙ <span>Group permissions</span><b>›</b></button>':''}<button class="danger" data-info-clear>⌫ <span>Clear chat for me</span><b>›</b></button></section></div>`;info.hidden=false;}
    async function invite(){const url=`${location.origin}${location.pathname}?joinGroup=${encodeURIComponent(groupId)}`;const text=`Join my NEXZO study group “${group.name}”\n${url}\nGroup code: ${groupId}`;try{await navigator.clipboard.writeText(text);toast('Invite link copied','success');}catch(_){prompt('Copy this group invite:',text);}}
    function showEmoji(){const sets={Recent:['😂','❤️','🔥','👍','🙏','🥳','✨','🎯'],Smileys:['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😍','🥰','😎','🤔','😭','😡'],Study:['📚','📝','💡','🎯','✅','🧠','💻','📊','🏆','⏳','🚀','🔥'],Hands:['👍','👎','👏','🙌','🙏','🤝','💪','✍️','👌','🤞'],Symbols:['❤️','💜','💙','💚','✨','⭐','✅','❌','⚠️','📌']};showPopup(`<div class="nx-emoji-picker"><div class="nx-emoji-tabs">${Object.keys(sets).map((k,i)=>`<button data-emoji-tab="${k}" class="${i?'':'active'}">${k}</button>`).join('')}</div><input data-emoji-search placeholder="Search emoji"><div class="nx-emoji-panel">${sets.Recent.map(e=>`<button data-emoji-value="${e}">${e}</button>`).join('')}</div><div class="nx-sticker-strip"><button data-sticker-text="📚 Study time!">📚<span>Study time!</span></button><button data-sticker-text="🔥 Keep going!">🔥<span>Keep going!</span></button><button data-sticker-text="✅ Done!">✅<span>Done!</span></button><button data-sticker-text="🎯 Focus mode">🎯<span>Focus mode</span></button></div></div>`,'emoji');popup._emojiSets=sets;}
    function showAttach(){showPopup(`<button data-file-kind="image" data-accept="image/*">🖼️ <span>Photos & videos</span></button><button data-file-kind="document" data-accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip">📄 <span>Document</span></button><button data-file-kind="audio" data-accept="audio/*">🎧 <span>Audio</span></button><button data-file-kind="sticker" data-accept="image/png,image/webp">✨ <span>Sticker image</span></button><button data-gif-url>GIF <span>Send GIF by URL</span></button>`,'attach');}
    function showPermissions(){const p=permissions();info.innerHTML=`<header><button data-perm-back>←</button><b>Group permissions</b></header><div class="nx-info-scroll nx-permissions"><h3>Members can:</h3>${[['membersCanEdit','✎','Edit group settings'],['membersCanSend','▤','Send new messages'],['membersCanInvite','👥','Add other members'],['historyVisible','↶','See previous messages']].map(([k,ic,label])=>`<label><span>${ic}</span><b>${label}</b><button role="switch" aria-checked="${p[k]}" data-permission="${k}" class="${p[k]?'on':''}">${p[k]?'ON':'OFF'}</button></label>`).join('')}<h3>Admins can:</h3><label><span>◉</span><b>Approve new members</b><button role="switch" aria-checked="${p.approvalRequired}" data-permission="approvalRequired" class="${p.approvalRequired?'on':''}">${p.approvalRequired?'ON':'OFF'}</button></label></div>`;info.hidden=false;}
    async function uploadAttachment(file,kind){if(!file)return;if(file.size>10*1024*1024)return toast('Maximum file size is 10 MB.','error');connection.textContent='Uploading attachment…';connection.className='nx-group-connection warning';try{const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=`community/${state.user.uid}/groups/${groupId}/${Date.now()}_${safe}`;const ref=fb.ref(fb.storage,path);await fb.uploadBytes(ref,file,{contentType:file.type||'application/octet-stream'});const url=await fb.getDownloadURL(ref);await fb.addDoc(fb.collection(fb.db,'groups',groupId,'messages'),{uid:state.user.uid,authorName:userName(),authorUsername:userHandle(),authorPhoto:state.user.photoURL||'',text:'',attachment:{kind:kind==='image'?fileKind(file):kind,name:file.name,size:file.size,sizeLabel:readableSize(file.size),contentType:file.type||'',url,path},createdAtMs:Date.now()});connection.textContent='● Connected';connection.className='nx-group-connection online';}catch(error){console.error(error);connection.textContent='Attachment upload failed';connection.className='nx-group-connection error';toast(error.message||'Upload failed','error');}}
    document.querySelector('.nx-group-chat-window')?.style.setProperty('--group-wallpaper',`url("${mediaURL(group.wallpaperURL||DEFAULT_GROUP_WALLPAPER)}")`);await refreshMembers();renderActions();subscribeMessages();
    const toggleInfo=async()=>{if(!info.hidden){info.hidden=true;return;}hidePopup();await showInfo();};$('.nx-group-avatar')?.addEventListener('click',toggleInfo);$('[data-group-info]')?.addEventListener('click',toggleInfo);$('[data-group-menu]')?.addEventListener('click',e=>{e.stopPropagation();popup.hidden?showMenu():hidePopup();});
    document.addEventListener('click',e=>{if(!popup.hidden&&!e.target.closest('#v32GroupPopup')&&!e.target.closest('[data-group-menu]')&&!e.target.closest('[data-attach]')&&!e.target.closest('[data-emoji]')&&!e.target.closest('[data-study-view]'))hidePopup();});
    document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!popup.hidden){hidePopup();return;}if(!info.hidden){info.hidden=true;return;}closeModal();});
    search.querySelector('input').addEventListener('input',e=>drawGroupMessages(groupId,e.target.value));search.querySelector('button').addEventListener('click',()=>{search.hidden=true;search.querySelector('input').value='';drawGroupMessages(groupId);});
    document.querySelector('.nx-study-popup-nav')?.addEventListener('click',async e=>{
      const view=e.target.closest('[data-study-view]')?.dataset.studyView;
      const wallpaper=e.target.closest('[data-wallpaper-url]')?.dataset.wallpaperUrl;
      if(wallpaper){await applyBuiltinWallpaper(wallpaper);return;}
      if(!view)return;
      // Every Study Group section behaves like a toggle: click once to open, click the
      // active option again to close it and return to Chats. This prevents trapped panels.
      const activeBtn=e.target.closest('[data-study-view]');
      const alreadyActive=activeBtn?.classList.contains('active') && view!=='chats';
      if(alreadyActive){info.hidden=true;hidePopup();setActiveStudyView('chats');$('#v32GroupMessage')?.focus();return;}
      info.hidden=true;hidePopup();setActiveStudyView(view);
      if(view==='chats'){$('#v32GroupMessage')?.focus();}
      else if(view==='media'){await showInfo();requestAnimationFrame(()=>info.querySelector('.nx-media-grid')?.scrollIntoView({block:'start'}));}
      else if(view==='profile')await showInfo();
      else if(view==='wallpaper')showWallpaperPicker();
      else if(view==='notifications'){const muted=!groupPrefs(groupId).muted;saveGroupPrefs(groupId,{muted});const label=$('#v33MuteState');if(label)label.textContent=muted?'Muted':'On';toast(muted?'Group notifications muted':'Group notifications enabled','success');setActiveStudyView('chats');}
      else if(view==='quality')showQualityPicker();
    });
    info.addEventListener('click',async e=>{const t=e.target;if(t.closest('[data-info-close]'))info.hidden=true;else if(t.closest('[data-info-invite]'))invite();else if(t.closest('[data-info-search]')){info.hidden=true;search.hidden=false;search.querySelector('input').focus();}else if(t.closest('[data-info-mute]')){saveGroupPrefs(groupId,{muted:!groupPrefs(groupId).muted});showInfo();}else if(t.closest('[data-info-clear]')){if(confirm('Clear this chat only on this device?')){saveGroupPrefs(groupId,{clearedAtMs:Date.now()});drawGroupMessages(groupId);info.hidden=true;}}else if(t.closest('[data-info-permissions]'))showPermissions();else if(t.closest('[data-perm-back]'))showInfo();else if(t.closest('[data-info-edit]')){const name=prompt('Group name',group.name);if(!name)return;const description=prompt('Group description',group.description||'')??group.description;await fb.updateDoc(fb.doc(fb.db,'groups',groupId),{name:name.slice(0,100),description:String(description||'').slice(0,500),updatedAtMs:Date.now()});group.name=name;group.description=description;showInfo();}else if(t.closest('[data-info-avatar]')){fileInput.accept='image/png,image/jpeg,image/webp';fileInput.dataset.kind='avatar';fileInput.click();}else if(t.closest('[data-info-wallpaper]')){showWallpaperPicker();}else if(t.closest('[data-member-menu]')){const uid=t.closest('[data-member-menu]').dataset.memberMenu;const member=members.find(m=>m.id===uid);showPopup(`<button data-promote-member="${esc(uid)}">👤 <span>${member?.role==='admin'?'Remove admin':'Make group admin'}</span></button><button class="danger" data-remove-member="${esc(uid)}">⊖ <span>Remove member</span></button>`);}else if(t.closest('[data-permission]')){const key=t.closest('[data-permission]').dataset.permission;const next={...permissions(),[key]:!permissions()[key]};await fb.updateDoc(fb.doc(fb.db,'groups',groupId),{permissions:next,updatedAtMs:Date.now()});group.permissions=next;showPermissions();}});
    popup.addEventListener('input',e=>{if(!e.target.matches('[data-emoji-search]'))return;const q=e.target.value.trim();const all=Object.values(popup._emojiSets||{}).flat();popup.querySelector('.nx-emoji-panel').innerHTML=all.filter(x=>!q||x.includes(q)).map(x=>`<button data-emoji-value="${x}">${x}</button>`).join('');});
    popup.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-close-popup')){hidePopup();setActiveStudyView('chats');return;}if(b.dataset.wallpaperUrl){await applyBuiltinWallpaper(b.dataset.wallpaperUrl);showWallpaperPicker();return;}if(b.hasAttribute('data-custom-wallpaper')){fileInput.accept='image/png,image/jpeg,image/webp,image/gif';fileInput.dataset.kind='wallpaper';fileInput.click();hidePopup();return;}if(b.dataset.quality){const key=`nexzo_group_media_quality:${state.user.uid}`;localStorage.setItem(key,b.dataset.quality);const label=$('#v33QualityState');if(label)label.textContent=b.dataset.quality;toast(`${b.dataset.quality} upload quality saved`,'success');showQualityPicker();return;}if(b.dataset.emojiValue){const input=$('#v32GroupMessage');input.value+=b.dataset.emojiValue;input.focus();return;}if(b.dataset.stickerText){const input=$('#v32GroupMessage');input.value=b.dataset.stickerText;actions.querySelector('[data-v32-send-group]')?.click();hidePopup();return;}if(b.dataset.emojiTab){const set=popup._emojiSets?.[b.dataset.emojiTab]||[];popup.querySelectorAll('[data-emoji-tab]').forEach(x=>x.classList.toggle('active',x===b));popup.querySelector('.nx-emoji-panel').innerHTML=set.map(e=>`<button data-emoji-value="${e}">${e}</button>`).join('');return;}if(b.dataset.fileKind){fileInput.accept=b.dataset.accept||'';fileInput.dataset.kind=b.dataset.fileKind;fileInput.click();hidePopup();return;}if(b.hasAttribute('data-menu-info')){hidePopup();await showInfo();}else if(b.hasAttribute('data-menu-search')){search.hidden=false;search.querySelector('input').focus();}else if(b.hasAttribute('data-menu-invite'))invite();else if(b.hasAttribute('data-menu-wallpaper')){if(!popup.hidden&&popup.dataset.popupKey==='wallpaper'){hidePopup();setActiveStudyView('chats');}else showWallpaperPicker();}else if(b.hasAttribute('data-menu-permissions'))showPermissions();else if(b.hasAttribute('data-gif-url')){const url=prompt('Paste a direct GIF URL (https://...)')?.trim();if(url&&/^https:\/\//i.test(url)){await fb.addDoc(fb.collection(fb.db,'groups',groupId,'messages'),{uid:state.user.uid,authorName:userName(),authorUsername:userHandle(),authorPhoto:state.user.photoURL||'',text:'',attachment:{kind:'gif',name:'GIF',size:0,sizeLabel:'',contentType:'image/gif',url,path:''},createdAtMs:Date.now()});}}else if(b.dataset.promoteMember){const uid=b.dataset.promoteMember,m=members.find(x=>x.id===uid);await fb.updateDoc(fb.doc(fb.db,'groups',groupId,'members',uid),{role:m?.role==='admin'?'member':'admin'});await refreshMembers();showInfo();hidePopup();return;}else if(b.dataset.removeMember){if(confirm('Remove this member from the group?')){await fb.deleteDoc(fb.doc(fb.db,'groups',groupId,'members',b.dataset.removeMember));await refreshMembers();showInfo();}hidePopup();return;}else if(b.hasAttribute('data-menu-mute')){const muted=!groupPrefs(groupId).muted;saveGroupPrefs(groupId,{muted});toast(muted?'Group muted':'Group unmuted','success');}else if(b.hasAttribute('data-menu-clear')){if(confirm('Clear this chat only on this device?')){saveGroupPrefs(groupId,{clearedAtMs:Date.now()});drawGroupMessages(groupId);}}else if(b.hasAttribute('data-menu-exit')){if(confirm('Exit this group?')){try{await leaveGroupCloud(groupId,group);const localMembers=state.members.get(groupId);localMembers?.delete(state.user.uid);if(localMembers)state.members.set(groupId,localMembers);saveOffline(true);closeModal();toast('You left the group','success');}catch(error){toast(error.message||'Could not leave the group','error');}}}hidePopup();});
    fileInput.addEventListener('change',async()=>{const f=fileInput.files?.[0],kind=fileInput.dataset.kind||fileKind(f);fileInput.value='';if(!f)return;
      if(kind==='avatar'||kind==='wallpaper'){
        if(!isOwner())return toast('Only the group owner can change group media.','error');
        const max=kind==='avatar'?3*1024*1024:8*1024*1024;
        if(!String(f.type||'').startsWith('image/'))return toast('Choose a PNG, JPG, WEBP or GIF image.','error');
        if(f.size>max)return toast(`${kind==='avatar'?'Group icon':'Wallpaper'} must be under ${kind==='avatar'?'3':'8'} MB.`, 'error');
        connection.textContent=`Saving ${kind==='avatar'?'group icon':'wallpaper'}…`;connection.className='nx-group-connection warning';
        await mediaCacheSet(groupId,kind,f);
        writeGroupMediaMeta(groupId,{[`${kind}Pending`]:true});
        const previewURL=URL.createObjectURL(f);
        if(kind==='avatar'){
          document.querySelectorAll('.nx-group-avatar,.nx-info-avatar').forEach(el=>el.innerHTML=`<img src="${previewURL}" alt="Group icon preview">`);
        }else{
          messageBox?.style.setProperty('--group-wallpaper',`url("${previewURL}")`);
          if(messageBox){messageBox.style.backgroundImage=`linear-gradient(rgba(2,4,10,.44),rgba(2,4,10,.68)),url("${previewURL}")`;messageBox.style.backgroundSize='cover';messageBox.style.backgroundPosition='center';}
          document.querySelector('.nx-info-cover')?.style.setProperty('--nx-cover',`url("${previewURL}")`);
        }
        try{
          const ext=(f.name.split('.').pop()||'img').replace(/[^a-z0-9]/gi,'').slice(0,8);
          const path=`community/${state.user.uid}/groups/${groupId}/${kind}_${Date.now()}.${ext}`;
          const storageRef=fb.ref(fb.storage,path);
          await withTimeout(fb.uploadBytes(storageRef,f,{contentType:f.type||'image/jpeg',cacheControl:'public,max-age=3600',customMetadata:{groupId,kind,ownerUid:state.user.uid}}));
          const url=await withTimeout(fb.getDownloadURL(storageRef),15000);
          const field=kind==='avatar'?'avatarURL':'wallpaperURL';
          await withTimeout(fb.updateDoc(fb.doc(fb.db,'groups',groupId),{[field]:url,updatedAtMs:Date.now()}),15000);
          group[field]=url;
          writeGroupMediaMeta(groupId,{[`${kind}Pending`]:false,[`${kind}URL`]:url});
          await mediaCacheDelete(groupId,kind);
          if(kind==='avatar'){
            const avatar=document.querySelector('.nx-group-avatar');if(avatar)avatar.innerHTML=`<img src="${esc(url)}" alt="${esc(group.name)} icon">`;
          }else{messageBox?.style.setProperty('--group-wallpaper',`url("${url}")`);if(messageBox){messageBox.style.backgroundImage=`linear-gradient(rgba(2,4,10,.44),rgba(2,4,10,.68)),url("${url}")`;messageBox.style.backgroundSize='cover';messageBox.style.backgroundPosition='center';}}
          connection.textContent='● Saved everywhere';connection.className='nx-group-connection online';
          toast(`${kind==='avatar'?'Group icon':'Wallpaper'} saved permanently`, 'success');
          if(!info.hidden)await showInfo();
          setTimeout(()=>URL.revokeObjectURL(previewURL),1500);
        }catch(error){
          console.error('[NEXZO Community] group media upload failed',error);
          const msg=error?.code==='storage/unauthorized'?'Storage rules blocked the upload. Run DEPLOY_FIREBASE_RULES.cmd, then refresh.':error?.code==='permission-denied'?'Firestore rules blocked the group update. Run DEPLOY_FIREBASE_RULES.cmd, then refresh.':error?.code==='storage/timeout'?'Upload timed out. Check Firebase Storage is enabled and your internet connection.':error?.code==='storage/bucket-not-found'?'Firebase Storage bucket is not configured for this project.':(error.message||'Upload failed.');
          connection.textContent='● Saved on this device — cloud sync failed';connection.className='nx-group-connection warning';
          group[kind==='avatar'?'avatarURL':'wallpaperURL']=previewURL;
          writeGroupMediaMeta(groupId,{[`${kind}Pending`]:true,lastError:msg});
          toast(`${kind==='avatar'?'Group icon':'Wallpaper'} saved locally. ${msg}`,'error');
        }
        return;
      }
      await uploadAttachment(f,kind);
    });
    actions.addEventListener('click',async e=>{if(e.target.closest('[data-attach]')){if(!popup.hidden&&popup.dataset.popupKey==='attach')return hidePopup();return showAttach();}if(e.target.closest('[data-emoji]')){if(!popup.hidden&&popup.dataset.popupKey==='emoji')return hidePopup();return showEmoji();}const join=e.target.closest('[data-v32-join-group]');if(join){const original=join.textContent;join.disabled=true;join.textContent='Joining…';try{const result=await joinGroupCloud(groupId,group);isMember=true;const localMembers=state.members.get(groupId)||new Set();localMembers.add(state.user.uid);state.members.set(groupId,localMembers);group.memberCount=Math.max(Number(group.memberCount||1),localMembers.size);saveOffline(true);await refreshMembers();renderActions();subscribeMessages();toast(result.created?'Joined group':'You are already a member','success');}catch(error){console.error('[NEXZO Community] join failed',error);join.disabled=false;join.textContent=original;const msg=error?.code==='permission-denied'?'Joining was blocked by Firebase rules. Deploy the included firestore.rules, then retry.':error?.code==='unavailable'?'Could not reach Firestore. Check the internet connection and retry.':(error.message||'Could not join group');toast(msg,'error');}return;}const send=e.target.closest('[data-v32-send-group]');if(send){const input=$('#v32GroupMessage'),text=input?.value.trim();if(!text)return;send.disabled=true;try{await fb.addDoc(fb.collection(fb.db,'groups',groupId,'messages'),{uid:state.user.uid,authorName:userName(),authorUsername:userHandle(),authorPhoto:state.user.photoURL||'',text:text.slice(0,1000),createdAtMs:Date.now()});input.value='';input.focus();}catch(error){toast(error.message||'Message was not sent.','error');}finally{send.disabled=false;}}});
  }

  function intercept(event){
    const target=event.target,handled=target.closest('[data-community-jump],#communityCreatePost,#openCreatePostBtn,#communityAttach,#communityAIImprove,#openCommunityAI,#refreshTrending,#openCreateGroup,[data-v32-like],[data-v32-comment],[data-v32-save],[data-v32-share],[data-v32-delete],[data-v42-report],[data-v32-open-group],[data-v32-close],.community-filter-card button');if(!handled)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    if(target.closest('#communityCreatePost'))createPost().catch(error=>toast(error.message,'error'));
    else if(target.closest('#openCreatePostBtn')){$('.community-compose-card')?.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>$('#communityPostText')?.focus(),250);}
    else if(target.closest('#communityAttach'))attachResource();
    else if(target.closest('#communityAIImprove'))improvePost();
    else if(target.closest('#openCommunityAI'))location.href='ai-assistant.html';
    else if(target.closest('#refreshTrending'))renderTrending();
    else if(target.closest('#openCreateGroup'))createGroup();
    else if(target.closest('[data-v32-like]'))toggleLike(target.closest('[data-v32-like]').dataset.v32Like).catch(error=>toast(error.message,'error'));
    else if(target.closest('[data-v32-comment]'))openComments(target.closest('[data-v32-comment]').dataset.v32Comment);
    else if(target.closest('[data-v32-save]'))toggleSave(target.closest('[data-v32-save]').dataset.v32Save).catch(error=>toast(error.message,'error'));
    else if(target.closest('[data-v32-share]')){navigator.clipboard?.writeText(`${location.href.split('#')[0]}#post-${target.closest('[data-v32-share]').dataset.v32Share}`);toast('Link copied');}
    else if(target.closest('[data-v42-report]'))reportPost(target.closest('[data-v42-report]').dataset.v42Report).catch(error=>toast(error.message,'error'));
    else if(target.closest('[data-v32-delete]'))deletePost(target.closest('[data-v32-delete]').dataset.v32Delete).catch(error=>toast(error.message,'error'));
    else if(target.closest('[data-v32-open-group]'))openGroup(target.closest('[data-v32-open-group]').dataset.v32OpenGroup).catch(error=>toast(error.message,'error'));
    else if(target.closest('[data-v32-close]'))closeModal();
    else{const button=target.closest('.community-filter-card button');if(button){document.querySelectorAll('.community-filter-card button').forEach(row=>row.classList.remove('active'));button.classList.add('active');state.filter=button.dataset.filter||'all';render();}}
  }
  function bind(){document.addEventListener('click',intercept,true);$('#communitySort')?.addEventListener('change',event=>{state.sort=event.target.value;render();});const draft=$('#communityPostText');if(draft){draft.value=localStorage.getItem(state.draftKey)||draft.value||'';draft.addEventListener('input',()=>localStorage.setItem(state.draftKey,draft.value.slice(0,2000)));}}
  function init(){if(!isPage())return;bind();setModeStatus();const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('Firebase connection timed out')),10000));Promise.race([initFirebase(),timeout]).catch(error=>startOffline(error.message));}
  window.NEXZOCommunity=Object.freeze({getMode:()=>state.mode,getState:()=>({mode:state.mode,posts:state.posts.length,groups:state.groups.length,pendingReports:window.NEXZOCommunityReports?.read(localStorage,state.user?.uid||identity().uid)?.length||0}),startOffline,syncPendingReports});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
