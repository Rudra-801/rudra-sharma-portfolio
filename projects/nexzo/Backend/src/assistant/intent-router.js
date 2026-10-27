const exactGreeting=/^\s*(hi|hello|hey|hii+|hello+|namaste|thanks|thank\s*you|good\s+(morning|afternoon|evening))\s*[!.?]*\s*$/i;
const plannerAction=/\b(create|add|make|schedule|bana|bna|daal|dal)\b[\s\S]{0,80}\b(task|planner|revision|study session)\b|\b(task|planner)\b[\s\S]{0,80}\b(create|add|make|schedule|bana|bna|daal|dal)\b/i;

export function routeAssistant(input={}){
  const message=String(input.message||'').trim();
  const mode=String(input.mode||'chat').toLowerCase();
  // An explicit workflow selection always wins. A greeting inside an active
  // quiz/interview must not silently drop the workflow back to normal chat.
  if(mode==='quiz')return {intent:'quiz',strategy:'workflow',agents:['content','evaluator']};
  if(mode==='interview')return {intent:'interview',strategy:'workflow',agents:['content','evaluator']};
  if(exactGreeting.test(message))return {intent:'conversation',strategy:'fast',agents:[]};
  if(/\b(?:start|begin|take|make|create|generate|give me|quiz me|test me)\b[\s\S]{0,70}\b(?:quiz|mcqs?|test)\b|\b(?:quiz|mcqs?)\b[\s\S]{0,70}\b(?:on|about|for|start|begin)\b/i.test(message))return {intent:'quiz',strategy:'workflow',agents:['content','evaluator']};
  if(/\b(?:start|begin|run|take|conduct|mock)\b[\s\S]{0,70}\b(?:interview|viva)\b|\b(?:interview me|mock interview|viva practice)\b/i.test(message))return {intent:'interview',strategy:'workflow',agents:['content','evaluator']};
  if(plannerAction.test(message))return {intent:'planner-action',strategy:'tool',agents:['planner']};
  if(mode==='notes'||/\b(notes?|cheat\s*sheet|revision sheet|summary)\b/i.test(message))return {intent:'notes',strategy:'direct',agents:['retrieval','content']};
  if(mode==='explain'||/\b(explain|solve|debug|derive|why|how|difference|compare|versus|\bvs\b)\b/i.test(message)){
    const complex=message.length>180||/\b(compare|research|analyse|analyze|roadmap|complete|detailed)\b/i.test(message);
    return {intent:'explanation',strategy:complex?'multi-agent':'direct',agents:complex?['retrieval','reasoning','personalization']:['reasoning']};
  }
  if(/\b(career|resume|job|placement|roadmap|salary|skills?)\b/i.test(message))return {intent:'career',strategy:'multi-agent',agents:['retrieval','planner','personalization']};
  return {intent:'conversation',strategy:'direct',agents:['reasoning','personalization']};
}

export function greetingReply(message='',name=''){
  const first=String(name||'').trim().split(/\s+/)[0];
  if(/thank/i.test(message))return 'You’re welcome!';
  if(/namaste/i.test(message))return `Namaste${first?` ${first}`:''}! Aaj kis cheez mein help chahiye?`;
  return `Hey${first?` ${first}`:''}! Kya karna hai aaj?`;
}
