/* NEXZO AI client v162 — resilient evaluation transport and safe fallback. */
(function(){
  'use strict';
  if(window.NEXZOAI?.version>=162)return;
  let activeBase=''; let backendState='unknown';
  const bases=()=>[activeBase,...(window.NEXZO_CONFIG?.API_CANDIDATES||[]),window.NEXZO_CONFIG?.API_BASE_URL].map(v=>String(v||'').replace(/\/$/,'')).filter((v,i,a)=>v&&a.indexOf(v)===i);
  async function token(){
    try{
      let auth;
      if(window.NEXZOFirebase?.getAuthContext){
        ({auth}=await window.NEXZOFirebase.getAuthContext());
      }else if(typeof window.getFirebaseAuthCompat==='function'){
        ({auth}=await window.getFirebaseAuthCompat());
      }
      if(!auth)return '';
      await auth.authStateReady?.();
      return auth.currentUser ? await auth.currentUser.getIdToken() : '';
    }catch{return ''}
  }
  const authHeaders=t=>t?{Authorization:`Bearer ${t}`}:{ };
  function timeoutSignal(ms){if(AbortSignal.timeout)return AbortSignal.timeout(ms);const c=new AbortController();setTimeout(()=>c.abort(),ms);return c.signal;}
  function emitState(state,detail={}){backendState=state;window.dispatchEvent(new CustomEvent('nexzo:ai-status',{detail:{state,...detail}}));}
  async function probe(base,timeout=5000){
    const r=await fetch(`${base}/health`,{headers:{Accept:'application/json'},signal:timeoutSignal(timeout),cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.ok)throw new Error(`HTTP ${r.status}`);
    return d;
  }
  async function findBackend(){
    const errors=[];
    for(const base of bases()){
      try{const health=await probe(base);activeBase=base;emitState('online',{base,health});return {base,health};}
      catch(e){errors.push(`${base}: ${e.message}`)}
    }
    emitState('offline',{errors});throw new Error(`No Study service is reachable. ${errors.join(' | ')}`);
  }
  async function request(path,options={}){
    const ownerAtStart=window.NEXZODataService?.getUser?.()?.uid;
    const authToken=await token();
    const {noFailover=false,...fetchOptions}=options;
    const form=fetchOptions.body instanceof FormData;
    const errors=[];
    const candidates=noFailover?bases().slice(0,1):bases();
    for(const base of candidates){
      try{
        const r=await fetch(`${base}${path}`,{...fetchOptions,headers:{...(form?{}:{'Content-Type':'application/json'}),...authHeaders(authToken),...(fetchOptions.headers||{})},signal:fetchOptions.signal||timeoutSignal(50000),cache:'no-store'});
        const d=await r.json().catch(()=>({}));
        if(!r.ok){const err=new Error(d.message||`AI request failed (${r.status})`);err.status=r.status;err.code=d.code;throw err;}
        if(ownerAtStart!==window.NEXZODataService?.getUser?.()?.uid)throw new Error('Account changed during request.');
        activeBase=base;return d;
      }catch(e){
        if(noFailover)throw e.status?e:Object.assign(new Error(e.name==='TimeoutError'||e.name==='AbortError'?'Study service took too long. Your work is preserved; retry.':'Study service is unreachable. Your work is preserved; retry.'),{code:'BACKEND_UNAVAILABLE'});
        errors.push(`${base}: ${e.message}`);
        if(e.status&&e.status<500&&e.status!==429)throw e;
      }
    }
    throw new Error(`AI service could not answer. ${errors.join(' | ')}`);
  }
  const sanitizePayload=p=>{const x={...(p||{})};const settings=window.NEXZOSettings?.get?.()||{};if(settings.personalization===false||settings.personalizationConsent===false){x.context={...(x.context||{}),personalization:{enabled:false}};delete x.context.profile;delete x.context.tasks;delete x.userContext;delete x.profile;delete x.tasks;delete x.weakTopics;delete x.activity;x.personalization=false}return x};
  const chat=p=>request('/ai/chat',{method:'POST',body:JSON.stringify(sanitizePayload(p))});
  async function streamChat(payload,{onDelta,signal}={}){
    const authToken=await token();
    const errors=[];
    for(const base of bases()){
      try{
        const response=await fetch(`${base}/ai/chat/stream`,{method:'POST',headers:{'Content-Type':'application/json',...authHeaders(authToken),Accept:'text/event-stream'},body:JSON.stringify(sanitizePayload(payload)),signal,cache:'no-store'});
        if(!response.ok){const data=await response.json().catch(()=>({}));const err=new Error(data.message||`AI stream failed (${response.status})`);err.status=response.status;throw err;}
        activeBase=base;
        const reader=response.body?.getReader();if(!reader)throw new Error('Streaming response is unavailable.');
        const decoder=new TextDecoder();let pending='',reply='',meta={};
        while(true){
          const {done,value}=await reader.read();if(done)break;
          pending+=decoder.decode(value,{stream:true});
          pending=pending.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
          const blocks=pending.split('\n\n');pending=blocks.pop()||'';
          for(const block of blocks){
            for(const line of block.split('\n')){
              if(!line.startsWith('data:'))continue;
              const data=JSON.parse(line.slice(5).trim());
              if(data.type==='delta'){reply+=data.text||'';onDelta?.(data.text||'',reply);}
              else if(data.type==='done')meta=data;
              else if(data.type==='error')throw new Error(data.message||'AI streaming failed.');
            }
          }
        }
        if(!reply.trim())throw new Error('AI stream returned an empty response.');
        return {reply,...meta};
      }catch(error){
        errors.push(`${base}: ${error.message}`);
        if(error.name==='AbortError')throw error;
        if(error.status&&error.status<500&&error.status!==429)throw error;
      }
    }
    // Some browsers/proxies block SSE even while normal JSON requests work.
    try{const fallback=await chat(payload);const reply=fallback.reply||fallback.answer||'';if(reply){onDelta?.(reply,reply);return {reply,model:fallback.model||'',fallback:true};}}catch(error){errors.push(`non-stream fallback: ${error.message}`)}
    emitState('offline',{errors});
    throw new Error(`AI service could not answer. ${errors.join(' | ')}`);
  }

  async function assistantStream(payload,{onDelta,onStatus,onRoute,onAction,onLearningEvent,signal}={}){
    const {auth}=await window.NEXZOFirebase.getAuthContext();await auth.authStateReady?.();
    const user=auth.currentUser;if(!user)throw new Error('Sign in to use Study Assistant.');
    const uid=user.uid,authToken=await user.getIdToken(),base=activeBase||bases()[0];
    if(!base)throw new Error('Study Assistant is unavailable. Please retry later.');
    const controller=new AbortController(),abort=()=>controller.abort();
    if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,120000);let reader;
    const current=()=>{if(auth.currentUser?.uid!==uid)throw new Error('Account changed. Please send your message again.');};
    try{
      current();
      const response=await fetch(`${base}/assistant/stream`,{method:'POST',headers:{'Content-Type':'application/json',...authHeaders(authToken),Accept:'text/event-stream'},body:JSON.stringify(sanitizePayload(payload)),signal:controller.signal,cache:'no-store'});
      if(!response.ok){const error=new Error(response.status===429?'Study Assistant is busy. Wait a moment and retry.':response.status===401?'Please sign in again.':'Study Assistant could not respond. Your message is preserved; please retry.');error.status=response.status;throw error;}
      current();activeBase=base;reader=response.body?.getReader();if(!reader)throw new Error('Streaming is unavailable. Please retry.');
      const decoder=new TextDecoder();let pending='',reply='',meta={},complete=false;
      const event=data=>{current();
        if(data.type==='delta'){reply+=data.text||'';onDelta?.(data.text||'',reply);}
        else if(data.type==='route'){meta.route=data.route;onRoute?.(data.route);}
        else if(data.type==='status')onStatus?.(data.message||'Working…');
        else if(data.type==='action'){meta.action=data.action;onAction?.(data.action);}
        else if(data.type==='learning-event'){meta.learningEvent=data.event;onLearningEvent?.(data.event);}
        else if(data.type==='workflow')meta.workflow=data.workflow;
        else if(data.type==='done'){meta={...meta,...data};complete=true;}
        else if(data.type==='error')throw new Error('The answer could not finish. Your message is preserved; please retry.');
      };
      const block=value=>{for(const line of value.split('\n'))if(line.startsWith('data:'))event(JSON.parse(line.slice(5).trim()));};
      while(true){const {done,value}=await reader.read();if(done)break;current();pending+=decoder.decode(value,{stream:true});pending=pending.replace(/\r\n/g,'\n');if(pending.length>262144)throw new Error('The response could not be read. Please retry.');const blocks=pending.split('\n\n');pending=blocks.pop()||'';blocks.forEach(block);}
      pending+=decoder.decode();if(pending.trim())block(pending);current();
      if(!complete||!reply.trim())throw new Error('The answer could not finish. Please retry.');return {...meta,reply};
    }catch(error){if(controller.signal.aborted)throw new DOMException(signal?.aborted?'Request stopped.':'Study Assistant took too long. Please retry.','AbortError');throw new Error(error.status?error.message:'The answer could not finish. Your message is preserved; please retry.');}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);try{await reader?.cancel();}catch{/* Stream may already be closed. */}}
  }

  const confirmAssistantAction=id=>request(`/assistant/actions/${encodeURIComponent(id)}/confirm`,{method:'POST',body:'{}'});

  async function multiAgentStream(payload,{onDelta,onStatus,onRoute,signal}={}){
    const authToken=await token();
    const errors=[];
    for(const base of bases()){
      try{
        const response=await fetch(`${base}/ai/multi-agent/stream`,{method:'POST',headers:{'Content-Type':'application/json',...authHeaders(authToken),Accept:'text/event-stream'},body:JSON.stringify(sanitizePayload(payload)),signal,cache:'no-store'});
        if(!response.ok){const data=await response.json().catch(()=>({}));const err=new Error(data.message||`Multi-agent stream failed (${response.status})`);err.status=response.status;throw err;}
        activeBase=base;const reader=response.body?.getReader();if(!reader)throw new Error('Streaming response is unavailable.');
        const decoder=new TextDecoder();let pending='',reply='',meta={};
        while(true){const {done,value}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});pending=pending.replace(/\r\n/g,'\n').replace(/\r/g,'\n');const blocks=pending.split('\n\n');pending=blocks.pop()||'';
          for(const block of blocks){for(const line of block.split('\n')){if(!line.startsWith('data:'))continue;const data=JSON.parse(line.slice(5).trim());
            if(data.type==='delta'){reply+=data.text||'';onDelta?.(data.text||'',reply);}
            else if(data.type==='route'){meta.route=data.route;onRoute?.(data.route);onStatus?.('Routing request to specialist agents…');}
            else if(data.type==='validation'){meta.validation=data.validation;onStatus?.('Validating specialist outputs…');}
            else if(data.type==='workflow'){meta={...meta,...data.workflow};onStatus?.('Synthesizing final response…');}
            else if(data.type==='done')meta={...meta,...data};
            else if(data.type==='error')throw new Error(data.message||'Multi-agent streaming failed.');
          }}
        }
        return {reply,...meta};
      }catch(error){errors.push(`${base}: ${error.message}`);if(error.name==='AbortError')throw error;if(error.status&&error.status<500&&error.status!==429)throw error;}
    }
    throw new Error(`Multi-agent AI could not answer. ${errors.join(' | ')}`);
  }

  const chats=()=>request('/ai/chats');
  const removeChat=id=>request(`/ai/chats/${encodeURIComponent(id)}`,{method:'DELETE'});
  const updateChat=(id,payload)=>request(`/ai/chats/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(payload)});
  const planner=p=>request('/ai/planner',{method:'POST',body:JSON.stringify(p),signal:timeoutSignal(35000),noFailover:true});
  const notes=p=>request('/ai/notes',{method:'POST',body:JSON.stringify(p),signal:timeoutSignal(30000),noFailover:true});
  const practice=p=>request('/ai/practice',{method:'POST',body:JSON.stringify(p),signal:timeoutSignal(30000),noFailover:true});
  const gradeMcq=p=>request('/ai/evaluate/mcq-grade',{method:'POST',body:JSON.stringify(p),signal:timeoutSignal(12000),noFailover:true});
  async function evaluate(payload){
    // Evaluate directly. The previous pre-flight /health request added another cold-start
    // wait before every submission and could leave the UI looking stuck. The evaluate
    // endpoint itself is the contract and returns a bounded error when incompatible.
    emitState('evaluating',{attempt:1});
    try{
      const result=await request('/ai/evaluate',{method:'POST',body:JSON.stringify(payload),signal:timeoutSignal(30000),noFailover:true});
      emitState('online',{attempt:1});
      return result;
    }catch(error){
      emitState('offline',{error:error?.message||'Evaluation failed'});
      throw error;
    }
  }
  const community=p=>request('/ai/community',{method:'POST',body:JSON.stringify(p)});
  function analyze(file,prompt){const f=new FormData();f.append('file',file);f.append('prompt',prompt||'Analyze this file clearly.');return request('/ai/analyze',{method:'POST',body:f});}
  function formatAnswer(text){return String(text||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])).replace(/```([\s\S]*?)```/g,'<pre><code>$1</code></pre>').replace(/^###?\s+(.+)$/gm,'<h3>$1</h3>').replace(/^[-*]\s+(.+)$/gm,'<li>$1</li>').replace(/\n/g,'<br>');}
  window.NEXZOAI=Object.freeze({version:163,request,chat,streamChat,assistantStream,confirmAssistantAction,multiAgentStream,chats,removeChat,updateChat,planner,evaluate,gradeMcq,notes,practice,community,analyze,formatAnswer,findBackend,probe,apiBase:()=>activeBase||bases()[0]||'',candidates:bases,status:()=>backendState});
})();
