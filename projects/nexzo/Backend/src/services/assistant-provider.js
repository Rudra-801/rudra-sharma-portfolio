import {askGemini,streamGeminiText} from './gemini.js';
import {askOpenAI,streamOpenAI,openAIConfiguration} from './openai-responses.js';
import {askGroq,streamGroq,groqConfiguration} from './groq.js';

export function configuredAssistantProviders(env=process.env){
  const providers=[];
  if(groqConfiguration(env).configured)providers.push('groq');
  if(openAIConfiguration(env).configured)providers.push('openai');
  if(env.GEMINI_API_KEY&&!/^YOUR_/i.test(env.GEMINI_API_KEY))providers.push('gemini');
  return providers;
}
export const assistantProvider=(env=process.env)=>configuredAssistantProviders(env)[0]||'none';
export const assistantConfigured=(env=process.env)=>configuredAssistantProviders(env).length>0;
const transports={groq:askGroq,openai:askOpenAI,gemini:askGemini};
const streamTransports={groq:streamGroq,openai:streamOpenAI,gemini:streamGeminiText};
function retryable(error){const s=error?.providerStatus||error?.status;return s===429||s===404||s===502||s===503||s===504||/quota|rate|timeout|unavailable|model/i.test(error?.message||'');}
export async function askAssistant(prompt,options={}){
  const env=options.env||process.env,providers=configuredAssistantProviders(env);if(!providers.length)throw Object.assign(new Error('AI service is not configured.'),{status:503});let last;
  for(const provider of providers){try{return await transports[provider](prompt,{...options,env});}catch(error){last=error;console.warn(JSON.stringify({event:'assistant_provider_failure',provider,status:error?.providerStatus||error?.status||502}));if(!retryable(error))break;}}
  throw last||Object.assign(new Error('AI service is unavailable.'),{status:503});
}
export async function* streamAssistantText(prompt,options={}){
  const env=options.env||process.env,providers=configuredAssistantProviders(env);if(!providers.length)throw Object.assign(new Error('AI service is not configured.'),{status:503});let last;
  for(const provider of providers){let emitted=false;try{for await(const chunk of streamTransports[provider](prompt,{...options,env})){emitted=true;yield chunk;}return;}catch(error){last=error;console.warn(JSON.stringify({event:'assistant_provider_failure',provider,status:error?.providerStatus||error?.status||502}));if(emitted||!retryable(error))throw error;}}
  throw last||Object.assign(new Error('AI service is unavailable.'),{status:503});
}
