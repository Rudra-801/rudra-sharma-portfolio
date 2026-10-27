import 'dotenv/config';
import { firestore, firebaseAdminDataReady } from '../config/firebase.js';
import { deepResearch } from '../services/advanced-tools.js';

export async function runDueSchedules({limit=40}={}){
  if(!firebaseAdminDataReady||!firestore)throw new Error('Firebase Admin credentials are required for scheduled tasks.');
  if(!process.env.GEMINI_API_KEY)throw new Error('GEMINI_API_KEY is required for scheduled research tasks.');
  const now=Date.now();
  const snap=await firestore.collectionGroup('assistantSchedules').where('status','==','scheduled').limit(limit).get();
  const due=snap.docs.filter(doc=>Number(doc.data()?.runAtMs||0)<=now).sort((a,b)=>Number(a.data().runAtMs)-Number(b.data().runAtMs));
  const results=[];
  for(const doc of due){
    const row=doc.data();
    try{
      await doc.ref.set({status:'running',startedAtMs:Date.now()},{merge:true});
      const result=await deepResearch(row.prompt);
      if(row.repeat==='none')await doc.ref.set({status:'completed',lastRunAtMs:Date.now(),result:result.text,sources:result.sources||[]},{merge:true});
      else{const add=row.repeat==='daily'?86400000:604800000;await doc.ref.set({status:'scheduled',runAtMs:Math.max(Date.now(),Number(row.runAtMs)||0)+add,lastRunAtMs:Date.now(),result:result.text,sources:result.sources||[]},{merge:true});}
      results.push({id:doc.id,ok:true});
    }catch(error){await doc.ref.set({status:'scheduled',lastError:String(error?.message||error),lastErrorAtMs:Date.now()},{merge:true});results.push({id:doc.id,ok:false,error:String(error?.message||error)});}
  }
  return {checked:snap.size,due:due.length,results};
}

if(import.meta.url===`file://${process.argv[1]}`){runDueSchedules().then(result=>{console.log(JSON.stringify({ok:true,...result}));process.exit(0)}).catch(error=>{console.error(error);process.exit(1)});}
