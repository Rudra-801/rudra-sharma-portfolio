import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../Frontend/js/planner-controller.js',import.meta.url),'utf8');
// Execute the existing controller functions with controlled DOM/network boundaries.
function part(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)+start.length));}
const generation=part('  async function requestAIPlan()','  async function regenerateLegacyTask(');
const creation=part('  async function createTask(','  function startOfWeekMs(');
const submission=part('  async function submitForAI()','  function showSubmitError(');
const normalize=part('  function normalizeAIResult(','  async function submitForAI(');
const controls=part('  function subjectOptions(','  function refreshTargetOptions(');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
function boot({planner=async()=>{},putTask=async()=>{},evaluate=async()=>{}}={}){
 let uid='test-A';const messages=[],local=[],events=[];
 const node=()=>({value:'',textContent:'',innerHTML:'',style:{},dataset:{},classList:{add(){},remove(){}}});
 const els=Object.fromEntries(['roadSub','aiPreview','pasteAnswer','writeAnswer','submitNote','proofFile','submitError','submitStatus'].map(k=>[k,node()]));
 const button=node(),task={id:'saved-task',type:'Short Questions',generatedQuestions:['Define a rational agent.'],done:false};
 const payload={subject:'AI',taskType:'Short Questions',questionCount:1,level:'Beginner'};
 const c=vm.createContext({console,Promise,Date,JSON,Number,Boolean,String,Array,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},
 generationBusy:false,creationBusy:false,submissionBusy:false,latestAIPlan:null,previousPlanQuestions:[],previousPlanSignature:'',bounded:p=>p,isMcqTask:t=>/mcq|quiz/i.test(t.type),validMcqBundle:()=>true,payload,tasks:[task],activeTaskId:task.id,submitMode:'paste',filter:'All',els,
 planInput:()=>({...payload}),submissionOwner:()=>uid,countNum:()=>1,renderSuggestion(){},normalizeTask:v=>v,
 makeTask:()=>({id:'planner_plan-1',questionPlanId:'plan-1',type:payload.taskType,generatedQuestions:['Define a rational agent.']}),saveTasks(){},render(){},esc:v=>String(v),updateEval(){},isOverdue:()=>false,collectMcqAttempt:()=>['A'],showSubmitError:m=>messages.push(m),confirmSubmissionSave:async()=>({cloud:true}),
 document:{querySelector:()=>button},window:{dispatchEvent:e=>events.push(e),NEXZODataService:{getUser:()=>({uid})},NEXZOAI:{planner,evaluate},NEXZOBackendStore:{putTask},NEXZOTaskStore:{upsert:v=>local.push(v)},NEXZOShell:{toast:(m,t)=>messages.push({m,t})}}});
 vm.runInContext(generation+creation+normalize+submission+controls,c);
 return {c,payload,els,task,button,messages,local,events,setOwner:v=>uid=v};
}
test('DSA and ML task types/targets are available synchronously without network calls',()=>{
 const {c}=boot();for(const subject of ['DSA','Machine Learning']){const types=c.subjectOptions(subject).types;for(const type of ['Theory Study','MCQ Practice','Coding Practice','Short Questions','Long Questions'])assert.ok(types.includes(type));assert.ok(c.targetOptionsForType('MCQ Practice',subject).includes('10 MCQs'));assert.ok(c.targetOptionsForType('Coding Practice',subject).includes('3 Coding Problems'));}
});
test('Generate produces a preview without secretly creating a task; double click sends once',async()=>{
 const d=deferred();let calls=0,saves=0;const s=boot({planner:()=>{calls++;return d.promise;},putTask:()=>saves++});const first=s.c.requestAIPlan();await s.c.requestAIPlan();assert.equal(calls,1);d.resolve({planId:'plan-1',tasks:[{questions:['Define a rational agent.']}]});assert.equal(await first,true);assert.equal(saves,0);assert.equal(s.c.latestAIPlan.planId,'plan-1');
});
test('Changed form or changed user rejects an in-flight preview',async()=>{
 for(const change of [s=>s.payload.subject='DSA',s=>s.setOwner('test-B')]){const d=deferred(),s=boot({planner:()=>d.promise});const p=s.c.requestAIPlan();change(s);d.resolve({planId:'plan-1',tasks:[{questions:['Define a rational agent.']}]});assert.equal(await p,false);assert.equal(s.c.latestAIPlan,null);}
});
test('Failed generation creates no task; exact preview survives cloud read-back',async()=>{
 let saves=0;const s=boot({putTask:async(id,task)=>{saves++;return {ok:true,task:{...task,id}};}});await s.c.createTask();assert.equal(saves,0);s.c.latestAIPlan={planId:'plan-1',inputSignature:JSON.stringify(s.payload)};await s.c.createTask();assert.equal(saves,1);assert.deepEqual(Array.from(s.c.tasks[0].generatedQuestions),['Define a rational agent.']);assert.ok(s.messages.some(x=>x.t==='success'));
});
test('Duplicate Create is suppressed while save is pending',async()=>{
 const d=deferred();let saves=0;const s=boot({putTask:()=>{saves++;return d.promise;}});s.c.latestAIPlan={planId:'plan-1',inputSignature:JSON.stringify(s.payload)};const a=s.c.createTask();await s.c.createTask();assert.equal(saves,1);d.resolve({ok:true,task:{id:'planner_plan-1'}});await a;
});
test('Backend outage preserves preview but creates no unusable local task',async()=>{
 const s=boot({putTask:async()=>{throw new Error('Service unavailable');}});s.c.latestAIPlan={planId:'plan-1',inputSignature:JSON.stringify(s.payload)};await s.c.createTask();assert.equal(s.local.length,0);assert.equal(s.messages.some(x=>x.t==='success'),false);assert.ok(s.c.latestAIPlan);
});
test('Duplicate Evaluate sends once, failed quota retains draft and no XP or completion',async()=>{
 const d=deferred();let requests=0;const s=boot({evaluate:()=>{requests++;return d.promise;}});s.els.pasteAnswer.value='An agent maximizes expected performance.';const a=s.c.submitForAI();await Promise.resolve();await Promise.resolve();await s.c.submitForAI();assert.equal(requests,1);assert.equal(s.button.disabled,true);d.reject(Object.assign(new Error('Evaluation provider quota is temporarily exhausted.'),{code:'AI_QUOTA_EXCEEDED'}));await a;assert.equal(s.task.done,false);assert.equal(s.task.score,undefined);assert.equal(s.task.submissionDraftAnswer,s.els.pasteAnswer.value);assert.equal(s.events.length,0);assert.match(s.els.submitStatus.innerHTML,/No score, completion or XP/);assert.equal(s.button.disabled,false);
});
test('Unconfirmed result or user change never displays a successful evaluation',async()=>{
 for(const change of [false,true]){const d=deferred(),s=boot({evaluate:()=>d.promise});s.els.pasteAnswer.value='Actual work';const p=s.c.submitForAI();await Promise.resolve();await Promise.resolve();if(change)s.setOwner('test-B');d.resolve({score:8,feedback:'Good reasoning',persisted:change,serverVerified:true,task:{id:'saved-task',done:true}});await p;assert.equal(s.task.done,false);assert.equal(s.events.length,0);}
});
test('Confirmed server evaluation is consumed without any browser reward call',async()=>{
 const s=boot({evaluate:async()=>({score:8,feedback:'Reasoning is mostly correct.',serverVerified:true,persisted:true,evaluationMode:'subjective-provider',xpAwarded:40,task:{id:'saved-task',done:true,score:8}})});s.els.pasteAnswer.value='Actual answer';await s.c.submitForAI();assert.equal(s.c.tasks[0].score,8);assert.equal(s.c.tasks[0].done,true);assert.match(s.els.submitStatus.innerHTML,/40 XP confirmed by the server/);assert.equal(s.events.length,1);
});

const rewardSource=fs.readFileSync(new URL('../Frontend/js/gamification-system.js',import.meta.url),'utf8');
function rewardBoot(read){
 let id='test-A';const writes=[],events=[];
 const c=vm.createContext({Promise,JSON,Error,syncTimer:1,cloudReadyFor:'',cloudHydratedFor:'',uid:()=>id,key:v=>'rewards:'+v,defaults:()=>({totalXP:0,coins:0}),clearTimeout(){},localStorage:{setItem:(k,v)=>writes.push([k,JSON.parse(v)])},applyCosmetics(){},summary:v=>v,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},window:{dispatchEvent:e=>events.push(e),NEXZOFirebase:{getContext:async()=>({auth:{currentUser:{uid:'test-A'}},db:{},firestoreTools:{doc:()=>({}),getDoc:read}})}}});
 vm.runInContext(rewardSource.slice(rewardSource.indexOf('async function refreshVerifiedRewards(){'),rewardSource.indexOf('async function hydrateCloud(){')),c);
 return {c,writes,events,setOwner:v=>id=v};
}
test('Successful evaluation reward read-back uses canonical XP without awarding or writing again',async()=>{
 const record={uid:'test-A',totalXP:180,coins:18,evaluationRevision:2,lastEvaluationId:'receipt'};
 const s=rewardBoot(async()=>({exists:()=>true,data:()=>record}));assert.equal(await s.c.refreshVerifiedRewards(),true);assert.equal(s.writes[0][1].totalXP,180);assert.equal(s.writes[0][1].evaluationRevision,2);assert.equal(s.events[0].type,'nexzo:rewards-updated');
});
test('Reward read-back failure never replaces cached progress or claims an update',async()=>{
 const s=rewardBoot(async()=>{throw new Error('offline');});await assert.rejects(s.c.refreshVerifiedRewards(),/offline/);assert.equal(s.writes.length,0);assert.equal(s.events.length,0);
});
test('Account change during reward read-back cannot import the previous account state',async()=>{
 const d=deferred(),s=rewardBoot(()=>d.promise),request=s.c.refreshVerifiedRewards();await Promise.resolve();await Promise.resolve();s.setOwner('test-B');d.resolve({exists:()=>true,data:()=>({uid:'test-A',totalXP:180})});await assert.rejects(request,/Account changed/);assert.equal(s.writes.length,0);
});
