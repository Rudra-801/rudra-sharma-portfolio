/* Server-only Groq transport. Uses the OpenAI-compatible Chat Completions API. */
const problem=(message,status=502,providerStatus)=>Object.assign(new Error(message),{status,providerStatus});

export function groqConfiguration(env=process.env){
  return {
    configured:Boolean(env.GROQ_API_KEY&&env.GROQ_MODEL),
    model:String(env.GROQ_MODEL||'').trim()
  };
}
function control(options){
  const controller=new AbortController(),abort=()=>controller.abort();
  if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,Math.min(90000,Math.max(1000,Number(options.timeoutMs)||30000)));
  return {signal:controller.signal,close(){clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}};
}
function bodyFor(prompt,options,env){
  const config=groqConfiguration(env);
  if(!config.configured)throw problem('Groq is not configured.',503);
  const input=String(prompt||'');
  if(!input.trim()||input.length>48000)throw problem('The AI request is empty or too large.',400);
  return {
    model:config.model,
    messages:[{role:'user',content:input}],
    temperature:Math.min(2,Math.max(0,Number(options.temperature) || 0)),
    max_completion_tokens:Math.min(8192,Math.max(64,Number(options.maxOutputTokens)||2200)),
    ...(options.academic?{response_format:{type:'json_object'}}:{})
  };
}
async function request(body,options,env,signal){
  const response=await (options.fetchImpl||fetch)('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.GROQ_API_KEY},signal,body:JSON.stringify(body)
  });
  if(!response.ok){
    await response.body?.cancel();
    const status=response.status;
    throw problem(status===429?'Groq quota or rate limit reached.':'Groq is temporarily unavailable.',status===429?429:status===401||status===403?503:status===404?404:502,status);
  }
  return response;
}
export async function askGroq(prompt,options={}){
  const env=options.env||process.env,body=bodyFor(prompt,options,env),handle=control(options);
  try{
    const response=await request(body,options,env,handle.signal),data=await response.json();
    const text=String(data?.choices?.[0]?.message?.content||'').trim();
    if(!text)throw problem('Groq returned an empty response.',502);
    return text;
  }catch(error){if(handle.signal.aborted)throw problem(options.signal?.aborted?'Request stopped.':'Groq request timed out.',504,504);throw error;}
  finally{handle.close();}
}
export async function* streamGroq(prompt,options={}){
  const env=options.env||process.env,body={...bodyFor(prompt,options,env),stream:true},handle=control(options);let reader;
  try{
    const response=await request(body,options,env,handle.signal);reader=response.body?.getReader();if(!reader)throw problem('Groq streaming is unavailable.',502);
    const decoder=new TextDecoder();let pending='',emitted=false;
    while(true){const chunk=await reader.read();if(chunk.done)break;pending+=decoder.decode(chunk.value,{stream:true}).replace(/\r\n/g,'\n');const lines=pending.split('\n');pending=lines.pop()||'';
      for(const line of lines){if(!line.startsWith('data:'))continue;const raw=line.slice(5).trim();if(!raw||raw==='[DONE]')continue;let event;try{event=JSON.parse(raw);}catch{continue;}const text=String(event?.choices?.[0]?.delta?.content||'');if(text){emitted=true;yield text;}}
    }
    if(!emitted)throw problem('Groq returned an empty streaming response.',502);
  }catch(error){if(handle.signal.aborted)throw problem(options.signal?.aborted?'Request stopped.':'Groq request timed out.',504,504);throw error;}
  finally{try{await reader?.cancel();}finally{handle.close();}}
}
