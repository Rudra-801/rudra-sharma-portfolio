import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../Frontend/js/academics-controller.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('async function saveCloudNow()'),source.indexOf('\nasync function hydrateCloud()'));
function setup(change=v=>v){
 let uid='test-user',saved;
 const state={selected:['CS'],progress:{topic:2},attempts:{topic:[{id:'attempt-1',answer:'persist this answer',score:8}]},topicEvidence:{topic:{lastAttemptId:'attempt-1'}},files:[],selection:{topicIndex:0}};
 const context=vm.createContext({state,cloudTimer:0,clearTimeout(){},saveLocal(){},owner:()=>uid,clone:structuredClone,normalizeState:v=>v,CustomEvent:class{},window:{dispatchEvent(){},NEXZOBackendStore:{putState:async(_d,v)=>{saved=structuredClone(v)},getState:async()=>({data:change(saved)})}}});
 vm.runInContext(fn,context);
 return {run:()=>context.saveCloudNow(),context,setOwner:v=>uid=v};
}
test('confirmed subjects do not hide a missing saved evaluation',async()=>{
 const s=setup(v=>({...v,attempts:{}}));assert.equal((await s.run()).cloud,false);
});
test('changed score is not accepted as a confirmed academic save',async()=>{
 const s=setup(v=>({...v,attempts:{topic:[{...v.attempts.topic[0],score:1}]}}));assert.equal((await s.run()).cloud,false);
});
test('identical persisted answer, score and progress are acknowledged',async()=>assert.equal((await setup().run()).cloud,true));
test('missing cloud read-back cannot report success',async()=>{
 const s=setup();delete s.context.window.NEXZOBackendStore.getState;assert.equal((await s.run()).cloud,false);
});
test('sign-out during save cannot award confirmation to another account',async()=>{
 const s=setup(v=>{s.setOwner('another-user');return v});assert.equal((await s.run()).cloud,false);
});
