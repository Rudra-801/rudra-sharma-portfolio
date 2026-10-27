import crypto from 'node:crypto';
import { z } from 'zod';
import { firestore, firebaseAdmin, firebaseAdminDataReady } from '../config/firebase.js';

import { confirmPlannerTransaction } from './planner-confirmation.js';
const plannerSchema=z.object({title:z.string().trim().min(1).max(160),subject:z.string().trim().min(1).max(80).default('General'),type:z.string().trim().max(70).default('Study'),level:z.string().trim().max(40).default('Beginner'),durationMinutes:z.coerce.number().int().min(5).max(1440).default(60),deadlineDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),deadlineTime:z.string().regex(/^\d{2}:\d{2}$/).default('23:59'),priority:z.enum(['Low','Medium','High']).default('Medium')});

export async function stagePlannerAction(uid,data){
  if(!firebaseAdminDataReady||!firestore)throw Object.assign(new Error('Planner cloud save is unavailable. Please retry later.'),{status:503});
  const payload=plannerSchema.parse(data);const id=crypto.randomUUID();const action={id,type:'planner.createTask',status:'pending',payload,createdAtMs:Date.now(),expiresAtMs:Date.now()+30*60*1000};
  if(firebaseAdminDataReady&&firestore)await firestore.collection('users').doc(uid).collection('assistantActions').doc(id).set({...action,uid,createdAt:firebaseAdmin.firestore.FieldValue.serverTimestamp()});

  return {id,type:action.type,status:'pending',title:'Create Planner task?',description:`${payload.title} · ${payload.durationMinutes} minutes`,preview:payload};
}
export async function confirmAction(uid,id){
  return confirmPlannerTransaction(firebaseAdminDataReady?firestore:null,uid,id,{
    parse:data=>plannerSchema.parse(data),stamp:()=>firebaseAdmin.firestore.FieldValue.serverTimestamp()
  });
}
