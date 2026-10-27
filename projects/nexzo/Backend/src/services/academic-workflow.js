import {createHash,randomUUID} from 'node:crypto';
import levels from './level-system.cjs';
import {gradeMcq,evaluateSubmission} from './learning-engines.js';
const fail=(message,status=409,code='EVALUATION_CONFLICT')=>Object.assign(new Error(message),{status,code});
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const questionDigest=t=>hash([t.generatedQuestions||[],t.subject||'',t.type||'',t.level||'',t.unit||'',t.topic||'']);
export const protectedTaskFields=['evaluationId','serverVerified','evaluationSource','evaluationMode','score','maxScore','submissionLocked','submittedAnswer','submittedAtMs','evaluatedAtMs','xpGranted','rewardClaimed','aiFeedback','questionPlanId'];
export const publicTask=t=>{const out={...t};delete out.answerKey;delete out.uid;return out;};
export async function storeQuestionPlan(db,uid,input,plan){
  if(!db)throw fail('Cloud question storage is unavailable.',503,'BACKEND_UNAVAILABLE');
  const id=randomUUID(),{answerKey,...preview}=plan;
  const record={uid,id,schemaVersion:1,input,preview,answerKey,createdAtMs:Date.now(),createdAt:new Date(),updatedAt:new Date()};
  await db.doc(`users/${uid}/privateQuestionPlans/${id}`).set(record);
  const saved=await db.doc(`users/${uid}/privateQuestionPlans/${id}`).get();
  if(saved.data()?.uid!==uid)throw fail('Question plan could not be confirmed.',503,'BACKEND_UNAVAILABLE');
  return {...preview,planId:id};
}
export async function savePlannerTask(db,uid,id,incoming){
  if(incoming.questionPlanId&&(typeof incoming.questionPlanId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(incoming.questionPlanId)))throw fail('Valid question preview identity required.',400,'PLAN_INVALID');
  const ref=db.doc(`users/${uid}/tasks/${id}`),now=Date.now();
  await db.runTransaction(async tx=>{
    const snap=await tx.get(ref),old=snap.exists?snap.data():null;
    if(old?.uid&&old.uid!==uid)throw fail('Task owner mismatch.',403);
    if(!old&&!incoming.questionPlanId&&(/mcq|quiz|diagnostic|practice questions/i.test(incoming.type||'')))throw fail('Generate validated questions before creating this task.',409,'PLAN_MISSING');
    let data={...incoming};delete data.answerKey;delete data.uid;
    for(const field of protectedTaskFields){if(old&&field in old)data[field]=old[field];else delete data[field];}
    if(old?.serverVerified){for(const field of ['done','completed','status','progress','generatedQuestions','subject','type','level','topic','unit','completedAtMs','running','lastStarted'])data[field]=old[field]??null;}
    if(old&&!old.serverVerified&&(!Number.isFinite(Number(incoming.updatedAtMs))||Number(incoming.updatedAtMs)<Number(old.updatedAtMs)))throw fail('A newer task exists. Refresh before saving.');
    if(incoming.questionPlanId&&!old?.serverVerified){
      const planSnap=await tx.get(db.doc(`users/${uid}/privateQuestionPlans/${incoming.questionPlanId}`)),p=planSnap.data();
      if(!p||p.uid!==uid)throw fail('Generate a preview in this account before creating a task.',403,'PLAN_MISSING');
      if(p.claimedTaskId&&p.claimedTaskId!==id)throw fail('This preview already belongs to a Planner task.',409,'PLAN_ALREADY_USED');
      const questions=p.preview.tasks.flatMap(t=>t.questions);
      if(JSON.stringify(questions)!==JSON.stringify(incoming.generatedQuestions)||incoming.type!==p.input.taskType||incoming.subject!==p.input.subject)throw fail('Task must contain exactly the previewed content.',409,'PLAN_CHANGED');
      if(!questions.length||questions.some(q=>typeof q!=='string'||!q.trim()))throw fail('Question plan is empty or malformed.',409,'QUESTIONS_MISSING');
      if(p.preview.questionFormat==='mcq'&&(!Array.isArray(p.answerKey)||p.answerKey.length!==questions.length))throw fail('MCQ answer key is missing.',409,'MCQ_KEY_MISSING');
      data.questionFormat=p.preview.questionFormat||(Array.isArray(p.answerKey)?'mcq':'descriptive');
      data.questionPlanId=incoming.questionPlanId;data.level=p.input.level;data.unit=p.input.unit||'';data.topic=p.input.topic||'';
      tx.set(planSnap.ref,{claimedTaskId:id,updatedAt:new Date(now)},{merge:true});
    }
    tx.set(ref,{...data,id,uid,updatedAtMs:now,updatedAt:new Date(now)},{merge:true});
  });
  const confirmed=await ref.get();if(confirmed.data()?.uid!==uid)throw fail('Task save was not confirmed.',503,'BACKEND_UNAVAILABLE');
  return publicTask(confirmed.data());
}
export async function prepareEvaluation(db,uid,input){
  if(!db)throw fail('Evaluation persistence is unavailable.',503,'BACKEND_UNAVAILABLE');
  if(!input.taskId)return {...input,questions:input.questions||[input.question]};
  const snap=await db.doc(`users/${uid}/tasks/${input.taskId}`).get(),task=snap.data();
  if(!task||task.uid&&task.uid!==uid)throw fail('This task does not exist in your Planner.',404,'TASK_MISSING');
  if(task.serverVerified&&task.evaluationId){const receipt=await db.doc(`users/${uid}/academicEvaluations/${task.evaluationId}`).get();if(receipt.data()?.uid===uid)return {existing:receipt.data()};throw fail('The evaluation receipt is unavailable.',503);}
  const questions=task.generatedQuestions;
  if(!Array.isArray(questions)||!questions.length||questions.length>25||questions.some(q=>typeof q!=='string'||!q.trim())||questions.join('\n').length>16000)throw fail('This task needs a bounded set of generated questions. Regenerate it; the original task is preserved.',409,'QUESTIONS_MISSING');
  let answerKey=null;
  if(task.questionFormat==='mcq'||/mcq|quiz|diagnostic/i.test(task.type||task.questionType||'')){
    if(task.questionPlanId){const plan=await db.doc(`users/${uid}/privateQuestionPlans/${task.questionPlanId}`).get(),p=plan.data();if(p?.uid===uid&&JSON.stringify(p.preview.tasks.flatMap(t=>t.questions))===JSON.stringify(questions))answerKey=p.answerKey;}
    // A browser-supplied legacy answerKey is never accepted as trusted grading evidence.
    if(!answerKey)throw fail('This older quiz needs a fresh server-owned question preview. Your task and submission are preserved.',409,'MCQ_KEY_MISSING');
  }
  return {...input,question:questions.join('\n'),questions,answerKey,subject:task.subject,taskType:task.type,level:task.level,unit:task.unit||'',topic:task.topic||'',questionDigest:questionDigest(task)};
}
export const evaluationId=(uid,input)=>hash([uid,input.taskId||input.topicKey||'',input.questions,input.answer]);
export async function persistEvaluation(db,uid,input,result,{now=Date.now()}={}){
  const id=evaluationId(uid,input),ref=db.doc(`users/${uid}/academicEvaluations/${id}`),rewardRef=db.doc(`users/${uid}/rewards/main`),profileRef=db.doc(`users/${uid}/profile/main`),ledgerRef=db.doc(`users/${uid}/xpLedger/evaluation_${id}`),taskRef=input.taskId?db.doc(`users/${uid}/tasks/${input.taskId}`):null;
  await db.runTransaction(async tx=>{
    const [receipt,reward,profile,ledger,task]=await Promise.all([tx.get(ref),tx.get(rewardRef),tx.get(profileRef),tx.get(ledgerRef),taskRef?tx.get(taskRef):null]);
    if(receipt.exists)return;
    const t=task?.data()||{};
    if(taskRef&&(!task.exists||t.serverVerified||questionDigest(t)!==input.questionDigest))throw fail('Task changed during evaluation. Refresh to read its confirmed result.');
    const previous=reward.data()||{},p=profile.data()||{},passed=result.score>=4;
    // Preserve all existing profile/Level 100 data. Never migrate or downgrade it.
    const oldXP=Math.max(0,Number(previous.totalXP)||0,Number(p.xp)||0),level=Math.max(Number(p.level)||1,levels.resolve(oldXP).level);
    const unique=input.taskId?`lifetime:planner:${input.taskId}`:`lifetime:academics:${input.topicKey||id}`;
    const base=/advanced/i.test(input.level)?90:/beginner/i.test(input.level)?40:60;
    const amount=passed&&!ledger.exists&&!previous.awarded?.[unique]&&!t.xpGranted&&!t.rewardClaimed?Math.min(Math.round(base*levels.levelMultiplier(level)),Math.max(0,270000-oldXP)):0;
    const record={...result,id,evaluationId:id,uid,schemaVersion:2,serverVerified:true,source:'server-evaluation',academic:input.academic||null,taskId:input.taskId||null,topicKey:input.topicKey||null,subject:input.subject||'',unit:input.unit||'',topic:input.topic||'',questions:input.questions,answer:input.answer,maxScore:10,passed,passThreshold:4,xpAwarded:amount,createdAt:new Date(now),updatedAt:new Date(now),evaluatedAtMs:now};
    tx.set(ref,record);
    if(taskRef)tx.set(taskRef,{evaluationId:id,serverVerified:true,evaluationSource:'verified',evaluationMode:result.evaluationMode,score:result.score,maxScore:10,aiFeedback:result.feedback,feedback:result.feedback,aiStrengths:result.strengths,aiSuggestions:result.improvements,questionResults:result.questionResults,submissionLocked:true,submittedAnswer:input.answer,evaluatedAtMs:now,submittedAtMs:now,done:passed,completed:passed,status:passed?'completed':'needs-improvement',running:false,lastStarted:null,rewardClaimed:amount>0||Boolean(t.rewardClaimed),xpGranted:amount>0||Boolean(t.xpGranted),...(passed?{progress:100,completedAtMs:now}:{}),updatedAtMs:now},{merge:true});
    if(amount){const item={id:`evaluation_${id}`,uid,date:new Date(now).toISOString().slice(0,10),subject:input.subject||'',reason:'Verified academic evaluation',source:taskRef?'planner':'academics',actionId:input.taskId||input.topicKey||id,evaluationId:id,amount,coins:Math.floor(amount/10),createdAtMs:now,verified:true};tx.set(ledgerRef,item);tx.set(rewardRef,{uid,version:4,xpPlanVersion:2,evaluationRevision:(Number(previous.evaluationRevision)||0)+1,lastEvaluationId:id,totalXP:oldXP+amount,coins:Math.max(0,Number(previous.coins)||0)+item.coins,awarded:{...(previous.awarded||{}),[unique]:now},ledger:[item,...(previous.ledger||[])].slice(0,300),updatedAtMs:now},{merge:true});}
  });
  const saved=await ref.get();if(saved.data()?.uid!==uid||saved.data()?.evaluationId!==id)throw fail('Evaluation could not be confirmed. Retry safely.',503,'BACKEND_UNAVAILABLE');
  const out={...saved.data(),persisted:true};delete out.uid;
  if(taskRef){const t=await taskRef.get();if(t.data()?.evaluationId!==id)throw fail('Task evaluation read-back failed.',503);out.task=publicTask(t.data());}
  return out;
}
export async function gradeMcqOnly(db,uid,input){
  const prepared=await prepareEvaluation(db,uid,input);
  if(prepared.existing){const saved=prepared.existing;return {score:Number(saved.score)||0,correctness:saved.correctness??null,understanding:saved.understanding??null,completeness:saved.completeness??100,presentation:saved.presentation??null,feedback:saved.feedback||saved.aiFeedback||'Already evaluated.',strengths:saved.strengths||saved.aiStrengths||[],improvements:saved.improvements||saved.aiSuggestions||[],questionResults:saved.questionResults||[],evaluationMode:saved.evaluationMode||'deterministic-mcq',alreadySaved:true};}
  if(!prepared.answerKey)throw fail('Instant marking is available only for MCQ tasks.',400,'NOT_MCQ');
  return gradeMcq(prepared.answerKey,prepared.answer,prepared.questions);
}
export async function evaluateAndPersist(db,uid,input,options={}){
  const prepared=await prepareEvaluation(db,uid,input);
  if(prepared.existing){const {uid:owner,...saved}=prepared.existing;const task=await db.doc(`users/${uid}/tasks/${input.taskId}`).get();return {...saved,persisted:true,task:publicTask(task.data())};}
  const previous=await db.doc(`users/${uid}/academicEvaluations/${evaluationId(uid,prepared)}`).get();
  if(previous.exists)return {...publicTask(previous.data()),persisted:true};
  const result=prepared.answerKey?gradeMcq(prepared.answerKey,prepared.answer,prepared.questions):await evaluateSubmission(prepared,options);
  return persistEvaluation(db,uid,prepared,result);
}
