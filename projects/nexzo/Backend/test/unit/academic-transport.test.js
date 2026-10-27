import test from 'node:test';
import assert from 'node:assert/strict';
process.env.GEMINI_API_KEY='unit-fixture';
process.env.GEMINI_MODEL='fixture-primary';
process.env.GEMINI_FALLBACK_MODELS='fixture-secondary';
const {askGemini}=await import('../../src/services/gemini.js');
const {academicJson}=await import('../../src/services/academic-provider.js');
const env={GEMINI_API_KEY:'unit-fixture'};
function transportFixture(fn){const original=global.fetch;global.fetch=fn;return ()=>{global.fetch=original;};}
test('actual Gemini transport makes one request for quota exhaustion',async()=>{
 let calls=0;const restore=transportFixture(async()=>{calls++;return Response.json({error:{message:'raw provider diagnostic'}},{status:429});});
 try{await assert.rejects(academicJson('JSON response',v=>v,{env,transports:{gemini:askGemini}}),e=>e.code==='AI_QUOTA_EXCEEDED'&&!e.message.includes('raw provider'));assert.equal(calls,1);}finally{restore();}
});
test('academic model fallback only uses explicitly configured models',async()=>{
 const urls=[];const restore=transportFixture(async url=>{urls.push(String(url));return urls.length===1?Response.json({error:{message:'not found'}},{status:404}):Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"value":1}'}]}}]});});
 try{assert.equal((await academicJson('JSON response',v=>v,{env,transports:{gemini:askGemini}})).data.value,1);assert.equal(urls.length,2);assert.match(urls[0],/fixture-primary/);assert.match(urls[1],/fixture-secondary/);}finally{restore();}
});
test('truncated structured output is never accepted',async()=>{
 const restore=transportFixture(async()=>Response.json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{"score":8}'}]}}]}));
 try{await assert.rejects(academicJson('JSON response',v=>v,{env,transports:{gemini:askGemini}}),e=>e.code==='INVALID_AI_RESPONSE');}finally{restore();}
});
test('actual provider abort is classified as timeout without a retry',async()=>{
 let calls=0;const restore=transportFixture(async()=>{calls++;throw Object.assign(new Error('aborted'),{name:'AbortError'});});
 try{await assert.rejects(academicJson('JSON response',v=>v,{env,transports:{gemini:askGemini}}),e=>e.code==='PROVIDER_TIMEOUT');assert.equal(calls,1);}finally{restore();}
});
