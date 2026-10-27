/* NEXZO Authentication Controller - stable single-authority flow. */
(function(){
  'use strict';
  if(window.__NEXZO_AUTH_CONTROLLER_BOUND__) return;
  window.__NEXZO_AUTH_CONTROLLER_BOUND__=true;
  const $=id=>document.getElementById(id);
  const page=document.body?.dataset.page||'';
  const message=(text='',type='error')=>{const box=$('authMessage');if(!box)return text&&alert(text);box.textContent=text;box.className=`auth-message ${type}`;};
  const busy=value=>{const button=$(page==='signup'?'createAccountButton':'signInButton');if(button){button.disabled=value;button.setAttribute('aria-busy',String(value));}};
  const errorText=error=>({
    'auth/invalid-credential':'Email or password is incorrect.',
    'auth/user-not-found':'No account exists for this email.',
    'auth/wrong-password':'Email or password is incorrect.',
    'auth/email-already-in-use':'This email is already registered. Please sign in.',
    'auth/weak-password':'Use at least 8 characters with a letter and number.',
    'auth/popup-closed-by-user':'The sign-in popup was closed.',
    'auth/popup-blocked':'Allow popups for this site and try again.',
    'auth/account-exists-with-different-credential':'This email already uses another sign-in method.',
    'auth/unauthorized-domain':'Add this domain to Firebase Authentication authorised domains.',
    'auth/network-request-failed':'Could not reach Firebase. Check your connection.',
    'auth/too-many-requests':'Too many attempts. Wait a few minutes and retry.'
  }[error?.code]||error?.message||'Authentication failed.');
  const passwordProvider=user=>user?.providerData?.some(row=>row.providerId==='password');

  const normalizeUsername=value=>String(value||'').trim().toLowerCase().replace(/^@/,'');
  const validUsername=value=>/^[a-z0-9._]{3,20}$/.test(normalizeUsername(value));
  async function saveIdentity(user,username,nameOverride=''){
    const usernameClean=normalizeUsername(username);if(!validUsername(usernameClean))throw new Error('Username must be 3–20 characters using letters, numbers, dot or underscore.');
    const ctx=await window.NEXZOFirebase.getContext({auth:true,firestore:true}),f=ctx.firestoreTools;
    const usernameRef=f.doc(ctx.db,'usernames',usernameClean),profileRef=f.doc(ctx.db,'users',user.uid,'profile','main'),publicRef=f.doc(ctx.db,'publicProfiles',user.uid);
    await f.runTransaction(ctx.db,async tx=>{const snap=await tx.get(usernameRef);if(snap.exists()&&snap.data()?.uid!==user.uid)throw Object.assign(new Error(`@${usernameClean} is already taken.`),{code:'username/taken'});tx.set(usernameRef,{uid:user.uid,username:usernameClean,updatedAtMs:Date.now()},{merge:true});const publicData={uid:user.uid,name:String(nameOverride||user.displayName||user.email?.split('@')[0]||'Student').trim(),username:usernameClean,photoURL:user.photoURL||'',updatedAtMs:Date.now()};tx.set(profileRef,{...publicData,email:user.email||'',termsAcceptedVersion:'2026-09-01',termsAcceptedAtMs:Date.now()},{merge:true});tx.set(publicRef,publicData,{merge:true});});
    localStorage.setItem('nexzo_username',usernameClean);return usernameClean;
  }
  async function existingUsername(user){try{const ctx=await window.NEXZOFirebase.getContext({auth:true,firestore:true}),f=ctx.firestoreTools,snap=await f.getDoc(f.doc(ctx.db,'users',user.uid,'profile','main'));return normalizeUsername(snap.exists()?snap.data()?.username:'')}catch(_){return normalizeUsername(localStorage.getItem('nexzo_username'))}}
  function usernameModal(user){return new Promise(resolve=>{let root=document.getElementById('nxUsernameGate');if(root)root.remove();const displayName=String(user?.displayName||user?.email?.split('@')[0]||'Student').trim();const suggestion=normalizeUsername(displayName).replace(/[^a-z0-9._]+/g,'.').replace(/^\.+|\.+$/g,'').slice(0,20);root=document.createElement('div');root.id='nxUsernameGate';root.className='nx-username-gate';root.innerHTML=`<div class="nx-username-card" role="dialog" aria-modal="true" aria-labelledby="nxUsernameTitle"><div class="nx-username-mark">@</div><div class="nx-username-copy"><span class="nx-username-kicker">ONE-TIME SETUP</span><h2 id="nxUsernameTitle">Set your NEXZO tag</h2><p><strong>${displayName.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</strong> stays your display name. Your tag only identifies you when students have the same name.</p></div><label for="nxUsernameInput">Unique tag</label><div class="nx-username-input"><span>@</span><input id="nxUsernameInput" maxlength="20" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="rudra.sharma"></div><small>3–20 letters, numbers, dot or underscore · shown as @tag in Community and Study Groups</small><div class="nx-username-error" aria-live="polite"></div><button type="button">Save tag & continue</button></div>`;document.body.appendChild(root);const input=root.querySelector('input'),button=root.querySelector('button'),error=root.querySelector('.nx-username-error');if(validUsername(suggestion))input.value=suggestion;input.focus();input.select();const submit=async()=>{const value=normalizeUsername(input.value);if(!validUsername(value)){error.textContent='Use 3–20 letters, numbers, dot or underscore.';return}button.disabled=true;button.textContent='Checking availability…';try{await saveIdentity(user,value);root.remove();resolve(value)}catch(e){error.textContent=e.code==='username/taken'?`@${value} is already taken. Try another tag.`:(e.message||'Could not save your tag.');button.disabled=false;button.textContent='Save tag & continue'}};button.onclick=submit;input.addEventListener('keydown',e=>{if(e.key==='Enter')submit()});});}
  async function requireUsername(user){const found=await existingUsername(user);if(found){localStorage.setItem('nexzo_username',found);return found}return usernameModal(user)}

  function saveLocal(user,token=''){
    const email=user.email||'',name=user.displayName||email.split('@')[0]||'Student';
    const profile={uid:user.uid,name,email,photoURL:user.photoURL||''};
    localStorage.setItem('loggedIn','true');localStorage.removeItem('nexzo_guest_mode');
    localStorage.setItem('currentUser',name);localStorage.setItem('userName',name);localStorage.setItem('email',email);
    localStorage.setItem('nexzo_user',JSON.stringify(profile));if(token)localStorage.setItem('token',token);
  }
  async function syncBackend(user,token){
    const base=String(window.NEXZO_CONFIG?.API_BASE_URL||'').replace(/\/$/,'');if(!base)return;
    try{const response=await fetch(`${base}/auth/firebase`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout?.(8000)});if(response.ok){const data=await response.json();if(data.user)localStorage.setItem('nexzo_user',JSON.stringify(data.user));}}catch(error){console.warn('[NEXZO Auth] Backend session sync unavailable:',error.message)}
  }
  async function finish(user){
    if(passwordProvider(user)&&!user.emailVerified){
      const {auth,tools}=await window.NEXZOFirebase.getAuthContext();
      await tools.sendEmailVerification(user).catch(()=>{});await tools.signOut(auth);
      throw Object.assign(new Error('Verify your email first. A new verification link has been sent.'),{code:'auth/email-not-verified'});
    }
    await requireUsername(user);
    const token=await user.getIdToken(true);saveLocal(user,token);await syncBackend(user,token);
    const allowed=new Set(['Home.html','academics.html','career.html','ai-assistant.html','planner.html','community.html','dashboard.html','nexzo-hub.html','settings.html','profile.html']);const saved=localStorage.getItem('redirectPage')||'Home.html';const target=allowed.has(saved)?saved:'Home.html';localStorage.removeItem('redirectPage');location.replace(target);
  }
  function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||'').trim())}
  function validateLoginFields(){
    const email=$('email')?.value.trim()||'';const password=$('password')?.value||'';
    if(!email)return message('Enter your email address.','error'),false;
    if(!validEmail(email))return message('Enter a valid email address, not your name. Example: name@example.com','error'),false;
    if(!password)return message('Enter your password.','error'),false;
    return true;
  }
  async function login(event){
    event?.preventDefault();if(!validateLoginFields())return;busy(true);message('Signing in…','info');
    try{const {auth,tools}=await window.NEXZOFirebase.getAuthContext();const result=await tools.signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);await finish(result.user);}catch(error){message(errorText(error),error?.code==='auth/email-not-verified'?'info':'error');busy(false)}
  }
  async function signup(event){
    event?.preventDefault();const password=$('password').value;const name=$('name').value.trim();const email=$('email').value.trim();const username=normalizeUsername($('username')?.value||'');
    if(!name)return message('Enter your full name.');
    if(!validUsername(username))return message('Choose a username: 3–20 letters, numbers, dot or underscore.');
    if(!$('legalAgreement')?.checked)return message('Please agree to the Terms of Service and acknowledge the Privacy Policy.');
    if(!validEmail(email))return message('Enter a valid email address.');
    if(password.length<8||!/\p{L}/u.test(password)||!/\d/.test(password))return message('Password must contain at least 8 characters, one letter and one number.');
    busy(true);message('Creating account…','info');
    try{const {auth,tools}=await window.NEXZOFirebase.getAuthContext();const result=await tools.createUserWithEmailAndPassword(auth,email,password);await tools.updateProfile(result.user,{displayName:name});try{await saveIdentity(result.user,username,name)}catch(identityError){try{await result.user.delete()}catch(_){}throw identityError}await tools.sendEmailVerification(result.user);await tools.signOut(auth);message('Account created. Check your email, verify it, then sign in.','success');setTimeout(()=>location.replace('login.html?reason=verify'),1800);}catch(error){message(errorText(error));busy(false)}
  }
  async function providerLogin(providerName){
    busy(true);message(`Opening ${providerName}…`,'info');
    try{const {auth,tools}=await window.NEXZOFirebase.getAuthContext();const provider=providerName==='google'?new tools.GoogleAuthProvider():new tools.GithubAuthProvider();if(providerName==='google')provider.setCustomParameters({prompt:'select_account'});else{provider.addScope('read:user');provider.addScope('user:email');}const result=await tools.signInWithPopup(auth,provider);await finish(result.user);}catch(error){message(errorText(error));busy(false)}
  }
  async function forgotPassword(event){event?.preventDefault();const email=$('email')?.value.trim()||prompt('Enter your account email:')?.trim();if(!email)return;try{const {auth,tools}=await window.NEXZOFirebase.getAuthContext();await tools.sendPasswordResetEmail(auth,email);message('Password-reset email sent.','success')}catch(error){message(errorText(error))}}
  function guestLogin(){localStorage.setItem('loggedIn','guest');localStorage.setItem('nexzo_guest_mode','true');localStorage.removeItem('token');localStorage.removeItem('redirectPage');location.replace('academics.html')}
  function togglePassword(id,button){const input=$(id);if(!input)return;input.type=input.type==='password'?'text':'password';if(button)button.textContent=input.type==='password'?'Show':'Hide'}
  function sanitizeAutofill(){
    const input=$('email');if(!input)return;const value=input.value.trim();
    if(value&&!value.includes('@')){input.value='';input.setAttribute('data-cleared-invalid-autofill','true');}
  }
  function bind(){
    const form=document.querySelector('.auth-box');if(form&&!form.dataset.authBound){form.dataset.authBound='true';form.addEventListener('submit',page==='signup'?signup:login);}
    sanitizeAutofill();setTimeout(sanitizeAutofill,250);setTimeout(sanitizeAutofill,900);
    window.addEventListener('pageshow',sanitizeAutofill,{once:true});
    document.querySelector('[data-action="toggle-password"]')?.addEventListener('click',e=>togglePassword('password',e.currentTarget));
    document.querySelector('[data-action="forgot-password"]')?.addEventListener('click',forgotPassword);
    document.querySelector('[data-provider="google"]')?.addEventListener('click',()=>providerLogin('google'));
    document.querySelector('[data-provider="github"]')?.addEventListener('click',()=>providerLogin('github'));
    document.querySelector('[data-action="guest-login"]')?.addEventListener('click',guestLogin);
    const reason=new URLSearchParams(location.search).get('reason');if(reason==='verify')message('Verify your email, then sign in.','info');else if(reason==='protected'){const target=(localStorage.getItem('redirectPage')||'selected feature').replace('.html','').replace(/-/g,' ');message(`Sign in to continue to ${target}. It will open automatically after login.`,'info');}else if(reason==='session'||reason==='session-expired')message('Your session expired or could not be refreshed. Sign in again; your selected page will open automatically.','info');
  }
  Object.assign(window,{login,signup,forgotPassword,googleLogin:()=>providerLogin('google'),githubLogin:()=>providerLogin('github'),guestLogin,togglePassword});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
