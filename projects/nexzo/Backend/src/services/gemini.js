const REQUESTED_MODEL=String(process.env.GEMINI_MODEL||"").trim();
// Keep the configured model first, then try current stable Flash models. Do not
// label a model deprecated locally: Google controls availability per API key and
// returns a precise 400/404 when a model is unavailable.
const MODEL = REQUESTED_MODEL || "gemini-3.8-flash";
const CONFIGURED_FALLBACKS=(process.env.GEMINI_FALLBACK_MODELS||"")
  .split(",")
  .map(value=>value.trim())
  .filter(Boolean);
const MODEL_CANDIDATES = [...new Set([
  MODEL,
  ...CONFIGURED_FALLBACKS,
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash"
])];
const TRANSIENT_STATUSES=new Set([408,429,500,502,503,504]);

function geminiError(message, status = 502){
  return Object.assign(new Error(message), { status });
}

async function fetchGemini(pathForModel, init, key, options={}){
  // Remember the last model that actually worked so every request does not walk the
  // fallback list again. Model fallbacks are only useful for unsupported-model errors
  // (400/404). Quota errors fail immediately. Academic requests only try explicit
  // configured models and never retry a failed call against the same quota.
  const ordered=options.academic?[MODEL,...CONFIGURED_FALLBACKS]:[...MODEL_CANDIDATES];
  if(fetchGemini.lastGoodModel && ordered.includes(fetchGemini.lastGoodModel)){
    ordered.splice(ordered.indexOf(fetchGemini.lastGoodModel),1);
    ordered.unshift(fetchGemini.lastGoodModel);
  }
  let lastError;
  for(const model of ordered){
    for(let attempt=0;attempt<(options.academic?1:2);attempt++){
      const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${pathForModel}`,{
        ...init,
        headers:{...(init.headers||{}),"x-goog-api-key":key}
      });
      if(response.ok){fetchGemini.lastGoodModel=model;return {response,model};}
      const data=await response.json().catch(()=>({}));
      const status=response.status;
      const publicStatus=status===429?429:status===401||status===403?401:502;
      lastError=Object.assign(geminiError(data?.error?.message||`Gemini request failed for ${model}`,publicStatus),{providerStatus:status});
      if(status===429)throw lastError;
      if(status===401||status===403)throw lastError;
      if(status===400||status===404)break; // try next compatible model
      if(options.academic)throw lastError;
      if(!TRANSIENT_STATUSES.has(status))throw lastError;
      if(attempt===0){await new Promise(resolve=>setTimeout(resolve,650));continue;}
      throw lastError;
    }
  }
  throw lastError||geminiError("No compatible Gemini model was available",502);
}
fetchGemini.lastGoodModel='';

export async function generateGeminiContent(parts, options = {}){
  const key = process.env.GEMINI_API_KEY;
  if(!key) throw geminiError("GEMINI_API_KEY is not configured", 503);
  if(!Array.isArray(parts) || !parts.length) throw geminiError("Gemini request has no content", 400);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || 45_000));
  try{
    const {response} = await fetchGemini("generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            maxOutputTokens: options.maxOutputTokens ?? 1800,
            ...(options.academic?{responseMimeType:"application/json"}:{}),
            ...(Number.isFinite(Number(options.temperature))?{temperature:Number(options.temperature)}:{})
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
          ]
        })
      }, key, options);
    const data = await response.json().catch(() => ({}));
    if(!response.ok) throw geminiError(data?.error?.message || "Gemini request failed", response.status === 429 ? 429 : 502);
    if(options.academic && data?.candidates?.[0]?.finishReason==='MAX_TOKENS')throw Object.assign(geminiError('Incomplete structured response',502),{code:'INVALID_AI_RESPONSE'});
    const text = data?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
    if(!text) throw geminiError("Gemini returned an empty response", 502);
    return text;
  }catch(error){
    if(error?.name === "AbortError") throw geminiError("Gemini request timed out", 504);
    throw error;
  }finally{
    clearTimeout(timer);
  }
}

export async function* streamGeminiContent(parts, options = {}){
  const key = process.env.GEMINI_API_KEY;
  if(!key) throw geminiError("GEMINI_API_KEY is not configured", 503);
  if(!Array.isArray(parts) || !parts.length) throw geminiError("Gemini request has no content", 400);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || 60_000));
  try{
    const {response} = await fetchGemini("streamGenerateContent?alt=sse", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        signal:controller.signal,
        body:JSON.stringify({
          contents:[{role:"user",parts}],
          generationConfig:{maxOutputTokens:options.maxOutputTokens ?? 2200,...(Number.isFinite(Number(options.temperature))?{temperature:Number(options.temperature)}:{})},
          safetySettings:[
            {category:"HARM_CATEGORY_HARASSMENT",threshold:"BLOCK_MEDIUM_AND_ABOVE"},
            {category:"HARM_CATEGORY_HATE_SPEECH",threshold:"BLOCK_MEDIUM_AND_ABOVE"},
            {category:"HARM_CATEGORY_DANGEROUS_CONTENT",threshold:"BLOCK_MEDIUM_AND_ABOVE"}
          ]
        })
      }, key);
    if(!response.ok){
      const data=await response.json().catch(()=>({}));
      throw geminiError(data?.error?.message || "Gemini streaming request failed", response.status===429?429:502);
    }
    const reader=response.body?.getReader();
    if(!reader) throw geminiError("Gemini streaming response is unavailable",502);
    const decoder=new TextDecoder();
    let pending="",emitted=false;
    const parseBlock=block=>{
      const chunks=[];
      for(const line of block.split("\n")){
        if(!line.startsWith("data:")) continue;
        const payload=line.slice(5).trim();
        if(!payload || payload==="[DONE]") continue;
        const data=JSON.parse(payload);
        const text=data?.candidates?.[0]?.content?.parts?.map(part=>part.text||"").join("") || "";
        if(text) chunks.push(text);
      }
      return chunks;
    };
    while(true){
      const {done,value}=await reader.read();
      if(done) break;
      pending += decoder.decode(value,{stream:true});
      pending = pending.replace(/\r\n/g,"\n").replace(/\r/g,"\n");
      const blocks=pending.split("\n\n");
      pending=blocks.pop() || "";
      for(const block of blocks){
        for(const text of parseBlock(block)){emitted=true;yield text;}
      }
    }
    pending += decoder.decode();
    pending = pending.replace(/\r\n/g,"\n").replace(/\r/g,"\n").trim();
    if(pending)for(const text of parseBlock(pending)){emitted=true;yield text;}
    if(!emitted)throw geminiError("Gemini returned an empty streaming response",502);
  }catch(error){
    if(error?.name==="AbortError") throw geminiError("Gemini request timed out",504);
    throw error;
  }finally{clearTimeout(timer);}
}

export async function* streamGeminiText(prompt, options = {}){
  yield* streamGeminiContent([{text:String(prompt||"")}], options);
}

export async function askGemini(prompt, options = {}){
  return generateGeminiContent([{ text: String(prompt || "") }], options);
}

export async function analyzeGeminiFile({ prompt, buffer, mimeType }, options = {}){
  return generateGeminiContent([
    { text: String(prompt || "Analyze this file for a university student.") },
    { inlineData: { mimeType, data: buffer.toString("base64") } }
  ], { ...options, maxOutputTokens: options.maxOutputTokens ?? 2200 });
}

export async function analyzeGeminiFiles({prompt,files=[]},options={}){
  const parts=[{text:String(prompt||'Analyze these project files for a university student. Use the file paths when explaining relationships.')}];
  let textBudget=600000;
  for(const file of files){
    const label=String(file.path||file.name||'file').slice(0,320);
    if(file.isText){
      const raw=file.buffer.toString('utf8'),content=raw.slice(0,Math.max(0,textBudget));textBudget-=content.length;
      parts.push({text:'\n--- FILE: '+label+' ---\n'+content+(content.length<raw.length?'\n[File truncated safely]':'' )});
    }else{
      parts.push({text:'\n--- BINARY FILE: '+label+' ---'});
      parts.push({inlineData:{mimeType:file.mimeType,data:file.buffer.toString('base64')}});
    }
  }
  return generateGeminiContent(parts,{...options,maxOutputTokens:options.maxOutputTokens??3000});
}

export function parseJsonModelOutput(text){
  const cleaned = String(text || "").replace(/```json|```/gi, "").trim();
  try{ return JSON.parse(cleaned); }
  catch{
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if(start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw geminiError("AI returned invalid JSON", 502);
  }
}


const configuredImageModel = String(process.env.GEMINI_IMAGE_MODEL || "").trim();
// A text-only Gemini model cannot satisfy this route. If an old deployment
// accidentally put GEMINI_MODEL (for example gemini-3.6-flash) into the image
// setting, fall back to the native image model instead of returning empty text.
const IMAGE_MODEL = /image/i.test(configuredImageModel) ? configuredImageModel : "gemini-3.1-flash-image";
const IMAGE_ASPECT_RATIOS = new Set(["1:1","2:3","3:2","3:4","4:3","4:5","5:4","9:16","16:9","1:4","4:1","1:8","8:1"]);
const IMAGE_SIZES = new Set(["512","0.5K","1K","2K","4K"]);
const IMAGE_SIZE_TO_API = {"0.5K":"512"};

function findImageBlock(value){
  if(!value)return null;
  if(Array.isArray(value)){
    for(const item of value){const found=findImageBlock(item);if(found)return found;}
    return null;
  }
  if(typeof value!=='object')return null;
  if((String(value.type||'').toLowerCase()==='image' || value.data) && (value.data||value.uri))return value;
  for(const key of ['output_image','output','steps','content','delta','image']){
    const found=findImageBlock(value[key]);if(found)return found;
  }
  return null;
}

function collectImageText(value,lines=[]){
  if(!value)return lines;
  if(Array.isArray(value)){value.forEach(item=>collectImageText(item,lines));return lines;}
  if(typeof value!=='object')return lines;
  if(String(value.type||'').toLowerCase()==='text' && value.text)lines.push(String(value.text));
  for(const key of ['output','steps','content','delta'])collectImageText(value[key],lines);
  return lines;
}

export async function generateGeminiImage({prompt, images=[], aspectRatio="1:1", imageSize="1K"}={}){
  const key=process.env.GEMINI_API_KEY;
  if(!key) throw geminiError("GEMINI_API_KEY is not configured",503);
  const cleanPrompt=String(prompt||"").trim();if(!cleanPrompt)throw geminiError("Image prompt is required",400);
  const ratio=IMAGE_ASPECT_RATIOS.has(aspectRatio)?aspectRatio:"1:1";
  // The UI historically called the 512px option "0.5K". The Interactions API
  // accepts the literal value "512", so translate it at the API boundary.
  const size=IMAGE_SIZE_TO_API[imageSize] || (IMAGE_SIZES.has(imageSize)?imageSize:"1K");
  const input=[{type:"text",text:cleanPrompt},...images.slice(0,4).map(image=>({type:"image",mime_type:image.mimeType,data:image.buffer.toString("base64")}))];
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),120_000);
  try{
    const response=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
      method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},signal:controller.signal,
      // Image response_format only accepts JPEG output. The deployed failure
      // came from sending image/png here; reference-image mime types above are
      // still preserved as their original PNG/JPEG/WEBP values.
      body:JSON.stringify({model:IMAGE_MODEL,input,response_format:{type:"image",mime_type:"image/jpeg",delivery:"inline",aspect_ratio:ratio,image_size:size}})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw geminiError(data?.error?.message||`Gemini image request failed (${response.status})`,response.status===429?429:response.status===401||response.status===403?401:502);
    const image=findImageBlock(data);
    const text=[String(data?.output_text||''),...collectImageText(data)].filter(Boolean).join("\n").trim();
    if(!image?.data)throw geminiError("Gemini image model returned no image",502);
    const returnedMime=String(image.mime_type||image.mimeType||"image/jpeg").toLowerCase();
    return {data:image.data,mimeType:/^image\/(png|jpeg|webp|gif|bmp|tiff)$/i.test(returnedMime)?returnedMime:"image/jpeg",text,interactionId:data?.id||"",model:data?.model||IMAGE_MODEL};
  }catch(error){if(error?.name==="AbortError")throw geminiError("Image generation timed out",504);throw error;}finally{clearTimeout(timer);}
}
