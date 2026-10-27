import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import fs from 'node:fs';
// Hard guard: this runner only writes to local demo emulators, never a real project.
process.env.NODE_ENV='test';process.env.FIREBASE_PROJECT_ID='demo-nexzo-release';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8085';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
for(const k of ['FIREBASE_SERVICE_ACCOUNT_JSON','GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_CLIENT_EMAIL','FIREBASE_PRIVATE_KEY','OPENAI_API_KEY','OPENAI_MODEL'])delete process.env[k];
process.env.GEMINI_API_KEY='emulator-provider-fixture';process.env.AI_RATE_LIMIT_PER_MINUTE='100';
const {default:app}=await import('../Backend/src/app.js');
const {firestore:db,adminAuth}=await import('../Backend/src/config/firebase.js');
const actualFetch=global.fetch;
let providerCalls=0,providerFailure=false;
global.fetch=async(url,options)=>{
 if(String(url).startsWith('https://generativelanguage.googleapis.com/')){
  providerCalls++;
  if(providerFailure)return Response.json({error:{message:'quota fixture, not real Google quota'}},{status:429});
  const body=JSON.parse(options.body),prompt=body.contents[0].parts[0].text;
  if(prompt.startsWith('Generate exactly')){
    const count=Number(prompt.match(/Generate exactly (\d+)/)[1]);
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({questions:Array.from({length:count},(_,i)=>`Question ${i+1}: Compare rational-agent actions under uncertainty with a concrete performance objective.`)})}]}}]});
  }
  const q=JSON.parse(prompt.match(/Questions: (\[[^\n]+\])/)[1]);
  const output={score:8,feedback:'The example explains the concept but omits one assumption.',strengths:['Concrete reasoning'],mistakes:['Assumption missing'],improvements:['State the assumption'],questionResults:q.map(question=>({question,score:8,feedback:'Reasoning is mostly correct.'}))};
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(output)}]}}]});
 }
 return actualFetch(url,options);
};
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
const base=`http://127.0.0.1:${server.address().port}/api`;
async function login(user,password){const r=await actualFetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password,returnSecureToken:true})});assert.equal(r.status,200);return (await r.json()).idToken;}
async function api(path,token,method='GET',body){const r=await actualFetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
const pass=randomUUID()+'Aa1!',a=await adminAuth.createUser({email:`release-a-${randomUUID()}@example.test`,password:pass,emailVerified:true}),b=await adminAuth.createUser({email:`release-b-${randomUUID()}@example.test`,password:pass,emailVerified:true});
const tokenA=await login(a,pass),tokenB=await login(b,pass);
let plan,taskId,answerKey;
test.after(async()=>{global.fetch=actualFetch;await new Promise(resolve=>server.close(resolve));});
test('unauthenticated evaluation is rejected',async()=>assert.equal((await api('/ai/evaluate',null,'POST',{taskId:'missing',answer:'A'})).status,401));

test('DC Circuits notes API bypasses exhausted AI and awards no learning credit',async()=>{
 const callsBefore=providerCalls;
 providerFailure=true;
 const topics=JSON.parse(fs.readFileSync(new URL('../Frontend/data/mriirs-cse-2023-27.json',import.meta.url),'utf8')).courses.find(c=>c.code==='BEE-103').units[0].topics;
 for(let topicIndex=0;topicIndex<topics.length;topicIndex++){
  const r=await api('/ai/notes',tokenA,'POST',{courseKey:'1:BEE-103',unitIndex:0,topicIndex,level:'Beginner'});
  assert.equal(r.status,200);
  assert.equal(r.data.notes.context.topic,topics[topicIndex]);
  assert.equal(r.data.notes.source,'curated-local');
  assert.equal(r.data.notes.notesSchemaVersion,5);
 }
 assert.equal(providerCalls,callsBefore);
 assert.equal((await db.collection(`users/${a.uid}/academicEvaluations`).get()).size,0);
 assert.equal((await db.collection(`users/${a.uid}/xpLedger`).get()).size,0);
 providerFailure=false;
});
test('MCQ preview stores private key; browser receives no correct answers',async()=>{
 const r=await api('/ai/planner',tokenA,'POST',{subject:'DSA',taskType:'MCQ Practice',level:'Beginner',questionCount:5});assert.equal(r.status,200);plan=r.data;assert.ok(plan.planId);assert.equal('answerKey' in plan,false);
 const snap=await db.doc(`users/${a.uid}/privateQuestionPlans/${plan.planId}`).get();answerKey=snap.data().answerKey;assert.equal(snap.data().uid,a.uid);assert.equal(providerCalls,0);
});
test('task contains exact preview; foreign plan and changed preview are refused',async()=>{
 taskId='test_'+plan.planId;
 const data={id:taskId,title:'DSA MCQ',subject:'DSA',type:'MCQ Practice',level:'Beginner',questionPlanId:plan.planId,generatedQuestions:plan.tasks[0].questions,status:'pending',updatedAtMs:Date.now(),uid:b.uid};
 assert.equal((await api('/user/tasks/'+taskId,tokenB,'PUT',{data})).status,403);
 assert.equal((await api('/user/tasks/'+taskId,tokenA,'PUT',{data:{...data,generatedQuestions:['Changed question']}})).status,409);
 const saved=await api('/user/tasks/'+taskId,tokenA,'PUT',{data});assert.equal(saved.status,200);assert.equal(saved.data.task.questionPlanId,plan.planId);assert.equal('uid' in saved.data.task,false);
 assert.deepEqual(saved.data.task.generatedQuestions,plan.tasks[0].questions);
});
test('cross-user task evaluation cannot read or influence another user',async()=>{
 assert.equal((await api('/ai/evaluate',tokenB,'POST',{taskId,answer:answerKey.join(',')})).status,404);
 assert.equal((await api('/user/tasks',tokenB)).data.tasks.some(t=>t.id===taskId),false);
});

test('one preview cannot create a duplicate Planner task under another ID',async()=>{
 const existing=(await db.doc(`users/${a.uid}/tasks/${taskId}`).get()).data();
 const r=await api('/user/tasks/duplicate_'+randomUUID(),tokenA,'PUT',{data:{...existing,id:'duplicate',updatedAtMs:Date.now()}});assert.equal(r.status,409);assert.equal(r.data.code,'PLAN_ALREADY_USED');
});
test('correct MCQ marks persist without provider even when provider is in quota failure',async()=>{
 providerFailure=true;const r=await api('/ai/evaluate',tokenA,'POST',{taskId,answer:answerKey.join(',')});assert.equal(r.status,200);assert.equal(r.data.score,10);assert.equal(r.data.serverVerified,true);assert.equal(r.data.persisted,true);assert.ok(r.data.xpAwarded>0);assert.equal(providerCalls,0);
 const task=(await db.doc(`users/${a.uid}/tasks/${taskId}`).get()).data();assert.equal(task.completed,true);assert.equal(task.evaluationId,r.data.evaluationId);
});
test('concurrent duplicate evaluations and refresh/re-login do not duplicate XP',async()=>{
 const before=(await db.doc(`users/${a.uid}/rewards/main`).get()).data().totalXP;
 const results=await Promise.all([api('/ai/evaluate',tokenA,'POST',{taskId,answer:answerKey.join(',')}),api('/ai/evaluate',tokenA,'POST',{taskId,answer:answerKey.join(',')})]);assert.ok(results.every(r=>r.status===200));assert.equal(results[0].data.evaluationId,results[1].data.evaluationId);
 const freshToken=await login(a,pass),restored=await api('/user/tasks',freshToken);assert.equal(restored.data.tasks.find(t=>t.id===taskId).score,10);assert.equal((await db.doc(`users/${a.uid}/rewards/main`).get()).data().totalXP,before);
 assert.equal((await db.collection(`users/${a.uid}/xpLedger`).get()).size,1);
});
test('failed subjective evaluation stores no receipt, score, completion or XP; retry succeeds',async()=>{
 const id='theory_'+randomUUID(),data={id,title:'AI reasoning',subject:'AI',type:'Short Questions',level:'Beginner',generatedQuestions:['Define a rational agent and illustrate its performance objective.'],status:'pending',updatedAtMs:Date.now()};
 assert.equal((await api('/user/tasks/'+id,tokenA,'PUT',{data})).status,200);
 const body={taskId:id,answer:'A rational agent chooses actions to maximize expected performance given observations.'};
 const bad=await api('/ai/evaluate',tokenA,'POST',body);assert.equal(bad.status,429);assert.equal(bad.data.code,'AI_QUOTA_EXCEEDED');assert.doesNotMatch(JSON.stringify(bad.data),/googleapis|quota fixture/);
 let task=(await db.doc(`users/${a.uid}/tasks/${id}`).get()).data();assert.equal(task.serverVerified,undefined);assert.notEqual(task.completed,true);
 assert.equal((await db.collection(`users/${a.uid}/academicEvaluations`).get()).size,1);
 providerFailure=false;const good=await api('/ai/evaluate',tokenA,'POST',body);assert.equal(good.status,200);assert.equal(good.data.score,8);assert.equal(good.data.persisted,true);
});
test('stale writes and browser-forged scores cannot replace a newer/verified result',async()=>{
 const id='stale_'+randomUUID(),data={id,title:'Pending revision',subject:'DSA',type:'Revision',status:'pending',updatedAtMs:Date.now()};const saved=await api('/user/tasks/'+id,tokenA,'PUT',{data});assert.equal(saved.status,200);
 assert.equal((await api('/user/tasks/'+id,tokenA,'PUT',{data:{...data,title:'Stale device',updatedAtMs:1}})).status,409);
 const r=await api('/user/tasks/'+taskId,tokenA,'PUT',{data:{id:taskId,title:'tampered',status:'pending',score:0,serverVerified:false,updatedAtMs:Date.now()}});assert.equal(r.status,200);assert.equal(r.data.task.score,10);assert.equal(r.data.task.completed,true);
});
test('legacy recovery is retained but public keys are not trusted',async()=>{
 const id='legacy_'+randomUUID();await db.doc(`users/${a.uid}/tasks/${id}`).set({id,uid:a.uid,title:'Recovery: Recovery: General - MCQ Practice',subject:'General',type:'MCQ Practice',generatedQuestions:['Legacy question'],answerKey:['A'],status:'pending',updatedAtMs:1});
 const result=await api('/ai/evaluate',tokenA,'POST',{taskId:id,answer:'A'});assert.equal(result.status,409);assert.equal(result.data.code,'MCQ_KEY_MISSING');assert.equal((await db.doc(`users/${a.uid}/tasks/${id}`).get()).exists,true);
});
test('Level 100 profile and existing XP are never reset or downgraded',async()=>{
 await db.doc(`users/${b.uid}/profile/main`).set({uid:b.uid,level:100,xp:270000,name:'Protected fixture'});
 await db.doc(`users/${b.uid}/rewards/main`).set({uid:b.uid,totalXP:270000,coins:731,xpPlanVersion:2,ledger:[],awarded:{}});
 const before=(await db.doc(`users/${b.uid}/profile/main`).get()).data();
 const id='level_'+randomUUID(),data={id,title:'Verified work',subject:'AI',type:'Theory Study',level:'Advanced',generatedQuestions:['Explain rational agents.'],status:'pending',updatedAtMs:Date.now()};await api('/user/tasks/'+id,tokenB,'PUT',{data});assert.equal((await api('/ai/evaluate',tokenB,'POST',{taskId:id,answer:'A rational agent maximizes its expected performance measure.'})).status,200);
 assert.deepEqual((await db.doc(`users/${b.uid}/profile/main`).get()).data(),before);const reward=(await db.doc(`users/${b.uid}/rewards/main`).get()).data();assert.equal(reward.totalXP,270000);assert.equal(reward.coins,731);
});

test('canonical practice respects count and evaluates only server-saved questions',async()=>{
 providerFailure=false;const academic={courseKey:'1:BCS-100A',unitIndex:0,topicIndex:0,level:'Beginner'};
 const generated=await api('/ai/practice',tokenA,'POST',{...academic,questionCount:3});assert.equal(generated.status,200);assert.equal(generated.data.tasks[0].questions.length,3);
 assert.equal((await api('/ai/evaluate',tokenA,'POST',{academic,taskId,answer:'A'})).status,400);
 assert.equal((await api('/user/tasks/invalid_plan',tokenA,'PUT',{data:{title:'bad plan',questionPlanId:'../another-user'}})).status,400);
 const planId=generated.data.planId,answer='A rational agent chooses actions to maximize expected performance under uncertainty.';
 const denied=await api('/ai/evaluate',tokenB,'POST',{academic,practicePlanId:planId,answer});assert.equal(denied.status,409);
 const wrong=await api('/ai/evaluate',tokenA,'POST',{academic:{...academic,topicIndex:1},practicePlanId:planId,answer});assert.equal(wrong.status,409);
 const result=await api('/ai/evaluate',tokenA,'POST',{academic,practicePlanId:planId,answer,questions:['Injected easier question']});assert.equal(result.status,200);assert.deepEqual(result.data.questions,generated.data.tasks[0].questions);
 const restored=await api('/user/evaluations',await login(a,pass));assert.ok(restored.data.evaluations.some(e=>e.evaluationId===result.data.evaluationId&&e.topicKey==='1:BCS-100A:u0:t0'));assert.equal('uid' in restored.data.evaluations[0],false);
});
test('Firestore rules hide private keys and reject forged receipts across two users',async()=>{
 const require=createRequire(new URL('./firebase-tests/package.json',import.meta.url)),rules=require('@firebase/rules-unit-testing'),client=require('firebase/firestore');
 const env=await rules.initializeTestEnvironment({projectId:'demo-nexzo-release',firestore:{host:'127.0.0.1',port:8085,rules:fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}});
 try{
  const own=env.authenticatedContext(a.uid,{email_verified:true}).firestore(),other=env.authenticatedContext(b.uid,{email_verified:true}).firestore();
  await rules.assertFails(client.getDoc(client.doc(own,`users/${a.uid}/privateQuestionPlans/${plan.planId}`)));
  await rules.assertFails(client.getDoc(client.doc(other,`users/${a.uid}/tasks/${taskId}`)));
  await rules.assertSucceeds(client.getDoc(client.doc(own,`users/${a.uid}/tasks/${taskId}`)));
  await rules.assertFails(client.updateDoc(client.doc(own,`users/${a.uid}/tasks/${taskId}`),{score:0}));
  const rewardsRef=client.doc(own,`users/${a.uid}/rewards/main`),reward=(await client.getDoc(rewardsRef)).data();assert.ok(reward.evaluationRevision>0);
  await rules.assertFails(client.updateDoc(rewardsRef,{totalXP:0}));
  await rules.assertFails(client.updateDoc(rewardsRef,{evaluationRevision:reward.evaluationRevision-1}));
  await rules.assertFails(client.updateDoc(rewardsRef,{lastEvaluationId:'forged'}));
  await rules.assertFails(client.setDoc(client.doc(own,`users/${a.uid}/academicEvaluations/forged`),{uid:a.uid,score:10}));
  await rules.assertFails(client.setDoc(client.doc(own,`users/${a.uid}/tasks/forged`),{uid:a.uid,id:'forged',title:'forged',status:'pending',score:10,serverVerified:true,updatedAtMs:Date.now()}));
 }finally{await env.cleanup();}
});
