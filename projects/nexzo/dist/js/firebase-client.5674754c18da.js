/* NEXZO Firebase Client v3 — one SDK version, one app instance, shared by every page. */
(function(){
  'use strict';
  if(window.NEXZOFirebase) return;
  const SDK_VERSION='10.12.5';
  const CONFIG=Object.freeze({
    apiKey:'AIzaSyALYRXOXr_jb8djjgNi_eu6AKheQUWvRoA',
    authDomain:'personalized-recommendersystem.firebaseapp.com',
    projectId:'personalized-recommendersystem',
    storageBucket:'personalized-recommendersystem.firebasestorage.app',
    messagingSenderId:'251161281833',
    appId:'1:251161281833:web:37ca8f03e0eb787ef8a338',
    measurementId:'G-V9ZQTK8FRM'
  });
  const modulePromises={};
  let appPromise=null;
  const load=name=>modulePromises[name]||(modulePromises[name]=import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-${name}.js`));
  async function getApp(){
    if(!appPromise) appPromise=(async()=>{const tools=await load('app');return tools.getApps().length?tools.getApp():tools.initializeApp(CONFIG)})();
    return appPromise;
  }
  async function getContext(options={auth:true}){
    const app=await getApp();
    const context={app,config:CONFIG,version:SDK_VERSION,appTools:await load('app')};
    const jobs=[];
    if(options.auth!==false) jobs.push(load('auth').then(tools=>Object.assign(context,{authTools:tools,auth:tools.getAuth(app)})));
    if(options.firestore) jobs.push(load('firestore').then(tools=>Object.assign(context,{firestoreTools:tools,db:tools.getFirestore(app)})));
    if(options.storage) jobs.push(load('storage').then(tools=>Object.assign(context,{storageTools:tools,storage:tools.getStorage(app)})));
    await Promise.all(jobs);
    return context;
  }
  const getAuthContext=async()=>{const c=await getContext({auth:true});return {app:c.app,auth:c.auth,tools:c.authTools}};
  window.NEXZOFirebase=Object.freeze({config:CONFIG,version:SDK_VERSION,getApp,getContext,getAuthContext});
})();
