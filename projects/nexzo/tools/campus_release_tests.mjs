import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../Frontend/js/campus-live-v1.js',import.meta.url),'utf8');
const action=source.slice(source.indexOf('async function addCampusToPlanner'),source.indexOf('window.NEXZOAddCampusToPlanner'));
async function run({flush, state='local', uid='test-a'}={}) {
 const notices=[], tasks=[];
 const context={items:[{id:'one',title:'Fixture club',type:'Club'}],college:()=> 'MRIIRS',branch:()=> 'All',program:()=> 'B.Tech',Date,window:{NEXZODataService:{getUser:()=>uid?{uid}:null},NEXZOTaskStore:{getAll:()=>tasks,upsert:t=>tasks.push(t),flush,syncStatus:()=>({state})},NEXZOShell:{toast:(...args)=>notices.push(args)}}};
 vm.createContext(context);vm.runInContext(action,context);await context.addCampusToPlanner('one');return {context,notices,tasks};
}
test('missing flush cannot report cloud success',async()=>{const r=await run();assert.equal(r.notices[0][1],'info');assert.match(r.notices[0][0],/pending/)});
test('local clean store cannot report cloud success',async()=>{const r=await run({flush:async()=>true});assert.equal(r.notices[0][1],'info')});
test('confirmed cloud save reports success',async()=>{const r=await run({flush:async()=>true,state:'cloud'});assert.equal(r.notices[0][1],'success')});
test('outage preserves local task and reports pending',async()=>{const r=await run({flush:async()=>{throw Error('offline')}});assert.equal(r.tasks.length,1);assert.equal(r.notices[0][1],'info')});
test('repeated add uses one deterministic task',async()=>{const r=await run({flush:async()=>true,state:'cloud'});await r.context.addCampusToPlanner('one');assert.equal(r.tasks.length,1)});
test('guest never receives cloud confirmation',async()=>{const r=await run({flush:async()=>true,state:'cloud',uid:null});assert.equal(r.notices[0][1],'info')});
