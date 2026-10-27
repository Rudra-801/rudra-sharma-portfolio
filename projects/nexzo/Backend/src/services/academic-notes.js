import fs from 'node:fs';
import notes from './academic-notes.cjs';
import {z} from 'zod';
import {academicJson,academicError} from './academic-provider.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../../data/mriirs-cse-2023-27.json',import.meta.url),'utf8')).courses;
export const academicContextSchema=z.object({courseKey:z.string().trim().min(1).max(100),unitIndex:z.number().int().min(0).max(40),topicIndex:z.number().int().min(0).max(150),level:z.enum(['Beginner','Intermediate','Advanced']).default('Intermediate')});
export function curriculumContext(input){
  const c=catalog.find(c=>`${c.semesterSuggested}:${c.code}`===input.courseKey),unit=c?.units[input.unitIndex],topic=unit?.topics[input.topicIndex];
  if(!c||!unit||!topic)throw Object.assign(new Error('Select an existing curriculum topic.'),{status:400,code:'CURRICULUM_TOPIC_INVALID'});
  return {course:c,subject:c.title,code:c.code,unit:unit.title,topic,topicKey:`${input.courseKey}:u${input.unitIndex}:t${input.topicIndex}`};
}
const text=z.string().trim().min(1).max(8000),strings=z.array(text).max(30).optional();
export const notesSchema=z.object({overview:text,concepts:z.array(z.tuple([text,text])).max(20).optional(),working:strings,formulae:strings,example:text.optional(),practice:strings,answers:strings,applications:strings,limits:strings,revision:strings,code:z.object({language:z.string().max(30),text}).optional(),tables:z.array(z.object({caption:text,headers:z.array(text).min(1).max(12),rows:z.array(z.array(text).max(12)).max(30)})).max(6).optional(),diagram:z.object({kind:z.enum(['flow','graph','gantt']),nodes:z.array(z.string().max(120)).max(12).optional(),edges:z.array(z.tuple([z.number().int().min(0).max(11),z.number().int().min(0).max(11)])).max(24).optional(),labels:z.array(z.string().max(60)).max(12).optional(),durations:z.array(z.number().positive().max(1000)).max(12).optional()}).optional()});
export function validateNotes(value){
  const pack=notesSchema.parse(value);
  if(!notes.valid(pack)||!pack.example||!pack.practice?.length||pack.answers?.length!==pack.practice.length||!pack.revision?.length)throw academicError('INVALID_AI_RESPONSE',502);
  if(pack.diagram?.kind==='graph'&&(!pack.diagram.nodes?.length||pack.diagram.edges?.some(e=>e.some(i=>i>=pack.diagram.nodes.length))))throw academicError('INVALID_AI_RESPONSE',502);
  if(pack.diagram?.kind==='gantt'&&(!pack.diagram.labels?.length||pack.diagram.labels.length!==pack.diagram.durations?.length))throw academicError('INVALID_AI_RESPONSE',502);
  return pack;
}
const cache=new Map(),pending=new Map();
export async function getStudyNotes(input,options={}){
  const ctx=curriculumContext(input),key=JSON.stringify([notes.version,ctx.topicKey,input.level]);
  const curated=notes.lookup(ctx.subject,ctx.topic);if(curated)return {...curated,context:{subject:ctx.subject,unit:ctx.unit,topic:ctx.topic}};
  if(cache.has(key)&&Date.now()-cache.get(key).at<14*86400000)return cache.get(key).pack;
  if(pending.has(key))return pending.get(key);
  const job=(async()=>{
    const r=await academicJson(`Write actual university notes for this exact canonical syllabus context: ${JSON.stringify({subject:ctx.subject,courseCode:ctx.code,unit:ctx.unit,topic:ctx.topic,level:input.level})}.\nNever invent another syllabus topic. Return JSON with overview, concepts [[term,explanation]], working[], formulae[], example (fully solved with intermediate steps and final result), practice[], answers[] (one actual solution per problem), revision[], and relevant optional code {language,text}, tables [{caption,headers,rows}], diagram {kind:flow|graph|gantt,nodes[],edges:[[index,index]],labels[],durations[]}. Use only academically relevant blocks: math actual formulas and solved sums; algorithms code/dry-runs/complexity; databases real tables/SQL/normalization; networks/subnetting binary calculations; OS scheduling Gantt/waiting calculations; electronics truth tables; theory definitions/workflow/case examples. No instructions disguised as notes: State the definition, Write the formula, List the assumptions, belongs to, Study its exact, Explain the main concept are forbidden filler. No HTML or SVG markup. Explain assumptions and limitations truthfully.`,validateNotes,options);
    const pack={...r.data,source:`generated-${r.provider}`,notesSchemaVersion:notes.version,context:{subject:ctx.subject,unit:ctx.unit,topic:ctx.topic}};
    if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(key,{at:Date.now(),pack});return pack;
  })();pending.set(key,job);try{return await job;}finally{pending.delete(key);}
}
