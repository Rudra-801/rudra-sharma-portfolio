import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../Frontend/js/ai-clean.js',import.meta.url),'utf8');
const functionSource=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const load=functionSource('  function loadSessions(){','  function persistentSessions()');
const save=functionSource('  function scheduleCloudSave(){','  async function loadCloudHistory');
test('actual local history loader reads only the selected UID cache',()=>{
  const values={'nexzo.ai.clean.sessions.v4:A':JSON.stringify([{id:'A-chat'}]),'nexzo.ai.clean.sessions.v4:B':JSON.stringify([{id:'B-chat'}]),'nexzo.ai.clean.sessions.v4':JSON.stringify([{id:'unknown-owner'}])},reads=[];
  const context=vm.createContext({STORE:'nexzo.ai.clean.sessions.v4:A',localStorage:{getItem:key=>{reads.push(key);return values[key];}},extractLegacyChats:value=>value});
  vm.runInContext(load+';result=loadSessions();',context);assert.equal(context.result[0].id,'A-chat');assert.deepEqual(reads,['nexzo.ai.clean.sessions.v4:A']);assert.equal(JSON.parse(values['nexzo.ai.clean.sessions.v4'])[0].id,'unknown-owner');
  context.STORE='nexzo.ai.clean.sessions.v4:B';vm.runInContext('result=loadSessions();',context);assert.equal(context.result[0].id,'B-chat');
});
test('actual local history loader supports missing/invalid cache without invented chats',()=>{
  const context=vm.createContext({STORE:'new-user',localStorage:{getItem:()=>'{invalid'},extractLegacyChats:value=>value});vm.runInContext(load+';result=loadSessions();',context);assert.equal(context.result.length,0);
});
function fixture(previous=0){let timer,writes=0;const row={uid:'A',id:'chat',updatedAtMs:previous},tools={doc:()=>({}),serverTimestamp:()=>123,runTransaction:async(_,fn)=>fn({get:async()=>({exists:()=>previous>0,data:()=>row}),set(_,data){writes++;Object.assign(row,data);}}),getDoc:async()=>({exists:()=>true,data:()=>row})};
  const context=vm.createContext({historyEnabled:()=>true,cloud:{db:{},tools},cloudUid:'A',cloudLoaded:true,authUser:{uid:'A'},cloudSaveTimer:0,sessions:[{id:'chat',title:'Study',messages:[{role:'user',content:'Explain 2NF'}],createdAt:10,updatedAt:20}],currentId:'chat',clearTimeout(){},setTimeout(fn){timer=fn;return 1;},console:{warn(){}}});
  vm.runInContext(save+';scheduleCloudSave();',context);return {context,run:()=>timer(),writes:()=>writes};
}
test('queued history save cannot write after the user changes',async()=>{const f=fixture();f.context.authUser={uid:'B'};await f.run();assert.equal(f.writes(),0);});
test('stale local conversation cannot overwrite newer cloud history',async()=>{const f=fixture(50);await f.run();assert.equal(f.writes(),0);});
test('current owned conversation saves then verifies read-back',async()=>{const f=fixture();await f.run();assert.equal(f.writes(),1);});
