import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../Frontend/js/ai-service.js',import.meta.url),'utf8');
function setup(fetchImpl){const auth={currentUser:{uid:'test-A',getIdToken:async()=> 'isolated-token'}},window={NEXZO_CONFIG:{API_CANDIDATES:['https://service.test/api','http://localhost:5000/api']},NEXZOFirebase:{getAuthContext:async()=>({auth})},dispatchEvent(){}};
  const sandbox={window,fetch:fetchImpl,AbortController,AbortSignal,DOMException,TextDecoder,FormData,setTimeout,clearTimeout,CustomEvent:class{}};vm.runInNewContext(source,sandbox);return {api:window.NEXZOAI,auth};}
const stream=events=>new Response(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));
test('Assistant outage sends one request and never invokes compatibility fallback',async()=>{let calls=0;const {api}=setup(async()=>{calls++;throw new Error('internal URL');});await assert.rejects(api.assistantStream({message:'Hello'}),e=>!e.message.includes('internal URL'));assert.equal(calls,1);});
test('Assistant deltas reconcile once and preserve terminal metadata',async()=>{const seen=[];const {api}=setup(async()=>stream([{type:'delta',text:'2NF '},{type:'delta',text:'explanation'},{type:'done',reply:'2NF explanation',route:{intent:'explanation'}}]));const result=await api.assistantStream({message:'Explain 2NF'},{onDelta:text=>seen.push(text)});assert.equal(result.reply,'2NF explanation');assert.equal(seen.join(''),'2NF explanation');assert.equal(result.route.intent,'explanation');});
test('partial Assistant stream cannot report success',async()=>{const {api}=setup(async()=>stream([{type:'delta',text:'partial'}]));await assert.rejects(api.assistantStream({message:'Explain'}),/could not finish/);});
test('account switch prevents late response from attaching to the next user',async()=>{let state;state=setup(async()=>{state.auth.currentUser={uid:'test-B'};return stream([{type:'delta',text:'private A answer'},{type:'done',reply:'private A answer'}]);});let delta=false;await assert.rejects(state.api.assistantStream({message:'Explain'},{onDelta:()=>{delta=true;}}));assert.equal(delta,false);});
test('backend error never exposes provider details',async()=>{const {api}=setup(async()=>Response.json({message:'private provider detail'},{status:503}));await assert.rejects(api.assistantStream({message:'Explain'}),e=>!e.message.includes('private provider'));});
