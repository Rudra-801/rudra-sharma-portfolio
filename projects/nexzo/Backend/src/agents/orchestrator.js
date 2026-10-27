import { askGemini, parseJsonModelOutput, streamGeminiText } from "../services/gemini.js";
import { AGENTS, classifyIntent } from "./agent-registry.js";

const safeJson=value=>JSON.stringify(value??{},null,2).slice(0,12000);
const compactHistory=history=>(history||[]).slice(-12).map(x=>`${x.role === "assistant" ? "NEXZO" : "Student"}: ${x.content}`).join("\n");

function agentPrompt(agentId,input,route){
  const agent=AGENTS[agentId];
  return [
    `You are the ${agent.name} inside the NEXZO multi-agent study system.`,
    `Role: ${agent.role}`,
    `Detected intent: ${route.intent}`,
    "Return concise, evidence-aware working notes for the Response Synthesis Agent. Do not address the student directly unless needed.",
    "Never claim an external action succeeded. Identify missing information instead of inventing it.",
    input.context && Object.keys(input.context).length ? `Student context:\n${safeJson(input.context)}` : "",
    compactHistory(input.history) ? `Recent conversation:\n${compactHistory(input.history)}` : "",
    `Current request:\n${input.message}`
  ].filter(Boolean).join("\n\n");
}

function synthesisPrompt(input,route,results,validation){
  return [
    "You are the Response Synthesis Agent for NEXZO AI Assistant.",
    "Combine the specialist outputs into one natural, conversational and accurate response for a university student.",
    "Do not mention internal agents unless the user explicitly asks about the architecture.",
    "Respond to greetings naturally. Ask one focused clarification question when essential information is missing.",
    "Use readable headings only when useful; avoid repetitive template sections.",
    "For MCQs, produce exactly the requested number, four options, varied answer positions, answers and short explanations.",
    "For answer evaluation, separate factual accuracy, completeness, clarity, score and a better answer.",
    "For plans, produce realistic tasks and clearly state that Planner changes happen only after the user presses Add to Planner.",
    `Intent: ${route.intent}`,
    input.context && Object.keys(input.context).length ? `Student context:\n${safeJson(input.context)}` : "",
    compactHistory(input.history) ? `Recent conversation:\n${compactHistory(input.history)}` : "",
    `Student request:\n${input.message}`,
    `Specialist outputs:\n${results.map(r=>`### ${r.name}\n${r.output}`).join("\n\n")}`,
    validation ? `Validator guidance:\n${safeJson(validation)}` : ""
  ].filter(Boolean).join("\n\n");
}

async function validateResults(input,route,results){
  try{
    const prompt=[
      "Act as NEXZO's Validation Agent. Check the specialist outputs for correctness, relevance, contradictions, unsupported claims and missing requirements.",
      "Return ONLY JSON with keys score (0 to 1), issues (array), refinements (array), sufficient (boolean).",
      `Intent: ${route.intent}`,
      `Request: ${input.message}`,
      results.map(r=>`${r.name}: ${r.output}`).join("\n\n")
    ].join("\n\n");
    return parseJsonModelOutput(await askGemini(prompt,{temperature:0.05,maxOutputTokens:700}));
  }catch{return {score:0.7,issues:[],refinements:[],sufficient:true};}
}

export async function prepareWorkflow(input){
  const route=classifyIntent(input.message);
  const selected=route.agents.slice(0,3);
  let results=(await Promise.all(selected.map(async id=>{
    try{return {id,name:AGENTS[id].name,output:await askGemini(agentPrompt(id,input,route),{temperature:AGENTS[id].temperature,maxOutputTokens:1000})};}
    catch(error){return {id,name:AGENTS[id].name,error:error.message||"Agent failed",output:""};}
  }))).filter(r=>r.output.trim());
  if(!results.length){
    results=[{id:"reasoning",name:AGENTS.reasoning.name,output:await askGemini(agentPrompt("reasoning",input,route),{temperature:0.25,maxOutputTokens:1200})}];
  }
  const validation=await validateResults(input,route,results);
  return {route:{...route,agents:selected.map(id=>({id,name:AGENTS[id].name}))},results,validation,prompt:synthesisPrompt(input,route,results,validation)};
}

export async function runMultiAgent(input){
  const workflow=await prepareWorkflow(input);
  const reply=await askGemini(workflow.prompt,{temperature:0.35,maxOutputTokens:2400});
  return {...workflow,reply};
}

export async function* streamMultiAgent(input){
  const workflow=await prepareWorkflow(input);
  yield {type:"route",route:workflow.route};
  yield {type:"validation",validation:workflow.validation};
  for await(const text of streamGeminiText(workflow.prompt,{temperature:0.35,maxOutputTokens:2400})) yield {type:"delta",text};
  yield {type:"workflow",workflow:{route:workflow.route,validation:workflow.validation,agentCount:workflow.results.length}};
}
