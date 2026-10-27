import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireFirebaseAuth, requireVerifiedEmail } from "../middleware/auth.js";
import { analyzeGeminiFile, analyzeGeminiFiles, generateGeminiImage, parseJsonModelOutput } from "../services/gemini.js";
import { askAssistant, streamAssistantText, assistantProvider } from "../services/assistant-provider.js";
import { firestore, firebaseAdmin, firebaseAdminDataReady } from "../config/firebase.js";
import { durableDailyAiQuota } from "../middleware/ai-quota.js";
import { runMultiAgent, streamMultiAgent } from "../agents/orchestrator.js";
import { isOfficeFile, extractOfficeText } from "../services/office-text.js";
import { generateQuestionPlan } from "../services/learning-engines.js";

import {storeQuestionPlan,evaluateAndPersist,gradeMcqOnly} from '../services/academic-workflow.js';
import {getStudyNotes,academicContextSchema,curriculumContext} from '../services/academic-notes.js';
const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb){
    const allowedMime = new Set(["image/png","image/jpeg","image/webp","application/pdf","text/plain","text/markdown","application/json","text/html","text/css","text/javascript","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.presentationml.presentation","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-excel"]);
    const textExtension = /\.(txt|md|json|js|mjs|cjs|html|css|py|java|c|cpp|h|sql|csv|tsv)$/i.test(file.originalname || "");
    const ok = allowedMime.has(file.mimetype) || textExtension;
    cb(ok ? null : Object.assign(new Error("Unsupported file type. Use images, PDF, DOCX, PPTX, XLSX, text, data or source-code files."), { status: 415 }), ok);
  }
});
const projectTextExtension=/\.(txt|md|json|js|mjs|cjs|ts|tsx|jsx|html|css|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sql|xml|ya?ml|toml|vue|svelte|csv)$/i;
const sensitiveProjectPath=/(^|\/)(?:\.env(?:\..*)?|\.git|node_modules|vendor|dist|build|coverage)(?:\/|$)|(?:^|\/)(?:id_rsa|id_ed25519|credentials?|secrets?|service-account|firebase-adminsdk)[^/]*$|\.(?:pem|key|p12|pfx)$/i;
const projectUpload=multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:5*1024*1024,files:24,fields:30,parts:60},
  fileFilter(req,file,cb){
    const binary=new Set(['image/png','image/jpeg','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
    const ok=binary.has(file.mimetype)||projectTextExtension.test(file.originalname||'')||/\.(docx|pptx|xlsx)$/i.test(file.originalname||'');
    cb(ok?null:Object.assign(new Error('Unsupported project file type.'),{status:415}),ok);
  }
});
const imageUpload=multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:8*1024*1024,files:4,fields:8,parts:16},
  fileFilter(req,file,cb){const ok=new Set(['image/png','image/jpeg','image/webp']).has(file.mimetype);cb(ok?null:Object.assign(new Error('Image editing supports PNG, JPG and WEBP files.'),{status:415}),ok);}
});

router.use(requireFirebaseAuth);
router.use(requireVerifiedEmail);
router.use(rateLimit({windowMs:60_000,limit:Number(process.env.AI_RATE_LIMIT_PER_MINUTE||20),keyGenerator:req=>req.user.uid,standardHeaders:true,legacyHeaders:false,message:{message:"AI request limit reached. Wait a minute and retry."}}));
const aiQuota=durableDailyAiQuota();
const consumeQuota=(req,res)=>()=>new Promise((resolve,reject)=>aiQuota(req,res,e=>e?reject(e):resolve()));
// Deterministic marking and validated cached notes do not consume provider quota.
router.use((req,res,next)=>['/evaluate','/evaluate/mcq-grade','/notes','/practice','/planner'].includes(req.path)?next():aiQuota(req,res,next));

const chatsRef = uid => {
  if(!firestore) return null;
  return firestore.collection("users").doc(uid).collection("aiChats");
};

const historyItem = z.object({
  role: z.enum(["user","assistant"]),
  content: z.string().trim().max(6000)
});
const modeGuidance={
  'academic-pack':'Return the requested subject-specific teaching pack as valid JSON only. Respect the exact topic, required teaching sequence and answer-bearing practice schema. Provide real worked content rather than instructions for creating it.',
  chat:[
    "Hold a natural multi-turn conversation like a capable study partner.",
    "Respond to the student's actual intent, remember the recent conversation, and do not restart or repeat earlier material.",
    "Be concise for simple questions and detailed only when the task needs it. Do not force headings, recaps, quizzes, or follow-up questions into every answer.",
    "When the request is ambiguous, ask one useful clarification instead of guessing."
  ].join(" "),
  explain:[
    "Teach from fundamentals and adapt depth to the student's follow-up questions.",
    "Use a concrete example, clarify confusing terms, and end with a compact recap or check-for-understanding question."
  ].join(" "),
  notes:[
    "Create genuinely revision-ready notes, not a conversational overview.",
    "Use a clear hierarchy, key definitions, important formulas or commands where relevant, examples, common mistakes, and a final rapid-revision section.",
    "For follow-ups, revise or extend the existing notes instead of restarting them."
  ].join(" "),
  quiz:[
    "Run an interactive quiz with exactly five MCQs unless the student requests another count.",
    "Ask only one numbered question at a time with four options A-D and wait for the student's answer.",
    "After each answer, state correct/incorrect, give a brief explanation, update the running score, then ask the next question.",
    "Infer the current question and score from the conversation history; never restart merely because the student replies with a short option such as A or B.",
    "After the last answer, provide final score, weak topics, and two next-study actions."
  ].join(" "),
  interview:[
    "Conduct a five-question one-at-a-time mock interview unless the student requests a different length.",
    "Ask one focused question and wait. After each answer, give concise interviewer feedback and ask the next question, using relevant follow-ups.",
    "Infer progress from conversation history and never restart when the student submits an answer.",
    "Finish with a score out of 10, strengths, weak areas, corrected answer examples, and an improvement plan."
  ].join(" ")
};
function buildStudyPrompt(input, req){
  const conversation=(input.history||[]).slice(-12).map(item=>`${item.role === "user" ? "Student" : "NEXZO"}: ${item.content}`).join("\n");
  const context=input.context||{};
  return [
    "You are NEXZO AI Assistant, a study-first intelligent workspace for university students.",
    "Answer accurately and directly. Match the student's language, tone and requested level of detail.",
    "Use the student's context when relevant, but never invent personal data.",
    "Use headings, examples, steps or practice prompts only when they materially improve the answer. For MCQs, provide exactly the requested count with varied answer positions.",
    "For answer evaluation, distinguish factual accuracy, completeness, clarity and improvement suggestions.",
    "Never claim Planner, notes, files, memory or another external action succeeded unless the application confirms it.",
    `Mode: ${input.mode || "study-help"}`,
    `Mode workflow: ${modeGuidance[input.mode]||modeGuidance.chat}`,
    context && Object.keys(context).length ? `Student context: ${JSON.stringify(context)}` : "",
    conversation ? `Recent conversation:\n${conversation}` : "",
    `Current student message:\n${input.message}`
  ].filter(Boolean).join("\n\n");
}

const chatInputSchema=z.object({
  message:z.string().trim().min(1).max(6000),
  chatId:z.string().trim().min(1).max(120).optional(),
  title:z.string().trim().max(120).optional(),
  mode:z.string().trim().max(60).optional(),
  history:z.array(historyItem).max(16).default([]),
  context:z.record(z.any()).optional()
});



router.post("/multi-agent/stream", async (req,res,next)=>{
  try{
    const input=chatInputSchema.parse(req.body);
    res.status(200);
    res.setHeader("Content-Type","text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control","no-cache, no-transform");
    res.setHeader("Connection","keep-alive");
    res.flushHeaders?.();
    let reply="",meta={};
    for await(const event of streamMultiAgent(input)){
      if(event.type==="delta") reply+=event.text||"";
      if(event.type==="workflow") meta=event.workflow||{};
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    let chatId=input.chatId || `local-${Date.now()}`;
    let historySaved=false;
    if(firebaseAdminDataReady && firestore){
      const base=chatsRef(req.user.uid);chatId=input.chatId || base.doc().id;const ref=base.doc(chatId);const snapshot=await ref.get();
      const previous=snapshot.exists && Array.isArray(snapshot.data()?.messages) ? snapshot.data().messages : [];
      const messages=[...previous,{role:"user",text:input.message,createdAt:new Date().toISOString()},{role:"assistant",text:reply,createdAt:new Date().toISOString(),agentMeta:meta}].slice(-40);
      await ref.set({title:input.title||input.message.slice(0,55),messages,lastAgentMeta:meta,updatedAt:firebaseAdmin.firestore.FieldValue.serverTimestamp(),createdAt:snapshot.exists?snapshot.data()?.createdAt||firebaseAdmin.firestore.FieldValue.serverTimestamp():firebaseAdmin.firestore.FieldValue.serverTimestamp()},{merge:true});
      historySaved=true;
    }
    res.write(`data: ${JSON.stringify({type:"done",chatId,historySaved,agentMeta:meta})}\n\n`);res.end();
  }catch(error){if(res.headersSent){res.write(`data: ${JSON.stringify({type:"error",message:error.message||"Multi-agent stream failed"})}\n\n`);res.end();return;}next(error);}
});

router.post("/multi-agent", async (req,res,next)=>{
  try{const input=chatInputSchema.parse(req.body);const result=await runMultiAgent(input);res.json({reply:result.reply,route:result.route,validation:result.validation});}
  catch(error){next(error);}
});


router.post("/chat/stream", async (req,res,next)=>{
  try{
    const input=chatInputSchema.parse(req.body);
    const prompt=buildStudyPrompt(input,req);
    res.status(200);
    res.setHeader("Content-Type","text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control","no-cache, no-transform");
    res.setHeader("Connection","keep-alive");
    res.flushHeaders?.();
    let reply="";
    for await (const chunk of streamAssistantText(prompt)){
      reply += chunk;
      res.write(`data: ${JSON.stringify({type:"delta",text:chunk})}\n\n`);
    }
    if(!reply.trim()) throw Object.assign(new Error("Gemini returned an empty streaming response"),{status:502});
    let chatId=input.chatId || `local-${Date.now()}`;
    let historySaved=false;
    if(firebaseAdminDataReady && firestore){
      const base=chatsRef(req.user.uid);
      chatId=input.chatId || base.doc().id;
      const ref=base.doc(chatId);
      const snapshot=await ref.get();
      const previous=snapshot.exists && Array.isArray(snapshot.data()?.messages) ? snapshot.data().messages : [];
      const messages=[...previous,{role:"user",text:input.message,createdAt:new Date().toISOString()},{role:"assistant",text:reply,createdAt:new Date().toISOString()}].slice(-40);
      await ref.set({title:input.title || input.message.slice(0,55),messages,updatedAt:firebaseAdmin.firestore.FieldValue.serverTimestamp(),createdAt:snapshot.exists ? snapshot.data()?.createdAt || firebaseAdmin.firestore.FieldValue.serverTimestamp() : firebaseAdmin.firestore.FieldValue.serverTimestamp()},{merge:true});
      historySaved=true;
    }
    res.write(`data: ${JSON.stringify({type:"done",chatId,historySaved})}\n\n`);
    res.end();
  }catch(error){
    if(res.headersSent){res.write(`data: ${JSON.stringify({type:"error",message:error.message||"Streaming failed"})}\n\n`);res.end();return;}
    next(error);
  }
});

router.post("/chat", async (req, res, next) => {
  try{
    const input = chatInputSchema.parse(req.body);
    const prompt = buildStudyPrompt(input, req);

    const academicPack=input.mode==='academic-pack';
    const reply = await askAssistant(prompt,academicPack?{maxOutputTokens:10000,temperature:0.2}:{});
    if(academicPack)return res.json({reply,source:assistantProvider(),historySaved:false});
    let chatId = input.chatId || `local-${Date.now()}`;
    let historySaved = false;
    if(firebaseAdminDataReady && firestore){
      const base = chatsRef(req.user.uid);
      chatId = input.chatId || base.doc().id;
      const ref = base.doc(chatId);
      const snapshot = await ref.get();
      const previous = snapshot.exists && Array.isArray(snapshot.data()?.messages) ? snapshot.data().messages : [];
      const messages = [...previous,
        { role:"user", text:input.message, createdAt:new Date().toISOString() },
        { role:"assistant", text:reply, createdAt:new Date().toISOString() }
      ].slice(-40);
      await ref.set({
        title: input.title || input.message.slice(0, 55),
        messages,
        updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
        createdAt: snapshot.exists ? snapshot.data()?.createdAt || firebaseAdmin.firestore.FieldValue.serverTimestamp() : firebaseAdmin.firestore.FieldValue.serverTimestamp()
      }, { merge:true });
      historySaved = true;
    }
    res.json({ ok:true, reply, chatId, historySaved });
  }catch(error){ next(error); }
});

router.get("/chats", async (req, res, next) => {
  try{
    if(!firebaseAdminDataReady || !firestore) return res.json({ chats:[], cloudHistoryAvailable:false });
    const snap = await chatsRef(req.user.uid).orderBy("updatedAt", "desc").limit(30).get();
    res.json({ chats: snap.docs.map(doc => ({ id:doc.id, ...doc.data() })), cloudHistoryAvailable:true });
  }catch(error){ next(error); }
});


router.patch("/chats/:chatId", async (req,res,next)=>{
  try{
    const chatId=z.string().trim().min(1).max(120).parse(req.params.chatId);
    const input=z.object({title:z.string().trim().min(1).max(120).optional(),pinned:z.boolean().optional()}).refine(v=>v.title!==undefined||v.pinned!==undefined).parse(req.body);
    if(firebaseAdminDataReady && firestore) await chatsRef(req.user.uid).doc(chatId).set({...input,updatedAt:firebaseAdmin.firestore.FieldValue.serverTimestamp()},{merge:true});
    res.json({ok:true,cloudHistoryAvailable:Boolean(firebaseAdminDataReady&&firestore)});
  }catch(error){next(error);}
});

router.delete("/chats/:chatId", async (req, res, next) => {
  try{
    const chatId = z.string().trim().min(1).max(120).parse(req.params.chatId);
    if(firebaseAdminDataReady && firestore) await chatsRef(req.user.uid).doc(chatId).delete();
    res.json({ ok:true, cloudHistoryAvailable:Boolean(firebaseAdminDataReady && firestore) });
  }catch(error){ next(error); }
});

router.post("/image", imageUpload.array("images",4), async (req,res,next)=>{
  try{
    const prompt=z.string().trim().min(1).max(5000).parse(req.body.prompt);
    const aspectRatio=z.enum(["1:1","2:3","3:2","3:4","4:3","4:5","5:4","9:16","16:9","1:4","4:1","1:8","8:1"]).catch("1:1").parse(req.body.aspectRatio||"1:1");
    const imageSize=z.enum(["0.5K","1K","2K","4K"]).catch("1K").parse(req.body.imageSize||"1K");
    const images=(Array.isArray(req.files)?req.files:[]).map(file=>({buffer:file.buffer,mimeType:file.mimetype,name:file.originalname}));
    const totalBytes=images.reduce((sum,file)=>sum+file.buffer.length,0);if(totalBytes>16*1024*1024)throw Object.assign(new Error("Reference images must total 16 MB or less"),{status:413});
    const result=await generateGeminiImage({prompt,images,aspectRatio,imageSize});
    res.json({ok:true,image:{data:result.data,mimeType:result.mimeType},text:result.text,interactionId:result.interactionId,model:result.model});
  }catch(error){next(error);}
});

router.post("/analyze", upload.single("file"), async (req, res, next) => {
  try{
    if(!req.file) throw Object.assign(new Error("A file is required"), { status:400 });
    const prompt = z.string().trim().min(1).max(4000).parse(req.body.prompt || "Analyze this file, explain it clearly, and create useful study notes.");
    const textExtension = /\.(txt|md|json|js|mjs|cjs|html|css|py|java|c|cpp|h|sql)$/i.test(req.file.originalname || "");
    const office=isOfficeFile(req.file.originalname,req.file.mimetype);
    const extracted=office?extractOfficeText(req.file.buffer,req.file.originalname):"";
    const mimeType = textExtension || extracted ? "text/plain" : req.file.mimetype;
    const payloadBuffer=extracted?Buffer.from(`Office file: ${req.file.originalname}\n\n${extracted}`):req.file.buffer;
    const reply = await analyzeGeminiFile({ prompt, buffer:payloadBuffer, mimeType });
    res.json({ ok:true, reply, fileName:req.file.originalname, mimeType });
  }catch(error){ next(error); }
});

router.post('/analyze-project',projectUpload.array('files',24),async(req,res,next)=>{
  try{
    const files=Array.isArray(req.files)?req.files:[];
    if(!files.length)throw Object.assign(new Error('At least one supported project file is required'),{status:400});
    const rawPaths=Array.isArray(req.body.paths)?req.body.paths:[req.body.paths].filter(Boolean);
    const paths=files.map((file,index)=>String(rawPaths[index]||file.originalname||'file').replace(/\\/g,'/').slice(0,320));
    if(paths.some(path=>sensitiveProjectPath.test(path)))throw Object.assign(new Error('Sensitive files such as .env, credentials and private keys cannot be uploaded'),{status:400});
    const totalBytes=files.reduce((sum,file)=>sum+file.size,0);
    if(totalBytes>12*1024*1024)throw Object.assign(new Error('Project context must be 12 MB or smaller'),{status:413});
    const prompt=z.string().trim().min(1).max(6000).parse(req.body.prompt||'Analyze this project, explain its structure, identify problems and answer the student request.');
    const rows=files.map((file,index)=>{const office=isOfficeFile(file.originalname,file.mimetype),extracted=office?extractOfficeText(file.buffer,file.originalname):'';const isText=projectTextExtension.test(file.originalname||'')||Boolean(extracted);return {name:file.originalname,path:paths[index],buffer:extracted?Buffer.from(extracted):file.buffer,mimeType:isText?'text/plain':file.mimetype,isText};});
    const manifest=paths.map((path,index)=>(index+1)+'. '+path).join('\n');
    const reply=await analyzeGeminiFiles({prompt:prompt+'\n\nProject manifest:\n'+manifest,files:rows});
    res.json({ok:true,reply,fileCount:rows.length,totalBytes,paths});
  }catch(error){next(error)}
});

router.post("/planner", async (req, res, next) => {
  try{
    const input = z.object({
      subject:z.string().trim().min(1).max(120), taskType:z.string().trim().min(1).max(80), level:z.string().trim().max(40).default("Beginner"),
      questionCount:z.union([z.string(),z.number()]).optional(), duration:z.union([z.string(),z.number()]).optional(), dailyHours:z.union([z.string(),z.number()]).optional(),
      reminder:z.string().max(80).optional(), prompt:z.string().trim().max(3000).optional(), courseCode:z.string().trim().max(80).optional(), unit:z.string().trim().max(180).optional(), topic:z.string().trim().max(220).optional(), generationNonce:z.string().trim().max(120).optional(), excludeQuestions:z.array(z.string().max(6000)).max(25).optional()
    }).parse(req.body);
    if(!firestore)throw Object.assign(new Error('Cloud storage unavailable.'),{status:503,code:'BACKEND_UNAVAILABLE'});
    res.json(await storeQuestionPlan(firestore,req.user.uid,input,await generateQuestionPlan(input,{beforeRequest:consumeQuota(req,res)})));
  }catch(error){next(error)}
});

router.post("/evaluate/mcq-grade", async (req, res, next) => {
  try{
    const input=z.object({taskId:z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/),answer:z.string().trim().min(1).max(16000)}).parse(req.body);
    if(!firestore)throw Object.assign(new Error('Cloud storage unavailable.'),{status:503,code:'BACKEND_UNAVAILABLE'});
    res.json({ok:true,...await gradeMcqOnly(firestore,req.user.uid,input)});
  }catch(error){next(error)}
});

router.post("/evaluate", async (req, res, next) => {
  try{
    const input=z.object({taskId:z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/).optional(),answer:z.string().trim().min(1).max(16000),question:z.string().trim().max(16000).optional(),academic:academicContextSchema.optional(),practicePlanId:z.string().uuid().optional(),questions:z.array(z.string().min(1).max(6000)).max(25).optional()}).refine(v=>Boolean(v.taskId)!==Boolean(v.academic),'Select either a saved task or an academic topic, not both.').parse(req.body);
    if(!input.taskId&&!input.academic)throw Object.assign(new Error('Select a saved Planner task or curriculum topic.'),{status:400});
    if(!firestore)throw Object.assign(new Error('Cloud storage unavailable.'),{status:503,code:'BACKEND_UNAVAILABLE'});
    if(input.academic){
      const c=curriculumContext(input.academic);
      if(input.practicePlanId){
        const p=(await firestore.doc(`users/${req.user.uid}/privateQuestionPlans/${input.practicePlanId}`).get()).data();
        if(!p||p.uid!==req.user.uid||JSON.stringify(p.input.academic)!==JSON.stringify(input.academic))throw Object.assign(new Error('Generate practice for this topic in your account first.'),{status:409,code:'PLAN_MISSING'});
        input.questions=p.preview.tasks.flatMap(t=>t.questions);
      }else{const note=await getStudyNotes(input.academic,{beforeRequest:consumeQuota(req,res)});input.questions=note.practice;}
      input.question=input.questions.join('\n');Object.assign(input,{subject:c.subject,unit:c.unit,topic:c.topic,topicKey:c.topicKey,level:input.academic.level,taskType:'Practice Questions'});
    }
    res.json({ok:true,...await evaluateAndPersist(firestore,req.user.uid,input,{beforeRequest:consumeQuota(req,res)})});
  }catch(error){next(error)}
});

router.post('/notes',async(req,res,next)=>{try{res.json({ok:true,notes:await getStudyNotes(academicContextSchema.parse(req.body),{beforeRequest:consumeQuota(req,res)})});}catch(error){next(error);}});

router.post('/practice',async(req,res,next)=>{try{
  if(!firestore)throw Object.assign(new Error('Cloud storage unavailable.'),{status:503,code:'BACKEND_UNAVAILABLE'});
  const input=academicContextSchema.extend({questionCount:z.number().int().min(1).max(10)}).parse(req.body),{questionCount,...academic}=input,c=curriculumContext(academic);
  const p={academic,subject:c.subject,unit:c.unit,topic:c.topic,courseCode:c.code,level:input.level,taskType:'Practice Questions',questionCount};
  const plan=await generateQuestionPlan(p,{beforeRequest:consumeQuota(req,res)});
  res.json({ok:true,...await storeQuestionPlan(firestore,req.user.uid,p,plan)});
}catch(error){next(error);}});

router.post("/community", async (req, res, next) => {
  try{
    const { postText } = z.object({ postText: z.string().trim().min(1).max(4000) }).parse(req.body);
    const prompt = `Analyze this university student community post. Return ONLY JSON with title,tags,summary,replySuggestion,tone,isSpam. Post: ${postText}`;
    res.json(parseJsonModelOutput(await askAssistant(prompt, { temperature: 0.25 })));
  }catch(error){ next(error); }
});

export default router;
