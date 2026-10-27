import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const root=new URL('../',import.meta.url);
const code=name=>fs.readFileSync(new URL(`Frontend/js/${name}`,root),'utf8');
function boot(storage=new Map()){
  const elements=new Map(),handlers=new Map();
  const element=()=>({value:'',textContent:'',innerHTML:'',dataset:{},style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},addEventListener(){},closest(){return null;}});
  const document={readyState:'loading',body:element(),documentElement:element(),querySelector:s=>s==='.planner-page'?{}:null,querySelectorAll:()=>[],getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)},addEventListener(){}};
  const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
  const window={document,localStorage,NEXZODataService:{getUser:()=>({uid:'test-user'}),saveTasks:async()=>true,getTasks:()=>[]},addEventListener:(name,fn)=>{if(!handlers.has(name))handlers.set(name,[]);handlers.get(name).push(fn)},dispatchEvent:e=>(handlers.get(e.type)||[]).forEach(f=>f(e)),NEXZOShell:{toast(){},addNotification(){},readSettings:()=>({})}};
  const context={window,document,localStorage,console,Date,Math,JSON,crypto:webcrypto,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail}}};
  vm.createContext(context);
  for(const f of ['planner-data.js','task-store.js','level-system.js','gamification-system.js'])vm.runInContext(code(f),context,{filename:f});
  const exposure=`window.testPlanner={submitForAI,normalizeTask,normalizeAIResult,rowHTML,openQuestions,set(list,id){tasks=list;activeTaskId=id;activeIndex=0;submitMode='paste';},list:()=>tasks}; render=()=>{}; renderSuggestion=()=>{};`;
  vm.runInContext(code('planner-controller.js').replace("  if(document.readyState==='loading')",exposure+"\n  if(document.readyState==='loading')"),context);
  return {window,elements,storage,context,api:window.testPlanner,store:window.NEXZOTaskStore};
}
const task=id=>({id,title:'DSA test',subject:'DSA',type:'Theory Study',level:'Beginner',questions:'5 Questions',generatedQuestions:['a','b','c','d','e'],createdAtMs:Date.now(),updatedAtMs:Date.now(),running:true,lastStarted:Date.now()-2000,progress:0});
const evaluation={score:8,feedback:'Fixture evaluation only: tests persistence, not AI accuracy.',strengths:['Example'],improvements:['More detail']};
function receipt(id='a',score=8){return {...evaluation,score,ok:true,persisted:true,serverVerified:true,evaluationId:`fixture-${id}`,evaluationMode:'subjective-provider',xpAwarded:score>=4?40:0,task:{...task(id),score,done:score>=4,completed:score>=4,status:score>=4?'completed':'needs-improvement',running:false,lastStarted:null,aiFeedback:evaluation.feedback,submissionLocked:true,evaluatedAtMs:Date.now(),serverVerified:true,evaluationId:`fixture-${id}`,evaluationMode:'subjective-provider',xpGranted:score>=4,rewardClaimed:score>=4}};}
function prepare(b,id='a'){b.api.set([task(id)],id);b.elements.get('pasteAnswer').value='Isolated test answer';}
test('invalid evaluator output is rejected, including absent score and feedback',()=>{
 const b=boot();for(const value of [{},{score:null,feedback:'x'},{score:11,feedback:'x'},{score:8},{score:true,feedback:'x'}])assert.throws(()=>b.api.normalizeAIResult(value));
 assert.equal(b.api.normalizeAIResult({score:0,feedback:'Incorrect'}).score,0);
});
test('service failure never invents score, completion or XP',async()=>{
 const b=boot();prepare(b);b.window.NEXZOAI={evaluate:async()=>{throw Object.assign(Error('Quota exhausted'),{code:'AI_QUOTA_EXCEEDED'})}};
 await b.api.submitForAI();assert.equal(b.api.list()[0].score,undefined);assert.ok(!b.api.list()[0].submissionLocked);
 assert.equal(b.window.NEXZOGamificationEngine.state().ledger.filter(x=>x.source==='planner').length,0);
 assert.match(b.elements.get('submitStatus').innerHTML,/No score, completion or XP/);
});
test('confirmed server task survives list replacement and reload without browser XP',async()=>{
 const b=boot();prepare(b);let resolve;let requests=0;b.window.NEXZOAI={evaluate:()=>{requests++;return new Promise(r=>resolve=r)}};
 const pending=b.api.submitForAI();await b.api.submitForAI();for(let i=0;i<30&&!requests;i++)await Promise.resolve();assert.equal(requests,1);
 b.api.set([task('b'),{...task('a'),elapsed:3000}],'a');resolve(receipt());await pending;
 const saved=b.store.getAll().find(t=>t.id==='a');assert.equal(saved.score,8);assert.equal(saved.status,'completed');assert.equal(saved.running,false);assert.equal(saved.lastStarted,null);assert.equal(saved.aiFeedback,evaluation.feedback);
 assert.equal(b.store.getAll().find(t=>t.id==='b').score,undefined);
 const restored=boot(b.storage),again=restored.store.getAll().find(t=>t.id==='a');assert.equal(again.score,8);assert.equal(again.status,'completed');
 assert.equal(restored.window.NEXZOGamificationEngine.state().ledger.filter(t=>t.source==='planner').length,0);
 assert.match(b.elements.get('submitStatus').innerHTML,/40 XP confirmed by the server/);
 await b.api.submitForAI();assert.equal(requests,1);
});
test('zero score persists as Needs Improvement and remains inspectable',async()=>{
 const b=boot();prepare(b);b.window.NEXZOAI={evaluate:async()=>receipt('a',0)};await b.api.submitForAI();
 const saved=boot(b.storage).store.getAll()[0];assert.equal(saved.status,'needs-improvement');assert.equal(saved.running,false);
 assert.match(b.api.rowHTML({...saved,i:0}),/Score 0\/10/);assert.doesNotMatch(b.api.rowHTML({...saved,i:0}),/Submit proof required/);
 b.api.openQuestions(0);assert.match(b.elements.get('qList').innerHTML,/Fixture evaluation/);
});
test('stale cloud snapshot and reload cannot erase saved evaluation',async()=>{
 const b=boot();prepare(b);b.window.NEXZOAI={evaluate:async()=>receipt()};await b.api.submitForAI();
 const restored=boot(b.storage);restored.window.dispatchEvent({type:'nexzo:tasks-updated',detail:{source:'firestore',tasks:[{...task('a'),updatedAtServerMs:Date.now()+10000}]}});
 assert.equal(restored.store.getAll()[0].score,8);assert.equal(restored.store.getAll()[0].status,'completed');
});
test('unacknowledged cloud save is never reported as saved',async()=>{
 const b=boot();b.window.NEXZODataService={getUser:()=>({uid:'test-user'}),saveTasks:async()=>false};b.store.upsert(task('a'));
 assert.equal(await b.store.flush(),false);assert.equal(b.store.syncStatus().state,'pending');
});

export {boot,task,receipt,prepare};
