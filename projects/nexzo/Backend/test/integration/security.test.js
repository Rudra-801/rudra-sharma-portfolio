import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../../src/app.js';

async function withServer(run){
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  try{return await run(`http://127.0.0.1:${server.address().port}`)}finally{await new Promise(resolve=>server.close(resolve))}
}

test('AI endpoints reject unauthenticated requests',()=>withServer(async base=>{
  const response=await fetch(`${base}/api/ai/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'hello'})});
  assert.equal(response.status,401);
}));

test('security headers are present',()=>withServer(async base=>{
  const response=await fetch(`${base}/health`);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.equal(response.headers.get('x-frame-options'),'SAMEORIGIN');
  assert.ok(response.headers.get('referrer-policy'));
}));

test('oversized JSON is rejected',()=>withServer(async base=>{
  const response=await fetch(`${base}/api/ai/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'x'.repeat(300000)})});
  assert.ok([400,401,413].includes(response.status));
}));

test('production CORS rejects an unknown origin',()=>withServer(async base=>{
  const previous=process.env.NODE_ENV;process.env.NODE_ENV='production';
  try{
    const response=await fetch(`${base}/health`,{headers:{Origin:'https://evil.example'}});
    assert.equal(response.status,403);
  }finally{process.env.NODE_ENV=previous;}
}));

test('API responses disable caching',()=>withServer(async base=>{
  const response=await fetch(`${base}/api/does-not-exist`);
  assert.equal(response.headers.get('cache-control'),'no-store');
}));

test('readiness fails closed without configured cloud dependencies',()=>withServer(async base=>{
  const response=await fetch(`${base}/ready`);
  assert.equal(response.status,503);
  const body=await response.json();
  assert.equal(body.ready,false);
}));
