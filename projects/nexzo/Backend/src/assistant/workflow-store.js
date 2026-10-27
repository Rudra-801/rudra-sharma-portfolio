import { firestore, firebaseAdmin, firebaseAdminDataReady } from '../config/firebase.js';

const volatileWorkflows=new Map();
const volatileMemory=new Map();
const key=(uid,chatId)=>`${uid}:${chatId}`;
const clone=value=>value==null?null:JSON.parse(JSON.stringify(value));

export async function getWorkflow(uid,chatId){
  if(firebaseAdminDataReady&&firestore){const snap=await firestore.collection('users').doc(uid).collection('assistantWorkflows').doc(chatId).get();const value=snap.exists?snap.data():null;if(value)volatileWorkflows.set(key(uid,chatId),clone(value));return value;}
  return clone(volatileWorkflows.get(key(uid,chatId))||null);
}
export async function saveWorkflow(uid,chatId,state){
  const value={...state,uid,chatId,updatedAtMs:Date.now()};
  if(firebaseAdminDataReady&&firestore){
    const ref=firestore.collection('users').doc(uid).collection('assistantWorkflows').doc(chatId);
    await ref.set({...value,updatedAt:firebaseAdmin.firestore.FieldValue.serverTimestamp()},{merge:true});
    const confirmed=await ref.get();
    if(!confirmed.exists||confirmed.data().uid!==uid||confirmed.data().updatedAtMs!==value.updatedAtMs)throw Object.assign(new Error('Study workflow save was not confirmed. Please retry.'),{status:503});
  }
  volatileWorkflows.set(key(uid,chatId),clone(value));
  return value;
}
export async function clearWorkflow(uid,chatId){
  if(firebaseAdminDataReady&&firestore)await firestore.collection('users').doc(uid).collection('assistantWorkflows').doc(chatId).delete();
  volatileWorkflows.delete(key(uid,chatId));
}
export async function getMemory(uid){
  if(firebaseAdminDataReady&&firestore){const snap=await firestore.collection('users').doc(uid).collection('assistantMemory').doc('profile').get();return snap.exists?snap.data():{};}
  return clone(volatileMemory.get(uid)||{});
}
export async function rememberInteraction(uid,input,route){
  const previous=await getMemory(uid);const message=String(input.message||'');
  const hinglish=/\b(kya|kaise|karna|bata|bta|mujhe|mera|hai|nahi|nhi|bro|yaar)\b/i.test(message);
  const topic=message.replace(/\s+/g,' ').slice(0,180);
  const value={preferredLanguage:hinglish?'Hinglish':previous.preferredLanguage||'English',recentIntents:[route.intent,...(previous.recentIntents||[]).filter(x=>x!==route.intent)].slice(0,6),recentTopics:[topic,...(previous.recentTopics||[]).filter(x=>x!==topic)].slice(0,8),updatedAtMs:Date.now()};
  if(firebaseAdminDataReady&&firestore){await firestore.collection('users').doc(uid).collection('assistantMemory').doc('profile').set({...value,updatedAt:firebaseAdmin.firestore.FieldValue.serverTimestamp()},{merge:true});}
  else volatileMemory.set(uid,clone(value));
  return value;
}
