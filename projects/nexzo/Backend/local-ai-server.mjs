import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename=fileURLToPath(import.meta.url);
const backendDir=path.dirname(__filename);
const rootDir=path.resolve(backendDir,'..');
const frontendDir=path.join(rootDir,'Frontend');

function loadEnv(file){
  if(!fs.existsSync(file)) return;
  const text=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim(); if(!line||line.startsWith('#')) continue;
    const i=line.indexOf('='); if(i<1) continue;
    const key=line.slice(0,i).trim(); let value=line.slice(i+1).trim();
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))) value=value.slice(1,-1);
    if(!(key in process.env)) process.env[key]=value;
  }
}
loadEnv(path.join(backendDir,'.env'));

const HOST='127.0.0.1';
const PORT=Number(process.env.PORT||5000);
const KEY=String(process.env.GEMINI_API_KEY||'').trim();
const REQUESTED_MODEL=String(process.env.GEMINI_MODEL||'').trim();
const MODEL_CANDIDATES=[...new Set([REQUESTED_MODEL||'gemini-3.8-flash','gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash','gemini-2.5-flash'].filter(Boolean))];
const MAX_BODY=8*1024*1024;

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(data));};
const sse=(res,data)=>res.write(`data: ${JSON.stringify(data)}\n\n`);

async function readBody(req,limit=MAX_BODY){
  const chunks=[]; let total=0;
  for await(const chunk of req){total+=chunk.length;if(total>limit) throw Object.assign(new Error('Request too large'),{status:413});chunks.push(chunk)}
  return Buffer.concat(chunks);
}
async function readJson(req){const body=await readBody(req,512*1024);try{return JSON.parse(body.toString('utf8')||'{}')}catch{throw Object.assign(new Error('Invalid JSON'),{status:400})}}

async function geminiFetch(action,body,{stream=false}={}){
  if(!KEY||KEY.length<20||/^YOUR_/i.test(KEY)) throw Object.assign(new Error('Gemini API key is missing'),{status:503});
  let last;
  for(const model of MODEL_CANDIDATES){
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${action}${stream?'?alt=sse':''}`;
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),60000);
    try{
      const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':KEY},body:JSON.stringify(body),signal:controller.signal});
      clearTimeout(timer);
      if(response.ok)return {response,model};
      const data=await response.json().catch(()=>({}));
      last=Object.assign(new Error(data?.error?.message||`Gemini error ${response.status}`),{status:response.status});
      if(![400,404].includes(response.status)) throw last;
    }catch(e){clearTimeout(timer);last=e;if(e.name==='AbortError')throw Object.assign(new Error('Gemini request timed out'),{status:504});if(e.status&&!([400,404].includes(e.status)))throw e;}
  }
  throw last||Object.assign(new Error('No Gemini model available'),{status:502});
}

function buildPrompt(payload){
  const history=Array.isArray(payload.history)?payload.history.slice(-12):[];
  const context=payload.context||{};
  return `You are NEXZO AI Assistant, a conversational university study companion.\nRespond naturally and directly. Remember the recent conversation. Ask a short clarification only when necessary. Never claim you performed an external action unless the UI confirms it.\n\nStudent context:\n${JSON.stringify(context).slice(0,5000)}\n\nRecent conversation:\n${history.map(m=>`${m.role}: ${m.content||m.text||''}`).join('\n').slice(-10000)}\n\nCurrent user message:\n${String(payload.message||payload.prompt||'').slice(0,10000)}\n\nGive a useful, accurate, well-structured answer. For greetings, greet briefly and ask what the student wants to do.`;
}

async function streamAnswer(res,payload,{multi=false}={}){
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','Access-Control-Allow-Origin':'*','X-Accel-Buffering':'no'});
  if(multi){sse(res,{type:'route',route:{intent:'study-help',agents:[{name:'Tutor'},{name:'Personalization'}]}});sse(res,{type:'workflow',workflow:{stage:'generating'}})}
  const prompt=buildPrompt(payload);
  const {response,model}=await geminiFetch('streamGenerateContent',{contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:2200}},{stream:true});
  const reader=response.body?.getReader(); if(!reader) throw new Error('Gemini stream unavailable');
  const decoder=new TextDecoder();
  let pending='';
  let emitted=false;

  const processBlocks=(input)=>{
    const normalized=input.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
    const blocks=normalized.split('\n\n');
    const remainder=blocks.pop()||'';
    for(const block of blocks){
      for(const line of block.split('\n')){
        if(!line.startsWith('data:')) continue;
        const raw=line.slice(5).trim();
        if(!raw||raw==='[DONE]') continue;
        try{
          const data=JSON.parse(raw);
          const text=data?.candidates?.[0]?.content?.parts?.map(part=>part.text||'').join('')||'';
          if(text){emitted=true;sse(res,{type:'delta',text});}
        }catch(error){
          console.warn('Gemini stream chunk parse failed:',error.message);
        }
      }
    }
    return remainder;
  };

  while(true){
    const {done,value}=await reader.read();
    if(done) break;
    pending+=decoder.decode(value,{stream:true});
    pending=processBlocks(pending);
  }
  pending+=decoder.decode();
  if(pending.trim()) processBlocks(`${pending}\n\n`);
  if(!emitted) throw Object.assign(new Error('Gemini returned an empty stream'),{status:502});
  sse(res,{type:'done',model,chatId:payload.chatId||`local-${Date.now()}`});
  res.end();
}

function parseMultipart(buffer,contentType){
  const match=/boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType||'');if(!match)return null;const boundary=`--${match[1]||match[2]}`;const raw=buffer.toString('latin1');const parts=raw.split(boundary).slice(1,-1);const out={fields:{},file:null};
  for(const part of parts){const idx=part.indexOf('\r\n\r\n');if(idx<0)continue;const head=part.slice(0,idx);let body=part.slice(idx+4);if(body.endsWith('\r\n'))body=body.slice(0,-2);const name=/name="([^"]+)"/i.exec(head)?.[1];const filename=/filename="([^"]*)"/i.exec(head)?.[1];const type=/content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim()||'application/octet-stream';if(filename)out.file={name:filename,type,buffer:Buffer.from(body,'latin1')};else if(name)out.fields[name]=Buffer.from(body,'latin1').toString('utf8');}
  return out;
}

async function handleApi(req,res,url){
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});return res.end()}
  if(url.pathname==='/api/health'||url.pathname==='/health')return json(res,200,{ok:true,service:'nexzo-local-ai',version:'8.9.0',geminiConfigured:!!KEY&&KEY.length>=20&&!/^YOUR_/i.test(KEY),multiAgentConfigured:true,localZeroInstall:true,time:new Date().toISOString()});
  if(url.pathname==='/api/health/deep'){
    try{const {response,model}=await geminiFetch('generateContent',{contents:[{role:'user',parts:[{text:'Reply only with OK'}]}],generationConfig:{maxOutputTokens:4}});await response.json();return json(res,200,{ok:true,geminiReachable:true,model})}catch(e){return json(res,e.status||502,{ok:false,geminiReachable:false,message:e.message})}
  }
  if(req.method==='POST'&&(url.pathname==='/api/ai/chat/stream'||url.pathname==='/api/ai/multi-agent/stream'||url.pathname==='/api/chat/stream')){
    const payload=await readJson(req);return streamAnswer(res,payload,{multi:url.pathname.includes('multi-agent')});
  }
  if(req.method==='POST'&&(url.pathname==='/api/ai/chat'||url.pathname==='/api/chat')){
    const payload=await readJson(req);const prompt=buildPrompt(payload);const {response,model}=await geminiFetch('generateContent',{contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:1800}});const raw=await response.text();let data={};try{data=JSON.parse(raw)}catch{throw Object.assign(new Error('Gemini returned invalid JSON'),{status:502})}const reply=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||'';if(!reply)throw Object.assign(new Error('Gemini returned an empty response'),{status:502});return json(res,200,{ok:true,reply,model});
  }
  if(req.method==='POST'&&url.pathname==='/api/ai/analyze'){
    const parsed=parseMultipart(await readBody(req),req.headers['content-type']);if(!parsed?.file)throw Object.assign(new Error('No file received'),{status:400});if(parsed.file.buffer.length>6*1024*1024)throw Object.assign(new Error('File too large'),{status:413});const prompt=String(parsed.fields.prompt||'Analyze this study material clearly.');const {response,model}=await geminiFetch('generateContent',{contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType:parsed.file.type,data:parsed.file.buffer.toString('base64')}}]}],generationConfig:{maxOutputTokens:2200}});const raw=await response.text();let data={};try{data=JSON.parse(raw)}catch{throw Object.assign(new Error('Gemini returned invalid JSON'),{status:502})}const reply=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||'';if(!reply)throw Object.assign(new Error('Gemini returned an empty response'),{status:502});return json(res,200,{ok:true,reply,model});
  }
  if(req.method==='GET'&&(url.pathname==='/api/ai/chats'||url.pathname==='/api/chats'))return json(res,200,{ok:true,cloudHistoryAvailable:false,chats:[]});
  return json(res,404,{ok:false,message:'Endpoint not found'});
}

function serveFile(req,res,url){
  let pathname=decodeURIComponent(url.pathname);if(pathname==='/'||pathname==='')pathname='/Home.html';const safe=path.normalize(pathname).replace(/^([.][.][/\\])+/, '');const file=path.join(frontendDir,safe);if(!file.startsWith(frontendDir))return json(res,403,{ok:false,message:'Forbidden'});fs.stat(file,(err,stat)=>{if(err||!stat.isFile())return json(res,404,{ok:false,message:'File not found'});res.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res)});
}

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/',`http://${req.headers.host||`${HOST}:${PORT}`}`);
  try{if(url.pathname.startsWith('/api/')||url.pathname==='/health')await handleApi(req,res,url);else serveFile(req,res,url)}catch(e){if(!res.headersSent)json(res,e.status||500,{ok:false,message:e.message||'Server error'});else{try{sse(res,{type:'error',message:e.message||'AI request failed'});res.end()}catch{}}}
});
server.listen(PORT,HOST,()=>console.log(`NEXZO zero-install AI running at http://${HOST}:${PORT}`));

process.on('uncaughtException',error=>console.error('[NEXZO AI uncaught]',error));
process.on('unhandledRejection',error=>console.error('[NEXZO AI rejection]',error));
