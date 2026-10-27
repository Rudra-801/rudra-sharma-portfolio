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
    mode:'loading',user:null,posts:[],groups:[],saved:new Set(),liked:new Set(),comments:new Map(),members:new Map(),memberRecords:new Map(),messages:new Map(),
    filter:'all',sort:'latest',search:'',resourceUrl:'',myGroupIds:new Set(),unsubs:[],memberUnsubs:new Map(),notificationUnsubs:new Map(),groupMessageUnsub:null,activeGroupMembersUnsub:null,activeGroupDocUnsub:null,commentUnsub:null,groupUiAbort:null,identities:new Map(),draftKey:'nexzo_community_draft_v2',postNotifyReady:false
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
    {id:'dark-doodles',name:'Graphite Notes',url:'assets/community/wallpapers/dark-doodles.webp'},
    {id:'neon-doodle',name:'Violet Orbit',url:'assets/community/wallpapers/neon-doodle.webp'},
    {id:'teal-tech',name:'Teal Circuit',url:'assets/community/wallpapers/teal-tech.webp'}
  ];
  const withTimeout=(promise,ms=35000)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error('Upload timed out. Check Firebase Storage and internet connection.'),{code:'storage/timeout'})),ms))]);
  const newGroupId=()=>`grp_${String(state.user?.uid||'user').replace(/[^a-z0-9]/gi,'').slice(0,12)}_${(crypto.randomUUID?.()||`${Date.now()}_${Math.random().toString(36).slice(2)}`).replace(/[^a-z0-9]/gi,'').slice(0,32)}`;
  function effectiveGroupLogoURL(group){const meta=group?.id?readGroupMediaMeta(group.id):{},raw=String(group?.avatarURL||'');if(raw.startsWith('blob:'))return raw;return safeHttpUrl(raw)||safeHttpUrl(meta.avatarURL)||DEFAULT_GROUP_ICON;}
  function effectiveGroupWallpaper(group){const meta=group?.id?readGroupMediaMeta(group.id):{};const pending=Boolean(meta.wallpaperPending);const local=String(meta.wallpaperURL||'').trim();const cloud=String(group?.wallpaperURL||'').trim();return mediaURL((pending&&local)?local:(cloud||local||DEFAULT_GROUP_WALLPAPER));}
  function paintGroupWallpaper(box,url){if(!box)return;const resolved=mediaURL(url||DEFAULT_GROUP_WALLPAPER);box.style.setProperty('--group-wallpaper',`url("${resolved}")`);box.style.backgroundImage=`linear-gradient(rgba(2,4,10,.18),rgba(2,4,10,.42)),url("${resolved}")`;box.style.backgroundSize='cover';box.style.backgroundPosition='center';return resolved;}
  function groupLogoMarkup(group,cls='nx-group-list-icon'){const url=effectiveGroupLogoURL(group);const label=(String(group?.name||'Study Group').trim()[0]||'N').toUpperCase();return `<span class="${cls} nx-group-logo-shell"><img data-group-logo src="${esc(url)}" alt="${esc(group?.name||'Study Group')} logo" loading="lazy" decoding="async"><span class="nx-group-logo-fallback" aria-hidden="true">${esc(label)}</span></span>`;}
  function compressGroupLogo(file){
    window.NEXZOCommunityContracts?.logo?.(file);
    return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{try{const max=512,scale=Math.min(1,max/Math.max(img.naturalWidth||1,img.naturalHeight||1)),w=Math.max(1,Math.round((img.naturalWidth||1)*scale)),h=Math.max(1,Math.round((img.naturalHeight||1)*scale)),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{alpha:true});ctx.drawImage(img,0,0,w,h);canvas.toBlob(blob=>{URL.revokeObjectURL(url);if(!blob)return reject(new Error('This browser could not compress the group logo.'));resolve(new File([blob],'logo.webp',{type:'image/webp',lastModified:Date.now()}));},'image/webp',0.84);}catch(error){URL.revokeObjectURL(url);reject(error)}};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('The selected logo could not be decoded.'))};img.src=url;});
  }

  function prepareWallpaperImage(file){
    return new Promise((resolve,reject)=>{
      const sourceURL=URL.createObjectURL(file),img=new Image();
      img.onload=()=>{
        const popup=document.createElement('div');
        popup.className='nx-wallpaper-editor-overlay';
        popup.dataset.popupKey='wallpaper-crop';
        popup.setAttribute('role','dialog');
        popup.setAttribute('aria-modal','true');
        popup.setAttribute('aria-label','Position wallpaper');
        document.body.appendChild(popup);
        popup.innerHTML=`<div class="nx-wallpaper-cropper nx-wallpaper-editor-v164">
          <header class="nx-wpe-head"><div class="nx-wpe-icon" aria-hidden="true">▧</div><div class="nx-wpe-title"><b>Position wallpaper</b><small>Drag the photo to frame it. What you see in the preview is what will be saved.</small></div><button type="button" data-crop-cancel aria-label="Close">×</button></header>
          <div class="nx-wpe-body">
            <aside class="nx-wpe-controls">
              <section><h4>Preview frame</h4><div class="nx-wpe-presets"><button type="button" data-crop-fit="cover" class="active"><strong>Fit to chat</strong><span>Recommended</span></button><button type="button" data-crop-fit="contain"><strong>Show full photo</strong><span>No crop</span></button></div></section>
              <section><div class="nx-wpe-control-head"><h4>Zoom &amp; position</h4><output data-crop-zoom-value>100%</output></div><div class="nx-wpe-zoom"><span>−</span><input data-crop-zoom type="range" min="100" max="300" value="100" step="1"><span>＋</span></div><div class="nx-wpe-actions"><button type="button" data-crop-fit-image>Fit image</button><button type="button" data-crop-fill>Fill frame</button><button type="button" data-crop-reset>Reset</button></div></section>
              <p class="nx-wpe-tip">Drag the image to reposition it. Use the mouse wheel or zoom slider to fine-tune the frame.</p>
            </aside>
            <main class="nx-wpe-preview-wrap"><div class="nx-crop-stage" data-crop-stage><canvas data-crop-canvas width="1600" height="1000"></canvas><div class="nx-crop-grid" aria-hidden="true"></div><div class="nx-crop-hint">Drag to reposition · Scroll to zoom</div></div></main>
          </div>
          <footer><button type="button" data-crop-cancel>Cancel</button><button type="button" data-crop-apply>Set as Wallpaper</button></footer>
        </div>`;
        const stage=popup.querySelector('[data-crop-stage]'),canvas=popup.querySelector('[data-crop-canvas]'),ctx=canvas.getContext('2d'),zoom=popup.querySelector('[data-crop-zoom]'),zoomValue=popup.querySelector('[data-crop-zoom-value]');
        let fit='cover',zoomFactor=1,posX=.5,posY=.5,dragging=false,lastX=0,lastY=0;
        const baseScale=()=>fit==='contain'?Math.min(canvas.width/img.naturalWidth,canvas.height/img.naturalHeight):Math.max(canvas.width/img.naturalWidth,canvas.height/img.naturalHeight);
        const draw=()=>{ctx.fillStyle='#050607';ctx.fillRect(0,0,canvas.width,canvas.height);const scale=baseScale()*zoomFactor,dw=img.naturalWidth*scale,dh=img.naturalHeight*scale,overflowX=Math.max(0,dw-canvas.width),overflowY=Math.max(0,dh-canvas.height),dx=-overflowX*posX+(dw<canvas.width?(canvas.width-dw)/2:0),dy=-overflowY*posY+(dh<canvas.height?(canvas.height-dh)/2:0);ctx.drawImage(img,dx,dy,dw,dh);zoom.value=Math.round(zoomFactor*100);zoomValue.value=`${Math.round(zoomFactor*100)}%`;};
        const reset=()=>{zoomFactor=1;posX=.5;posY=.5;draw()};draw();
        zoom.oninput=()=>{zoomFactor=Math.max(1,Math.min(3,Number(zoom.value)/100));draw()};
        stage.addEventListener('wheel',e=>{e.preventDefault();zoomFactor=Math.max(1,Math.min(3,zoomFactor+(e.deltaY<0?.08:-.08)));draw()},{passive:false});
        stage.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;stage.setPointerCapture?.(e.pointerId);stage.classList.add('is-dragging')});
        stage.addEventListener('pointermove',e=>{if(!dragging)return;const r=stage.getBoundingClientRect(),scale=baseScale()*zoomFactor,dw=img.naturalWidth*scale,dh=img.naturalHeight*scale,ox=Math.max(1,dw-canvas.width),oy=Math.max(1,dh-canvas.height);posX=Math.max(0,Math.min(1,posX-(e.clientX-lastX)*(canvas.width/Math.max(1,r.width))/ox));posY=Math.max(0,Math.min(1,posY-(e.clientY-lastY)*(canvas.height/Math.max(1,r.height))/oy));lastX=e.clientX;lastY=e.clientY;draw()});
        const stop=e=>{dragging=false;stage.classList.remove('is-dragging');try{stage.releasePointerCapture?.(e.pointerId)}catch{}};stage.addEventListener('pointerup',stop);stage.addEventListener('pointercancel',stop);
        const setFit=(mode)=>{fit=mode;popup.querySelectorAll('[data-crop-fit]').forEach(x=>x.classList.toggle('active',x.dataset.cropFit===mode));reset()};
        popup.querySelectorAll('[data-crop-fit]').forEach(b=>b.onclick=()=>setFit(b.dataset.cropFit));
        popup.querySelector('[data-crop-fit-image]').onclick=()=>setFit('contain');popup.querySelector('[data-crop-fill]').onclick=()=>setFit('cover');popup.querySelector('[data-crop-reset]').onclick=reset;
        const closeEditor=()=>{popup.remove();document.body.classList.remove('nx-wallpaper-editor-open')};
        document.body.classList.add('nx-wallpaper-editor-open');
        const cancel=()=>{URL.revokeObjectURL(sourceURL);closeEditor();reject(Object.assign(new Error('cancelled'),{cancelled:true}))};popup.querySelectorAll('[data-crop-cancel]').forEach(b=>b.onclick=cancel);
        popup.addEventListener('click',e=>{if(e.target===popup)cancel()});
        const onKey=e=>{if(e.key==='Escape'){document.removeEventListener('keydown',onKey);cancel()}};document.addEventListener('keydown',onKey);
        popup.querySelector('[data-crop-apply]').onclick=()=>{draw();canvas.toBlob(blob=>{document.removeEventListener('keydown',onKey);URL.revokeObjectURL(sourceURL);closeEditor();if(!blob)return reject(new Error('Could not prepare wallpaper.'));resolve(new File([blob],`wallpaper-${Date.now()}.webp`,{type:'image/webp',lastModified:Date.now()}))},'image/webp',0.84)};
      };
      img.onerror=()=>{URL.revokeObjectURL(sourceURL);reject(new Error('The selected wallpaper could not be decoded.'))};img.src=sourceURL;
    });
  }

  async function uploadPermanentGroupLogo(groupId,file,group){
    if(!file)return '';window.NEXZOCommunityContracts?.logo?.(file);const prepared=await compressGroupLogo(file),path=`groups/${groupId}/branding/logo.webp`,storageRef=fb.ref(fb.storage,path);
    await withTimeout(fb.uploadBytes(storageRef,prepared,{contentType:'image/webp',cacheControl:'no-store,max-age=0',customMetadata:{groupId,ownerUid:state.user.uid,kind:'group-logo'}}),18000);
    const url=await withTimeout(fb.getDownloadURL(storageRef),10000);if(!safeHttpUrl(url))throw new Error('Storage did not return a permanent HTTPS logo URL.');
    await withTimeout(fb.updateDoc(fb.doc(fb.db,'groups',groupId),{avatarURL:url,updatedAtMs:Date.now()}),10000);
    const verify=await fb.getDoc(fb.doc(fb.db,'groups',groupId));if(!verify.exists()||verify.data()?.avatarURL!==url)throw new Error('Logo upload finished but the saved group logo could not be verified.');
    if(group)group.avatarURL=url;return url;
  }

  // Shared backend helper. This intentionally lives at module scope because create/join/leave
  // are called before a group room exists. Earlier builds accidentally scoped this inside
  // openGroup(), which made Create/Join/Leave fail with groupAdminApi not defined.
  async function groupAdminApi(path,options={}){
    const configured=String(window.NEXZO_CONFIG?.API_BASE_URL||document.querySelector('meta[name="nexzo-api-base-url"]')?.content||'https://nexzo-backend.onrender.com/api').replace(/\/$/,'');
    const candidates=[configured,...(window.NEXZO_CONFIG?.API_CANDIDATES||[])].map(v=>String(v||'').replace(/\/$/,'')).filter((v,i,a)=>v&&a.indexOf(v)===i);
    const current=fb?.auth?.currentUser;
    if(!candidates.length||!current?.getIdToken)throw Object.assign(new Error('Backend group service unavailable.'),{code:'backend/unavailable'});
    const token=await current.getIdToken();
    let lastError=null;
    for(const base of candidates){
      for(let tryNo=0;tryNo<(options.noRetry?1:2);tryNo++){
          const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),options.noRetry?7000:(tryNo===0?9000:15000));
        try{
          const response=await fetch(`${base}${path}`,{method:options.method||'GET',headers:{Authorization:`Bearer ${token}`,...(options.body?{'Content-Type':'application/json'}:{})},body:options.body?JSON.stringify(options.body):undefined,cache:'no-store',signal:controller.signal});
          const data=await response.json().catch(()=>({}));
          if(!response.ok)throw Object.assign(new Error(data.message||`Group action failed (${response.status}).`),{code:`backend/${response.status}`,status:response.status,base});
          return data;
        }catch(error){
          lastError=error;
          const transient=error?.name==='AbortError'||[429,502,503,504].includes(Number(error?.status||0));
          if(!transient)break;
          await new Promise(r=>setTimeout(r,tryNo===0?450:900));
        }finally{clearTimeout(timer);}
      }
    }
    if(lastError?.name==='AbortError')throw Object.assign(new Error('NEXZO backend took too long to respond. Please retry once.'),{code:'backend/timeout'});
    throw lastError||new Error('Backend request failed.');
  }

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
  function time(ms){
    const value=Number(ms)||Date.now(),delta=Math.max(0,Date.now()-value),minute=60000,hour=3600000,day=86400000;
    if(delta<minute)return 'Just now';
    if(delta<hour)return `${Math.floor(delta/minute)}m ago`;
    if(delta<day)return `${Math.floor(delta/hour)}h ago`;
    if(delta<7*day)return `${Math.floor(delta/day)}d ago`;
    return new Date(value).toLocaleDateString(undefined,{day:'numeric',month:'short',year:new Date(value).getFullYear()===new Date().getFullYear()?undefined:'numeric'});
  }
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
  function enrichMemberIdentity(member){
    const row={...(member||{})},publicIdentity=state.identities.get(row.id)||{};
    if(row.id===state.user?.uid){
      row.name=userName()||row.name||'Student';
      row.username=userHandle()||row.username||'';
      row.photoURL=String(state.user?.photoURL||row.photoURL||publicIdentity.authorPhoto||'');
    }else{
      row.name=publicIdentity.authorName||row.name||'Member';
      row.username=publicIdentity.authorUsername||row.username||'';
      row.photoURL=publicIdentity.authorPhoto||row.photoURL||'';
    }
    return row;
  }
  async function syncMyGroupIdentity(groupId){
    if(!state.user?.uid||state.mode!=='cloud')return;
    const ref=fb.doc(fb.db,'groups',groupId,'members',state.user.uid);
    try{
      const snap=await fb.getDoc(ref);if(!snap.exists())return;
      const data=snap.data()||{},patch={};
      const nextName=String(userName()||'Student').trim().slice(0,100)||'Student';
      const nextUsername=userHandle();
      const nextPhoto=String(state.user.photoURL||'').slice(0,2048);
      if(data.name!==nextName)patch.name=nextName;
      if(data.username!==nextUsername)patch.username=nextUsername;
      if((data.photoURL||'')!==nextPhoto)patch.photoURL=nextPhoto;
      if(Object.keys(patch).length)await fb.updateDoc(ref,patch);
    }catch(error){console.warn('[NEXZO Community] member identity sync deferred',error);}
  }
  function avatarMarkup(url,name,cls='post-avatar'){const clean=safeHttpUrl(url);return `<div class="${cls}">${clean?`<img src="${esc(clean)}" alt="${esc(name||'Student')} profile photo">`:esc((name||'S')[0].toUpperCase())}</div>`;}
  function identityLine(name,handle){return `<div class="post-name-line"><b>${esc(name||'Student')}</b>${handle?`<span class="post-handle">@${esc(String(handle).replace(/^@/,''))}</span>`:''}</div>`;}
  function toast(message,type='info'){window.NEXZOShell?.toast?.(message,type);if(window.NEXZOShell?.toast)return;let el=$('#nxCommunityToast');if(!el){el=document.createElement('div');el.id='nxCommunityToast';el.className='nx-toast';document.body.appendChild(el);}el.textContent=message;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2500);}
  function communityDialog({title='Confirm action',message='',confirmText='Continue',cancelText='Cancel',danger=false,input=false,value='',placeholder='',choices=null,info=false}={}){
    return new Promise(resolve=>{
      const overlay=document.createElement('div');overlay.className='nx-community-dialog-overlay';overlay.setAttribute('role','presentation');
      const choiceHtml=Array.isArray(choices)?`<div class="nx-community-choice-row">${choices.map(c=>`<button type="button" class="nx-community-choice" data-choice="${esc(c)}">${esc(c)}</button>`).join('')}</div>`:'';
      overlay.innerHTML=`<section class="nx-community-dialog" role="dialog" aria-modal="true" aria-labelledby="nxCommunityDialogTitle"><header><div><small>NEXZO COMMUNITY</small><h3 id="nxCommunityDialogTitle">${esc(title)}</h3></div><button type="button" class="nx-community-dialog-x" data-dialog-cancel aria-label="Close">×</button></header><div class="nx-community-dialog-body">${message?`<p>${esc(message)}</p>`:''}${input?`<textarea data-dialog-input rows="3" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`:''}${choiceHtml}</div><footer>${info?'':`<button type="button" class="nx-community-dialog-secondary" data-dialog-cancel>${esc(cancelText)}</button>`}<button type="button" class="nx-community-dialog-primary ${danger?'danger':''}" data-dialog-confirm>${esc(info?'Close':confirmText)}</button></footer></section>`;
      document.body.appendChild(overlay);document.body.classList.add('nx-community-dialog-open');
      const field=overlay.querySelector('[data-dialog-input]');let chosen=null;
      const finish=result=>{document.removeEventListener('keydown',onKey);overlay.remove();document.body.classList.remove('nx-community-dialog-open');resolve(result)};
      const onKey=e=>{if(e.key==='Escape'){e.preventDefault();finish(input?null:false)}if(e.key==='Enter'&&!input){e.preventDefault();finish(chosen??true)}};document.addEventListener('keydown',onKey);
      overlay.addEventListener('click',e=>{if(e.target===overlay)finish(input?null:false);const choice=e.target.closest('[data-choice]');if(choice){chosen=choice.dataset.choice;overlay.querySelectorAll('[data-choice]').forEach(b=>b.classList.toggle('selected',b===choice));}if(e.target.closest('[data-dialog-cancel]'))finish(input?null:false);if(e.target.closest('[data-dialog-confirm]')){if(input){const v=String(field?.value||'').trim();finish(v||null)}else finish(chosen??true)}});
      requestAnimationFrame(()=>{overlay.classList.add('show');(field||overlay.querySelector('[data-dialog-confirm]'))?.focus()});
    });
  }
  const communityConfirm=(message,opts={})=>communityDialog({title:opts.title||'Confirm action',message,confirmText:opts.confirmText||'Continue',danger:!!opts.danger});
  const communityPrompt=(title,value='',opts={})=>communityDialog({title,message:opts.message||'',input:true,value,placeholder:opts.placeholder||'',confirmText:opts.confirmText||'Save'});
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
  function closeModal(){try{state.groupUiAbort?.abort();}catch(_){}state.groupUiAbort=null;try{closeMemberMenu?.();}catch(_){}try{state.groupMessageUnsub?.();}catch(_){}state.groupMessageUnsub=null;try{state.activeGroupMembersUnsub?.();}catch(_){}state.activeGroupMembersUnsub=null;try{state.activeGroupDocUnsub?.();}catch(_){}state.activeGroupDocUnsub=null;try{state.commentUnsub?.();}catch(_){}state.commentUnsub=null;$('#communityModalRoot')?.replaceChildren();}

  function legacyArray(keys){
    for(const key of keys){
      const value=parse(localStorage.getItem(key)||'[]',[]);
      if(Array.isArray(value)&&value.length)return value;
    }
    return [];
  }
  function isDemoPost(row){
    const text=String(row?.text||'').trim().toLowerCase();
    return !row?.uid || text==='hello' || text==='hello someone here?';
  }
  // Never use a group's display name as a deletion/filter rule. A real group called
  // "DSA Warriors" was previously mistaken for a demo row after every refresh.
  function isDemoGroup(){ return false; }
  function loadOffline(){
    const data=parse(localStorage.getItem(offlineKey())||'{}',{});
    const legacyPosts=legacyArray(['nexzo_community_v2_posts','nexzoCommunityPostsProject2','nexzoCommunityPostsPro','nexzoCommunityPosts']);
    const legacyGroups=legacyArray(['nexzo_community_v2_groups','nexzoStudyGroupsProject2','nexzoStudyGroupsPro','nexzoStudyGroups']);
    const deleted=new Set(parse(localStorage.getItem('nexzo_community_deleted_posts')||'[]',[]));
    state.posts=(Array.isArray(data.posts)&&data.posts.length?data.posts:legacyPosts).filter(row=>row?.id&&!deleted.has(String(row.id))&&!isDemoPost(row));
    state.groups=(Array.isArray(data.groups)&&data.groups.length?data.groups:legacyGroups).filter(row=>row?.id&&!isDemoGroup(row));
    state.saved=new Set(Array.isArray(data.saved)?data.saved:[]);
    state.liked=new Set(Array.isArray(data.liked)?data.liked:[]);
    state.comments=new Map(Object.entries(data.comments||{}));
    state.members=new Map(Object.entries(data.members||{}).map(([key,value])=>[key,new Set(value||[])]));
    state.messages=new Map(Object.entries(data.messages||{}));
  }
  function deletedPostIds(){return new Set(parse(localStorage.getItem('nexzo_community_deleted_posts')||'[]',[]));}
  function rememberDeletedPost(id){const rows=[...deletedPostIds(),String(id)].slice(-500);localStorage.setItem('nexzo_community_deleted_posts',JSON.stringify(rows));}
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

  function cleanupRealtime(){state.unsubs.splice(0).forEach(fn=>{try{fn();}catch(_){}});state.memberUnsubs.forEach(fn=>{try{fn();}catch(_){}});state.memberUnsubs.clear();state.notificationUnsubs.forEach(fn=>{try{fn();}catch(_){}});state.notificationUnsubs.clear();state.postNotifyReady=false;try{state.commentUnsub?.();}catch(_){}try{state.groupMessageUnsub?.();}catch(_){}try{state.activeGroupMembersUnsub?.();}catch(_){}try{state.activeGroupDocUnsub?.();}catch(_){}state.commentUnsub=null;state.groupMessageUnsub=null;state.activeGroupMembersUnsub=null;state.activeGroupDocUnsub=null;}
  async function runGroupHealthChecks(groups){
    // Intentionally non-destructive. Realtime errors or temporary membership
    // gaps are never used as evidence that a persisted group should be deleted.
    return {checked:Array.isArray(groups)?groups.length:0,mutated:false};
  }

  function subscribeAll(){
    const onError=error=>{console.warn('[NEXZO Community] realtime sync unavailable',error);if(state.mode!=='offline')startOffline(error.code==='permission-denied'?'Firestore permission denied — using local mode':error.message);};
    state.unsubs.push(fb.onSnapshot(fb.query(fb.collection(fb.db,'publicProfiles'),fb.limit(200)),snapshot=>{state.identities=new Map(snapshot.docs.map(doc=>{const p=doc.data();return [doc.id,{authorName:p.name||'Student',authorUsername:p.username||'',authorPhoto:p.photoURL||''}]}));render();},()=>{}));
    state.unsubs.push(fb.onSnapshot(fb.query(fb.collection(fb.db,'posts'),fb.orderBy('createdAtMs','desc'),fb.limit(50)),snapshot=>{
      const deleted=deletedPostIds();
      state.posts=snapshot.docs.map(doc=>({id:doc.id,likes:0,replies:0,...doc.data()})).filter(post=>!deleted.has(String(post.id))&&!isDemoPost(post));
      if(state.postNotifyReady){snapshot.docChanges().filter(change=>change.type==='added').forEach(change=>{const post={id:change.doc.id,...change.doc.data()};if(post.uid===state.user?.uid)return;const age=Date.now()-Number(post.createdAtMs||0);if(age<0||age>120000)return;const title=`New Community post • ${post.authorName||'Student'}`,body=String(post.text||'').trim().slice(0,120)||'Shared a new post in NEXZO Community';window.NEXZOShell?.addNotification?.(title,body,`community.html#post-${post.id}`);window.NEXZOShell?.notifyDevice?.(title,body);});}else state.postNotifyReady=true;
      saveOffline(true);render();
    },onError));
    state.unsubs.push(fb.onSnapshot(fb.query(fb.collection(fb.db,'groups'),fb.orderBy('createdAtMs','desc'),fb.limit(50)),snapshot=>{
      state.groups=snapshot.docs.map(doc=>({id:doc.id,...doc.data()})).filter(group=>!isDemoGroup(group));
      // Never block the Study Groups list on IndexedDB/media hydration or one listener per group.
      // Group media is hydrated only when that room opens. memberCount comes from the group doc.
      saveOffline(true);renderGroups();
    },error=>{console.warn('[NEXZO Community] group sync unavailable',error);toast('Study Groups could not sync. Please retry when connected.','error');}));
    state.unsubs.push(fb.onSnapshot(fb.query(fb.collectionGroup(fb.db,'members'),fb.where('uid','==',state.user.uid)),snapshot=>{
      state.myGroupIds=new Set(snapshot.docs.map(doc=>doc.ref.parent.parent?.id).filter(Boolean));
      saveOffline(true);renderGroups();
    },error=>console.warn('[NEXZO Community] membership sync unavailable',error)));
    state.unsubs.push(fb.onSnapshot(fb.collection(fb.db,'users',state.user.uid,'savedPosts'),snapshot=>{state.saved=new Set(snapshot.docs.map(doc=>doc.id));render();},onError));
    try{state.unsubs.push(fb.onSnapshot(fb.query(fb.collectionGroup(fb.db,'likes'),fb.where('uid','==',state.user.uid)),snapshot=>{state.liked=new Set(snapshot.docs.map(doc=>doc.ref.parent.parent?.id).filter(Boolean));render();},()=>{}));}catch(_){}
  }

  function removeEmptyGroupLocally(groupId){
    const id=String(groupId||'').trim();if(!id)return;
    state.groups=state.groups.filter(group=>group.id!==id);
    state.members.delete(id);
    const unsub=state.memberUnsubs.get(id);if(unsub){try{unsub();}catch(_){}state.memberUnsubs.delete(id);}
    const notifyUnsub=state.notificationUnsubs.get(id);if(notifyUnsub){try{notifyUnsub();}catch(_){}state.notificationUnsubs.delete(id);}
    if(state.activeGroupId===id){try{state.activeGroupMembersUnsub?.();}catch(_){}try{state.activeGroupDocUnsub?.();}catch(_){}state.activeGroupMembersUnsub=null;state.activeGroupDocUnsub=null;state.activeGroupId=null;closeModal();toast('Empty study group was dissolved.','success');}
    saveOffline(true);render();
    // Removing a stale UI row must never initiate a destructive server repair.
  }

  function syncGroupMemberListeners(){ /* V148: intentionally lazy; active room owns its single member listener. */ }

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
          const myHandle=userHandle(),mentioned=!!myHandle&&new RegExp(`(^|\\s)@${myHandle.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')}($|\\s|[.,!?])`,'i').test(String(message.text||''));
          const title=mentioned?`You were mentioned in ${group.name||'Study Group'}`:`${group.name||'Study Group'} • ${message.authorName||'Student'}`;
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
    const query=String(state.search||'').trim().toLowerCase();
    if(query)posts=posts.filter(raw=>{const post={...raw,...(state.identities.get(raw.uid)||{})};const haystack=[post.text,post.category,post.authorName,post.authorUsername,...(post.tags||[])].join(' ').toLowerCase();return haystack.includes(query);});
    if(state.sort==='popular')posts.sort((a,b)=>Number(b.likes||0)-Number(a.likes||0));
    else if(state.sort==='replies')posts.sort((a,b)=>Number(b.replies||0)-Number(a.replies||0));
    else posts.sort((a,b)=>Number(b.createdAtMs||0)-Number(a.createdAtMs||0));
    return posts;
  }
  function postCard(post){
    post={...post,...(state.identities.get(post.uid)||{})};
    const rows=state.comments.get(post.id)||[],mine=post.uid===state.user?.uid,liked=state.liked.has(post.id),saved=state.saved.has(post.id);
    return `<article class="community-post-card" id="post-${esc(post.id)}" data-post-card="${esc(post.id)}">
      <div class="post-head">${avatarMarkup(post.authorPhoto,post.authorName)}<div class="post-identity">${identityLine(post.authorName,post.authorUsername)}<small>${esc(time(post.createdAtMs))}</small></div><span class="post-category">${esc(post.category||'General')}</span></div>
      <p class="post-text">${esc(post.text||'')}</p>
      ${safeHttpUrl(post.resourceUrl)?`<a class="community-resource-link" href="${esc(safeHttpUrl(post.resourceUrl))}" target="_blank" rel="noopener noreferrer">🔗 Open attached resource</a>`:''}
      <div class="post-tags">${(post.tags||[]).map(tag=>`<span>#${esc(tag)}</span>`).join('')}</div>
      <div class="post-actions">
        <button data-v32-like="${esc(post.id)}">${liked?'❤️':'🤍'} ${Math.max(0,Number(post.likes)||0)}</button>
        <button data-v32-comment="${esc(post.id)}">💬 Comment (${Math.max(0,Number(post.replies)||0)})</button>
        <button data-v32-save="${esc(post.id)}">${saved?'✅ Saved':'🔖 Save'}</button>
        <button data-v32-share="${esc(post.id)}">↗ Share</button><button data-v42-report="${esc(post.id)}">⚑ Report</button>${mine?`<button data-v32-edit="${esc(post.id)}">✎ Edit</button><button data-v32-delete="${esc(post.id)}">🗑 Delete</button>`:''}
      </div><div class="post-replies">${rows.slice(-4).map(comment=>`<div class="post-reply"><div class="post-reply-head">${avatarMarkup(comment.authorPhoto,comment.authorName,'post-reply-avatar')}<span>${identityLine(comment.authorName,comment.authorUsername)}</span></div><span class="nx-comment-text">${esc(comment.text||'')}</span><time class="nx-comment-time">${esc(time(comment.createdAtMs))}</time></div>`).join('')}</div>
    </article>`;
  }
  function render(){
    if(!isPage())return;setModeStatus();const posts=filteredPosts(),sevenDaysAgo=Date.now()-7*86400000;
    const activeUsers=new Set(state.posts.filter(post=>Number(post.updatedAtMs||post.createdAtMs)>=sevenDaysAgo).map(post=>post.uid).filter(Boolean));
    const set=(id,value)=>{const el=$(`#${id}`);if(el)el.textContent=value;};
    set('communityTotalPosts',state.posts.length);set('communityActiveUsers',activeUsers.size);set('communitySavedCount',state.saved.size);set('communityDiscussionCount',state.posts.reduce((sum,post)=>sum+Math.max(0,Number(post.replies)||0),0));
    const feed=$('#communityFeed');if(feed)feed.innerHTML=posts.length?posts.map(postCard).join(''):`<div class="community-empty-v2"><h3>No posts found</h3><p>Create the first discussion or change the selected filter.</p></div>`;
    renderTrending();renderContributors();renderGroups();
  }
  window.addEventListener('nexzo:stats-updated',()=>{ if(isPage() && state.mode!=='loading') render(); });

  function renderTrending(){const counts={};state.posts.forEach(post=>(post.tags?.length?post.tags:[post.category]).filter(Boolean).forEach(tag=>counts[tag]=(counts[tag]||0)+1));const rows=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6),box=$('#trendingTopics');if(box)box.innerHTML=rows.length?rows.map(([tag,count])=>`<div class="side-item"><div><b>#${esc(tag)}</b><small>${count} ${count===1?'post':'posts'}</small></div><span>🔥</span></div>`).join(''):'<div class="community-empty-mini-v2">No trends yet.</div>';}
  function renderContributors(){const map={};state.posts.forEach(raw=>{const post={...raw,...(state.identities.get(raw.uid)||{})};const key=post.uid||post.authorName;map[key]??={name:post.authorName||'Student',username:post.authorUsername||'',photo:post.authorPhoto||'',posts:0,likes:0,comments:0};map[key].posts+=1;map[key].likes+=Number(post.likes)||0;map[key].comments+=Number(post.replies)||0;});const leaders=Object.values(map).map(row=>({...row,score:row.posts*20+row.likes*2+row.comments*4})).sort((a,b)=>b.score-a.score).slice(0,5),box=$('#topContributors');if(box)box.innerHTML=leaders.length?leaders.map((row,index)=>`<div class="side-item"><div><b>${index+1}. ${esc(row.name)}${row.username?` <span class="post-handle">@${esc(row.username)}</span>`:''}</b><small>${row.posts} posts • ${row.comments} comments</small></div><span>${row.score} pts</span></div>`).join(''):'<div class="community-empty-mini-v2">No contributors yet.</div>';}
  function groupPrivacy(group){return group?.privacy==='private'?'private':'public';}
  function currentUserInGroup(group){return !!state.user&&(group?.ownerUid===state.user.uid||state.myGroupIds.has(group?.id)||state.members.get(group?.id)?.has(state.user.uid));}
  function visibleGroups(){return state.groups.filter(group=>Boolean(group?.id));}
  function groupListCard(group,compact=false){
    const active=state.activeGroupId===group.id?state.members.get(group.id):null,count=active?active.size:Math.max(0,Number(group.memberCount||0)),privacy=groupPrivacy(group);
    const member=currentUserInGroup(group),owner=!!state.user&&group?.ownerUid===state.user.uid;
    const primaryLabel=privacy==='private'&&!member?'Request':'Open';
    const manage=compact?'':(owner?`<button class="nx-group-inline-danger" data-v32-delete-group-direct="${esc(group.id)}" title="Delete this group permanently">Delete</button>`:(member?`<button class="nx-group-inline-secondary" data-v32-leave-group-direct="${esc(group.id)}">Leave</button>`:''));
    return `<div class="group-pro-card${compact?' nx-group-card-compact':''}" data-group-id="${esc(group.id)}" title="${esc(group.name||'Study Group')}">${groupLogoMarkup(group)}<div class="nx-group-list-copy"><b title="${esc(group.name||'Study Group')}">${esc(group.name||'Study Group')}${owner?' <span class="nx-group-owned-badge">Owner</span>':''}</b><small title="${esc(`${count} ${count===1?'Member':'Members'} · ${group.subject||'General'} · ${privacy==='private'?'Private · approval required':'Public'}`)}">${count} ${count===1?'Member':'Members'} · ${esc(group.subject||'General')} · ${privacy==='private'?'Private · approval required':'Public'}</small></div><div class="nx-group-inline-actions"><button data-v32-open-group="${esc(group.id)}">${primaryLabel}</button>${manage}</div>${compact?'':`<span class="nx-group-list-preview">${esc(group.description||'Open the group to chat, share files and study together.')}</span>`}</div>`;
  }
  function renderGroups(){const section=$('#communityStudyGroups');if(section){section.hidden=false;section.removeAttribute('hidden');section.setAttribute('aria-hidden','false');}const box=$('#studyGroupsList');if(!box)return;const rows=visibleGroups();box.innerHTML=rows.length?rows.slice(0,3).map(group=>groupListCard(group,true)).join(''):'<div class="community-empty-mini-v2">No study groups yet. Create one or request access to a private group.</div>';const more=$('#openAllGroups');if(more){more.hidden=false;more.textContent=rows.length>3?`More (${rows.length})`:'More';more.disabled=rows.length===0;more.title=rows.length?'View all study groups':'No study groups yet';}}
  function openAllGroupsModal(){
    const rows=visibleGroups();
    const root=modal(`<div class="nx-all-groups-modal"><div class="nx-all-groups-head"><div><span class="nx-modal-kicker">STUDY GROUPS</span><h2>All study groups</h2><p>${rows.length} accessible ${rows.length===1?'group':'groups'} · search and open any group</p></div></div><label class="nx-all-groups-search"><span>⌕</span><input id="nxAllGroupsSearch" type="search" placeholder="Search group or subject..." autocomplete="off"></label><div id="nxAllGroupsList" class="nx-all-groups-list">${rows.length?rows.map(group=>groupListCard(group)).join(''):'<div class="community-empty-mini-v2">No groups available.</div>'}</div></div>`);
    root?.classList.add('nx-all-groups-overlay');
    root?.querySelector('.nx-pro-modal-card')?.classList.add('nx-all-groups-card');
    const input=root?.querySelector('#nxAllGroupsSearch'),list=root?.querySelector('#nxAllGroupsList');
    input?.addEventListener('input',()=>{const q=input.value.trim().toLowerCase(),filtered=rows.filter(g=>!q||String(g.name||'').toLowerCase().includes(q)||String(g.subject||'').toLowerCase().includes(q)||String(g.description||'').toLowerCase().includes(q));if(list)list.innerHTML=filtered.length?filtered.map(group=>groupListCard(group)).join(''):'<div class="community-empty-mini-v2">No matching groups.</div>';});
    setTimeout(()=>input?.focus(),40);
  }


  async function deleteGroupDirect(groupId){
    const group=state.groups.find(row=>row.id===groupId);if(!group)return toast('Group no longer exists.','info');
    if(!state.user||group.ownerUid!==state.user.uid)return toast('Only the group owner can delete this group.','error');
    if(!await communityConfirm(`Delete “${group.name||'this group'}” permanently? This removes the group, members, messages and requests. This cannot be undone.`,{title:'Delete group',confirmText:'Delete permanently',danger:true}))return;
    try{
      await groupAdminApi(`/groups/${encodeURIComponent(groupId)}`,{method:'DELETE'});
      const check=await fb.getDocFromServer(fb.doc(fb.db,'groups',groupId));
      if(check.exists())throw new Error('Delete was not confirmed by Firestore.');
      state.groups=state.groups.filter(row=>row.id!==groupId);state.myGroupIds.delete(groupId);state.members.delete(groupId);saveOffline(true);render();
      document.querySelector(`[data-group-id="${CSS.escape(groupId)}"]`)?.remove();
      toast('Study group permanently deleted.','success');
    }catch(error){toast(error?.message||'Could not delete the group.','error')}
  }
  async function leaveGroupDirect(groupId){
    const group=state.groups.find(row=>row.id===groupId);if(!group)return toast('Group no longer exists.','info');
    if(group.ownerUid===state.user?.uid)return toast('Owner must transfer ownership or delete the group.','error');
    if(!currentUserInGroup(group))return toast('You are not a member of this group.','info');
    if(!await communityConfirm(`Leave “${group.name||'this group'}”?`,{title:'Leave group',confirmText:'Leave',danger:true}))return;
    try{await leaveGroupCloud(groupId,group);state.myGroupIds.delete(groupId);state.members.get(groupId)?.delete(state.user.uid);saveOffline(true);render();toast('You left the group.','success')}catch(error){toast(error?.message||'Could not leave the group.','error')}
  }

  async function createPost(){
    if(!ensureUser())return;const input=$('#communityPostText'),raw=input?.value||'',guard=window.NEXZOCommunitySafety;
    const checked=guard?.validateText(raw,{min:3,max:2000})||{ok:raw.trim().length>=3,text:raw.trim(),message:'Write at least 3 characters.'};if(!checked.ok)return toast(checked.message,'error');
    const rate=guard?.rateLimit(localStorage,`nexzo:community:post-rate:${state.user.uid}`,{cooldownMs:12000});if(rate&&!rate.allowed)return toast(`Please wait ${Math.ceil(rate.remainingMs/1000)}s before posting again.`,'error');
    const dup=guard?.duplicate(localStorage,`nexzo:community:post-dup:${state.user.uid}`,checked.text);if(dup?.duplicate)return toast('Duplicate post blocked. Edit the message before posting again.','error');
    let tags;
    try{tags=window.NEXZOCommunityContracts.tags($('#communityPostTags')?.value||'');}catch(error){return toast(error.message,'error');}
    const text=checked.text,now=Date.now();
    const data={uid:state.user.uid,authorName:userName(),authorUsername:userHandle(),authorPhoto:state.user.photoURL||'',text:text.slice(0,2000),tags,category:$('#communityPostCategory')?.value||'Academics',resourceUrl:safeHttpUrl(state.resourceUrl),likes:0,replies:0,createdAtMs:now,updatedAtMs:now};
    if(state.mode==='offline'){localStorage.setItem(state.draftKey,text);return toast('You are offline. Your draft is preserved, but it was not published.','error');}
    const ref=await fb.addDoc(fb.collection(fb.db,'posts'),data);
    const verify=await fb.getDoc(ref);if(!verify.exists())throw new Error('Post write could not be verified.');
    rate?.commit();dup?.commit();if(input)input.value='';if($('#communityPostTags'))$('#communityPostTags').value='';state.resourceUrl='';localStorage.removeItem(state.draftKey);toast('Post published','success');window.dispatchEvent(new CustomEvent('nexzo:community-posted',{detail:{id:ref.id}}));
  }
  async function toggleLike(postId){
    if(!ensureUser())return;
    if(state.mode==='offline')return toast('Reconnect to update likes. No cloud state was changed.','error');
    const postRef=fb.doc(fb.db,'posts',postId),likeRef=fb.doc(fb.db,'posts',postId,'likes',state.user.uid);
    await fb.runTransaction(fb.db,async transaction=>{const [postSnap,likeSnap]=await Promise.all([transaction.get(postRef),transaction.get(likeRef)]);if(!postSnap.exists())throw new Error('Post no longer exists.');const count=Math.max(0,Number(postSnap.data()?.likes)||0);if(likeSnap.exists()){transaction.delete(likeRef);transaction.update(postRef,{likes:Math.max(0,count-1),updatedAtMs:Date.now()});}else{transaction.set(likeRef,{uid:state.user.uid,createdAtMs:Date.now()});transaction.update(postRef,{likes:count+1,updatedAtMs:Date.now()});}});
  }
  async function addComment(postId,text){
    if(!ensureUser()||!text.trim())return;const data={id:uuid(),uid:state.user.uid,authorName:userName(),authorUsername:userHandle(),authorPhoto:state.user.photoURL||'',text:text.trim().slice(0,1000),createdAtMs:Date.now()};
    if(state.mode==='offline')return toast('Reconnect to publish this comment. Nothing was added to the shared post.','error');
    const postRef=fb.doc(fb.db,'posts',postId),commentRef=fb.doc(fb.collection(fb.db,'posts',postId,'comments'));
    await fb.runTransaction(fb.db,async transaction=>{const postSnap=await transaction.get(postRef);if(!postSnap.exists())throw new Error('Post no longer exists.');const {id:_commentId,...commentData}=data;transaction.set(commentRef,commentData);transaction.update(postRef,{replies:Math.max(0,Number(postSnap.data()?.replies)||0)+1,updatedAtMs:Date.now()});});
  }
  function drawComments(postId){
    const rows=state.comments.get(postId)||[],box=$('#v32Comments');if(!box)return;
    const post=state.posts.find(row=>row.id===postId);
    box.innerHTML=rows.length?rows.map(comment=>{
      const canDelete=comment.uid===state.user?.uid||post?.uid===state.user?.uid;
      return `<div class="group-chat-msg"><div class="post-reply-head">${avatarMarkup(comment.authorPhoto,comment.authorName,'post-reply-avatar')}<span>${identityLine(comment.authorName,comment.authorUsername)}</span>${canDelete?`<button class="nx-comment-delete" data-delete-comment="${esc(comment.id)}" title="Delete comment">🗑</button>`:''}</div>${esc(comment.text||'')}</div>`;
    }).join(''):'<div class="post-reply">No comments yet.</div>';
    box.querySelectorAll('[data-delete-comment]').forEach(button=>button.onclick=async()=>{
      const commentId=button.dataset.deleteComment;if(!commentId||!await communityConfirm('Delete this comment permanently?',{title:'Delete comment',confirmText:'Delete',danger:true}))return;
      button.disabled=true;
      try{
        if(state.mode==='offline')return toast('Reconnect before deleting a shared comment. No cloud data was changed.','error');
        await groupAdminApi(`/community/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,{method:'DELETE'});
        state.comments.set(postId,(state.comments.get(postId)||[]).filter(row=>row.id!==commentId));drawComments(postId);toast('Comment deleted','success');
      }catch(error){button.disabled=false;toast(error.message||'Could not delete comment','error');}
    });
  }
  function openComments(postId){
    const post=state.posts.find(row=>row.id===postId);if(!post)return;modal(`<h2>💬 Comments</h2><p>${esc((post.text||'').slice(0,240))}</p><div id="v32Comments" class="group-chat-box"><div class="post-reply">Loading comments…</div></div><div class="group-chat-input"><input id="v32CommentInput" placeholder="Write a comment..."><button id="v32CommentSend">Send</button></div>`);
    if(state.mode==='offline')drawComments(postId);else{try{state.commentUnsub?.();}catch(_){}state.commentUnsub=fb.onSnapshot(fb.query(fb.collection(fb.db,'posts',postId,'comments'),fb.orderBy('createdAtMs','asc'),fb.limit(100)),snapshot=>{state.comments.set(postId,snapshot.docs.map(doc=>({id:doc.id,...doc.data()})));drawComments(postId);},error=>{const box=$('#v32Comments');if(box)box.innerHTML=`<div class="post-reply">${esc(error.message)}</div>`;});}
    $('#v32CommentSend').onclick=async()=>{const input=$('#v32CommentInput'),text=input?.value.trim();if(!text)return;await addComment(postId,text);input.value='';if(state.mode==='offline')drawComments(postId);};
  }
  async function toggleSave(postId){if(!ensureUser())return;if(state.mode==='offline')return toast('Reconnect to change saved posts. No cloud state was changed.','error');const ref=fb.doc(fb.db,'users',state.user.uid,'savedPosts',postId);if(state.saved.has(postId))await fb.deleteDoc(ref);else await fb.setDoc(ref,{postId,createdAtMs:Date.now()});}

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

  async function editPost(postId){
    if(!ensureUser())return;const post=state.posts.find(row=>row.id===postId);if(!post||post.uid!==state.user.uid)return toast('Only the post owner can edit it.','error');
    if(state.mode!=='cloud')return toast('Reconnect before editing a shared post.','error');
    const root=modal(`<div class="nx-report-modal"><span class="nx-modal-kicker">EDIT POST</span><h2>Edit your post</h2><label class="nx-field-label">Post</label><textarea id="nxEditPostText" maxlength="2000">${esc(post.text||'')}</textarea><label class="nx-field-label">Tags</label><input id="nxEditPostTags" maxlength="120" value="${esc((post.tags||[]).join(', '))}" placeholder="max 4 tags"><div class="nx-modal-actions"><button class="btn" data-edit-cancel>Cancel</button><button class="btn primary" data-edit-save>Save changes</button></div></div>`);
    root.querySelector('[data-edit-cancel]').onclick=closeModal;root.querySelector('[data-edit-save]').onclick=async()=>{const button=root.querySelector('[data-edit-save]'),text=$('#nxEditPostText')?.value.trim()||'';if(text.length<3)return toast('Write at least 3 characters.','error');let tags;try{tags=window.NEXZOCommunityContracts.tags($('#nxEditPostTags')?.value||'')}catch(error){return toast(error.message,'error')}button.disabled=true;button.textContent='Saving…';try{const ref=fb.doc(fb.db,'posts',postId);await fb.updateDoc(ref,{text:text.slice(0,2000),tags,updatedAtMs:Date.now()});const snap=await fb.getDoc(ref);if(!snap.exists()||snap.data()?.text!==text.slice(0,2000))throw new Error('Post update could not be verified.');closeModal();toast('Post updated','success')}catch(error){button.disabled=false;button.textContent='Save changes';toast(error.message||'Post was not updated.','error')}};
  }

  // Compatibility contract: NEXZOCommunityMaintenance?.chunks remains available for legacy maintenance flows.
  async function deletePost(postId){
    if(!ensureUser()||!await communityConfirm('This post will be permanently deleted.',{title:'Delete post',confirmText:'Delete',danger:true}))return;const post=state.posts.find(row=>row.id===postId);if(post?.uid!==state.user.uid)return toast('Only the post owner can delete it.','error');
    if(state.mode==='offline')return toast('Reconnect before deleting a shared post. No cloud data was changed.','error');
    try{
      try{await groupAdminApi(`/community/posts/${encodeURIComponent(postId)}`,{method:'DELETE'});}
      catch(error){await fb.deleteDoc(fb.doc(fb.db,'posts',postId));}
      const verify=await fb.getDoc(fb.doc(fb.db,'posts',postId));if(verify.exists())throw new Error('Delete was not confirmed by Firestore.');
      rememberDeletedPost(postId);state.posts=state.posts.filter(row=>row.id!==postId);state.saved.delete(postId);state.liked.delete(postId);state.comments.delete(postId);saveOffline(true);render();toast('Post deleted','success');
    }catch(error){toast(error.message||'Post was not deleted. Your post remains visible.','error');}
  }

  async function improvePost(){const input=$('#communityPostText'),text=input?.value.trim()||'';if(text.length<3)return toast('Write a draft first.','error');if(!window.NEXZOAI?.community)return toast('Study service is not configured.','error');const button=$('#communityAIImprove');if(button){button.disabled=true;button.dataset.old=button.textContent;button.textContent='Improving…';}try{const data=await window.NEXZOAI.community({postText:text});input.value=[data.title,data.summary||text].filter(Boolean).join(' — ').slice(0,2000);if(Array.isArray(data.tags)&&$('#communityPostTags'))$('#communityPostTags').value=data.tags.slice(0,4).join(', ');localStorage.setItem(state.draftKey,input.value);toast('AI improved the draft. Review before publishing.');}catch(error){toast(error.message||'AI improvement failed','error');}finally{if(button){button.disabled=false;button.textContent=button.dataset.old||'✨ Improve with AI';}}}
  async function attachResource(){const url=(await communityPrompt('Attach resource','',{message:'Paste a secure http/https resource URL.',placeholder:'https://...',confirmText:'Attach'}))?.trim();if(!url)return;try{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))throw new Error();state.resourceUrl=parsed.href;toast('Resource attached');}catch(_){toast('Enter a valid http/https URL','error');}}

  async function createGroup(){
    const existing=$('#nxRealCommunityModal');
    if(existing?.dataset?.modalType==='create-group'){closeModal();return;}if(existing)closeModal();if(!ensureUser())return;if(state.mode!=='cloud')return toast('Internet access is required to create a shared group.','error');
    const groupId=newGroupId();
    const root=modal(`<div class="nx-group-create nx-group-create-v214">
      <div class="nx-create-head"><span class="nx-create-icon">👥</span><div><span class="nx-modal-kicker">STUDY GROUP</span><h2>Create your study group</h2><p class="nx-modal-copy">Build a focused space to learn, discuss and grow together.</p></div></div>
      <div class="nx-create-grid">
        <label class="nx-create-field"><span>Group name <em>Required</em></span><input id="v32GroupName" maxlength="100" placeholder="e.g. DSA Warriors"></label>
        <label class="nx-create-field"><span>Subject <em>Required</em></span><input id="v32GroupSubject" maxlength="80" placeholder="e.g. Data Structures"></label>
        <label class="nx-create-field nx-create-wide"><span>Description <small>Optional</small></span><textarea id="v32GroupDescription" maxlength="500" placeholder="What will this group study?"></textarea></label>
        <label class="nx-create-field nx-create-wide nx-group-logo-picker"><span>Group logo <small>Optional · PNG/JPG/WebP · max 2 MB</small></span><div class="nx-logo-pick-row">${groupLogoMarkup({name:'NEXZO Study Group',avatarURL:''},'nx-create-logo-preview')}<input id="v32GroupLogo" type="file" accept="image/png,image/jpeg,image/webp"><button type="button" class="btn" data-clear-create-logo>Use default</button></div><small id="v32GroupLogoStatus">NEXZO default logo will be used.</small></label>
      </div>
      <div class="nx-create-privacy-title"><div><b>Who can join?</b><small>Choose how new members enter this group.</small></div></div>
      <div class="nx-group-privacy nx-group-privacy-v214"><label><input type="radio" name="v32Privacy" value="public" checked><span class="nx-privacy-icon">🌐</span><span class="nx-privacy-copy"><b>Public</b><small>Students can join instantly.</small></span><i>Instant join</i></label><label><input type="radio" name="v32Privacy" value="private"><span class="nx-privacy-icon">🔒</span><span class="nx-privacy-copy"><b>Private</b><small>Students request access. Admins approve or reject.</small></span><i>Approval</i></label></div>
      <div class="nx-create-foot"><span>🔐 Only members can read group chat and shared media.</span><div class="nx-create-actions"><button class="btn nx-create-cancel" type="button" data-create-cancel>Cancel</button><button class="btn primary" data-v32-create-group-now><span>✨ Create Group</span><b>→</b></button></div></div>
    </div>`);
    root.dataset.modalType='create-group';root.dataset.groupId=groupId;root.querySelector('[data-create-cancel]')?.addEventListener('click',closeModal);let logoFile=null,previewURL='';const logoInput=root.querySelector('#v32GroupLogo'),status=root.querySelector('#v32GroupLogoStatus');
    logoInput.addEventListener('change',()=>{const file=logoInput.files?.[0];if(!file){logoFile=null;return}try{window.NEXZOCommunityContracts.logo(file);logoFile=file;if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(file);const img=root.querySelector('.nx-create-logo-preview img');if(img){img.src=previewURL;img.hidden=false}if(status)status.textContent=`${file.name} · ${(file.size/1024).toFixed(0)} KB`;}catch(error){logoInput.value='';logoFile=null;toast(error.message,'error')}});
    root.querySelector('[data-clear-create-logo]').onclick=()=>{logoInput.value='';logoFile=null;if(previewURL){URL.revokeObjectURL(previewURL);previewURL=''}const img=root.querySelector('.nx-create-logo-preview img');if(img)img.src=DEFAULT_GROUP_ICON;if(status)status.textContent='NEXZO default logo will be used.'};
    root.querySelector('[data-v32-create-group-now]').onclick=async()=>{
      const name=$('#v32GroupName')?.value.trim(),subject=$('#v32GroupSubject')?.value.trim(),description=($('#v32GroupDescription')?.value||'').trim(),privacy=root.querySelector('input[name="v32Privacy"]:checked')?.value==='private'?'private':'public';if(!name||!subject)return toast('Name and subject are required.','error');
      const button=root.querySelector('[data-v32-create-group-now]');button.disabled=true;button.classList.add('is-loading');button.innerHTML='<span>Creating group…</span><b>•••</b>';let created=null,backendError=null;
      const payload={groupId,idempotencyKey:groupId,name:name.slice(0,100),subject:subject.slice(0,80),description:description.slice(0,500),privacy,ownerName:userName(),ownerUsername:userHandle(),ownerPhotoURL:state.user.photoURL||''};
      try{const result=await groupAdminApi('/groups',{method:'POST',noRetry:true,body:payload});created=result?.group;if(!created?.id)throw new Error('Backend did not return the persisted group.');}
      catch(error){backendError=error;try{const now=Date.now(),groupRef=fb.doc(fb.db,'groups',groupId),ownerRef=fb.doc(fb.db,'groups',groupId,'members',state.user.uid);const [existingGroup,existingOwner]=await Promise.all([fb.getDoc(groupRef),fb.getDoc(ownerRef)]);if(existingGroup.exists()){if(existingGroup.data()?.ownerUid!==state.user.uid||!existingOwner.exists()||existingOwner.data()?.role!=='owner')throw new Error('The retry key already exists but is not a verified owner group.');created={id:groupId,...existingGroup.data()};}else{const batch=fb.writeBatch(fb.db);const inviteCode=groupId.replace(/[^a-z0-9]/gi,'').slice(-12).toUpperCase();batch.set(groupRef,{ownerUid:state.user.uid,ownerName:userName(),name:payload.name,subject:payload.subject,description:payload.description,memberCount:1,createdAtMs:now,updatedAtMs:now,avatarURL:'',wallpaperURL:'',wallpaperType:'',privacy,inviteCode:'',permissions:{membersCanSend:true,membersCanInvite:true,membersCanEdit:false,historyVisible:true,approvalRequired:privacy==='private'},schemaVersion:240});batch.set(ownerRef,{uid:state.user.uid,name:userName(),username:userHandle(),photoURL:state.user.photoURL||'',role:'owner',joinedAtMs:now});batch.set(fb.doc(fb.db,'groups',groupId,'private','invite'),{code:inviteCode,updatedAtMs:now});await batch.commit();const [savedGroup,savedOwner]=await Promise.all([fb.getDoc(groupRef),fb.getDoc(ownerRef)]);if(!savedGroup.exists()||!savedOwner.exists()||savedOwner.data()?.role!=='owner')throw new Error('Firestore group creation could not be verified.');created={id:groupId,...savedGroup.data()};}}catch(fallbackError){console.error('[NEXZO Community] create shared group failed',backendError,fallbackError);button.disabled=false;button.classList.remove('is-loading');button.innerHTML='<span>Create Group</span><b>→</b>';const reason=fallbackError?.code==='permission-denied'?'Firebase rules blocked the atomic owner bootstrap.':fallbackError?.message||backendError?.message||'Unknown persistence error.';return toast(`Group not created: ${reason}`,'error')}}
      let logoWarning='';const pendingLogoFile=logoFile||null;
      const finalSnap=await fb.getDoc(fb.doc(fb.db,'groups',groupId));if(!finalSnap.exists()){button.disabled=false;button.classList.remove('is-loading');button.innerHTML='<span>Create Group</span><b>→</b>';return toast('Group write was not confirmed after creation.','error')}created={id:groupId,...finalSnap.data(),_backendVerified:true};state.groups=[created,...state.groups.filter(row=>row.id!==groupId)];state.myGroupIds.add(groupId);saveOffline(true);render();if(previewURL)URL.revokeObjectURL(previewURL);closeModal();toast(`${privacy==='private'?'Private':'Public'} group created and verified`,'success');setTimeout(()=>openGroup(groupId),80);if(pendingLogoFile){mediaCacheSet(groupId,'avatar',pendingLogoFile).catch(()=>{});writeGroupMediaMeta(groupId,{avatarPending:true,avatarURL:'',lastError:''});uploadPermanentGroupLogo(groupId,pendingLogoFile,created).then(async url=>{created.avatarURL=url;writeGroupMediaMeta(groupId,{avatarPending:false,avatarURL:url,lastError:''});await mediaCacheDelete(groupId,'avatar');const row=state.groups.find(g=>g.id===groupId);if(row)row.avatarURL=url;renderGroups();toast('Group logo saved','success');}).catch(error=>{console.error('[NEXZO Community] background group logo failed',error);writeGroupMediaMeta(groupId,{avatarPending:true,lastError:error?.message||'Cloud save failed'});toast('Group created. Logo is kept locally until cloud save succeeds.','error');});}
    };
  }

  function messageTime(ms){
    const date=new Date(Number(ms)||Date.now());
    return date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  }
  function messageDateKey(ms){const d=new Date(Number(ms)||Date.now());return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;}
  function messageDateLabel(ms){const d=new Date(Number(ms)||Date.now()),now=new Date(),y=new Date(now);y.setDate(now.getDate()-1);if(messageDateKey(d.getTime())===messageDateKey(now.getTime()))return 'Today';if(messageDateKey(d.getTime())===messageDateKey(y.getTime()))return 'Yesterday';return d.toLocaleDateString([],{weekday:'short',day:'numeric',month:'short',year:d.getFullYear()===now.getFullYear()?undefined:'numeric'});}
  function messageFullDateTime(ms){return new Date(Number(ms)||Date.now()).toLocaleString([],{weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}
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
  function renderGroupMessageText(value){
    return String(value||'').split(/(@[a-z0-9._]{3,20})/gi).map(part=>/^@[a-z0-9._]{3,20}$/i.test(part)?`<mark class="nx-message-mention">${esc(part)}</mark>`:esc(part)).join('');
  }
  function updateVisibleReceiptStatuses(groupId){
    const box=$('#v32GroupMessages');if(!box)return;
    const recipients=(state.memberRecords.get(groupId)||[]).filter(m=>m.id!==state.user?.uid);
    for(const row of box.querySelectorAll('.nx-group-message-row.mine[data-message-id]')){
      const message=(state.messages.get(groupId)||[]).find(m=>m.id===row.dataset.messageId);if(!message||message.pending)continue;
      const created=Number(message.createdAtMs||0),statusEl=row.querySelector('.nx-msg-status');if(!statusEl)continue;
      const delivered=recipients.length>0&&recipients.every(m=>Number(m.lastDeliveredAtMs||0)>=created);
      const read=recipients.length>0&&recipients.every(m=>Number(m.lastReadAtMs||0)>=created);
      const text=read?'✓✓':delivered?'✓✓':'✓',cls=read?'read':delivered?'delivered':'sent',title=read?'Read by every current group member':delivered?'Delivered to every current group member':'Sent to NEXZO';
      if(statusEl.textContent!==text||!statusEl.classList.contains(cls)){statusEl.textContent=text;statusEl.className=`nx-msg-status ${cls}`;statusEl.title=title;statusEl.setAttribute('aria-label',title);}
    }
  }

  function drawGroupMessages(groupId,search=''){
    const prefs=groupPrefs(groupId),clearedAt=Number(prefs.clearedAtMs||0),term=String(search||'').trim().toLowerCase();
    const hiddenIds=new Set(Array.isArray(prefs.hiddenMessageIds)?prefs.hiddenMessageIds:[]),starred=new Set(Array.isArray(prefs.starredMessageIds)?prefs.starredMessageIds:[]);
    let rows=(state.messages.get(groupId)||[]).filter(m=>Number(m.createdAtMs||0)>clearedAt&&!hiddenIds.has(m.id)&&(!Number(m.expiresAtMs||0)||Number(m.expiresAtMs)>Date.now())).sort((a,b)=>Number(a.createdAtMs||0)-Number(b.createdAtMs||0)||String(a.id||'').localeCompare(String(b.id||'')));
    if(term)rows=rows.filter(m=>String(m.text||'').toLowerCase().includes(term)||String(m.authorName||'').toLowerCase().includes(term)||String(m.attachment?.name||'').toLowerCase().includes(term));
    const box=$('#v32GroupMessages');if(!box)return;
    if(!rows.length){box.innerHTML=`<div class="nx-chat-empty"><span>${term?'🔎':'💬'}</span><b>${term?'No matching messages':'No messages yet'}</b><small>${term?'Try another word.':'Start the group conversation.'}</small></div>`;return;}
    let previousDay='',html='';
    for(const message of rows){
      const day=messageDateKey(message.createdAtMs);if(day!==previousDay){html+=`<div class="nx-message-date-separator"><span>${esc(messageDateLabel(message.createdAtMs))}</span></div>`;previousDay=day;}
      const mine=message.uid===state.user?.uid,deleted=!!message.deletedForEveryoneAtMs,edited=!deleted&&message.editedAtMs?' · Edited':'',avatar=message.authorPhoto?`<img src="${esc(message.authorPhoto)}" alt="" loading="lazy" decoding="async">`:esc(String(message.authorName||'?')[0].toUpperCase());
      let status='◷',statusClass='pending',statusTitle='Sending';
      if(!message.pending){
        const recipients=(state.memberRecords.get(groupId)||[]).filter(m=>m.id!==state.user?.uid),created=Number(message.createdAtMs||0);
        const deliveredToAll=recipients.length>0&&recipients.every(m=>Number(m.lastDeliveredAtMs||0)>=created);
        const readByAll=recipients.length>0&&recipients.every(m=>Number(m.lastReadAtMs||0)>=created);
        if(readByAll){status='✓✓';statusClass='read';statusTitle='Read by every current group member';}
        else if(deliveredToAll){status='✓✓';statusClass='delivered';statusTitle='Delivered to every current group member';}
        else{status='✓';statusClass='sent';statusTitle='Sent';}
      }
      const reply=message.replyTo?`<button class="nx-msg-reply-quote" data-jump-message="${esc(message.replyTo.id||'')}"><b>${esc(message.replyTo.authorName||'Message')}</b><span>${esc(String(message.replyTo.text||'Attachment').slice(0,90))}</span></button>`:'';
      html+=`<div class="nx-group-message-row ${mine?'mine':'other'}" data-message-id="${esc(message.id)}">${mine?'':`<button class="nx-message-avatar" data-message-member="${esc(message.uid||'')}" aria-label="Open ${esc(message.authorName||'member')} profile">${avatar}</button>`}<div class="nx-group-message">${reply}<span class="nx-message-author">${mine?'You':esc(message.authorName||'Student')}${message.authorUsername?` <small>@${esc(String(message.authorUsername).replace(/^@/,''))}</small>`:''}${starred.has(message.id)?'<i class="nx-starred-indicator" title="Starred">★</i>':''}</span>${deleted?`<p class="nx-deleted-message">${message.deletedByAdmin&&message.uid!==message.deletedByUid?'This message was deleted by an admin':'This message was deleted'}</p>`:`${attachmentMarkup(message)}${message.text?`<p>${renderGroupMessageText(message.text)}</p>`:''}`}${!deleted&&message.reactions&&Object.keys(message.reactions).length?`<div class="nx-msg-reactions">${Object.entries(Object.values(message.reactions).reduce((a,x)=>(a[x]=(a[x]||0)+1,a),{})).map(([emoji,count])=>`<button data-quick-react="${esc(emoji)}">${esc(emoji)} <small>${count}</small></button>`).join('')}</div>`:''}<div class="nx-msg-meta"><time title="${esc(messageFullDateTime(message.createdAtMs))}">${esc(messageTime(message.createdAtMs))}${edited}</time>${mine?`<button type="button" class="nx-msg-status ${statusClass}" data-msg-status="${esc(message.id)}" title="${esc(statusTitle)} — click for details" aria-label="${esc(statusTitle)}. Click for details.">${status}</button>`:''}<button type="button" class="nx-msg-more" data-msg-more="${esc(message.id)}" aria-label="Open message actions" title="Message actions"><span aria-hidden="true">⋮</span></button></div></div></div>`;
    }
    box.innerHTML=html;
    if(!term)requestAnimationFrame(()=>box.scrollTo({top:box.scrollHeight,behavior:'auto'}));
  }

  async function joinGroupCloud(groupId,group,inviteCode=''){
    try{const result=await groupAdminApi(`/groups/${encodeURIComponent(groupId)}/join`,{method:'POST',body:{name:userName(),username:userHandle(),photoURL:state.user.photoURL||'',inviteCode:String(inviteCode||'')}});state.myGroupIds.add(groupId);if(Number.isFinite(Number(result?.memberCount)))group.memberCount=Number(result.memberCount);return {created:Boolean(result?.joined),mode:'backend'};}
    catch(error){
      const groupRef=fb.doc(fb.db,'groups',groupId),memberRef=fb.doc(fb.db,'groups',groupId,'members',state.user.uid);
      if(groupPrivacy(group)==='private'||group?.permissions?.approvalRequired===true){const requestRef=fb.doc(fb.db,'groups',groupId,'joinRequests',state.user.uid),approved=await fb.getDoc(requestRef).catch(()=>null);if(!approved?.exists?.()||approved.data()?.status!=='approved')throw Object.assign(new Error('Private groups require an approved access request when the group backend is unavailable.'),{cause:error});}
      let created=false;await fb.runTransaction(fb.db,async tx=>{const [g,m]=await Promise.all([tx.get(groupRef),tx.get(memberRef)]);if(!g.exists())throw new Error('Group not found.');if(m.exists())return;const data=g.data()||{};tx.set(memberRef,{uid:state.user.uid,name:userName(),username:userHandle(),photoURL:state.user.photoURL||'',role:'member',joinedAtMs:Date.now()});tx.update(groupRef,{memberCount:Math.max(0,Number(data.memberCount||0))+1,updatedAtMs:Date.now()});created=true;});state.myGroupIds.add(groupId);return {created,mode:'firestore'};
    }
  }

  async function leaveGroupCloud(groupId,group){
    try{
      const result=await groupAdminApi(`/groups/${encodeURIComponent(groupId)}/leave`,{method:'POST'});
      if(!result?.ok)throw new Error('Backend could not complete the leave operation.');
      const verify=await fb.getDoc(fb.doc(fb.db,'groups',groupId,'members',state.user.uid));
      if(verify.exists())throw new Error('Leave was not confirmed by Firestore.');
      return result;
    }catch(error){
      if(group?.ownerUid===state.user?.uid)throw Object.assign(new Error('Owner must transfer ownership or delete the group before leaving.'),{cause:error});
      const groupRef=fb.doc(fb.db,'groups',groupId),memberRef=fb.doc(fb.db,'groups',groupId,'members',state.user.uid);
      let left=false;
      await fb.runTransaction(fb.db,async tx=>{
        const [g,m]=await Promise.all([tx.get(groupRef),tx.get(memberRef)]);
        if(!g.exists())return;
        if(!m.exists())return;
        const data=g.data()||{};
        if(data.ownerUid===state.user.uid||m.data()?.role==='owner')throw new Error('Owner must transfer ownership before leaving.');
        const nextCount=Math.max(1,Number(data.memberCount||1)-1);
        tx.delete(memberRef);tx.update(groupRef,{memberCount:nextCount,updatedAtMs:Date.now()});left=true;
      });
      const verify=await fb.getDoc(memberRef);if(verify.exists())throw new Error('Leave fallback was not confirmed by Firestore.');
      return {ok:true,left,mode:'firestore'};
    }
  }

  async function sendGroupMessage(groupId,payload){
    try{return await groupAdminApi(`/groups/${encodeURIComponent(groupId)}/messages`,{method:'POST',body:payload});}
    catch(error){
      const ref=fb.doc(fb.collection(fb.db,'groups',groupId,'messages'));
      const data={uid:state.user.uid,authorName:String(payload.authorName||userName()).slice(0,100),authorUsername:String(payload.authorUsername||userHandle()).replace(/^@/,'').toLowerCase(),authorPhoto:String(payload.authorPhoto||state.user.photoURL||'').slice(0,2048),text:String(payload.text||'').slice(0,1000),createdAtMs:Date.now()};
      if(payload.attachment)data.attachment={...payload.attachment};if(payload.replyTo)data.replyTo={...payload.replyTo};const disappearingMs=Number((state.groups.find(g=>g.id===groupId)?.permissions||{}).disappearingMessagesMs||0);if([86400000,604800000,7776000000].includes(disappearingMs))data.expiresAtMs=data.createdAtMs+disappearingMs;
      await fb.setDoc(ref,data);
      const verify=await fb.getDoc(ref);if(!verify.exists())throw Object.assign(new Error('Message fallback was not confirmed by Firestore.'),{cause:error});
      return {ok:true,id:ref.id,mode:'firestore'};
    }
  }

  async function requestJoinCloud(groupId){
    const body={name:userName(),username:userHandle(),photoURL:state.user.photoURL||''};
    try{return await groupAdminApi(`/groups/${encodeURIComponent(groupId)}/join-request`,{method:'POST',body});}
    catch(error){
      const ref=fb.doc(fb.db,'groups',groupId,'joinRequests',state.user.uid),now=Date.now();
      const existing=await fb.getDoc(ref).catch(()=>null);
      const createdAtMs=existing?.exists?.()?Number(existing.data()?.createdAtMs)||now:now;
      await fb.setDoc(ref,{uid:state.user.uid,...body,status:'pending',createdAtMs,updatedAtMs:now},{merge:true});
      const verify=await fb.getDoc(ref);if(!verify.exists()||verify.data()?.status!=='pending')throw Object.assign(new Error('Join request fallback was not confirmed by Firestore.'),{cause:error});
      return {requested:true,status:'pending',mode:'firestore'};
    }
  }

  async function openGroup(groupId){
    if(!ensureUser())return;closeModal();const groupScope=new AbortController();state.groupUiAbort=groupScope;const groupSignal=groupScope.signal;const group=state.groups.find(row=>row.id===groupId);if(!group)return toast('Group not found.','error');
    state.activeGroupId=groupId;
    groupSignal.addEventListener('abort',()=>{closeMemberMenu();document.querySelector('.nx-member-detail-card')?.remove();if(state.activeGroupId===groupId)state.activeGroupId=null;},{once:true});
    if(state.mode!=='cloud'){modal(`<div class="nx-group-offline"><h2>👥 ${esc(group.name)}</h2><p>Realtime groups require Firestore. Your browser is currently offline.</p><button class="btn primary" onclick="location.reload()">Retry connection</button></div>`);return;}
    const savedMediaMeta=readGroupMediaMeta(groupId);
    const initialWallpaper=effectiveGroupWallpaper(group);
    group.wallpaperURL=initialWallpaper;
    // V148 cache-first room bootstrap: opening a room must never wait for Render or a full members query.
    // The collectionGroup membership listener already tells us whether this user belongs here.
    let isMember=state.myGroupIds.has(groupId)||group.ownerUid===state.user.uid,members=[];
    const cachedMemberSet=state.members.get(groupId);
    if(isMember){
      members=[enrichMemberIdentity({id:state.user.uid,uid:state.user.uid,name:userName(),username:userHandle(),photoURL:state.user.photoURL||'',role:group.ownerUid===state.user.uid?'owner':'member'})];
      if(cachedMemberSet?.size)group.memberCount=Math.max(Number(group.memberCount||0),cachedMemberSet.size);
      state.memberRecords.set(groupId,members.slice());
    }
    // V149: never block room opening on IndexedDB/media hydration. Paint the shell first, then hydrate in idle time.
    const localMediaHydration=hydrateLocalGroupMedia(group).then(()=>{
      if(groupSignal.aborted)return;
      const hydrated=effectiveGroupWallpaper(group);
      const liveBox=document.querySelector('#v32GroupMessages');
      paintGroupWallpaper(liveBox,hydrated);
      const hydratedLogo=effectiveGroupLogoURL(group);
      document.querySelectorAll('[data-group-logo],.nx-group-avatar img,.nx-info-avatar img').forEach(img=>{if(img&&hydratedLogo)img.src=hydratedLogo;});
    }).catch(()=>{});
    if(isMember)syncMyGroupIdentity(groupId);
    const params=new URLSearchParams(location.search),inviteParam=String(params.get('code')||''),hasValidInvite=Boolean(params.get('joinGroup')===groupId&&inviteParam),inviteAllowed=groupPrivacy(group)==='public'||isMember||group.ownerUid===state.user.uid||hasValidInvite;
    if(groupPrivacy(group)==='private'&&!inviteAllowed){
      const gate=modal(`<div class="nx-private-group-gate nx-private-request-v214"><span class="nx-private-lock">🔒</span><span class="nx-modal-kicker">PRIVATE STUDY GROUP</span><h2>${esc(group.name)}</h2><p>${esc(group.description||'This group requires approval before you can enter the chat.')}</p><div class="nx-private-meta"><span>📚 ${esc(group.subject||'General')}</span><span>👥 ${Math.max(0,Number(group.memberCount||0))} members</span></div><button class="btn primary" data-v214-request-private>Request to join</button><button class="btn" data-v32-close>Not now</button></div>`);
      gate.querySelector('[data-v214-request-private]').onclick=async e=>{const b=e.currentTarget;b.disabled=true;b.textContent='Sending request…';try{await requestJoinCloud(groupId);b.textContent='✓ Request sent';toast('Request sent to the group admins','success');}catch(error){b.disabled=false;b.textContent='Request to join';toast(error.message||'Could not send join request','error');}};
      return;
    }
    const workspaceGroups=visibleGroups().map(row=>{const liveMembers=state.members.get(row.id);const count=liveMembers?liveMembers.size:Math.max(0,Number(row.memberCount||0));return `<button class="nx-workspace-group ${row.id===groupId?'active':''}" data-v32-open-group="${esc(row.id)}" data-group-search-text="${esc(`${row.name||''} ${row.subject||''}`.toLowerCase())}">${groupLogoMarkup(row,'nx-workspace-avatar')}<span><b>${esc(row.name||'Study Group')}</b><small>${count} ${count===1?'member':'members'} · ${esc(row.subject||'General')}</small></span>${row.id===groupId?'<i>LIVE</i>':''}</button>`;}).join('');
    modal(`<div class="nx-group-room nx-group-workspace"><button class="nx-study-global-close" data-v32-close aria-label="Close study group popup">×</button>
      <aside class="nx-workspace-list nx-study-popup-nav">
        <div class="nx-study-popup-title"><button data-v32-close aria-label="Close study group">←</button><div><strong>Study Group</strong><small>Community workspace</small></div></div>
        <nav class="nx-study-popup-menu" aria-label="Study group sections">
          <button class="active" data-study-view="chats"><span>💬</span><b>Chats</b></button>
          <button data-study-view="media"><span>🖼️</span><b>Media</b></button>
          <button data-study-view="profile"><span>👥</span><b>Members & Info</b></button>
          <button data-study-view="notifications"><span>🔔</span><b>Notifications</b><i id="v33MuteState">${groupPrefs(groupId).muted?'Muted':'On'}</i></button>
          <button data-study-view="saved"><span>⭐</span><b>Saved</b></button>
          <button data-study-view="resources"><span>📚</span><b>Resources</b></button>
          <button data-study-view="wallpaper"><span>🎨</span><b>Wallpapers</b></button>
          ${isOwner()?'<button class="nx-study-danger-nav" data-study-delete-group><span>🗑</span><b>Delete Group</b></button>':''}
        </nav>
      </aside>
      <section class="nx-workspace-chat">
        <header class="nx-group-room-head"><button class="nx-group-avatar" data-group-info aria-label="Group info">${`<img data-group-logo src="${esc(group.avatarURL||DEFAULT_GROUP_ICON)}" alt="${esc(group.name)} logo" loading="lazy" decoding="async">`}</button><div class="nx-group-title"><h2>${esc(group.name)}</h2><p>${esc(group.subject||'Study Group')} · <span id="v32GroupMemberCount">…</span> members</p></div><button class="nx-room-action" data-menu-search aria-label="Search messages">⌕</button><span class="nx-live-dot">LIVE</span><button class="nx-room-menu-btn" data-group-menu aria-label="Group menu">⋮</button></header>
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
    paintGroupWallpaper(messageBox,initialWallpaper);
    // V149: cached messages are useful immediately; realtime refresh happens after first paint.
    drawGroupMessages(groupId);
    groupListSearch?.addEventListener('input',()=>{const q=groupListSearch.value.trim().toLowerCase();document.querySelectorAll('#v32WorkspaceGroups [data-group-search-text]').forEach(card=>{card.hidden=!!q&&!card.dataset.groupSearchText.includes(q);});});
    async function refreshMembers(){try{const snap=await (fb.getDocsFromServer||fb.getDocs)(fb.collection(fb.db,'groups',groupId,'members'));if(groupSignal.aborted)return;members=snap.docs.map(d=>enrichMemberIdentity({id:d.id,...d.data()}));group.memberCount=members.length;state.members.set(groupId,new Set(members.map(m=>m.id)));state.memberRecords.set(groupId,members.slice());isMember=members.some(m=>m.id===state.user.uid);const count=$('#v32GroupMemberCount');if(count)count.textContent=String(members.length);}catch(_){const count=$('#v32GroupMemberCount');if(count)count.textContent=String(Math.max(0,Number(group.memberCount||0)));}}
    async function syncMemberCount(){if(!isAdmin())return;try{await fb.updateDoc(fb.doc(fb.db,'groups',groupId),{memberCount:members.length,updatedAtMs:Date.now()});group.memberCount=members.length;}catch(_){}}
    function orphanOwnerMissing(){const ownerUid=String(group.ownerUid||'').trim();return !ownerUid||!members.some(m=>m.id===ownerUid);}
    async function repairLegacyOwnership(){
      if(!state.user||!hasOwnerRole()||!orphanOwnerMissing())throw new Error('Legacy owner repair is only available when your membership is already marked owner and the group owner record is missing.');
      const groupRef=fb.doc(fb.db,'groups',groupId),meRef=fb.doc(fb.db,'groups',groupId,'members',state.user.uid);
      let claimed=false;
      await fb.runTransaction(fb.db,async tx=>{
        const gSnap=await tx.get(groupRef),meSnap=await tx.get(meRef);if(!gSnap.exists()||!meSnap.exists())return;
        const data=gSnap.data()||{},ownerUid=String(data.ownerUid||'').trim();
        if(ownerUid){const ownerSnap=await tx.get(fb.doc(fb.db,'groups',groupId,'members',ownerUid));if(ownerSnap.exists())return;}
        tx.update(groupRef,{ownerUid:state.user.uid,ownerName:userName(),updatedAtMs:Date.now()});
        tx.update(meRef,{role:'owner'});claimed=true;
      });
      if(!claimed)throw new Error('The group owner record could not be repaired.');group.ownerUid=state.user.uid;group.ownerName=userName();const me=members.find(m=>m.id===state.user.uid);if(me)me.role='owner';const verify=await fb.getDoc(groupRef);if(!verify.exists()||verify.data()?.ownerUid!==state.user.uid)throw new Error('Owner repair was not confirmed by Firestore.');toast('Legacy owner record repaired. Delete/admin controls are now available.','success');return true;
    }
    function syncOpenGroupRealtime(){
      if(groupSignal.aborted)return;
      try{state.activeGroupMembersUnsub?.();}catch(_){}try{state.activeGroupDocUnsub?.();}catch(_){}
      state.activeGroupMembersUnsub=fb.onSnapshot(fb.collection(fb.db,'groups',groupId,'members'),async snap=>{
        if(groupSignal.aborted)return;
        const wasMember=isMember;
        const previousMembershipSignature=members.map(m=>`${m.id}:${m.name||''}:${m.username||''}:${m.photoURL||''}:${m.role||''}`).join('|');const previousInfoSignature=previousMembershipSignature;
        members=snap.docs.map(d=>enrichMemberIdentity({id:d.id,...d.data()}));
        // Firestore can emit a cached membership snapshot immediately after a join.
        // Do not regress a membership already confirmed by the join transaction/API.
        if(isMember&&!members.some(m=>m.id===state.user.uid)&&fb.getDocFromServer){
          try{const confirmed=await fb.getDocFromServer(fb.doc(fb.db,'groups',groupId,'members',state.user.uid));if(confirmed.exists())members.push(enrichMemberIdentity({id:confirmed.id,...confirmed.data()}));}catch(_){}
        }
        if(groupSignal.aborted)return;
        const nextMembershipSignature=members.map(m=>`${m.id}:${m.name||''}:${m.username||''}:${m.photoURL||''}:${m.role||''}`).join('|');
        group.memberCount=members.length;state.members.set(groupId,new Set(members.map(m=>m.id)));state.memberRecords.set(groupId,members.slice());isMember=members.some(m=>m.id===state.user.uid);
        const receiptSignature=members.map(m=>`${m.id}:${Number(m.lastDeliveredAtMs||0)}:${Number(m.lastReadAtMs||0)}`).join('|');
        if(syncOpenGroupRealtime._receiptSignature!==receiptSignature){syncOpenGroupRealtime._receiptSignature=receiptSignature;requestAnimationFrame(()=>updateVisibleReceiptStatuses(groupId));}
        if(wasMember!==isMember)subscribeMessages();
        // Receipt-only member snapshots are frequent. Do not rebuild controls/info for them.
        if(previousMembershipSignature!==nextMembershipSignature){const count=$('#v32GroupMemberCount');if(count)count.textContent=String(members.length);renderActions();}
        if(orphanOwnerMissing())console.warn('[NEXZO Community] group owner record is incomplete; no automatic ownership mutation was performed.');
        const nextInfoSignature=members.map(m=>`${m.id}:${m.name||''}:${m.username||''}:${m.photoURL||''}:${m.role||''}`).join('|');if(previousInfoSignature!==nextInfoSignature&&!info.hidden&&info.querySelector('.nx-info-cover'))showInfo().catch(()=>{});
      },error=>console.warn('[NEXZO Community] active group member sync unavailable',error));
      state.activeGroupDocUnsub=fb.onSnapshot(fb.doc(fb.db,'groups',groupId),snap=>{
        if(!snap.exists()){closeModal();renderGroups();return;}
        const cloudData=snap.data()||{},mediaMeta=readGroupMediaMeta(groupId),localAvatarPending=Boolean(mediaMeta.avatarPending),localWallpaperPending=Boolean(mediaMeta.wallpaperPending);
        const keepAvatar=localAvatarPending?group.avatarURL:'',keepWallpaper=localWallpaperPending?group.wallpaperURL:'';
        Object.assign(group,cloudData);
        if(localAvatarPending&&keepAvatar)group.avatarURL=keepAvatar;if(localWallpaperPending&&keepWallpaper)group.wallpaperURL=keepWallpaper;
        paintGroupWallpaper(messageBox,effectiveGroupWallpaper(group));
        const row=state.groups.find(g=>g.id===groupId);if(row&&row!==group)Object.assign(row,group);
        const actionSignature=JSON.stringify([isMember,group.name,group.privacy,group.permissions]);if(syncOpenGroupRealtime._actionSignature!==actionSignature){syncOpenGroupRealtime._actionSignature=actionSignature;renderActions();}
        const title=document.querySelector('.nx-group-room .nx-group-title h2');if(title)title.textContent=group.name||'Study Group';
        if(!info.hidden&&info.querySelector('.nx-info-cover'))showInfo().catch(()=>{});
      },error=>console.warn('[NEXZO Community] active group sync unavailable',error));
    }
    let renderedActionState='';
    function renderActions(){
      if(groupSignal.aborted)return;
      const actionState=JSON.stringify([isMember,canSend(),group.name,groupPrivacy(group)]);
      if(actionState===renderedActionState)return;
      renderedActionState=actionState;
      actions.innerHTML=isMember?(canSend()?`<div id="v300ReplyPreview" class="nx-reply-preview" hidden></div><div class="nx-group-composer"><button class="nx-compose-icon" data-attach aria-label="Attach">＋</button><button class="nx-compose-icon" data-emoji aria-label="Emoji">☺</button><input id="v32GroupMessage" maxlength="1000" autocomplete="off" placeholder="Message ${esc(group.name)}"><button class="nx-send-btn" type="button" data-v32-send-group="${esc(groupId)}" aria-label="Send message">➤</button></div>`:`<div class="nx-group-join-panel"><p>Only admins can send messages right now.</p></div>`):`<div class="nx-group-join-panel"><p>${groupPrivacy(group)==='private'?'You opened a valid private-group invite. Join to read and send messages.':'Join this public group to read and send messages.'}</p><button class="btn primary" data-v32-join-group="${esc(groupId)}">Join Group</button></div>`;
      const input=$('#v32GroupMessage');requestAnimationFrame(()=>input?.focus({preventScroll:true}));
      // V150 Discord/WhatsApp-style member mentions. Typing @ always opens the live group-member picker.
      let mentionIndex=0,mentionLoad=null;
      const closeMentionList=()=>{actions.querySelector('.nx-mention-autocomplete')?.remove();mentionIndex=0;};
      const mentionMatch=()=>{if(!input)return null;const pos=input.selectionStart??input.value.length,left=input.value.slice(0,pos),match=left.match(/(^|\s)@([^\s@]*)$/u);return match?{pos,match,q:String(match[2]||'').toLowerCase()}:null;};
      const chooseMention=(uid,handle)=>{const token=mentionMatch();if(!token)return;const value=input.value,start=token.pos-token.match[2].length-1;input.value=value.slice(0,start)+`@${handle} `+value.slice(token.pos);input.dataset.mentionUid=uid||'';input.dataset.mentionHandle=handle;closeMentionList();input.focus();const caret=start+handle.length+2;input.setSelectionRange(caret,caret);input.dispatchEvent(new Event('change',{bubbles:true}));};
      const ensureMentionMembers=async()=>{if(members.length>1)return members;if(mentionLoad)return mentionLoad;mentionLoad=(async()=>{try{const snap=await fb.getDocs(fb.collection(fb.db,'groups',groupId,'members'));if(groupSignal.aborted)return members;const fresh=snap.docs.map(d=>enrichMemberIdentity({id:d.id,...d.data()}));if(fresh.length){members=fresh;group.memberCount=fresh.length;state.members.set(groupId,new Set(fresh.map(m=>m.id)));state.memberRecords.set(groupId,fresh.slice());const count=$('#v32GroupMemberCount');if(count)count.textContent=String(fresh.length);}}catch(error){console.warn('[NEXZO Community] mention member lookup unavailable',error);}return members;})().finally(()=>{mentionLoad=null;});return mentionLoad;};
      const paintMentionList=(q='',loading=false)=>{closeMentionList();const options=[];if(isAdmin()&&(!q||'all'.startsWith(q)||'everyone'.startsWith(q)))options.push({id:'@all',handle:'all',name:'Everyone',role:'Notify everyone',photoURL:''});if(!q||'admins'.startsWith(q)||'admin'.startsWith(q))options.push({id:'@admins',handle:'admins',name:'Admins',role:'Notify group admins',photoURL:''});for(const m of members){const handle=String(m.username||normalizeCommunityHandle(m.name||'member')).replace(/^@/,'');const hay=`${handle} ${m.name||''}`.toLowerCase();if(!q||hay.includes(q))options.push({id:m.id,handle,name:m.id===state.user.uid?'You':m.name||'Member',role:memberRoleLabel(m),photoURL:m.photoURL||''});if(options.length>=10)break;}const list=document.createElement('div');list.className='nx-mention-autocomplete';list.setAttribute('role','listbox');list.innerHTML=loading&&!options.length?'<div class="nx-mention-loading">Loading group members…</div>':options.length?options.map((o,i)=>`<button type="button" role="option" class="${i===0?'active':''}" data-mention-choice="${esc(o.id)}" data-handle="${esc(o.handle)}">${o.photoURL?`<span class="nx-mention-avatar"><img src="${esc(o.photoURL)}" alt="" loading="lazy"></span>`:`<span class="nx-mention-avatar">${esc((o.name||'@')[0].toUpperCase())}</span>`}<b>${esc(o.name)}</b><small>@${esc(o.handle)} · ${esc(o.role)}</small></button>`).join(''):'<div class="nx-mention-empty">No matching group member</div>';actions.appendChild(list);list.addEventListener('mousedown',e=>e.preventDefault());list.addEventListener('click',e=>{const b=e.target.closest('[data-mention-choice]');if(b)chooseMention(b.dataset.mentionChoice,b.dataset.handle);});mentionIndex=0;};
      const refreshMentionPicker=async()=>{const token=mentionMatch();if(!token){closeMentionList();return;}paintMentionList(token.q,members.length<=1);await ensureMentionMembers();const latest=mentionMatch();if(latest)paintMentionList(latest.q,false);};
      input?.addEventListener('input',refreshMentionPicker);
      input?.addEventListener('click',()=>{if(mentionMatch())refreshMentionPicker();});
      input?.addEventListener('keydown',e=>{const list=actions.querySelector('.nx-mention-autocomplete'),choices=list?[...list.querySelectorAll('[data-mention-choice]')]:[];if(list&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();mentionIndex=(mentionIndex+(e.key==='ArrowDown'?1:-1)+choices.length)%Math.max(choices.length,1);choices.forEach((b,i)=>b.classList.toggle('active',i===mentionIndex));choices[mentionIndex]?.scrollIntoView({block:'nearest'});return;}if(e.key==='Escape'&&list){e.preventDefault();closeMentionList();return;}if(e.key==='Enter'&&!e.shiftKey){if(list&&choices.length){e.preventDefault();const selected=choices[mentionIndex]||choices[0];chooseMention(selected.dataset.mentionChoice,selected.dataset.handle);return;}e.preventDefault();actions.querySelector('[data-v32-send-group]')?.click();}});
    }
    let lastMessageSignature='',receiptDeliveredAt=0,receiptReadAt=0,receiptWriteTimer=0;
    function publishReceipt(latestMs,markRead=false){
      const target=Number(latestMs||0);if(!target||!isMember||groupSignal.aborted)return;
      const nextDelivered=Math.max(receiptDeliveredAt,target),nextRead=markRead?Math.max(receiptReadAt,target):receiptReadAt;
      if(nextDelivered===receiptDeliveredAt&&nextRead===receiptReadAt)return;
      receiptDeliveredAt=nextDelivered;receiptReadAt=nextRead;
      clearTimeout(receiptWriteTimer);receiptWriteTimer=setTimeout(()=>{
        if(groupSignal.aborted)return;
        const patch={lastDeliveredAtMs:receiptDeliveredAt};if(receiptReadAt)patch.lastReadAtMs=receiptReadAt;
        fb.updateDoc(fb.doc(fb.db,'groups',groupId,'members',state.user.uid),patch).catch(error=>console.warn('[NEXZO Community] receipt sync unavailable',error));
      },220);
    }
    function markVisibleMessagesRead(){if(document.visibilityState!=='visible')return;const rows=state.messages.get(groupId)||[],latest=rows.at(-1);if(latest)publishReceipt(latest.createdAtMs,true);}
    document.addEventListener('visibilitychange',markVisibleMessagesRead,{signal:groupSignal});
    function subscribeMessages(){try{state.groupMessageUnsub?.();}catch(_){}state.groupMessageUnsub=null;if(!isMember){state.messages.set(groupId,[]);drawGroupMessages(groupId);connection.textContent='Join required';connection.className='nx-group-connection warning';return;}connection.textContent='● Connected';connection.className='nx-group-connection online';state.groupMessageUnsub=fb.onSnapshot(fb.query(fb.collection(fb.db,'groups',groupId,'messages'),fb.orderBy('createdAtMs','desc'),fb.limit(30)),snap=>{let rows=snap.docs.map(d=>({id:d.id,...d.data()})).reverse();const me=members.find(m=>m.id===state.user.uid);if(permissions().historyVisible===false&&!isAdmin()&&me)rows=rows.filter(m=>Number(m.createdAtMs||0)>=Number(me.joinedAtMs||0));const latest=rows.at(-1);if(latest)publishReceipt(latest.createdAtMs,document.visibilityState==='visible');const signature=rows.map(m=>`${m.id}:${m.updatedAtMs||m.editedAtMs||m.createdAtMs||0}:${JSON.stringify(m.reactions||{})}`).join('|');if(signature===lastMessageSignature)return;lastMessageSignature=signature;state.messages.set(groupId,rows);drawGroupMessages(groupId,$('#v32GroupSearch input')?.value||'');},error=>{connection.textContent=error?.code==='permission-denied'?'Deploy Firestore rules to use shared chat':'Chat disconnected';connection.className='nx-group-connection error';});}
    function showPopup(html,key='generic'){popup.innerHTML=html;popup.dataset.popupKey=key;popup.hidden=false;}function hidePopup(){popup.hidden=true;popup.innerHTML='';delete popup.dataset.popupKey;}function togglePopup(key,htmlFactory){if(!popup.hidden&&popup.dataset.popupKey===key){hidePopup();return false;}showPopup(typeof htmlFactory==='function'?htmlFactory():htmlFactory,key);return true;}
    function setActiveStudyView(view){document.querySelectorAll('.nx-study-popup-menu [data-study-view]').forEach(btn=>btn.classList.toggle('active',btn.dataset.studyView===view));}
    async function applyBuiltinWallpaper(url){
      if(!isOwner())return toast('Only the group owner can change the group wallpaper.','error');
      const chosen=BUILTIN_GROUP_WALLPAPERS.find(row=>row.url===url);if(!chosen)return;
      const previous=group.wallpaperURL||DEFAULT_GROUP_WALLPAPER;
      group.wallpaperURL=chosen.url;
      paintGroupWallpaper(messageBox,chosen.url);
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
      const selected=effectiveGroupWallpaper(group);
      showPopup(`<div class="nx-wallpaper-picker"><header><div class="nx-wallpaper-title"><span class="nx-wallpaper-icon">▣</span><div><b>Chat wallpaper</b><small>15 built-in wallpapers · Study Group only</small></div></div><button data-close-popup aria-label="Close wallpaper picker">×</button></header><div class="nx-wallpaper-tabs"><button class="active" type="button">▣ <span>Built-in</span></button>${isOwner()?'<button type="button" data-custom-wallpaper>↥ <span>Upload</span></button>':''}</div><div class="nx-wallpaper-preview"><img src="${esc(selected)}" alt="Selected wallpaper preview"><div><b>Wallpaper preview</b><small>Preview your selected background before applying.</small></div></div><div class="nx-wallpaper-grid">${BUILTIN_GROUP_WALLPAPERS.map(w=>`<button class="${selected===mediaURL(w.url)?'selected':''}" data-wallpaper-choice="${esc(w.url)}"><i><img src="${esc(w.url)}" alt="${esc(w.name)} wallpaper" loading="lazy"></i><span>${esc(w.name)}</span></button>`).join('')}</div>${!isOwner()?'<p class="nx-wallpaper-owner-note">Only the group owner can change the wallpaper.</p>':''}<footer><button type="button" class="nx-wallpaper-secondary" data-close-popup>Cancel</button>${isOwner()?'<button type="button" class="nx-wallpaper-apply" data-wallpaper-apply>✓ Apply Wallpaper</button>':''}</footer></div>`,'wallpaper');popup.dataset.selectedWallpaper=selected;
    }
    function showQualityPicker(){
      setActiveStudyView('quality');const key=`nexzo_group_media_quality:${state.user.uid}`;const current=localStorage.getItem(key)||'Standard';
      showPopup(`<div class="nx-quality-picker"><header><b>Media upload quality</b><button data-close-popup>×</button></header><button data-quality="Standard" class="${current==='Standard'?'selected':''}"><span>Standard quality<small>Faster uploads and less storage.</small></span><i></i></button><button data-quality="HD" class="${current==='HD'?'selected':''}"><span>HD quality<small>Higher image quality with larger file size.</small></span><i></i></button></div>`,'quality');
    }
    function myMember(){return members.find(m=>m.id===state.user.uid)||null;}
    function hasOwnerRole(){return myMember()?.role==='owner';}
    function isOwner(){return group.ownerUid===state.user.uid;}
    function isAdmin(){return isOwner()||myMember()?.role==='admin';}
    function canEditGroup(){return isAdmin()||permissions().membersCanEdit;}
    function canInvite(){return isAdmin()||permissions().membersCanInvite;}
    function canSend(){return isAdmin()||permissions().membersCanSend;}
    function permissions(){return {membersCanSend:true,membersCanInvite:true,membersCanEdit:false,historyVisible:true,approvalRequired:false,disappearingMessagesMs:0,...(group.permissions||{})};}
    function showMenu(){const muted=!!groupPrefs(groupId).muted;showPopup(`<button data-menu-info>ⓘ <span>Group info</span></button><button data-menu-search>⌕ <span>Search messages</span></button>${canInvite()?'<button data-menu-invite>🔗 <span>Invite via link</span></button>':''}${isOwner()?'<button data-menu-reset-invite>↻ <span>Reset invite link</span></button>':''}<button data-menu-wallpaper>🖼️ <span>Chat wallpaper</span></button><button data-menu-mute>🔕 <span>${muted?'Unmute':'Mute'} notifications</span></button><button data-menu-clear>⌫ <span>Clear chat for me</span></button>${isOwner()?'<button data-menu-permissions>⚙ <span>Group permissions</span></button>':''}${isAdmin()&&permissions().approvalRequired?'<button data-menu-requests>👤 <span>Join requests</span></button>':''}${isOwner()?'<button class="danger" data-menu-delete-group>🗑 <span>Delete group</span></button>':''}${isMember&&!isOwner()?'<button class="danger" data-menu-exit>↪ <span>Exit group</span></button>':''}`,'menu');}
    function mediaMarkup(media){return media.slice(-12).map(m=>m.attachment.kind==='image'||m.attachment.kind==='gif'||m.attachment.kind==='sticker'?`<a href="${esc(m.attachment.url)}" target="_blank"><img src="${esc(m.attachment.url)}" alt="Shared media"></a>`:`<a class="doc" href="${esc(m.attachment.url)}" target="_blank">${m.attachment.kind==='audio'?'🎧':'📄'}</a>`).join('')||'<small>No shared media yet.</small>';}
    async function showInfo(){const media=(state.messages.get(groupId)||[]).filter(m=>m.attachment?.url);info.innerHTML=`<header><button data-info-close>←</button><b>Group info</b></header><div class="nx-info-scroll"><div class="nx-info-cover" style="--nx-cover:url('${esc(group.wallpaperURL||DEFAULT_GROUP_WALLPAPER)}')"><div class="nx-info-hero"><button class="nx-info-avatar" ${isOwner()?'data-info-avatar':''} aria-label="${isOwner()?'Change group icon':'Group icon'}">${`<img data-group-logo src="${esc(group.avatarURL||DEFAULT_GROUP_ICON)}" alt="${esc(group.name)} logo" loading="lazy" decoding="async">`}${isOwner()?'<i>✎</i>':''}</button><h2>${esc(group.name)}</h2><p class="nx-info-meta">${groupPrivacy(group)==='private'?'🔒 Private group':'🌐 Public group'} · <b>${members.length} members</b></p><p>${esc(group.description||'No group description yet.')}</p>${isOwner()?`<div class="nx-info-media-controls"><button data-info-avatar>Replace logo</button>${group.avatarURL?'<button data-info-remove-avatar>Remove logo</button>':''}<button data-info-wallpaper>Change wallpaper</button></div>`:''}</div></div><div class="nx-info-actions">${canInvite()?'<button data-info-invite>🔗<span>Invite</span></button>':''}<button data-info-search>⌕<span>Search</span></button>${canEditGroup()?'<button data-info-edit>✎<span>Edit</span></button>':''}</div><section><h3>Media, links and docs <span>${media.length}</span></h3><div class="nx-media-grid">${mediaMarkup(media)}</div></section><section><h3>${members.length} members <span>⌕</span></h3><div class="nx-member-list">${members.map(m=>`<div data-member-row="${esc(m.id)}"><span class="nx-member-photo">${m.photoURL?`<img src="${esc(m.photoURL)}">`:esc((m.name||'?')[0].toUpperCase())}</span><span><b>${m.id===state.user.uid?'You':esc(m.name||'Member')}</b><small>${m.role==='owner'?'Owner 👑':m.role==='admin'?'Admin 🛡️':'Member'}</small></span>${m.id!==state.user.uid?`<button class="nx-member-more" data-member-menu="${esc(m.id)}" aria-label="Member options" aria-haspopup="menu" aria-expanded="false">⌄</button>`:''}</div>`).join('')}</div></section><section class="nx-info-settings"><button data-info-mute>🔔 <span>Notification settings</span><b>${groupPrefs(groupId).muted?'Muted':'On'}</b></button>${isOwner()?'<button data-info-permissions>⚙ <span>Group permissions</span><b>›</b></button>':''}${isAdmin()&&permissions().approvalRequired?'<button data-info-requests>👤 <span>Join requests</span><b>›</b></button>':''}${orphanOwnerMissing()&&hasOwnerRole()?'<button data-info-repair-owner>🛠 <span>Repair legacy owner record</span><b>›</b></button>':''}${isOwner()?'<button data-info-reset-invite>↻ <span>Reset invite link</span><b>›</b></button><button class="danger" data-info-delete-group>🗑 <span>Delete group</span><b>›</b></button>':''}<button class="danger" data-info-clear>⌫ <span>Clear chat for me</span><b>›</b></button></section></div>`;info.hidden=false;}
    async function invite(){if(!canInvite())return toast('Only admins or permitted members can invite people.','error');let code='';if(groupPrivacy(group)==='private'){try{const out=await groupAdminApi(`/groups/${encodeURIComponent(groupId)}/invite`);code=String(out?.inviteCode||'').trim();}catch(error){try{const snap=await fb.getDoc(fb.doc(fb.db,'groups',groupId,'private','invite'));code=snap.exists()?String(snap.data()?.code||'').trim():'';}catch{}if(!code)return toast(error?.message||'Invite code is unavailable. Ask the owner to reset the invite link.','error');}}const url=`${location.origin}${location.pathname}?joinGroup=${encodeURIComponent(groupId)}${groupPrivacy(group)==='private'?`&code=${encodeURIComponent(code)}`:''}`;const text=`Join my NEXZO study group “${group.name}”\n${url}${groupPrivacy(group)==='private'?`\nInvite code: ${code}`:''}`;try{await navigator.clipboard.writeText(text);toast('Invite link copied','success');}catch(_){await communityPrompt('Copy group invite',text,{message:'Clipboard access is unavailable. Copy the invite below.',confirmText:'Close'});}}
    async function resetInviteLink(){
      if(!isOwner())throw new Error('Only the owner can reset the invite link.');
      let inviteCode='';
      try{const out=await groupAdminApi(`/groups/${encodeURIComponent(groupId)}/reset-invite`,{method:'POST'});inviteCode=String(out?.inviteCode||'');}
      catch(_){inviteCode=randomCode();await fb.setDoc(fb.doc(fb.db,'groups',groupId,'private','invite'),{code:inviteCode,updatedAtMs:Date.now()},{merge:true});await fb.updateDoc(fb.doc(fb.db,'groups',groupId),{inviteCode:'',updatedAtMs:Date.now(),schemaVersion:240});}
      const verify=await fb.getDoc(fb.doc(fb.db,'groups',groupId,'private','invite'));if(!verify.exists()||String(verify.data()?.code||'')!==inviteCode)throw new Error('New invite code could not be verified.');
      group.inviteCode='';toast('Old invite link revoked. New invite link is ready.','success');
      return inviteCode;
    }
    async function requestJoin(){const result=await requestJoinCloud(groupId);return {requested:Boolean(result?.requested),status:result?.status||'pending'};}
    async function showJoinRequests(){if(!isAdmin())return;let rows=[];try{const data=await groupAdminApi(`/groups/${encodeURIComponent(groupId)}/join-requests`);rows=Array.isArray(data?.requests)?data.requests.filter(r=>r.status==='pending'):[];}catch(primary){const snap=await fb.getDocs(fb.collection(fb.db,'groups',groupId,'joinRequests'));rows=snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>r.status==='pending');}info.innerHTML=`<header><button data-requests-back>←</button><b>Join requests</b></header><div class="nx-info-scroll"><section><h3>Pending requests <span>${rows.length}</span></h3><div class="nx-member-list">${rows.length?rows.map(r=>`<div><span class="nx-member-photo">${r.photoURL?`<img src="${esc(r.photoURL)}">`:esc((r.name||'?')[0])}</span><span><b>${esc(r.name||'Student')}</b><small>@${esc(r.username||'student')}</small></span><div class="nx-request-actions"><button data-approve-request="${esc(r.id)}">Approve</button><button class="danger" data-reject-request="${esc(r.id)}">Reject</button></div></div>`).join(''):'<small>No pending requests.</small>'}</div></section></div>`;info.hidden=false;}
    async function approveRequest(uid){if(!isAdmin())throw new Error('Admin access required.');try{await groupAdminApi(`/groups/${encodeURIComponent(groupId)}/join-requests/${encodeURIComponent(uid)}/approve`,{method:'POST'});}catch(primary){if(!isOwner())throw Object.assign(new Error('Approval fallback requires the group owner while the backend is unavailable.'),{cause:primary});const requestRef=fb.doc(fb.db,'groups',groupId,'joinRequests',uid),memberRef=fb.doc(fb.db,'groups',groupId,'members',uid),groupRef=fb.doc(fb.db,'groups',groupId);await fb.runTransaction(fb.db,async tx=>{const [reqSnap,memberSnap,groupSnap]=await Promise.all([tx.get(requestRef),tx.get(memberRef),tx.get(groupRef)]);if(!reqSnap.exists())throw new Error('Join request no longer exists.');if(!groupSnap.exists())throw new Error('Group no longer exists.');const req=reqSnap.data()||{},g=groupSnap.data()||{};tx.update(requestRef,{status:'approved',updatedAtMs:Date.now()});if(!memberSnap.exists()){tx.set(memberRef,{uid,name:String(req.name||'Student').slice(0,100),username:String(req.username||'student').replace(/^@/,'').toLowerCase(),photoURL:String(req.photoURL||'').slice(0,2048),role:'member',joinedAtMs:Date.now()});tx.update(groupRef,{memberCount:Math.max(1,Number(g.memberCount||1))+1,updatedAtMs:Date.now()});}});const verify=await fb.getDoc(memberRef);if(!verify.exists())throw new Error('Approved member was not confirmed in Firestore.');}await refreshMembers();}
    async function deleteGroup(){
      if(!isOwner())return toast('Delete unavailable: your membership is not recognized as the group owner. Open Members & Info and verify the owner record.','error');
      const typed=await communityPrompt('Permanently delete group','',{message:`Type DELETE to permanently remove “${group.name}”, its members, messages and join requests.`,placeholder:'Type DELETE',confirmText:'Continue'});
      if(typed!=='DELETE')return;
      connection.textContent='Deleting group…';connection.className='nx-group-connection warning';
      let backendError=null;
      try{await groupAdminApi(`/groups/${encodeURIComponent(groupId)}`,{method:'DELETE',noRetry:true});}catch(error){backendError=error;}
      try{
        let verify=await fb.getDocFromServer(fb.doc(fb.db,'groups',groupId));
        if(verify.exists()&&backendError){
          const refs=[];
          for(const sub of ['messages','joinRequests','members','private']){const snap=await fb.getDocs(fb.collection(fb.db,'groups',groupId,sub));snap.docs.forEach(d=>refs.push(d.ref));}
          if(refs.length>430)throw new Error('This group is too large for browser deletion. Restore the NEXZO backend and retry.');
          const batch=fb.writeBatch(fb.db);refs.forEach(ref=>batch.delete(ref));batch.delete(fb.doc(fb.db,'groups',groupId));await batch.commit();
          verify=await fb.getDocFromServer(fb.doc(fb.db,'groups',groupId));
        }
        if(verify.exists())throw backendError||new Error('Delete was not confirmed by Firestore.');
        try{state.activeGroupMembersUnsub?.();}catch(_){}try{state.activeGroupDocUnsub?.();}catch(_){}groupScope.abort();
        state.groups=state.groups.filter(row=>row.id!==groupId);state.myGroupIds.delete(groupId);state.members.delete(groupId);state.messages.delete(groupId);saveOffline(true);closeModal();render();toast('Study group permanently deleted.','success');
      }catch(error){const code=String(error?.code||backendError?.code||'').replace(/^firestore\//,'');const reason=code.includes('permission-denied')?'Permission denied — deploy the latest Firestore rules or repair the legacy owner record.':code.includes('unauthenticated')?'Your Firebase session expired. Sign in again and retry.':(error?.message||backendError?.message||'Could not delete the group.');connection.textContent='● Delete failed — group was kept';connection.className='nx-group-connection warning';toast(reason,'error');}
    }
    function memberActionError(error,fallback='Action failed'){
      console.error('[NEXZO Community] member action failed',error);
      const code=String(error?.code||'');
      const message=code.includes('permission-denied')
        ? 'This action is not allowed for your role. Refresh after deploying the latest Firestore rules.'
        : code.includes('not-found')
          ? 'This member is no longer in the group.'
          : (error?.message||fallback);
      toast(message,'error');
    }
    async function copyTextReliable(text){
      const value=String(text||'');
      if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(value);return true;}catch(_){}}
      try{const ta=document.createElement('textarea');ta.value=value;ta.setAttribute('readonly','');Object.assign(ta.style,{position:'fixed',left:'-9999px',top:'0',opacity:'0'});document.body.appendChild(ta);ta.focus();ta.select();ta.setSelectionRange(0,value.length);const ok=document.execCommand?.('copy');ta.remove();return !!ok;}catch(_){return false;}
    }
    function memberRoleLabel(member){return member?.role==='owner'?'Owner 👑':member?.role==='admin'?'Admin 🛡️':'Member';}
    function memberAvatarMarkup(member){return member?.photoURL?`<img src="${esc(member.photoURL)}" alt="${esc(member.name||'Member')}">`:esc((member?.name||'?')[0].toUpperCase());}
    function closeMemberMenu(){
      document.querySelector('.nx-member-action-sheet')?.remove();
      document.querySelectorAll('[data-member-menu][aria-expanded="true"]').forEach(btn=>btn.setAttribute('aria-expanded','false'));
    }
    function showMemberCard(member){
      if(!member)return toast('Member details are unavailable.','error');
      closeMemberMenu();
      document.querySelector('.nx-member-detail-card')?.remove();
      const handle=`@${member.username||'student'}`;
      const card=document.createElement('div');
      card.className='nx-member-detail-card';
      card.innerHTML=`<button type="button" class="nx-member-detail-backdrop" data-close-member-card aria-label="Close member details"></button><section role="dialog" aria-modal="true" aria-label="Member details"><button type="button" class="nx-member-detail-close" data-close-member-card aria-label="Close">×</button><span class="nx-member-detail-photo">${memberAvatarMarkup(member)}</span><h3>${esc(member.name||'Member')}</h3><p>${esc(handle)}</p><b>${esc(memberRoleLabel(member))}</b><div class="nx-member-detail-actions"><button type="button" data-message-member-card="${esc(member.id)}">💬 Message privately</button><button type="button" data-copy-member-card="${esc(member.id)}">@ Copy username</button><button type="button" data-mention-member-card="${esc(member.id)}">↪ Mention in chat</button></div></section>`;
      document.body.appendChild(card);
    }
    async function changeMemberRole(uid){
      if(!isOwner())throw new Error('Only the group owner can change admin roles.');
      const member=members.find(m=>m.id===uid);if(!member)throw Object.assign(new Error('Member not found.'),{code:'not-found'});
      if(member.role==='owner')throw new Error('The owner role cannot be changed.');
      const nextRole=member.role==='admin'?'member':'admin';
      const ref=fb.doc(fb.db,'groups',groupId,'members',uid);
      try{
        await groupAdminApi(`/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(uid)}/role`,{method:'PATCH',body:{role:nextRole}});
      }catch(error){
        try{await fb.updateDoc(ref,{role:nextRole});const verify=await fb.getDoc(ref);if(!verify.exists()||verify.data()?.role!==nextRole)throw new Error('Role change was not confirmed by Firestore.');}
        catch(fallback){if(fallback?.code==='permission-denied')throw Object.assign(new Error('Firebase blocked the role change. Deploy the included Firestore rules, then retry.'),{code:fallback.code});throw Object.assign(fallback,{cause:error});}
      }
      member.role=nextRole;
      return nextRole;
    }
    async function transferOwnership(uid){
      if(!isOwner())throw new Error('Only the current group owner can transfer ownership.');
      if(uid===state.user.uid)throw new Error('You already own this group.');
      const target=members.find(m=>m.id===uid);if(!target)throw Object.assign(new Error('Member not found.'),{code:'not-found'});
      const groupRef=fb.doc(fb.db,'groups',groupId),targetRef=fb.doc(fb.db,'groups',groupId,'members',uid),meRef=fb.doc(fb.db,'groups',groupId,'members',state.user.uid);
      const now=Date.now();
      try{await groupAdminApi(`/groups/${encodeURIComponent(groupId)}/transfer-ownership`,{method:'POST',body:{memberUid:uid}});}
      catch(error){
        try{await fb.runTransaction(fb.db,async tx=>{const [g,t,m]=await Promise.all([tx.get(groupRef),tx.get(targetRef),tx.get(meRef)]);if(!g.exists()||!t.exists()||!m.exists())throw new Error('Ownership records are incomplete.');if(g.data()?.ownerUid!==state.user.uid)throw new Error('You are no longer the group owner.');tx.update(groupRef,{ownerUid:uid,ownerName:String(t.data()?.name||target.name||'Student').slice(0,100),updatedAtMs:now});tx.update(targetRef,{role:'owner'});tx.update(meRef,{role:'admin'});});const verified=await fb.getDoc(groupRef);if(!verified.exists()||verified.data()?.ownerUid!==uid)throw new Error('Ownership transfer was not confirmed by Firestore.');}
        catch(fallback){if(fallback?.code==='permission-denied')throw Object.assign(new Error('Firebase blocked ownership transfer. Deploy the included Firestore rules, then retry.'),{code:fallback.code});throw Object.assign(fallback,{cause:error});}
      }
      group.ownerUid=uid;group.ownerName=target.name||'Student';
      const oldMe=members.find(m=>m.id===state.user.uid);if(oldMe)oldMe.role='admin';
      target.role='owner';
    }
    async function removeMember(uid){
      if(!isAdmin())throw new Error('Only group admins can remove members.');
      const member=members.find(m=>m.id===uid);if(!member)throw Object.assign(new Error('Member not found.'),{code:'not-found'});
      if(member.role==='owner')throw new Error('The group owner cannot be removed.');
      if(!isOwner() && member.role==='admin')throw new Error('Only the owner can remove another admin.');
      const memberRef=fb.doc(fb.db,'groups',groupId,'members',uid),groupRef=fb.doc(fb.db,'groups',groupId);
      try{
        await groupAdminApi(`/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(uid)}`,{method:'DELETE'});
      }catch(error){
        if(!isOwner())throw Object.assign(new Error('Removing another member while the backend is unavailable requires the group owner.'),{cause:error});
        try{await fb.runTransaction(fb.db,async tx=>{const [memberSnap,groupSnap]=await Promise.all([tx.get(memberRef),tx.get(groupRef)]);if(!memberSnap.exists())return;if(!groupSnap.exists())throw new Error('Group no longer exists.');const g=groupSnap.data()||{};tx.delete(memberRef);tx.update(groupRef,{memberCount:Math.max(1,Number(g.memberCount||1)-1),updatedAtMs:Date.now()});});const verify=await fb.getDoc(memberRef);if(verify.exists())throw new Error('Member removal was not confirmed by Firestore.');}
        catch(fallback){if(fallback?.code==='permission-denied')throw Object.assign(new Error('Firebase blocked this member action. Deploy the included Firestore rules, then retry.'),{code:fallback.code});throw Object.assign(fallback,{cause:error});}
      }
      members=members.filter(m=>m.id!==uid);
      group.memberCount=members.length;
    }
    function mentionMember(member){
      const input=$('#v32GroupMessage');if(!input)return toast('Open the chat composer to mention this member.','error');
      const handle=String(member.username||'').replace(/^@/,'')||normalizeCommunityHandle(member.name||'member')||'member';
      const mention=`@${handle} `;
      const start=input.selectionStart??input.value.length,end=input.selectionEnd??start;
      input.value=input.value.slice(0,start)+mention+input.value.slice(end);
      input.dataset.mentionUid=member.id||'';
      input.dataset.mentionHandle=handle;
      input.closest('.nx-group-composer')?.classList.add('has-mention');
      input.focus();input.setSelectionRange(start+mention.length,start+mention.length);
      closeMemberMenu();
      info.hidden=true;
      const composer=input.closest('.nx-group-composer');
      let chip=composer?.querySelector('.nx-active-mention');
      if(composer&&!chip){chip=document.createElement('span');chip.className='nx-active-mention';composer.appendChild(chip);}
      if(chip){chip.innerHTML=`<b>@${esc(handle)}</b><button type="button" aria-label="Remove mention">×</button>`;chip.querySelector('button')?.addEventListener('click',()=>{input.value=input.value.replace(new RegExp(`@${handle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s?`,'i'),'');chip.remove();composer.classList.remove('has-mention');input.focus();},{once:true});}
      toast(`@${handle} added to your message`,'success');
    }
    async function executeMemberAction(action,uid,button){
      const member=members.find(x=>x.id===uid);if(!member)return toast('Member not found. Refresh group info.','error');
      if(button?.dataset.busy==='1')return;
      if(button){button.dataset.busy='1';button.disabled=true;}
      try{
        if(action==='view'){showMemberCard(member);return;}
        if(action==='copy'){const value=`@${member.username||'student'}`;const ok=await copyTextReliable(value);toast(ok?'Username copied':value,ok?'success':'info');return;}
        if(action==='mention'){mentionMember(member);info.hidden=true;return;}
        if(action==='role'){
          const wasAdmin=member.role==='admin';
          if(!await communityConfirm(`${wasAdmin?'Remove admin rights from':'Make'} ${member.name||'this member'}${wasAdmin?'?':' a group admin?'}`,{title:'Change admin role',confirmText:wasAdmin?'Remove admin':'Make admin'}))return;
          await changeMemberRole(uid);await refreshMembers();await showInfo();toast(wasAdmin?'Admin removed':'Group admin added','success');return;
        }
        if(action==='transfer'){
          if(!await communityConfirm(`Transfer group ownership to ${member.name||'this member'}? You will become an admin.`,{title:'Transfer ownership',confirmText:'Transfer ownership',danger:true}))return;
          await transferOwnership(uid);await refreshMembers();await showInfo();toast('Ownership transferred','success');return;
        }
        if(action==='remove'){
          if(!await communityConfirm(`Remove ${member.name||'this member'} from “${group.name}”?`,{title:'Remove member',confirmText:'Remove',danger:true}))return;
          await removeMember(uid);await refreshMembers();await showInfo();toast('Member removed from group','success');return;
        }
      }catch(error){memberActionError(error,'Member action failed.');}
      finally{if(button?.isConnected){button.dataset.busy='0';button.disabled=false;}closeMemberMenu();}
    }
    function openMemberMenu(trigger,uid){
      const member=members.find(m=>m.id===uid);if(!member)return toast('Member not found. Refresh group info.','error');
      const wasOpen=trigger.getAttribute('aria-expanded')==='true';closeMemberMenu();if(wasOpen)return;
      const sheet=document.createElement('div');sheet.className='nx-member-action-sheet';sheet.dataset.memberUid=uid;sheet.setAttribute('role','menu');sheet.setAttribute('aria-label',`${member.name||'Member'} options`);
      const canManageRole=isOwner()&&member.role!=='owner';
      const canRemove=member.role!=='owner'&&(isOwner()||(isAdmin()&&member.role==='member'));
      const canTransfer=isOwner()&&member.role!=='owner';
      sheet.innerHTML=`<div class="nx-member-sheet-profile"><span class="nx-member-sheet-avatar">${memberAvatarMarkup(member)}</span><span><b>${esc(member.name||'Member')}</b><small>${esc(memberRoleLabel(member))}</small></span></div><button type="button" data-member-action="view"><i>ⓘ</i><span><b>View member</b><small>Profile, username and role</small></span></button><button type="button" data-member-action="copy"><i>@</i><span><b>Copy username</b><small>Copy @${esc(member.username||'student')}</small></span></button><button type="button" data-member-action="mention"><i>↪</i><span><b>Mention in chat</b><small>Add this member to your message</small></span></button>${canManageRole?`<hr><button type="button" data-member-action="role"><i>♟</i><span><b>${member.role==='admin'?'Remove admin':'Make group admin'}</b><small>${member.role==='admin'?'Change role to member':'Give admin permissions'}</small></span></button>`:''}${canTransfer?`<button type="button" data-member-action="transfer"><i>♛</i><span><b>Transfer ownership</b><small>Make this member the group owner</small></span></button>`:''}${canRemove?`<hr><button type="button" class="danger" data-member-action="remove"><i>⊖</i><span><b>Remove member</b><small>Remove from this study group</small></span></button>`:''}`;
      document.body.appendChild(sheet);trigger.setAttribute('aria-expanded','true');
      const r=trigger.getBoundingClientRect(),w=Math.min(344,window.innerWidth-24);sheet.style.width=`${w}px`;
      requestAnimationFrame(()=>{const h=sheet.offsetHeight||420;let left=Math.min(window.innerWidth-w-12,Math.max(12,r.right-w));let top=r.bottom+8;if(top+h>window.innerHeight-12)top=Math.max(12,r.top-h-8);sheet.style.left=`${left}px`;sheet.style.top=`${top}px`;});
      sheet.addEventListener('click',e=>{const btn=e.target.closest('button[data-member-action]');if(!btn)return;e.preventDefault();e.stopPropagation();executeMemberAction(btn.dataset.memberAction,uid,btn);});
    }
    document.addEventListener('pointerdown',e=>{if(document.querySelector('.nx-member-action-sheet')&&!e.target.closest('.nx-member-action-sheet')&&!e.target.closest('[data-member-menu]'))closeMemberMenu();},{capture:true,signal:groupSignal});
    window.addEventListener('resize',closeMemberMenu,{passive:true,signal:groupSignal});
    window.addEventListener('scroll',e=>{if(!e.target?.closest?.('.nx-member-action-sheet'))closeMemberMenu();},{capture:true,signal:groupSignal});
    function showEmoji(){
      const sets={
        Recent:['😂','❤️','🔥','👍','🙏','🥳','✨','🎯','😊','😍','😭','😎','🤔','👏','✅','💯'],
        Smileys:['😀','😃','😄','😁','😆','😅','😂','🤣','🥲','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😋','😛','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','🤗','🤔','🫡','🤭','🫢','🤫','🤥','😶','😐','😑','😬','🙄','😯','😴','🤤','😪','😵','🤐','🤢','🤮','🤧','😷','🤒','🤕'],
        People:['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🧠','👀','👁️','👄','🫂'],
        Animals:['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🦄','🐝','🦋','🐌','🐞','🐜','🕷️','🐢','🐍','🦎','🦖','🐙','🦑','🦀','🐠','🐟','🐬','🐳'],
        Food:['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🥦','🥕','🌽','🌶️','🍞','🥐','🧀','🍳','🥞','🍔','🍟','🍕','🌭','🥪','🌮','🍜','🍚','🍣','🍦','🍩','🍪','🎂','🍫','🍿','☕','🧋'],
        Activity:['⚽','🏀','🏈','⚾','🎾','🏐','🏓','🏸','🥊','🎮','🎯','🎲','♟️','🎨','🎭','🎧','🎤','🎸','🎹','🏆','🥇','🚀','✈️','🚗','🏍️','🚲','🏠','🏫','🌍','🌙','☀️','⭐','🌈','⚡','🔥'],
        Study:['📚','📖','📝','✏️','📌','📎','📐','📏','🧮','💡','🎯','✅','❌','🧠','💻','⌨️','🖥️','📱','📊','📈','📉','🔬','🔭','🧪','⚗️','🧬','🔢','➕','➖','✖️','➗','🏆','⏳','⏰','🚀','🔥','💯'],
        Symbols:['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','✨','⭐','🌟','💫','💥','💯','💢','💬','💭','♻️','⚠️','🚫','✅','❌','❓','❗','‼️','⁉️','➕','➖','✔️','☑️','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪']
      };
      showPopup(`<div class="nx-emoji-picker"><div class="nx-emoji-tabs">${Object.keys(sets).map((k,i)=>`<button data-emoji-tab="${k}" class="${i?'':'active'}">${k}</button>`).join('')}</div><input data-emoji-search placeholder="Search / browse emoji" aria-label="Search emoji"><div class="nx-emoji-panel">${sets.Recent.map(e=>`<button data-emoji-value="${e}" title="${e}">${e}</button>`).join('')}</div><div class="nx-sticker-strip"><button data-sticker-text="📚 Study time!">📚<span>Study time</span></button><button data-sticker-text="🔥 Keep going!">🔥<span>Keep going</span></button><button data-sticker-text="✅ Done!">✅<span>Done</span></button><button data-sticker-text="🎯 Focus mode">🎯<span>Focus</span></button></div></div>`,'emoji');
      popup._emojiSets=sets;
    }
    function showAttach(){showPopup(`<button data-file-kind="image" data-accept="image/*">🖼️ <span>Photos & videos</span></button><button data-file-kind="gif" data-accept="image/gif">GIF <span>Upload GIF</span></button><button data-file-kind="document" data-accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip">📄 <span>Document</span></button><button data-file-kind="audio" data-accept="audio/*">🎧 <span>Audio</span></button><button data-file-kind="sticker" data-accept="image/png,image/webp">✨ <span>Sticker image</span></button><button data-gif-url>GIF <span>Send GIF by URL</span></button>`,'attach');}
    function showPermissions(){
      const p=permissions();
      const rows=[
        ['membersCanEdit','✎','Edit group info','When on, every member can change the group name and description.'],
        ['membersCanSend','▤','Send messages','Turn off for an announcement-style group where only admins can post.'],
        ['membersCanInvite','👥','Add other members','When off, only admins can share invites or add people.'],
        ['historyVisible','↶','Chat history for new members','When off, new members only see messages sent after they joined.']
      ];
      info.innerHTML=`<header><button data-perm-back aria-label="Back">←</button><b>Group permissions</b></header><div class="nx-info-scroll nx-permissions nx-permissions-v188"><div class="nx-perm-intro"><b>Who can use group features?</b><small>Owner controls these settings. Admins keep moderation access.</small></div><h3>Members</h3>${rows.map(([k,ic,label,desc])=>`<label><span class="nx-perm-icon">${ic}</span><span class="nx-perm-copy"><b>${label}</b><small>${desc}</small></span><button role="switch" aria-label="${label}" aria-checked="${p[k]}" data-permission="${k}" class="${p[k]?'on':''}"><i></i><em>${p[k]?'On':'Off'}</em></button></label>`).join('')}<h3>Disappearing messages</h3><div class="nx-disappearing-options"><button data-disappearing-ms="0" class="${Number(p.disappearingMessagesMs||0)===0?'active':''}">Off</button><button data-disappearing-ms="86400000" class="${Number(p.disappearingMessagesMs||0)===86400000?'active':''}">24 hours</button><button data-disappearing-ms="604800000" class="${Number(p.disappearingMessagesMs||0)===604800000?'active':''}">7 days</button><button data-disappearing-ms="7776000000" class="${Number(p.disappearingMessagesMs||0)===7776000000?'active':''}">90 days</button></div><small class="nx-disappearing-note">Applies to new messages sent after this setting is changed.</small><h3>Joining</h3><label><span class="nx-perm-icon">◎</span><span class="nx-perm-copy"><b>Approve new members</b><small>${p.approvalRequired?'Admins must approve people who request to join.':'People with a valid invite can join without manual approval.'}</small></span><button role="switch" aria-label="Approve new members" aria-checked="${p.approvalRequired}" data-permission="approvalRequired" class="${p.approvalRequired?'on':''}"><i></i><em>${p.approvalRequired?'On':'Off'}</em></button></label><div class="nx-perm-role-note"><b>Owner</b><span>Full control · manage admins · permissions · ownership</span><b>Admin</b><span>Moderate members · approve requests · edit group info</span><b>Member</b><span>Participates according to the settings above</span></div></div>`;
      info.hidden=false;
    }
    async function optimizeUpload(file,kind){const quality=localStorage.getItem(`nexzo_group_media_quality:${state.user.uid}`)||'Standard';if(kind!=='image'||!String(file.type||'').startsWith('image/')||file.type==='image/gif')return file;try{const bitmap=await createImageBitmap(file),max=quality==='HD'?2560:1600,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();const blob=await new Promise(r=>canvas.toBlob(r,'image/webp',quality==='HD'?.92:.82));return blob?new File([blob],file.name.replace(/\.[^.]+$/,'.webp'),{type:'image/webp',lastModified:Date.now()}):file;}catch(_){return file;}}
    async function uploadAttachment(file,kind){if(!file)return;if(!canSend())return toast('Only admins can send attachments right now.','error');file=await optimizeUpload(file,kind);if(file.size>10*1024*1024)return toast('Maximum file size is 10 MB.','error');connection.textContent='Uploading attachment…';connection.className='nx-group-connection warning';let uploadedRef=null;try{const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=`community/${state.user.uid}/groups/${groupId}/${Date.now()}_${safe}`;uploadedRef=fb.ref(fb.storage,path);await fb.uploadBytes(uploadedRef,file,{contentType:file.type||'application/octet-stream'});const url=await fb.getDownloadURL(uploadedRef);await sendGroupMessage(groupId,{authorName:userName(),authorUsername:userHandle(),authorPhoto:state.user.photoURL||'',text:'',attachment:{kind:kind==='image'?fileKind(file):kind,name:file.name,size:file.size,sizeLabel:readableSize(file.size),contentType:file.type||'',url,path}});connection.textContent='● Connected';connection.className='nx-group-connection online';}catch(error){if(uploadedRef){try{await fb.deleteObject(uploadedRef);}catch(cleanupError){console.warn('[NEXZO Community] orphan attachment cleanup failed',cleanupError);}}console.error(error);connection.textContent='Attachment upload failed';connection.className='nx-group-connection error';toast(error.message||'Upload failed','error');}}
    paintGroupWallpaper(document.querySelector('.nx-group-chat-window'),effectiveGroupWallpaper(group));refreshMembers().catch(()=>{});if(orphanOwnerMissing())console.warn('[NEXZO Community] legacy group owner record is incomplete; open Members & Info to repair it explicitly.');renderActions();subscribeMessages();syncOpenGroupRealtime();
    const toggleInfo=async()=>{if(!info.hidden){info.hidden=true;return;}hidePopup();await showInfo();};$('.nx-group-avatar')?.addEventListener('click',toggleInfo);$('[data-group-info]')?.addEventListener('click',toggleInfo);$('[data-group-menu]')?.addEventListener('click',e=>{e.stopPropagation();popup.hidden?showMenu():hidePopup();});
    document.addEventListener('click',e=>{if(!popup.hidden&&!e.target.closest('#v32GroupPopup')&&!e.target.closest('[data-group-menu]')&&!e.target.closest('[data-attach]')&&!e.target.closest('[data-emoji]')&&!e.target.closest('[data-study-view]')&&!e.target.closest('[data-msg-more]')&&!e.target.closest('[data-msg-status]'))hidePopup();},{signal:groupSignal});
    document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!popup.hidden){hidePopup();return;}if(!info.hidden){info.hidden=true;return;}closeModal();},{signal:groupSignal});
    search.querySelector('input').addEventListener('input',e=>drawGroupMessages(groupId,e.target.value));search.querySelector('button').addEventListener('click',()=>{search.hidden=true;search.querySelector('input').value='';drawGroupMessages(groupId);});
    document.querySelector('.nx-study-popup-nav')?.addEventListener('click',async e=>{
      if(e.target.closest('[data-study-delete-group]')){await deleteGroup();return;}
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
      else if(view==='saved'){const ids=new Set(groupPrefs(groupId).starredMessageIds||[]),saved=(state.messages.get(groupId)||[]).filter(m=>ids.has(m.id));showPopup(`<div class="nx-connect-panel"><header><div><b>⭐ Saved messages</b><small>${saved.length} saved in this group</small></div><button data-close-popup>×</button></header>${saved.length?saved.map(m=>`<button class="nx-saved-row" data-jump-saved="${esc(m.id)}"><b>${esc(m.authorName||'Student')}</b><span>${esc(String(m.text||m.attachment?.name||'Attachment').slice(0,120))}</span><small>${esc(messageFullDateTime(m.createdAtMs))}</small></button>`).join(''):'<p class="nx-connect-empty">Star a message from its ⋮ menu and it will appear here.</p>'}</div>`,'saved');}
      else if(view==='resources'){const media=(state.messages.get(groupId)||[]).filter(m=>m.attachment?.url);showPopup(`<div class="nx-connect-panel"><header><div><b>📚 Shared resources</b><small>Files and media from recent messages</small></div><button data-close-popup>×</button></header>${media.length?media.map(m=>`<a class="nx-resource-row" href="${esc(m.attachment.url)}" target="_blank" rel="noopener"><span>${m.attachment.kind==='image'?'🖼️':'📄'}</span><b>${esc(m.attachment.name||'Shared file')}</b><small>${esc(messageFullDateTime(m.createdAtMs))}</small></a>`).join(''):'<p class="nx-connect-empty">No recent shared files.</p>'}</div>`,'resources');}
      else if(view==='quality')showQualityPicker();
    });
    info.addEventListener('click',async e=>{
      const t=e.target;
      const actionButton=t.closest('button');
      if(actionButton?.disabled)return;
      if(t.closest('[data-close-member-card]')){t.closest('.nx-member-detail-card')?.remove();return;}
      if(t.closest('[data-message-member-card]')){const uid=t.closest('[data-message-member-card]').dataset.messageMemberCard;if(uid&&uid!==state.user?.uid){location.href=`messages.html?user=${encodeURIComponent(uid)}`;}return;}
      if(t.closest('[data-copy-member-card]')){
        const uid=t.closest('[data-copy-member-card]').dataset.copyMemberCard,m=members.find(x=>x.id===uid);const value=`@${m?.username||'student'}`;
        const ok=await copyTextReliable(value);toast(ok?'Username copied':value,ok?'success':'info');return;
      }
      if(t.closest('[data-info-close]')){info.hidden=true;return;}
      if(t.closest('[data-info-invite]')){invite();return;}
      if(t.closest('[data-info-search]')){info.hidden=true;search.hidden=false;search.querySelector('input').focus();return;}
      if(t.closest('[data-info-mute]')){saveGroupPrefs(groupId,{muted:!groupPrefs(groupId).muted});await showInfo();return;}
      if(t.closest('[data-info-clear]')){if(await communityConfirm('Messages will be hidden only on this device. Other members will still see them.',{title:'Clear chat for me',confirmText:'Clear chat',danger:true})){saveGroupPrefs(groupId,{clearedAtMs:Date.now()});drawGroupMessages(groupId);info.hidden=true;}return;}
      if(t.closest('[data-info-permissions]')){showPermissions();return;}
      if(t.closest('[data-info-requests]')){showJoinRequests();return;}
      if(t.closest('[data-info-repair-owner]')){const btn=t.closest('[data-info-repair-owner]');btn.disabled=true;try{await repairLegacyOwnership();await refreshMembers();await showInfo();renderActions();}catch(error){memberActionError(error,'Legacy owner repair failed.');btn.disabled=false;}return;}
      if(t.closest('[data-info-delete-group]')){await deleteGroup();return;}
      if(t.closest('[data-requests-back]')){await showInfo();return;}
      if(t.closest('[data-approve-request]')){try{await approveRequest(t.closest('[data-approve-request]').dataset.approveRequest);await showJoinRequests();toast('Member approved','success');}catch(error){memberActionError(error,'Could not approve member.');}return;}
      if(t.closest('[data-reject-request]')){try{const uid=t.closest('[data-reject-request]').dataset.rejectRequest;try{await groupAdminApi(`/groups/${encodeURIComponent(groupId)}/join-requests/${encodeURIComponent(uid)}/reject`,{method:'POST'});}catch(primary){const ref=fb.doc(fb.db,'groups',groupId,'joinRequests',uid);await fb.updateDoc(ref,{status:'rejected',updatedAtMs:Date.now()});const verify=await fb.getDoc(ref);if(!verify.exists()||verify.data()?.status!=='rejected')throw Object.assign(new Error('Request rejection was not confirmed by Firestore.'),{cause:primary});}await showJoinRequests();toast('Request rejected','success');}catch(error){memberActionError(error,'Could not reject request.');}return;}
      if(t.closest('[data-perm-back]')){await showInfo();return;}
      if(t.closest('[data-info-edit]')){if(!canEditGroup())return toast('You do not have permission to edit group settings.','error');const name=await communityPrompt('Edit group name',group.name||'',{confirmText:'Next'});if(!name)return;const description=(await communityPrompt('Edit group description',group.description||'',{confirmText:'Save'}))??group.description;try{await fb.updateDoc(fb.doc(fb.db,'groups',groupId),{name:name.slice(0,100),description:String(description||'').slice(0,500),updatedAtMs:Date.now()});group.name=name;group.description=description;await showInfo();toast('Group updated','success');}catch(error){memberActionError(error,'Could not update group.');}return;}
      if(t.closest('[data-info-avatar]')){fileInput.accept='image/png,image/jpeg,image/webp';fileInput.dataset.kind='avatar';fileInput.click();return;}
      if(t.closest('[data-info-remove-avatar]')){if(!isOwner())return toast('Only the group owner can remove the logo.','error');if(!await communityConfirm('Remove the custom group logo and use the NEXZO default?',{title:'Remove group logo',confirmText:'Remove',danger:true}))return;const btn=t.closest('[data-info-remove-avatar]');btn.disabled=true;try{const controlled=fb.ref(fb.storage,`groups/${groupId}/branding/logo.webp`);try{await fb.deleteObject(controlled)}catch(error){if(error?.code!=='storage/object-not-found')console.warn('[NEXZO Community] controlled group logo object could not be deleted',error)}await fb.updateDoc(fb.doc(fb.db,'groups',groupId),{avatarURL:'',updatedAtMs:Date.now()});const check=await fb.getDoc(fb.doc(fb.db,'groups',groupId));if(!check.exists()||String(check.data()?.avatarURL||'')!=='')throw new Error('Logo removal could not be verified.');group.avatarURL='';renderGroups();await showInfo();toast('Custom group logo removed','success')}catch(error){btn.disabled=false;toast(error.message||'Logo was not removed.','error')}return;}
      if(t.closest('[data-info-wallpaper]')){showWallpaperPicker();return;}
      if(t.closest('[data-member-menu]')){const trigger=t.closest('[data-member-menu]');openMemberMenu(trigger,trigger.dataset.memberMenu);return;}
      if(t.closest('[data-view-member]')){const uid=t.closest('[data-view-member]').dataset.viewMember;showMemberCard(members.find(x=>x.id===uid));return;}
      if(t.closest('[data-copy-member]')){const uid=t.closest('[data-copy-member]').dataset.copyMember,m=members.find(x=>x.id===uid),value=`@${m?.username||'student'}`;const ok=await copyTextReliable(value);toast(ok?'Username copied':value,ok?'success':'info');return;}
      if(t.closest('[data-transfer-owner]')){const btn=t.closest('[data-transfer-owner]');btn.disabled=true;try{await transferOwnership(btn.dataset.transferOwner);}finally{btn.disabled=false;}return;}
      if(t.closest('[data-promote-member]')){
        const btn=t.closest('[data-promote-member]'),uid=btn.dataset.promoteMember,m=members.find(x=>x.id===uid);if(!isOwner())return toast('Only the group owner can change admin roles.','error');if(!m)return toast('Member not found.','error');
        btn.disabled=true;const wasAdmin=m.role==='admin';
        try{await changeMemberRole(uid);await refreshMembers();await showInfo();toast(wasAdmin?'Admin removed':'Admin assigned','success');}catch(error){memberActionError(error,'Could not update admin role.');}finally{btn.disabled=false;}return;
      }
      if(t.closest('[data-remove-member]')){
        const btn=t.closest('[data-remove-member]'),uid=btn.dataset.removeMember,m=members.find(x=>x.id===uid);if(!isAdmin())return toast('Only group admins can remove members.','error');if(m?.role==='owner')return toast('The group owner cannot be removed.','error');if(!await communityConfirm(`Remove ${m?.name||'this member'} from the group?`,{title:'Remove member',confirmText:'Remove',danger:true}))return;
        btn.disabled=true;try{await removeMember(uid);await refreshMembers();await showInfo();toast('Member removed','success');}catch(error){memberActionError(error,'Could not remove member.');}finally{btn.disabled=false;}return;
      }
      if(t.closest('[data-disappearing-ms]')){if(!isOwner())return toast('Only the owner can change disappearing messages.','error');const btn=t.closest('[data-disappearing-ms]'),next={...permissions(),disappearingMessagesMs:Number(btn.dataset.disappearingMs||0)};btn.disabled=true;try{await groupAdminApi(`/groups/${encodeURIComponent(groupId)}/permissions`,{method:'PATCH',body:{permissions:next}});group.permissions=next;showPermissions();toast(next.disappearingMessagesMs?`New messages will disappear after ${next.disappearingMessagesMs===86400000?'24 hours':next.disappearingMessagesMs===604800000?'7 days':'90 days'}`:'Disappearing messages turned off','success');}catch(error){memberActionError(error,'Could not update disappearing messages.');}return;}
      if(t.closest('[data-permission]')){if(!isOwner())return toast('Only the owner can change group permissions.','error');const btn=t.closest('[data-permission]'),key=btn.dataset.permission,next={...permissions(),[key]:!permissions()[key]};btn.disabled=true;try{try{await groupAdminApi(`/groups/${encodeURIComponent(groupId)}/permissions`,{method:'PATCH',body:{permissions:next}});}catch(primary){await fb.updateDoc(fb.doc(fb.db,'groups',groupId),{permissions:next,updatedAtMs:Date.now()});}const verified=await fb.getDoc(fb.doc(fb.db,'groups',groupId));if(!verified.exists()||JSON.stringify(verified.data()?.permissions||{})!==JSON.stringify(next))throw new Error('Permission update was not confirmed by Firestore.');group.permissions=next;renderActions();subscribeMessages();showPermissions();toast('Permission updated','success');}catch(error){memberActionError(error,'Could not update permission.');}finally{if(btn.isConnected)btn.disabled=false;}return;}
    });
    document.addEventListener('click',async e=>{
      if(e.target.closest('[data-close-member-card]')){e.target.closest('.nx-member-detail-card')?.remove();return;}
      const copy=e.target.closest('[data-copy-member-card]');if(copy){const m=members.find(x=>x.id===copy.dataset.copyMemberCard);const value=`@${m?.username||'student'}`;const ok=await copyTextReliable(value);toast(ok?'Username copied':value,ok?'success':'info');return;}
      const mention=e.target.closest('[data-mention-member-card]');if(mention){const m=members.find(x=>x.id===mention.dataset.mentionMemberCard);if(m){mentionMember(m);document.querySelector('.nx-member-detail-card')?.remove();info.hidden=true;}return;}
    },{signal:groupSignal});
    popup.addEventListener('input',e=>{if(!e.target.matches('[data-emoji-search]'))return;const q=e.target.value.trim();const all=Object.values(popup._emojiSets||{}).flat();popup.querySelector('.nx-emoji-panel').innerHTML=all.filter(x=>!q||x.includes(q)).map(x=>`<button data-emoji-value="${x}">${x}</button>`).join('');});
    popup.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.msgAction){const id=popup.dataset.messageId,msg=(state.messages.get(groupId)||[]).find(m=>m.id===id);if(!msg)return hidePopup();const action=b.dataset.msgAction;if(action==='reply'){const input=$('#v32GroupMessage'),rp=$('#v300ReplyPreview');if(input){input.dataset.replyTo=id;input.focus();}if(rp){rp.hidden=false;rp.innerHTML=`<span><b>Replying to ${esc(msg.uid===state.user.uid?'yourself':msg.authorName||'Student')}</b><small>${esc(String(msg.text||msg.attachment?.name||'Attachment').slice(0,120))}</small></span><button type="button" data-cancel-reply>×</button>`;rp.querySelector('[data-cancel-reply]').onclick=()=>{delete input.dataset.replyTo;rp.hidden=true;rp.innerHTML='';};}}else if(action==='copy'){await navigator.clipboard?.writeText(String(msg.text||msg.attachment?.url||''));toast('Copied','success');}else if(action==='star'){const prefs=groupPrefs(groupId),ids=new Set(Array.isArray(prefs.starredMessageIds)?prefs.starredMessageIds:[]);ids.has(id)?ids.delete(id):ids.add(id);saveGroupPrefs(groupId,{starredMessageIds:[...ids].slice(-500)});toast(ids.has(id)?'Message starred':'Message unstarred','success');}else if(action==='delete-me'){if(await communityConfirm('This message will be hidden only from your view. Other members will still see it.',{title:'Delete for me',confirmText:'Delete',danger:true})){const prefs=groupPrefs(groupId),ids=new Set(Array.isArray(prefs.hiddenMessageIds)?prefs.hiddenMessageIds:[]);ids.add(id);saveGroupPrefs(groupId,{hiddenMessageIds:[...ids].slice(-1000)});drawGroupMessages(groupId,$('#v32GroupSearch input')?.value||'');toast('Message deleted for you','success');}}else if(action==='forward'){const value=String(msg.text||msg.attachment?.url||'');if(navigator.share){try{await navigator.share({title:group.name||'NEXZO Study Group',text:value});}catch(_){}}else{await copyTextReliable(value);toast('Message copied — paste it into another chat','success');}}else if(action==='edit'){if(Date.now()-Number(msg.createdAtMs||0)>15*60*1000)return toast('Edit is available for 15 minutes after sending.','error');if(msg.attachment)return toast('Media and attachment messages cannot be edited.','error');const next=await communityPrompt('Edit message',msg.text||'',{message:'You can edit your message for up to 15 minutes after sending.',confirmText:'Save changes'});if(next!==null&&next.trim()){await groupAdminApi(`/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(id)}`,{method:'PATCH',body:{text:next.trim()}});toast('Message edited','success');}}else if(action==='delete'){if(Date.now()-Number(msg.createdAtMs||0)>2*24*60*60*1000)return toast('Delete for everyone is available for 2 days after sending.','error');if(await communityConfirm('This message will be replaced with “This message was deleted” for everyone.',{title:'Delete for everyone',confirmText:'Delete',danger:true})){await groupAdminApi(`/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(id)}`,{method:'DELETE'});toast('Message deleted','success');}}else if(action==='pin'){await groupAdminApi(`/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(id)}/pin`,{method:'POST'});toast('Message pinned','success');}else if(action==='react'){const emoji=await communityDialog({title:'React to message',message:'Choose a reaction',choices:['👍','❤️','😂','😮','😢','🙏','🔥','✅'],confirmText:'React'});if(typeof emoji==='string'&&emoji)await groupAdminApi(`/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(id)}/reactions`,{method:'POST',body:{emoji}});}hidePopup();return;}if(b.dataset.jumpSaved){hidePopup();setActiveStudyView('chats');const target=messageBox?.querySelector(`[data-message-id="${CSS.escape(b.dataset.jumpSaved)}"]`);target?.scrollIntoView({behavior:'smooth',block:'center'});target?.classList.add('nx-message-highlight');setTimeout(()=>target?.classList.remove('nx-message-highlight'),1400);return;}if(b.hasAttribute('data-close-popup')){hidePopup();setActiveStudyView('chats');return;}if(b.dataset.wallpaperChoice){popup.dataset.selectedWallpaper=b.dataset.wallpaperChoice;popup.querySelectorAll('[data-wallpaper-choice]').forEach(x=>x.classList.toggle('selected',x===b));const preview=popup.querySelector('.nx-wallpaper-preview img');if(preview)preview.src=mediaURL(b.dataset.wallpaperChoice);return;}if(b.hasAttribute('data-wallpaper-apply')){const chosen=popup.dataset.selectedWallpaper;if(chosen){await applyBuiltinWallpaper(chosen);hidePopup();setActiveStudyView('chats');}return;}if(b.hasAttribute('data-custom-wallpaper')){fileInput.accept='image/png,image/jpeg,image/webp,image/gif';fileInput.dataset.kind='wallpaper';fileInput.click();hidePopup();return;}if(b.dataset.quality){const key=`nexzo_group_media_quality:${state.user.uid}`;localStorage.setItem(key,b.dataset.quality);const label=$('#v33QualityState');if(label)label.textContent=b.dataset.quality;toast(`${b.dataset.quality} upload quality saved`,'success');showQualityPicker();return;}if(b.dataset.emojiValue){const input=$('#v32GroupMessage');input.value+=b.dataset.emojiValue;input.focus();return;}if(b.dataset.stickerText){const input=$('#v32GroupMessage');input.value=b.dataset.stickerText;actions.querySelector('[data-v32-send-group]')?.click();hidePopup();return;}if(b.dataset.emojiTab){const set=popup._emojiSets?.[b.dataset.emojiTab]||[];popup.querySelectorAll('[data-emoji-tab]').forEach(x=>x.classList.toggle('active',x===b));popup.querySelector('.nx-emoji-panel').innerHTML=set.map(e=>`<button data-emoji-value="${e}">${e}</button>`).join('');return;}if(b.dataset.fileKind){fileInput.accept=b.dataset.accept||'';fileInput.dataset.kind=b.dataset.fileKind;fileInput.click();hidePopup();return;}if(b.hasAttribute('data-menu-info')){hidePopup();await showInfo();}else if(b.hasAttribute('data-menu-search')){search.hidden=false;search.querySelector('input').focus();}else if(b.hasAttribute('data-menu-invite'))invite();else if(b.hasAttribute('data-menu-wallpaper')){if(!popup.hidden&&popup.dataset.popupKey==='wallpaper'){hidePopup();setActiveStudyView('chats');}else showWallpaperPicker();}else if(b.hasAttribute('data-menu-permissions'))showPermissions();else if(b.hasAttribute('data-menu-requests'))showJoinRequests();else if(b.hasAttribute('data-menu-delete-group')){hidePopup();await deleteGroup();return;}else if(b.hasAttribute('data-gif-url')){if(!canSend())return toast('Only admins can send messages right now.','error');const url=(await communityPrompt('Send GIF by URL','',{message:'Paste a direct HTTPS GIF URL.',placeholder:'https://...',confirmText:'Send'}))?.trim();if(url&&/^https:\/\//i.test(url)){await sendGroupMessage(groupId,{authorName:userName(),authorUsername:userHandle(),authorPhoto:state.user.photoURL||'',text:'',attachment:{kind:'gif',name:'GIF',size:0,sizeLabel:'',contentType:'image/gif',url,path:''}});}}else if(b.dataset.viewMember){const m=members.find(x=>x.id===b.dataset.viewMember);await communityDialog({title:m?.name||'Member',message:`@${m?.username||'student'} · Role: ${m?.role||'member'}`,info:true});return;}else if(b.dataset.copyMember){const m=members.find(x=>x.id===b.dataset.copyMember);await navigator.clipboard?.writeText(`@${m?.username||''}`);toast('Username copied','success');return;}else if(b.dataset.transferOwner){await executeMemberAction('transfer',b.dataset.transferOwner,b);hidePopup();return;}else if(b.dataset.promoteMember){await executeMemberAction('role',b.dataset.promoteMember,b);hidePopup();return;}else if(b.dataset.removeMember){await executeMemberAction('remove',b.dataset.removeMember,b);hidePopup();return;}else if(b.hasAttribute('data-menu-mute')){const muted=!groupPrefs(groupId).muted;saveGroupPrefs(groupId,{muted});toast(muted?'Group muted':'Group unmuted','success');}else if(b.hasAttribute('data-menu-clear')){if(await communityConfirm('Messages will be hidden only on this device. Other members will still see them.',{title:'Clear chat for me',confirmText:'Clear chat',danger:true})){saveGroupPrefs(groupId,{clearedAtMs:Date.now()});drawGroupMessages(groupId);}}else if(b.hasAttribute('data-menu-exit')){if(await communityConfirm('You will stop receiving new messages from this group.',{title:'Exit group',confirmText:'Exit group',danger:true})){try{const left=await leaveGroupCloud(groupId,group);state.myGroupIds.delete(groupId);const localMembers=state.members.get(groupId);localMembers?.delete(state.user.uid);if(localMembers)state.members.set(groupId,localMembers);if(left?.dissolved)removeEmptyGroupLocally(groupId);saveOffline(true);closeModal();render();toast(left?.dissolved?'You left. The empty group was permanently removed.':'You left the group','success');}catch(error){toast(error.message||'Could not leave the group','error');}}}hidePopup();});
    fileInput.addEventListener('change',async()=>{const f=fileInput.files?.[0],kind=fileInput.dataset.kind||fileKind(f);fileInput.value='';if(!f)return;
      if(kind==='avatar'||kind==='wallpaper'){
        if(!isOwner())return toast('Only the group owner can change group media.','error');
        if(kind==='avatar'){
          try{window.NEXZOCommunityContracts.logo(f)}catch(error){return toast(error.message,'error')}
          const oldURL=group.avatarURL||'',previewURL=URL.createObjectURL(f);
          await mediaCacheSet(groupId,'avatar',f).catch(()=>{});
          writeGroupMediaMeta(groupId,{avatarPending:true,avatarURL:oldURL||'',lastError:''});
          group.avatarURL=previewURL;
          document.querySelectorAll('[data-group-logo],.nx-group-avatar img,.nx-info-avatar img').forEach(img=>img.src=previewURL);
          connection.textContent='Uploading logo in background…';connection.className='nx-group-connection warning';
          try{
            const url=await uploadPermanentGroupLogo(groupId,f,group);
            group.avatarURL=url;writeGroupMediaMeta(groupId,{avatarPending:false,avatarURL:url,lastError:''});await mediaCacheDelete(groupId,'avatar');
            document.querySelectorAll('[data-group-logo],.nx-group-avatar img,.nx-info-avatar img').forEach(img=>img.src=url);renderGroups();
            connection.textContent='● Connected';connection.className='nx-group-connection online';toast('Group logo saved permanently','success');if(!info.hidden)showInfo().catch(()=>{});
            setTimeout(()=>URL.revokeObjectURL(previewURL),1500);
          }catch(error){
            group.avatarURL=previewURL;writeGroupMediaMeta(groupId,{avatarPending:true,avatarURL:oldURL||'',lastError:error?.message||'Cloud save failed'});
            connection.textContent='● Connected';connection.className='nx-group-connection online';toast('Logo kept on this device; cloud save failed. Deploy Storage + Firestore rules.','error');
          }
          return;
        }
        const max=8*1024*1024;if(!String(f.type||'').startsWith('image/'))return toast('Choose an image file.','error');if(f.size>max)return toast('Wallpaper must be under 8 MB.','error');
        let wallpaperFile=f;try{wallpaperFile=await prepareWallpaperImage(f)}catch(error){if(error?.cancelled)return;return toast(error.message||'Could not prepare wallpaper.','error')}
        connection.textContent='● Connected';connection.className='nx-group-connection online';
        await mediaCacheSet(groupId,kind,wallpaperFile);
        const previewURL=URL.createObjectURL(wallpaperFile);
        writeGroupMediaMeta(groupId,{wallpaperPending:true,wallpaperURL:'',lastError:''});
        group.wallpaperURL=previewURL;
        paintGroupWallpaper(messageBox,previewURL);
        document.querySelector('.nx-info-cover')?.style.setProperty('--nx-cover',`url("${previewURL}")`);
        toast('Wallpaper applied — syncing in background','success');
        try{
          const path=`groups/${groupId}/branding/wallpaper`;
          const storageRef=fb.ref(fb.storage,path);
          await withTimeout(fb.uploadBytes(storageRef,wallpaperFile,{contentType:wallpaperFile.type||'image/webp',cacheControl:'no-store,max-age=0',customMetadata:{groupId,kind:'group-wallpaper',ownerUid:state.user.uid}}),18000);
          const url=await withTimeout(fb.getDownloadURL(storageRef),15000);
          const field=kind==='avatar'?'avatarURL':'wallpaperURL';
          await withTimeout(fb.updateDoc(fb.doc(fb.db,'groups',groupId),{[field]:url,wallpaperType:'custom',updatedAtMs:Date.now()}),15000);
          const verifySnap=await withTimeout(fb.getDoc(fb.doc(fb.db,'groups',groupId)),10000);
          if(!verifySnap.exists()||String(verifySnap.data()?.[field]||'')!==String(url))throw new Error('Wallpaper uploaded, but Firestore persistence verification failed.');
          group[field]=url;
          writeGroupMediaMeta(groupId,{[`${kind}Pending`]:false,[`${kind}URL`]:url});
          await mediaCacheDelete(groupId,kind);
          if(kind==='avatar'){
            const avatar=document.querySelector('.nx-group-avatar');if(avatar)avatar.innerHTML=`<img src="${esc(url)}" alt="${esc(group.name)} icon">`;
          }else{paintGroupWallpaper(messageBox,url);}
          connection.textContent='● Connected';connection.className='nx-group-connection online';
          toast(`${kind==='avatar'?'Group icon':'Wallpaper'} saved permanently`, 'success');
          if(!info.hidden)await showInfo();
          setTimeout(()=>URL.revokeObjectURL(previewURL),1500);
        }catch(error){
          console.error('[NEXZO Community] group media upload failed',error);
          const msg=error?.code==='storage/unauthorized'?'Storage rules blocked the upload. Run DEPLOY_FIREBASE_RULES.cmd, then refresh.':error?.code==='permission-denied'?'Firestore rules blocked the group update. Run DEPLOY_FIREBASE_RULES.cmd, then refresh.':error?.code==='storage/timeout'?'Upload timed out. Check Firebase Storage is enabled and your internet connection.':error?.code==='storage/bucket-not-found'?'Firebase Storage bucket is not configured for this project.':(error.message||'Upload failed.');
          connection.textContent='● Connected';connection.className='nx-group-connection online';
          group[kind==='avatar'?'avatarURL':'wallpaperURL']=previewURL;
          writeGroupMediaMeta(groupId,{[`${kind}Pending`]:true,lastError:msg});
          toast(`${kind==='avatar'?'Group icon':'Wallpaper'} saved locally. ${msg}`,'error');
        }
        return;
      }
      await uploadAttachment(f,kind);
    });
    messageBox?.addEventListener('click',async e=>{
      const row=e.target.closest('[data-message-id]'),id=row?.dataset.messageId;if(!id)return;const message=(state.messages.get(groupId)||[]).find(m=>m.id===id);if(!message)return;
      const memberBtn=e.target.closest('[data-message-member]');if(memberBtn){const m=members.find(x=>x.id===memberBtn.dataset.messageMember);if(m)showMemberCard(m);return;}
      if(e.target.closest('[data-jump-message]')){const target=messageBox.querySelector(`[data-message-id="${CSS.escape(e.target.closest('[data-jump-message]').dataset.jumpMessage||'')}"]`);target?.scrollIntoView({behavior:'smooth',block:'center'});target?.classList.add('nx-message-highlight');setTimeout(()=>target?.classList.remove('nx-message-highlight'),1400);return;}
      const quick=e.target.closest('[data-quick-react]');if(quick){try{await groupAdminApi(`/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(id)}/reactions`,{method:'POST',body:{emoji:quick.dataset.quickReact}});}catch(error){toast(error.message||'Reaction failed','error');}return;}
      const receipt=e.target.closest('[data-msg-status]');if(receipt){
        const created=Number(message.createdAtMs||0),others=members.filter(m=>m.id!==state.user.uid&&m.uid!==state.user.uid);
        const rows=others.map(m=>{const read=Number(m.lastReadAtMs||0)>=created,delivered=Number(m.lastDeliveredAtMs||0)>=created;return `<div class="nx-receipt-row"><span class="nx-receipt-avatar">${memberAvatarMarkup(m)}</span><span><b>${esc(m.name||m.username||'Member')}</b><small>${read?'Read':delivered?'Delivered':'Sent'}</small></span><strong class="${read?'read':delivered?'delivered':'sent'}">${read?'✓✓':delivered?'✓✓':'✓'}</strong></div>`;}).join('');
        showPopup(`<div class="nx-receipt-popup"><header><div><b>Message info</b><small>${esc(messageFullDateTime(message.createdAtMs))}</small></div><button type="button" data-close-popup aria-label="Close">×</button></header><div class="nx-receipt-legend"><span><i class="sent">✓</i> Sent</span><span><i class="delivered">✓✓</i> Delivered</span><span><i class="read">✓✓</i> Read</span></div><div class="nx-receipt-list">${rows||'<p>No other members in this group.</p>'}</div></div>`,'receipt-info');
        return;
      }
      if(!e.target.closest('[data-msg-more]'))return;
      const mine=message.uid===state.user.uid;const admin=isAdmin(),age=Math.max(0,Date.now()-Number(message.createdAtMs||0)),canEdit=mine&&!message.deletedForEveryoneAtMs&&!message.attachment&&age<=15*60*1000,canDeleteEveryone=(mine||admin)&&!message.deletedForEveryoneAtMs&&age<=2*24*60*60*1000;
      const starred=new Set(Array.isArray(groupPrefs(groupId).starredMessageIds)?groupPrefs(groupId).starredMessageIds:[]);showPopup(`<div class="nx-message-actions nx-message-actions-v179"><button data-msg-action="reply"><i>↩</i><span><b>Reply</b><small>Reply to this message</small></span></button>${canEdit?'<button data-msg-action="edit"><i>✎</i><span><b>Edit message</b><small>Available for 15 minutes</small></span></button>':''}<button data-msg-action="react"><i>☺</i><span><b>React</b><small>Add a reaction</small></span></button><button data-msg-action="star"><i>${starred.has(id)?'★':'☆'}</i><span><b>${starred.has(id)?'Unstar':'Star message'}</b><small>${starred.has(id)?'Remove from saved':'Save for later'}</small></span></button><button data-msg-action="forward"><i>➜</i><span><b>Forward</b><small>Share this message</small></span></button>${admin?'<button data-msg-action="pin"><i>⌖</i><span><b>Pin message</b><small>Keep visible in group</small></span></button>':''}<div class="nx-action-divider"></div><button data-msg-action="delete-me" class="danger"><i>⌫</i><span><b>Delete for me</b><small>Hide from your view</small></span></button>${canDeleteEveryone?'<button class="danger" data-msg-action="delete"><i>♲</i><span><b>Delete for everyone</b><small>Available for 2 days</small></span></button>':''}<div class="nx-action-divider"></div><button data-msg-action="copy"><i>▣</i><span><b>Copy message</b><small>Copy message text</small></span></button></div>`,'message-actions');
      popup.dataset.messageId=id;
    });
    actions.addEventListener('click',async e=>{if(e.target.closest('[data-attach]')){if(!popup.hidden&&popup.dataset.popupKey==='attach')return hidePopup();return showAttach();}if(e.target.closest('[data-emoji]')){if(!popup.hidden&&popup.dataset.popupKey==='emoji')return hidePopup();return showEmoji();}const join=e.target.closest('[data-v32-join-group]');if(join){const original=join.textContent;join.disabled=true;join.textContent='Joining…';try{const result=permissions().approvalRequired&&!isAdmin()&&!hasValidInvite?await requestJoin():await joinGroupCloud(groupId,group,hasValidInvite?inviteParam:'');if(result.requested){join.textContent='Request sent';toast('Join request sent to group admins','success');return;}isMember=true;const localMembers=state.members.get(groupId)||new Set();localMembers.add(state.user.uid);state.members.set(groupId,localMembers);group.memberCount=Math.max(Number(group.memberCount||1),localMembers.size);saveOffline(true);await refreshMembers();renderActions();subscribeMessages();toast(result.created?'Joined group':'You are already a member','success');}catch(error){console.error('[NEXZO Community] join failed',error);join.disabled=false;join.textContent=original;const msg=error?.code==='permission-denied'?'Joining was blocked by Firebase rules. Deploy the included firestore.rules, then retry.':error?.code==='unavailable'?'Could not reach Firestore. Check the internet connection and retry.':(error.message||'Could not join group');toast(msg,'error');}return;}const send=e.target.closest('[data-v32-send-group]');if(send){if(!canSend())return toast('Only admins can send messages right now.','error');const input=$('#v32GroupMessage'),text=input?.value.trim();if(!text)return;send.disabled=true;try{const replyId=input.dataset.replyTo||'';const original=(state.messages.get(groupId)||[]).find(m=>m.id===replyId);const payload={authorName:userName(),authorUsername:userHandle(),authorPhoto:state.user.photoURL||'',text:text.slice(0,1000)};if(original)payload.replyTo={id:original.id,authorName:original.authorName||'Student',text:String(original.text||original.attachment?.name||'Attachment').slice(0,160)};const tempId=`pending_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,optimistic={id:tempId,uid:state.user.uid,...payload,createdAtMs:Date.now(),pending:true};const optimisticRows=[...(state.messages.get(groupId)||[]),optimistic];state.messages.set(groupId,optimisticRows);input.value='';delete input.dataset.replyTo;drawGroupMessages(groupId,$('#v32GroupSearch input')?.value||'');messageBox?.scrollTo({top:messageBox.scrollHeight,behavior:'smooth'});try{const result=await sendGroupMessage(groupId,payload);const rows=state.messages.get(groupId)||[];const pending=rows.find(m=>m.id===tempId);if(pending&&result?.id)pending.id=result.id;}catch(error){state.messages.set(groupId,(state.messages.get(groupId)||[]).filter(m=>m.id!==tempId));drawGroupMessages(groupId,$('#v32GroupSearch input')?.value||'');throw error;}const rp=$('#v300ReplyPreview');if(rp){rp.hidden=true;rp.innerHTML='';}input.closest('.nx-group-composer')?.querySelector('.nx-active-mention')?.remove();input.closest('.nx-group-composer')?.classList.remove('has-mention');delete input.dataset.mentionUid;delete input.dataset.mentionHandle;input.focus();}catch(error){toast(error.message||'Message was not sent.','error');}finally{send.disabled=false;}}});
  }

  document.addEventListener('error',event=>{const img=event.target;if(!(img instanceof HTMLImageElement)||!img.matches('[data-group-logo]'))return;img.hidden=true;img.closest('.nx-group-logo-shell')?.classList.add('is-fallback');},{capture:true});

  async function intercept(event){
    const target=event.target,handled=target.closest('[data-community-jump],#communityCreatePost,#openCreatePostBtn,#communityAttach,#communityAIImprove,#openCommunityAI,#refreshTrending,#openCreateGroup,#openAllGroups,[data-v32-like],[data-v32-comment],[data-v32-save],[data-v32-share],[data-v32-edit],[data-v32-delete],[data-v42-report],[data-v32-open-group],[data-v32-delete-group-direct],[data-v32-leave-group-direct],[data-v32-close],.community-filter-card button');if(!handled)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    const jump=target.closest('[data-community-jump]');if(jump){state.filter=jump.dataset.communityJump||'all';document.querySelectorAll('.community-filter-card button').forEach(row=>row.classList.toggle('active',row.dataset.filter===state.filter));render();document.querySelector('#communityPosts')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    if(target.closest('#communityCreatePost'))createPost().catch(error=>toast(error.message,'error'));
    else if(target.closest('#openCreatePostBtn')){$('.community-compose-card')?.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>$('#communityPostText')?.focus(),250);}
    else if(target.closest('#communityAttach'))attachResource();
    else if(target.closest('#communityAIImprove'))improvePost();
    else if(target.closest('#openCommunityAI'))location.href='ai-assistant.html';
    else if(target.closest('#refreshTrending'))renderTrending();
    else if(target.closest('#openCreateGroup'))createGroup();
    else if(target.closest('#openAllGroups'))openAllGroupsModal();
    else if(target.closest('[data-v32-delete-group-direct]'))await deleteGroupDirect(target.closest('[data-v32-delete-group-direct]').dataset.v32DeleteGroupDirect);
    else if(target.closest('[data-v32-leave-group-direct]'))await leaveGroupDirect(target.closest('[data-v32-leave-group-direct]').dataset.v32LeaveGroupDirect);
    else if(target.closest('[data-v32-open-group]'))openGroup(target.closest('[data-v32-open-group]').dataset.v32OpenGroup).catch(error=>toast(error.message,'error'));
    else if(target.closest('[data-v32-like]'))toggleLike(target.closest('[data-v32-like]').dataset.v32Like).catch(error=>toast(error.message,'error'));
    else if(target.closest('[data-v32-comment]'))openComments(target.closest('[data-v32-comment]').dataset.v32Comment);
    else if(target.closest('[data-v32-save]'))toggleSave(target.closest('[data-v32-save]').dataset.v32Save).catch(error=>toast(error.message,'error'));
    else if(target.closest('[data-v32-share]')){navigator.clipboard?.writeText(`${location.href.split('#')[0]}#post-${target.closest('[data-v32-share]').dataset.v32Share}`);toast('Link copied');}
    else if(target.closest('[data-v42-report]'))reportPost(target.closest('[data-v42-report]').dataset.v42Report).catch(error=>toast(error.message,'error'));
    else if(target.closest('[data-v32-edit]'))editPost(target.closest('[data-v32-edit]').dataset.v32Edit).catch(error=>toast(error.message,'error'));
    else if(target.closest('[data-v32-delete]'))deletePost(target.closest('[data-v32-delete]').dataset.v32Delete).catch(error=>toast(error.message,'error'));
    else if(target.closest('[data-v32-close]'))closeModal();
    else{const button=target.closest('.community-filter-card button');if(button){document.querySelectorAll('.community-filter-card button').forEach(row=>row.classList.remove('active'));button.classList.add('active');state.filter=button.dataset.filter||'all';render();}}
  }
  function bind(){document.addEventListener('click',intercept,true);$('#communitySort')?.addEventListener('change',event=>{state.sort=event.target.value;render();});const search=$('#communitySearch');if(search){let timer;search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{state.search=search.value;render();},160);});}const draft=$('#communityPostText');if(draft){draft.value=localStorage.getItem(state.draftKey)||draft.value||'';draft.addEventListener('input',()=>localStorage.setItem(state.draftKey,draft.value.slice(0,2000)));}}
  function init(){if(!isPage())return;bind();setModeStatus();const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('Firebase connection timed out')),10000));Promise.race([initFirebase(),timeout]).catch(error=>startOffline(error.message));}
  window.NEXZOCommunity=Object.freeze({getMode:()=>state.mode,getState:()=>({mode:state.mode,posts:state.posts.length,groups:state.groups.length,pendingReports:window.NEXZOCommunityReports?.read(localStorage,state.user?.uid||identity().uid)?.length||0}),startOffline,syncPendingReports});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
