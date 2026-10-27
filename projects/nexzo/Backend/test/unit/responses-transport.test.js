import test from 'node:test';
import assert from 'node:assert/strict';
import {askOpenAI,streamOpenAI,openAIConfiguration} from '../../src/services/openai-responses.js';
const env={OPENAI_API_KEY:'isolated-test-key',OPENAI_MODEL:'configured-test-model'};
const collect=async it=>{let text='';for await(const part of it)text+=part;return text;};
function sse(events){const bytes=new TextEncoder().encode(events.map(event=>'data: '+JSON.stringify(event)+'\r\n\r\n').join(''));return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close();}}));}
test('Responses transport uses configured model, bounded output and private server-only key',async()=>{
  let body;
  const reply=await askOpenAI('Explain 2NF',{env,maxOutputTokens:999999,fetchImpl:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.Authorization,'Bearer isolated-test-key');body=JSON.parse(options.body);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Remove partial dependencies.'}]}]});}});
  assert.equal(reply,'Remove partial dependencies.');assert.equal(body.model,env.OPENAI_MODEL);assert.equal(body.store,false);assert.equal(body.max_output_tokens,4096);
});
test('stream emits deltas once across fragmented CRLF and does not append completed output',async()=>{
  const events=[{type:'response.output_text.delta',delta:'Hello '},{type:'response.output_text.delta',delta:'student'},{type:'response.completed',response:{output:[{text:'Hello student'}]}}];
  assert.equal(await collect(streamOpenAI('Hi',{env,fetchImpl:async()=>sse(events)})),'Hello student');
});
test('truncated stream is an error, never fabricated completion',async()=>{
  await assert.rejects(collect(streamOpenAI('Hi',{env,fetchImpl:async()=>sse([{type:'response.output_text.delta',delta:'Partial'}])})),/could not finish/);
});
test('provider failures never expose raw details or keys',async()=>{
  await assert.rejects(askOpenAI('Hi',{env,fetchImpl:async()=>new Response('private provider internal detail',{status:401})}),e=>e.status===503&&!e.message.includes('private'));
});
test('missing configured model fails before a network request',async()=>{
  let called=false;assert.equal(openAIConfiguration({OPENAI_API_KEY:'test'}).configured,false);
  await assert.rejects(askOpenAI('Hi',{env:{OPENAI_API_KEY:'test'},fetchImpl:async()=>{called=true;}}),/not configured/);assert.equal(called,false);
});
test('Stop propagates an AbortSignal to the provider',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(askOpenAI('Hi',{env,signal:controller.signal,fetchImpl:async(_,options)=>{assert.equal(options.signal.aborted,true);throw new DOMException('Aborted','AbortError');}}),/Request stopped/);
});
test('oversized prompt is rejected before transmission',async()=>{
  await assert.rejects(askOpenAI('x'.repeat(48001),{env}),e=>e.status===400);
});
