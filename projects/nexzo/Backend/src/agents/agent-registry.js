export const AGENTS = Object.freeze({
  retrieval:{name:"Knowledge Retrieval Agent",role:"Find and organize relevant facts from conversation, user context and supplied material.",temperature:0.15},
  reasoning:{name:"Reasoning & Tutor Agent",role:"Explain concepts, solve problems step by step, compare alternatives and clarify misconceptions.",temperature:0.25},
  content:{name:"Content Generation Agent",role:"Create notes, MCQs, summaries, revision material and interview questions in the requested format.",temperature:0.45},
  evaluator:{name:"Evaluation & Feedback Agent",role:"Evaluate answers for factual accuracy, completeness, clarity and improvement opportunities.",temperature:0.15},
  planner:{name:"Planner & Scheduling Agent",role:"Convert learning goals into realistic tasks, schedules, priorities and checkpoints.",temperature:0.25},
  personalization:{name:"Personalization Agent",role:"Adapt language, detail, difficulty and examples to the student's profile, memory and current progress.",temperature:0.25}
});

export function classifyIntent(message=""){
  const q=String(message).toLowerCase();
  if(/\b(mcqs?|quiz(?:zes)?|questions?|flashcards?)\b/.test(q)) return {intent:"quiz",agents:["retrieval","content","personalization"]};
  if(/\b(notes?|summary|summarize|cheat ?sheet)\b/.test(q)) return {intent:"notes",agents:["retrieval","content","personalization"]};
  if(/\b(revision|study plan|schedule|planner|deadline|timetable)\b/.test(q)) return {intent:"planning",agents:["planner","personalization","reasoning"]};
  if(/\b(check|evaluate|grade|review|improve)\b.*\b(answer|response|solution)\b|\bmy answer\b/.test(q)) return {intent:"evaluation",agents:["evaluator","reasoning","personalization"]};
  if(/\b(compare|difference|versus|\bvs\b)\b/.test(q)) return {intent:"comparison",agents:["retrieval","reasoning","personalization"]};
  if(/\b(solve|debug|calculate|derive|step by step|explain|why|how)\b/.test(q)) return {intent:"tutoring",agents:["retrieval","reasoning","personalization"]};
  if(/\b(hello|hi|hey|thanks|thank you)\b/.test(q)) return {intent:"conversation",agents:["personalization","reasoning"]};
  return {intent:"study-help",agents:["reasoning","personalization"]};
}
