import { askGemini, generateGeminiContent } from './gemini.js';

const REQUESTED_MODEL=String(process.env.GEMINI_MODEL||'').trim();
const MODEL=REQUESTED_MODEL||'gemini-3.8-flash';
const clean=s=>String(s||'').trim();
function toolError(message,status=502){return Object.assign(new Error(message),{status});}

async function callGeminiTool({prompt,tools,maxOutputTokens=4000,timeoutMs=90000}){
  const key=process.env.GEMINI_API_KEY;if(!key)throw toolError('GEMINI_API_KEY is not configured',503);
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},signal:controller.signal,
      body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],tools,generationConfig:{maxOutputTokens}})
    });
    const data=await response.json().catch(()=>({}));if(!response.ok)throw toolError(data?.error?.message||`Gemini tool request failed (${response.status})`,response.status===429?429:502);
    const candidate=data?.candidates?.[0]||{};const parts=candidate?.content?.parts||[];
    const text=parts.map(p=>p.text||'').join('').trim();
    const code=[];const executions=[];
    for(const p of parts){if(p.executableCode)code.push({language:p.executableCode.language||'',code:p.executableCode.code||''});if(p.codeExecutionResult)executions.push({outcome:p.codeExecutionResult.outcome||'',output:p.codeExecutionResult.output||''});}
    const meta=candidate.groundingMetadata||{};const sources=[];
    for(const chunk of meta.groundingChunks||[]){const web=chunk?.web;if(web?.uri&&!sources.some(s=>s.url===web.uri))sources.push({title:web.title||web.uri,url:web.uri});}
    return {text,code,executions,sources,searchQueries:meta.webSearchQueries||[],model:MODEL};
  }catch(error){if(error?.name==='AbortError')throw toolError('AI tool request timed out',504);throw error;}finally{clearTimeout(timer)}
}

export function webSearch(prompt){return callGeminiTool({prompt:`Use Google Search. Answer the request with current, verifiable information. Be concise but complete. Where useful, mention source names in the prose.\n\nRequest: ${clean(prompt)}`,tools:[{google_search:{}}],maxOutputTokens:3500});}
export async function deepResearch(prompt){
  const request=clean(prompt);
  const passes=[];
  const first=await callGeminiTool({prompt:`Research pass 1/3. Use Google Search to map the topic, identify the most important sub-questions, dates, claims and credible sources. Return concise findings plus 3-6 unresolved questions.\n\nRequest: ${request}`,tools:[{google_search:{}}],maxOutputTokens:3500,timeoutMs:120000});
  passes.push(first);
  const second=await callGeminiTool({prompt:`Research pass 2/3. Independently investigate the unresolved questions and verify or challenge the first-pass claims using additional Google Search results. Prefer primary/official sources when possible.\n\nOriginal request: ${request}\n\nFirst-pass findings:\n${first.text.slice(0,14000)}`,tools:[{google_search:{}}],maxOutputTokens:4200,timeoutMs:120000});
  passes.push(second);
  const synthesis=await callGeminiTool({prompt:`Research pass 3/3. Synthesize a final answer for the original request using the two research passes below. Resolve conflicts, separate verified facts from uncertainty, include relevant dates, and provide a concise source-backed conclusion. Do not invent citations; mention only source names/URLs present in the research evidence.\n\nOriginal request: ${request}\n\nPASS 1:\n${first.text.slice(0,12000)}\n\nPASS 2:\n${second.text.slice(0,14000)}`,tools:[{google_search:{}}],maxOutputTokens:6500,timeoutMs:120000});
  const sources=[];for(const pass of [...passes,synthesis])for(const source of pass.sources||[])if(source?.url&&!sources.some(x=>x.url===source.url))sources.push(source);
  return {...synthesis,sources,passes:3,researchTrace:[{stage:'map',sources:(first.sources||[]).length},{stage:'verify',sources:(second.sources||[]).length},{stage:'synthesize',sources:(synthesis.sources||[]).length}]};
}

export async function routeAdvancedTool({prompt='',files=[]}={}){
  const names=(files||[]).map(String).slice(0,40);
  const raw=await askGemini(`You are a tool router for NEXZO Study Assistant. Choose at most one tool. Return ONLY JSON: {"tool":"none|search|research|code|data|project-edit|artifact:docx|artifact:pdf|artifact:pptx|artifact:xlsx","confidence":0-1,"reason":"short reason"}. Use search only for current/live web facts, research for explicit deep multi-source research, code only when execution is requested/useful, data for dataset analysis, project-edit only when source files are attached and the user asks to modify them, artifacts only when the user explicitly asks to create that downloadable format. If normal conversation can answer, choose none.\n\nAttached files: ${JSON.stringify(names)}\n\nUser request: ${clean(prompt)}`,{temperature:0,maxOutputTokens:220});
  const text=String(raw||'').replace(/```json|```/gi,'').trim();let parsed={};try{parsed=JSON.parse(text)}catch{return {tool:'none',confidence:0,reason:'router parse fallback'}}
  const allowed=new Set(['none','search','research','code','data','project-edit','artifact:docx','artifact:pdf','artifact:pptx','artifact:xlsx']);
  const tool=allowed.has(parsed.tool)?parsed.tool:'none';return {tool,confidence:Math.max(0,Math.min(1,Number(parsed.confidence)||0)),reason:clean(parsed.reason).slice(0,180)};
}
export function runCode(prompt){return callGeminiTool({prompt:`Solve this programming/computation request. Use the code execution tool when execution helps. Show the final result, any executed code, and explain errors/fixes clearly. Never claim execution unless tool output is present.\n\nRequest: ${clean(prompt)}`,tools:[{code_execution:{}}],maxOutputTokens:5000,timeoutMs:120000});}
export function analyzeDataWithCode(prompt,context=''){return callGeminiTool({prompt:`Analyze this dataset or data question. Use code execution for calculations. Return: key findings, calculations, anomalies, and a compact chart specification as JSON in a fenced block when a chart is useful (type, title, labels, values).\n\n${context?`Data context:\n${context.slice(0,300000)}\n\n`:''}Request: ${clean(prompt)}`,tools:[{code_execution:{}}],maxOutputTokens:5500,timeoutMs:120000});}
export async function createArtifactContent({prompt,type}){
  const typeGuide={docx:'a polished document with title, sections, bullets and concise paragraphs',pdf:'a polished printable report with title, sections and concise paragraphs',pptx:'a presentation outline with 6-10 slides; each slide must have a title and 3-6 bullets',xlsx:'a spreadsheet-ready table; return JSON with {title,headers,rows} only'}[type]||'structured content';
  if(type==='xlsx')return askGemini(`Create ${typeGuide} for this request. ${prompt}`,{maxOutputTokens:4000});
  return askGemini(`Create ${typeGuide}. Use plain text/markdown only; no HTML. Request: ${prompt}`,{maxOutputTokens:5000});
}

export async function proposeProjectEdits({prompt,files=[]}){
  const context=files.map(f=>`--- FILE: ${f.path} ---\n${f.content}`).join('\n\n').slice(0,550000);
  const raw=await askGemini(`You are editing a software project. Return ONLY valid JSON with this exact shape: {"summary":"...","changes":[{"path":"relative/path.ext","content":"FULL NEW FILE CONTENT"}]}. Change only files that need modification. Preserve existing behavior unless the request explicitly changes it. Never include .env, credentials, keys, node_modules, dist or build outputs.\n\nRequest: ${prompt}\n\nProject files:\n${context}`,{maxOutputTokens:12000});
  const cleaned=String(raw).replace(/```json|```/gi,'').trim();let parsed;try{parsed=JSON.parse(cleaned)}catch{const a=cleaned.indexOf('{'),b=cleaned.lastIndexOf('}');if(a<0||b<=a)throw toolError('Project editor returned invalid JSON',502);parsed=JSON.parse(cleaned.slice(a,b+1));}
  return parsed;
}
