import { firebaseAdmin, firestore, firebaseAdminDataReady } from '../config/firebase.js';

const clean=(v,n=160)=>String(v||'').trim().slice(0,n);
export async function pushToUsers(uids,{title='NEXZO',body='',url='./Home.html',tag='nexzo',data={}}={}){
  if(!firebaseAdminDataReady||!firestore||!Array.isArray(uids)||!uids.length)return {sent:0,skipped:true};
  const unique=[...new Set(uids.filter(Boolean))].slice(0,500), tokens=[];
  await Promise.all(unique.map(async uid=>{try{const snap=await firestore.doc(`users/${uid}/settings/push`).get();const token=snap.data()?.token;if(token)tokens.push({uid,token});}catch{}}));
  if(!tokens.length)return {sent:0};
  const payload={notification:{title:clean(title,120)||'NEXZO',body:clean(body,220)||'You have a new update.'},data:{url:clean(url,500)||'./Home.html',tag:clean(tag,80),...Object.fromEntries(Object.entries(data||{}).map(([k,v])=>[k,clean(v,500)]))},tokens:tokens.map(x=>x.token),webpush:{fcmOptions:{link:clean(url,500)||'./Home.html'}}};
  try{
    const result=await firebaseAdmin.messaging().sendEachForMulticast(payload);
    const dead=[];result.responses.forEach((r,i)=>{if(!r.success&&/registration-token-not-registered|invalid-registration-token/.test(String(r.error?.code||'')))dead.push(tokens[i].uid)});
    await Promise.all(dead.map(uid=>firestore.doc(`users/${uid}/settings/push`).set({token:'',invalidatedAtMs:Date.now()},{merge:true}).catch(()=>{})));
    return {sent:result.successCount,failed:result.failureCount};
  }catch(error){console.warn('[push]',error.message);return {sent:0,error:error.message};}
}
export async function createUserNotification(uid,{title,body,url,type='general',sourceId=''}){
  if(!firebaseAdminDataReady||!firestore||!uid)return;
  await firestore.collection('users').doc(uid).collection('notifications').add({title:clean(title,120),body:clean(body,300),href:clean(url,500),type:clean(type,40),sourceId:clean(sourceId,128),read:false,createdAtMs:Date.now()}).catch(()=>{});
}
