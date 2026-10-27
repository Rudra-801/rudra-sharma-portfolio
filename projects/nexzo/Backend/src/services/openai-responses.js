/* Server-only Responses API transport. No SDK, browser key, or implicit model fallback. */
const problem=(message,status=502)=>Object.assign(new Error(message),{status});
export function openAIConfiguration(env=process.env){
  return {configured:Boolean(env.OPENAI_API_KEY&&env.OPENAI_MODEL),model:String(env.OPENAI_MODEL||'').trim()};
}
function payload(prompt,options,env){
  const config=openAIConfiguration(env);
  if(!config.configured)throw problem('Study Assistant is not configured. Please try again later.',503);
  const input=String(prompt||'');
  if(!input.trim()||input.length>48000)throw problem('The study request is empty or too large.',400);
  return {model:config.model,input,store:false,max_output_tokens:Math.min(4096,Math.max(64,Number(options.maxOutputTokens)||2200)),
    ...(options.academic?{text:{format:{type:'json_object'}}}:{}),
    ...(env.OPENAI_REASONING_EFFORT?{reasoning:{effort:env.OPENAI_REASONING_EFFORT}}:{})};
}
function control(options){
  const controller=new AbortController(),abort=()=>controller.abort();
  if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,Math.min(90000,Math.max(1000,Number(options.timeoutMs)||60000)));
  return {signal:controller.signal,close(){clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}};
}
async function request(body,options,env,signal){
  const response=await (options.fetchImpl||fetch)('https://api.openai.com/v1/responses',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.OPENAI_API_KEY},signal,body:JSON.stringify(body)
  });
  if(!response.ok){await response.body?.cancel();throw Object.assign(problem(response.status===429?'Study Assistant is busy. Please wait a moment and retry.':'Study Assistant is temporarily unavailable. Please retry.',response.status===429?429:503),{providerStatus:response.status});}
  return response;
}
function outputText(data){return (data.output||[]).filter(item=>item.type==='message').flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text||'').join('');}
export async function askOpenAI(prompt,options={}){
  const env=options.env||process.env,body=payload(prompt,options,env),handle=control(options);
  try{const response=await request(body,options,env,handle.signal),data=await response.json();
    if(data.status!=='completed')throw problem('The answer could not finish. Please retry.');
    const text=outputText(data);if(!text.trim())throw problem('No answer was returned. Please retry.');return text;
  }catch(error){if(handle.signal.aborted)throw problem(options.signal?.aborted?'Request stopped.':'Study Assistant took too long. Please retry.',504);throw error;}
  finally{handle.close();}
}
export async function* streamOpenAI(prompt,options={}){
  const env=options.env||process.env,body={...payload(prompt,options,env),stream:true},handle=control(options);
  let reader;
  try{
    const response=await request(body,options,env,handle.signal);reader=response.body?.getReader();if(!reader)throw problem('Streaming is unavailable. Please retry.');
    const decoder=new TextDecoder();let pending='',emitted=false,completed=false;
    function parse(block){const lines=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim());if(!lines.length)return null;const value=lines.join('\n');return value==='[DONE]'?null:JSON.parse(value);}
    function inspect(event){
      if(!event)return '';
      if(['response.failed','response.incomplete','error'].includes(event.type))throw problem('The answer could not finish. Please retry.');
      if(event.type==='response.completed')completed=true;
      return event.type==='response.output_text.delta'?String(event.delta||''):'';
    }
    while(true){const chunk=await reader.read();if(chunk.done)break;
      pending+=decoder.decode(chunk.value,{stream:true});pending=pending.replace(/\r\n/g,'\n');
      if(pending.length>262144)throw problem('The streaming response was invalid. Please retry.');
      const blocks=pending.split('\n\n');pending=blocks.pop()||'';
      for(const block of blocks){const text=inspect(parse(block));if(text){emitted=true;yield text;}}
    }
    pending+=decoder.decode();if(pending.trim()){const text=inspect(parse(pending));if(text){emitted=true;yield text;}}
    if(!completed||!emitted)throw problem('The answer could not finish. Please retry.');
  }catch(error){if(handle.signal.aborted)throw problem(options.signal?.aborted?'Request stopped.':'Study Assistant took too long. Please retry.',504);throw error;}
  finally{try{await reader?.cancel();}finally{handle.close();}}
}
