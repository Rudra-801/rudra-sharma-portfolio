import { parseJsonModelOutput } from '../services/gemini.js';
import { askAssistant as askGemini, streamAssistantText as streamGeminiText, assistantProvider } from '../services/assistant-provider.js';
import { streamMultiAgent } from '../agents/orchestrator.js';
import { routeAssistant, greetingReply } from './intent-router.js';
import { getWorkflow, saveWorkflow, clearWorkflow, getMemory, rememberInteraction } from './workflow-store.js';
import { stagePlannerAction } from './tools.js';

const historyText=history=>(history||[]).slice(-12).map(row=>`${row.role==='assistant'?'NEXZO':'Student'}: ${row.content}`).join('\n');
const clean=value=>String(value||'').trim();
const answerChoice=value=>clean(value).match(/^\s*(?:answer\s*)?([A-D])(?:[).\s]|$)/i)?.[1]?.toUpperCase()||'';
function questionText(question,index,total){return `**Question ${index+1}/${total}**\n\n${question.question}\n\n${question.options.map((option,i)=>`${String.fromCharCode(65+i)}. ${option}`).join('\n')}\n\nReply with A, B, C or D.`;}
function normalizeQuestions(raw,count=5){
  const rows=Array.isArray(raw)?raw:Array.isArray(raw?.questions)?raw.questions:[];
  return rows.slice(0,count).map(row=>({question:clean(row.question),options:Array.isArray(row.options)?row.options.map(clean).slice(0,4):[],correctAnswer:String(row.correctAnswer||row.answer||'').trim().charAt(0).toUpperCase(),explanation:clean(row.explanation)})).filter(row=>row.question&&row.options.length===4&&/[A-D]/.test(row.correctAnswer));
}
async function createQuiz(topic,difficulty,sourceContext=''){
  const source=clean(sourceContext).slice(0,14000);
  const raw=parseJsonModelOutput(await askGemini(`Create exactly 5 ${difficulty} MCQs about ${topic}.${source?` Ground every question in this uploaded-material context:\n${source}`:''} Return ONLY JSON: {"questions":[{"question":"...","options":["...","...","...","..."],"correctAnswer":"A","explanation":"..."}]}. Vary correct answer positions and ensure every answer is factually correct.`,{temperature:.3,maxOutputTokens:1800}));
  const questions=normalizeQuestions(raw);if(questions.length!==5)throw Object.assign(new Error('Quiz generation was incomplete. Please retry.'),{status:502});return questions;
}
async function handleQuiz(uid,input){
  const chatId=input.chatId,existing=await getWorkflow(uid,chatId),choice=answerChoice(input.message);
  if(existing?.type==='quiz'&&existing.status==='active'){
    if(!choice)return {reply:`Please answer the current question with **A, B, C or D**.\n\n${questionText(existing.questions[existing.index],existing.index,existing.questions.length)}`};
    const current=existing.questions[existing.index],correct=choice===current.correctAnswer,score=Number(existing.score||0)+(correct?1:0),nextIndex=existing.index+1;
    if(nextIndex>=existing.questions.length){
      const answers=[...(existing.answers||[]),{choice,correct,question:current.question,correctAnswer:current.correctAnswer}];
      await clearWorkflow(uid,chatId);
      return {reply:`${correct?'✅ Correct.':'❌ Not quite.'} ${current.explanation}\n\n## Quiz complete\n\n**Final score: ${score}/${existing.questions.length}**\n\n${score>=4?'Strong result. Review the explanations once and move to a harder set.':score>=2?'Good start. Revise the missed concepts, then retry with a fresh quiz.':'Revise the fundamentals first, then take another quiz.'}`,learningEvent:{kind:'quiz',subject:clean(input.context?.subject)||clean(input.context?.personalization?.nextAction?.subject)||'Study',topic:existing.topic,score:Math.round(score/existing.questions.length*100),correct:score,total:existing.questions.length,mistakes:answers.filter(row=>!row.correct).map(row=>`${row.question.slice(0,90)} — answered ${row.choice}, correct ${row.correctAnswer}`)}};
    }
    const next={...existing,index:nextIndex,score,answers:[...(existing.answers||[]),{choice,correct}]};await saveWorkflow(uid,chatId,next);
    return {reply:`${correct?'✅ Correct.':`❌ Incorrect. Correct answer: **${current.correctAnswer}**.`} ${current.explanation}\n\n**Running score: ${score}/${nextIndex}**\n\n${questionText(next.questions[nextIndex],nextIndex,next.questions.length)}`};
  }
  const topic=clean(input.message).replace(/^\s*(?:(?:start|begin|take|make|create|generate|give me)\s+(?:an?\s+)?(?:interactive\s+)?(?:quiz|mcqs?|test)\s*(?:on|about|for)?|quiz me on|test me on)\s*/i,'')||clean(input.context?.personalization?.nextAction?.topic)||'the selected topic',difficulty=clean(input.context?.difficulty)||'medium',sourceContext=clean(input.context?.sourceContext),questions=await createQuiz(topic,difficulty,sourceContext);await saveWorkflow(uid,chatId,{type:'quiz',status:'active',topic,difficulty,index:0,score:0,answers:[],questions});
  return {reply:`## ${topic} quiz started\n\n${questionText(questions[0],0,questions.length)}`};
}
async function createInterview(role,sourceContext=''){
  const source=clean(sourceContext).slice(0,14000);
  const raw=parseJsonModelOutput(await askGemini(`Create exactly 5 realistic interview questions for ${role}.${source?` Use this uploaded-material context where relevant:\n${source}`:''} Return ONLY JSON: {"questions":["question 1","question 2","question 3","question 4","question 5"]}. Questions must progress from fundamentals to practical judgment.`,{temperature:.35,maxOutputTokens:1000}));
  const questions=(Array.isArray(raw)?raw:raw.questions||[]).map(clean).filter(Boolean).slice(0,5);if(questions.length!==5)throw Object.assign(new Error('Interview generation was incomplete. Please retry.'),{status:502});return questions;
}
async function handleInterview(uid,input){
  const chatId=input.chatId,existing=await getWorkflow(uid,chatId);
  if(existing?.type==='interview'&&existing.status==='active'){
    if(clean(input.message).length<2)return {reply:`Give a short answer first.\n\n**Question ${existing.index+1}/${existing.questions.length}:** ${existing.questions[existing.index]}`};
    const current=existing.questions[existing.index];let evaluation;
    try{evaluation=parseJsonModelOutput(await askGemini(`Evaluate this interview answer. Return ONLY JSON with score (0-10), feedback (max 45 words), improvedAnswer (max 80 words). Role: ${existing.role}\nQuestion: ${current}\nAnswer: ${input.message}`,{temperature:.15,maxOutputTokens:500}))}catch{throw Object.assign(new Error('Evaluation could not finish. Your answer remains in this conversation; please retry.'),{status:503});}
    if(!Number.isFinite(Number(evaluation.score)))throw Object.assign(new Error('Evaluation returned no valid score. Please retry.'),{status:502});
    const score=Math.max(0,Math.min(10,Number(evaluation.score))),results=[...(existing.results||[]),{question:current,answer:input.message,score,feedback:clean(evaluation.feedback)}],nextIndex=existing.index+1;
    if(nextIndex>=existing.questions.length){
      await clearWorkflow(uid,chatId);const average=(results.reduce((sum,row)=>sum+row.score,0)/results.length).toFixed(1);const weak=results.slice().sort((a,b)=>a.score-b.score)[0];
      return {reply:`${evaluation.feedback}\n\n## Interview complete\n\n**Overall score: ${average}/10**\n\n**Strongest habit:** You completed the full interview and responded consistently.\n\n**Priority improvement:** ${weak?.feedback||'Use clearer structure and concrete examples.'}\n\nPractise the lowest-scoring answer once more using situation → action → result.`,learningEvent:{kind:'interview',subject:'Career',topic:existing.role,score:Math.round(Number(average)*10),correct:0,total:results.length,mistakes:weak?[`${weak.question.slice(0,90)} — ${weak.feedback}`]:[]}};
    }
    await saveWorkflow(uid,chatId,{...existing,index:nextIndex,results});return {reply:`**Feedback:** ${evaluation.feedback}\n\n**Score: ${score}/10**${evaluation.improvedAnswer?`\n\n**Stronger answer:** ${evaluation.improvedAnswer}`:''}\n\n**Question ${nextIndex+1}/${existing.questions.length}:** ${existing.questions[nextIndex]}`};
  }
  const role=clean(input.message).replace(/^\s*(?:(?:start|begin|run|take|conduct)\s+(?:an?\s+)?(?:mock\s+)?(?:interview|viva)\s*(?:on|about|for)?|interview me for|mock interview for|viva practice for)\s*/i,'')||'the selected role',sourceContext=clean(input.context?.sourceContext),questions=await createInterview(role,sourceContext);await saveWorkflow(uid,chatId,{type:'interview',status:'active',role,index:0,results:[],questions});return {reply:`## ${role} mock interview\n\nI’ll ask five questions one at a time and give feedback after every answer.\n\n**Question 1/5:** ${questions[0]}`};
}
function wantsDirectExplanation(message=''){return /\b(direct|seedha|directly|without question|no question|bas explain|just explain)\b/i.test(message)}
async function handleSocraticExplain(uid,input){
  const existing=await getWorkflow(uid,input.chatId);
  const freshBaseline=existing?.type==='explain-socratic'&&existing.status==='waiting-for-baseline'&&Date.now()-Number(existing.updatedAtMs||0)<30*60*1000;
  if(freshBaseline){
    if(wantsDirectExplanation(input.message)){await clearWorkflow(uid,input.chatId);return null;}
    await clearWorkflow(uid,input.chatId);
    const reply=await askGemini([
      'Teach this topic accurately using the Socratic diagnostic answer below.',
      'Start by correcting any misconception, then explain from fundamentals with one concrete example, one compact recap, and one check-for-understanding question.',
      'Match the student language and avoid unnecessary headings.',
      `Original request: ${existing.topic}`,
      `Student baseline answer: ${input.message}`,
      existing.sourceContext?`Uploaded-material context:\n${existing.sourceContext}`:'',
      personalizationPrompt(input.context?.personalization),
      historyText(input.history)?`Recent conversation:\n${historyText(input.history)}`:''
    ].filter(Boolean).join('\n\n'),{temperature:.25,maxOutputTokens:2200});
    return {reply,completed:true};
  }
  if(existing?.type==='explain-socratic')await clearWorkflow(uid,input.chatId);
  if(wantsDirectExplanation(input.message))return null;
  const topic=clean(input.message);await saveWorkflow(uid,input.chatId,{type:'explain-socratic',status:'waiting-for-baseline',topic,sourceContext:clean(input.context?.sourceContext).slice(0,14000)});
  return {reply:`Before I explain **${topic.slice(0,160)}**, ek quick check: tumhe abhi is topic mein kya clear hai—**basic definition**, **how it works**, ya **kuch bhi clear nahi**? Ek short line mein batao; uske basis par main explanation ka level set karunga.`};
}
async function plannerDraft(input){
  const today=clean(input.context?.localDate)||new Date().toISOString().slice(0,10),zone=clean(input.context?.timeZone)||'Asia/Kolkata';
  try{return parseJsonModelOutput(await askGemini(`Extract a Planner task from the request. Today is ${today}, timezone ${zone}. Resolve words such as today/tomorrow/kal into YYYY-MM-DD. Return ONLY JSON with title, subject, type, level, durationMinutes, deadlineDate, deadlineTime, priority. Recent conversation: ${historyText(input.history)}\nRequest: ${input.message}`,{temperature:.05,maxOutputTokens:450}))}catch{return {title:clean(input.message).slice(0,120),subject:'General',type:'Study',level:'Beginner',durationMinutes:60,deadlineDate:'',deadlineTime:'23:59',priority:'Medium'}}
}
function directPrompt(input,route,memory){return [
  'You are NEXZO, a capable and natural study assistant for a university student.',
  `Current intent: ${route.intent}. Current mode: ${input.mode||'chat'}.`,
  `Reply in ${memory.preferredLanguage||'the language used by the student'}. Match the student's tone without copying abuse or filler.`,
  'Answer the actual request. The student may change topic at any time, even during a quiz or interview. Never force an unrelated message to be treated as a workflow answer. Be brief for simple questions. Use structure only when it improves comprehension. For greetings or casual conversation, respond naturally and never mention internal context, mastery scores, memory, routing, tools, diagnostics, or loaded project state unless the student explicitly asks.',
  route.intent==='notes'?'For notes, create accurate revision-ready headings, definitions, key points, examples, common mistakes and a rapid-revision section.':'',
  personalizationPrompt(input.context?.personalization),
  memory.recentTopics?.length?`Useful long-term context (use only when relevant): ${memory.recentTopics.slice(0,4).join(' | ')}`:'',
  historyText(input.history)?`Recent conversation:\n${historyText(input.history)}`:'',
  `Current message:\n${input.message}`
].filter(Boolean).join('\n\n')}

function personalizationPrompt(value={}){
  if(!value||value.enabled===false)return '';
  const context={
    course:clean(value.course),branch:clean(value.branch),semester:clean(value.semester),subjects:Array.isArray(value.subjects)?value.subjects.slice(0,12):[],
    careerGoal:clean(value.careerGoal),preferredLanguage:clean(value.language),teachingStyle:clean(value.explanationStyle),dailyMinutes:Number(value.dailyMinutes)||0,
    today:value.today||{},weakTopics:Array.isArray(value.weakTopics)?value.weakTopics.slice(0,4):[],pendingTasks:Array.isArray(value.pendingTasks)?value.pendingTasks.slice(0,6):[],
    repeatedMistakes:Array.isArray(value.mistakes)?value.mistakes.slice(0,6):[],backlogs:Array.isArray(value.backlogs)?value.backlogs.slice(0,8):[],examDates:value.examDates||{},nextAction:value.nextAction||null
  };
  const useful=Object.values(context).some(item=>Array.isArray(item)?item.length:item&&typeof item==='object'?Object.keys(item).length:Boolean(item));
  return useful?`Student personalization context (use only when it helps answer the current request; never invent missing facts):\n${JSON.stringify(context)}`:'';
}

export async function* streamAssistant(uid,input){
  if(input.context?.personalization?.enabled===false)input={...input,personalization:false};
  if(input.personalization===false)input={...input,context:{...input.context,personalization:{enabled:false}}};
  const activeWorkflow=await getWorkflow(uid,input.chatId);
  const workflowAction=clean(input.context?.workflowAction).toLowerCase();
  if(activeWorkflow?.status==='active'&&workflowAction==='end'){
    await clearWorkflow(uid,input.chatId);
    const label=activeWorkflow.type==='quiz'?'quiz':'mock interview';
    const reply=`${label.charAt(0).toUpperCase()+label.slice(1)} ended. You can ask me anything or start another study workflow whenever you want.`;
    const route={intent:'conversation',strategy:'fast',agents:[],workflowEnded:true};
    yield {type:'route',route};yield {type:'delta',text:reply};yield {type:'done',reply,route};return;
  }
  const routingInput=activeWorkflow?.status==='active'&&workflowAction==='interrupt'?{...input,mode:'chat'}:input;
  const routed=routeAssistant(routingInput);
  const shouldContinue=activeWorkflow?.status==='active'&&['quiz','interview'].includes(activeWorkflow.type)&&workflowAction!=='interrupt'&&(workflowAction==='continue'||input.mode===activeWorkflow.type);
  const route=shouldContinue?{intent:activeWorkflow.type,strategy:'workflow',agents:['content','evaluator'],continued:true}:routed;
  yield {type:'route',route};
  const memory=input.personalization===false?{}:await getMemory(uid);if(input.personalization!==false)await rememberInteraction(uid,input,route);
  if(route.strategy==='fast'){const reply=greetingReply(input.message,input.context?.profileName);yield {type:'delta',text:reply};yield {type:'done',reply,route};return;}
  if(route.intent==='explanation'&&input.mode==='explain'&&/\b(socratic|teach me interactively|check my level first)\b/i.test(input.message)){
    const result=await handleSocraticExplain(uid,input);
    if(result){yield {type:'delta',text:result.reply};yield {type:'done',reply:result.reply,route,workflow:true};return;}
  }
  if(route.intent==='quiz'||route.intent==='interview'){
    const result=route.intent==='quiz'?await handleQuiz(uid,input):await handleInterview(uid,input);yield {type:'delta',text:result.reply};if(result.learningEvent)yield {type:'learning-event',event:result.learningEvent};yield {type:'done',reply:result.reply,route,workflow:true,learningEvent:result.learningEvent||null};return;
  }
  if(route.intent==='planner-action'){
    const action=await stagePlannerAction(uid,await plannerDraft(input));yield {type:'action',action};const reply='Task details ready hain. Create Planner task button press karoge tabhi task save hoga.';yield {type:'delta',text:reply};yield {type:'done',reply,route,action};return;
  }
  let reply='';
  if(route.strategy==='multi-agent'&&assistantProvider()!=='openai'){
    const enriched={...input,context:{...(input.context||{}),...(input.personalization===false?{}:{memory})}};
    for await(const event of streamMultiAgent(enriched)){if(event.type==='delta')reply+=event.text||'';yield event;}
  }else{
    for await(const text of streamGeminiText(directPrompt(input,route,memory),{temperature:.3,maxOutputTokens:2200,signal:input.signal})){reply+=text;yield {type:'delta',text};}
  }
  yield {type:'done',reply,route};
}
