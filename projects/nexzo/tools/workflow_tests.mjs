import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class StorageMock {
  constructor(){ this.map=new Map(); }
  getItem(k){ return this.map.has(String(k))?this.map.get(String(k)):null; }
  setItem(k,v){ this.map.set(String(k),String(v)); }
  removeItem(k){ this.map.delete(String(k)); }
  clear(){ this.map.clear(); }
}
function context(uid='user-a'){
  const localStorage=new StorageMock();
  const events=[];
  const window={
    localStorage,
    addEventListener(){},
    dispatchEvent(event){events.push(event);},
    NEXZODataService:{getUser:()=>({uid}),getTasks:()=>[],saveTasks:async()=>true,saveProfile:async()=>true},
    NEXZOSharedState:{uid:()=>uid,profile:()=>({uid,xp:0,updatedAtMs:1}),updateProfile(){}},
    NEXZOShell:{readSettings:()=>({weekStart:'Monday'}),toast(){}},
  };
  const sandbox={window,globalThis:window,localStorage,console,Date,Math,JSON,setTimeout,clearTimeout,Promise,CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail}},Event:class{}};
  vm.createContext(sandbox);
  return {sandbox,window,localStorage,events};
}
function load(ctx,file){vm.runInContext(fs.readFileSync(file,'utf8'),ctx.sandbox,{filename:file});}

function boot(uid='user-a'){
  const ctx=context(uid);
  load(ctx,'Frontend/js/level-system.js');
  load(ctx,'Frontend/js/metric-authority.js');
  load(ctx,'Frontend/js/task-store.js');
  load(ctx,'Frontend/js/profile-authority.js');
  return ctx;
}

test('task lifecycle updates canonical Planner/Dashboard stats',()=>{
  const {window}=boot();
  const store=window.NEXZOTaskStore;
  const task=store.upsert({id:'task-1',title:'DSA Practice',subject:'DSA',actualMinutes:45,status:'pending'},{cloud:false});
  assert.equal(store.stats().total,1);
  assert.equal(store.stats().completed,0);
  store.upsert({...task,status:'completed',completed:true,completedAtMs:Date.now(),score:8,serverVerified:true,evaluationId:'verified-attempt-1',evaluationSource:'verified',evaluatedAtMs:Date.now()},{cloud:false});
  const stats=store.stats();
  assert.equal(stats.completed,1);
  assert.equal(stats.progress,100);
  assert.equal(stats.totalMinutes,45);
  assert.equal(stats.accuracy,80);
});

test('profile authority consumes canonical task store instead of a missing snapshot API',()=>{
  const {window}=boot();
  window.NEXZOTaskStore.upsert({id:'task-2',title:'AI Notes',status:'completed',completed:true,actualMinutes:30},{cloud:false});
  const stats=window.NEXZOProfileAuthority.stats();
  assert.equal(stats.tasks.length,1);
  assert.equal(stats.completed,1);
  assert.equal(stats.minutes,30);
});

test('profile state is isolated by UID',()=>{
  const a=boot('user-a');
  a.window.NEXZOProfileAuthority.save({xp:1500,name:'A'});
  assert.equal(a.window.NEXZOProfileAuthority.current().level,a.window.NEXZOLevelSystem.resolve(1500).level);
  const b=boot('user-b');
  assert.equal(b.window.NEXZOProfileAuthority.current().xp,0);
  assert.notEqual(a.window.NEXZOProfileAuthority.key(),b.window.NEXZOProfileAuthority.key());
});


test('profile authority migrates V39 scoped state without data loss',()=>{
  const ctx=context('user-migrate');
  ctx.localStorage.setItem('nexzo_profile_authority_v39:user-migrate',JSON.stringify({xp:6800,name:'Legacy',updatedAtMs:500}));
  load(ctx,'Frontend/js/level-system.js');
  load(ctx,'Frontend/js/metric-authority.js');
  load(ctx,'Frontend/js/task-store.js');
  load(ctx,'Frontend/js/profile-authority.js');
  assert.equal(ctx.window.NEXZOProfileAuthority.current().level,11);
  assert.equal(ctx.window.NEXZOProfileAuthority.current().xp,ctx.window.NEXZOLevelSystem.xpGoals[10]);
  assert.ok(ctx.localStorage.getItem('nexzo_profile_authority_v41:user-migrate'));
});

test('task deletion remains blocked',async()=>{
  const {window}=boot();
  await assert.rejects(()=>window.NEXZOTaskStore.remove('x'),/disabled/i);
});

test('metric authority selects trusted source, not the highest number',()=>{
  const {window}=boot();
  const result=window.NEXZOMetricAuthority.choose([
    {value:99999,priority:10,updatedAtMs:9999},
    {value:1171,priority:100,updatedAtMs:100}
  ]);
  assert.equal(result,1171);
});
