import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmPlannerTransaction} from '../../src/assistant/planner-confirmation.js';
// Behavioural adapter tests. This is not a real Firebase or emulator test.
function database(){const rows=new Map();let queue=Promise.resolve();
  const ref=path=>({path,collection(name){return ref(path+'/'+name);},doc(id){return ref(path+'/'+id);},async get(){return {exists:rows.has(path),data:()=>rows.get(path)};}});
  return {rows,doc:ref,collection:name=>ref(name),runTransaction(fn){const run=queue.then(()=>fn({get:r=>r.get(),set(r,data,options){rows.set(r.path,options?.merge?{...rows.get(r.path),...data}:data);}}));queue=run.catch(()=>{});return run;}};
}
const options={parse:p=>p,stamp:()=>123,now:1000};
function seed(db,uid,id){db.rows.set(`users/${uid}/assistantActions/${id}`,{uid,status:'pending',type:'planner.createTask',expiresAtMs:5000,payload:{title:'Normalization practice',subject:'DBMS',type:'Study',level:'Beginner',durationMinutes:30,deadlineTime:'23:59',priority:'Medium'}});}
test('concurrent confirmation and retries create exactly one linked task',async()=>{
  const db=database();seed(db,'A','id');const results=await Promise.all([confirmPlannerTransaction(db,'A','id',options),confirmPlannerTransaction(db,'A','id',options)]);
  assert.equal(results[0].task.id,results[1].task.id);assert.equal([...db.rows.keys()].filter(k=>k.includes('/tasks/')).length,1);assert.equal(results[0].task.assistantActionId,'id');
});
test('another UID cannot confirm or read an action',async()=>{const db=database();seed(db,'A','id');await assert.rejects(confirmPlannerTransaction(db,'B','id',options),e=>e.status===404);assert.equal([...db.rows.keys()].filter(k=>k.includes('/tasks/')).length,0);});
test('cloud outage fails rather than returning volatile save success',async()=>{await assert.rejects(confirmPlannerTransaction(null,'A','id',options),e=>e.status===503);});
test('expired confirmation creates no task',async()=>{const db=database();seed(db,'A','id');await assert.rejects(confirmPlannerTransaction(db,'A','id',{...options,now:6000}),e=>e.status===409);assert.equal(db.rows.size,1);});
test('read-back mismatch cannot produce success',async()=>{const db=database();seed(db,'A','id');const real=db.runTransaction;db.runTransaction=async fn=>{await real(fn);db.rows.delete('users/A/tasks/assistant_id');};await assert.rejects(confirmPlannerTransaction(db,'A','id',options),e=>e.status===503);});
