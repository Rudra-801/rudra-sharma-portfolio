import test from "node:test";
import assert from "node:assert/strict";
import { askGemini, streamGeminiText } from "../../src/services/gemini.js";

test("Gemini transient overload retries the same model without latency fan-out", async () => {
  const originalFetch=global.fetch;
  const originalKey=process.env.GEMINI_API_KEY;
  const urls=[];
  process.env.GEMINI_API_KEY="test-key";
  global.fetch=async url=>{
    urls.push(String(url));
    if(urls.length===1){
      return new Response(JSON.stringify({error:{message:"model is experiencing high demand"}}),{
        status:503,
        headers:{"Content-Type":"application/json"}
      });
    }
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:"retry answer"}]}}]}),{
      status:200,
      headers:{"Content-Type":"application/json"}
    });
  };
  try{
    assert.equal(await askGemini("hello",{timeoutMs:5000}),"retry answer");
    assert.equal(urls.length,2);
    assert.match(urls[0],/gemini-3\.8-flash/);
    assert.match(urls[1],/gemini-3\.8-flash/);
  }finally{
    global.fetch=originalFetch;
    if(originalKey===undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY=originalKey;
  }
});

test("Gemini authentication errors do not fan out across models", async () => {
  const originalFetch=global.fetch;
  const originalKey=process.env.GEMINI_API_KEY;
  let calls=0;
  process.env.GEMINI_API_KEY="bad-key";
  global.fetch=async()=>{
    calls++;
    return new Response(JSON.stringify({error:{message:"invalid API key"}}),{
      status:401,
      headers:{"Content-Type":"application/json"}
    });
  };
  try{
    await assert.rejects(()=>askGemini("hello"),/invalid API key/);
    assert.equal(calls,1);
  }finally{
    global.fetch=originalFetch;
    if(originalKey===undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY=originalKey;
  }
});

test("Gemini stream accepts CRLF events and an unterminated final event", async () => {
  const originalFetch=global.fetch;
  const originalKey=process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY="test-key";
  const first=JSON.stringify({candidates:[{content:{parts:[{text:"Hello "}]}}]});
  const second=JSON.stringify({candidates:[{content:{parts:[{text:"Rudra"}]}}]});
  global.fetch=async()=>new Response(`data: ${first}\r\n\r\ndata: ${second}`,{status:200,headers:{"Content-Type":"text/event-stream"}});
  try{
    let answer="";
    for await(const chunk of streamGeminiText("hello"))answer+=chunk;
    assert.equal(answer,"Hello Rudra");
  }finally{
    global.fetch=originalFetch;
    if(originalKey===undefined)delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY=originalKey;
  }
});


test("Gemini persistent overload stops after one same-model retry", async () => {
  const originalFetch=global.fetch;
  const originalKey=process.env.GEMINI_API_KEY;
  const urls=[];
  process.env.GEMINI_API_KEY="test-key";
  global.fetch=async url=>{
    urls.push(String(url));
    if(/gemini-3\.8-flash/.test(String(url))){
      return new Response(JSON.stringify({error:{message:"model is experiencing high demand"}}),{status:503,headers:{"Content-Type":"application/json"}});
    }
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:"fallback answer"}]}}]}),{status:200,headers:{"Content-Type":"application/json"}});
  };
  try{
    await assert.rejects(askGemini("hello",{timeoutMs:10000}),error=>error.status===502);
    assert.equal(urls.length,2);
    assert.match(urls[0],/gemini-3\.8-flash/);
    assert.match(urls[1],/gemini-3\.8-flash/);
  }finally{
    global.fetch=originalFetch;
    if(originalKey===undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY=originalKey;
  }
});
