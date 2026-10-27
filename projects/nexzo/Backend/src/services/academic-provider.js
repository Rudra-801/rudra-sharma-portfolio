import {askGemini, parseJsonModelOutput} from './gemini.js';
import {askOpenAI} from './openai-responses.js';
import {askGroq} from './groq.js';

const messages={AI_QUOTA_EXCEEDED:'The study provider quota is exhausted. Retry after quota is restored.',MODEL_UNAVAILABLE:'The configured study model is unavailable.',AUTH_CONFIGURATION_ERROR:'The study provider is not configured correctly.',PROVIDER_TIMEOUT:'The study provider took too long. Your work is preserved; retry.',INVALID_AI_RESPONSE:'The study provider returned an incomplete or invalid result. Retry.',BACKEND_UNAVAILABLE:'The study service is unavailable. Retry later.'};
export function academicError(code,status=503){return Object.assign(new Error(messages[code]),{code,status,retryable:!['AUTH_CONFIGURATION_ERROR','MODEL_UNAVAILABLE'].includes(code)});}
export function classifyProviderError(e){
  if(messages[e?.code])return e;
  const status=e?.providerStatus||e?.status;
  const code=status===429?'AI_QUOTA_EXCEEDED':status===401||status===403?'AUTH_CONFIGURATION_ERROR':status===404?'MODEL_UNAVAILABLE':status===504||/abort|timeout|timed out/i.test(e?.message||'')?'PROVIDER_TIMEOUT':'BACKEND_UNAVAILABLE';
  return academicError(code,code==='AI_QUOTA_EXCEEDED'?429:code==='PROVIDER_TIMEOUT'?504:503);
}
export function configuredAcademicProviders(env=process.env){
  const providers=[];
  if(env.GROQ_API_KEY&&env.GROQ_MODEL&&!/^YOUR_/i.test(env.GROQ_API_KEY))providers.push('groq');
  if(env.OPENAI_API_KEY&&env.OPENAI_MODEL&&!/^YOUR_/i.test(env.OPENAI_API_KEY))providers.push('openai');
  if(env.GEMINI_API_KEY&&!/^YOUR_/i.test(env.GEMINI_API_KEY))providers.push('gemini');
  return providers;
}
// Each configured provider is attempted once. Quota failures never trigger a
// retry against the same quota, and arbitrary unconfigured models are not tried.
export async function academicJson(prompt,validate,{env=process.env,transports={groq:askGroq,openai:askOpenAI,gemini:askGemini},maxOutputTokens=4000,beforeRequest,onProviderFailure}={}){
  const providers=configuredAcademicProviders(env);if(!providers.length)throw academicError('AUTH_CONFIGURATION_ERROR');
  if(beforeRequest)await beforeRequest();
  let last;
  for(const provider of providers){
    try{
      const text=await transports[provider](prompt,{timeoutMs:12000,maxOutputTokens,temperature:.15,academic:true,env});
      let parsed;
      try{parsed=validate(parseJsonModelOutput(text));}catch{throw academicError('INVALID_AI_RESPONSE',502);}
      return {data:parsed,provider};
    }catch(e){
      last=classifyProviderError(e);
      const diagnostic={event:'academic_provider_failure',provider,code:last.code,status:last.status};
      if(onProviderFailure)onProviderFailure(diagnostic);
      else if(env.NODE_ENV==='production')console.warn(JSON.stringify(diagnostic));
    }
  }
  throw last;
}
