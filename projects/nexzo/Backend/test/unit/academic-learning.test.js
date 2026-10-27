import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import notes from '../../src/services/academic-notes.cjs';
import {generateQuestionPlan,gradeMcq,evaluateSubmission} from '../../src/services/learning-engines.js';
import {academicJson,classifyProviderError,configuredAcademicProviders} from '../../src/services/academic-provider.js';
import {validateNotes,curriculumContext,getStudyNotes} from '../../src/services/academic-notes.js';
const env={GEMINI_API_KEY:'fixture-key'};
const fixture=data=>({env,transports:{gemini:async()=>JSON.stringify(data)}});
test('MCQ generation and grading do not use an unavailable provider',async()=>{
 const p=await generateQuestionPlan({subject:'DSA',taskType:'MCQ Practice',level:'Beginner',questionCount:5},{env:{}});
 assert.equal(p.source,'curated-bank');assert.equal(p.tasks[0].questions.length,5);
 const good=gradeMcq(p.answerKey,p.answerKey,p.tasks[0].questions);assert.equal(good.score,10);
 const wrong=p.answerKey.map(a=>a==='A'?'B':'A');assert.equal(gradeMcq(p.answerKey,wrong,p.tasks[0].questions).score,0);
 assert.throws(()=>gradeMcq(p.answerKey,['A'],p.tasks[0].questions));
});
test('legacy public MCQ key cannot substitute for a private server plan',()=>assert.throws(()=>gradeMcq(null,'A',['question']),e=>e.code==='MCQ_KEY_MISSING'));
for(const [subject,type,content] of [
 ['DSA','Theory Study','Explain the stack invariant and contrast push and pop operations.'],
 ['DSA','Coding Practice','Implement binary search on a sorted integer array. Input: [1,3,5], target=3. Output:1. Limit n≤1000; return -1 if absent.'],
 ['AI','Short Questions','What makes an agent rational under uncertainty? Give one example.'],
 ['Machine Learning','Numerical Problems','Compute precision for TP=8, FP=2 and explain the false-positive effect.'],
 ['DSA','Long Questions','Compare quicksort and merge sort with a trace, complexity and worst-case input.'],
 ['DSA','Revision','Review stack LIFO behavior, array implementation and overflow/underflow cases.'],
 ['Python','Project Work','Build a CSV marks summarizer; deliver source, input fixtures and mean/median output validation.']]){
 test(`Generation respects ${subject} / ${type} and exact requested count`,async()=>{const p=await generateQuestionPlan({subject,taskType:type,level:'Beginner',questionCount:1},fixture({questions:[content]}));assert.deepEqual(p.tasks[0].questions,[content]);assert.equal(p.tasks[0].type,type);});
}
test('topic-specific MCQs never silently use unrelated subject-bank questions',async()=>{
 await assert.rejects(generateQuestionPlan({subject:'DSA',topic:'BFS',taskType:'MCQ Practice',questionCount:5},{env:{}}),e=>e.code==='AUTH_CONFIGURATION_ERROR');
});
for(const type of ['Short Questions','Theory Study'])test(`Structured ${type} evaluation includes each actual question`,async()=>{
 const q='Define a rational agent.',r={score:8,feedback:'The objective and observations are described; uncertainty needs explanation.',strengths:['Objective identified'],mistakes:['Uncertainty omitted'],improvements:['Explain expected performance'],questionResults:[{question:q,score:8,feedback:'Mostly correct.'}]};
 const result=await evaluateSubmission({subject:'AI',taskType:type,questions:[q],answer:'An agent selects actions to maximize expected performance.'},fixture(r));assert.equal(result.score,8);assert.equal(result.provider,'gemini');
});
test('malformed, out-of-range and mismatched-question evaluations are rejected',async()=>{
 for(const data of [{score:12},{score:5,feedback:'ok',strengths:[],mistakes:[],improvements:[],questionResults:[{question:'wrong question',score:5,feedback:'ok'}]}])await assert.rejects(evaluateSubmission({questions:['Actual saved question'],answer:'My answer'},fixture(data)),e=>e.code==='INVALID_AI_RESPONSE');
});
test('quota fails once and only configured secondary provider is attempted',async()=>{
 let primary=0,secondary=0;const r=await academicJson('JSON',v=>v,{env:{GEMINI_API_KEY:'fixture',OPENAI_API_KEY:'fixture',OPENAI_MODEL:'fixture-model'},transports:{openai:async()=>{primary++;throw {status:429,message:'raw secret provider URL'};},gemini:async()=>{secondary++;return '{"value":1}';}}});assert.equal(primary,1);assert.equal(secondary,1);assert.equal(r.provider,'gemini');
 assert.deepEqual(configuredAcademicProviders({}),[]);assert.equal(classifyProviderError({status:429}).code,'AI_QUOTA_EXCEEDED');
});
test('provider timeout/configuration/model errors are classified without raw provider details',()=>{
 for(const [status,code] of [[504,'PROVIDER_TIMEOUT'],[401,'AUTH_CONFIGURATION_ERROR'],[404,'MODEL_UNAVAILABLE']])assert.equal(classifyProviderError({status,message:'secret-url'}).code,code);
 assert.doesNotMatch(classifyProviderError({status:429,message:'secret-url'}).message,/secret-url/);
});
test('failed provider can be retried without caching invented result',async()=>{
 let calls=0;const opts={env,transports:{gemini:async()=>{if(!calls++)throw {status:429};return '{"ok":true}';}}};await assert.rejects(academicJson('JSON',v=>v,opts));assert.equal((await academicJson('JSON',v=>v,opts)).data.ok,true);assert.equal(calls,2);
});
const cases=[['BMA-101',0,1],['BMA-101',3,4],['BMA-101',2,7],['BCS-DS-301A',0,5],['BCS-DS-301A',4,2],['BCS-DS-404',1,1],['BCS-DS-404',1,4],['BCS-DS-405',3,1],['BCS-DS-403',1,7],['BEC-DS-322A',0,0],['BCS-DS-427B',0,3],['BCS-100A',0,0],['BCS-DS-602',2,2]];
const catalog=JSON.parse(fs.readFileSync(new URL('../../data/mriirs-cse-2023-27.json',import.meta.url),'utf8')).courses;
for(const [code,unitIndex,topicIndex] of cases)test(`Real notes for ${code} unit ${unitIndex} topic ${topicIndex}`,async()=>{
 const c=catalog.find(c=>c.code===code),input={courseKey:`${c.semesterSuggested}:${code}`,unitIndex,topicIndex,level:'Beginner'},ctx=curriculumContext(input),p=await getStudyNotes(input,{env:{}});
 assert.equal(p.context.topic,ctx.topic);assert.equal(p.context.unit,ctx.unit);assert.equal(p.source,'curated-local');assert.equal(notes.valid(p),true);assert.ok(p.example.length>60);assert.ok(p.answers.length);validateNotes(p);
});
test('cache stores only validated notes and rejects old generic filler',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},p=notes.lookup('Mathematics-I','Inverse of a matrix');
 notes.cache(storage,'key',p,100);assert.deepEqual(notes.cached(storage,'key',101),p);assert.equal(notes.cached(storage,'key',15*86400000),null);
 assert.throws(()=>notes.cache(storage,'fake',{overview:'State the mathematical definition and notation.'}));assert.equal(notes.valid({overview:'This topic belongs to a unit. Study its exact definition.'}),false);
 assert.equal(notes.lookup('Operating Systems','Inverse of a matrix'),null);
});
test('numerical examples and meaningful figure schemas have concrete output',()=>{
 const linear=notes.lookup('Machine Learning','Linear Regression');assert.match(linear.example,/MSE=1\/18/);
 const graph=notes.lookup('Data Structures & Algorithms','Graph Traversals Algorithms: Breadth First Search and Depth First Search');assert.deepEqual(graph.diagram.edges,[[0,1],[0,2],[1,3],[2,3]]);
 const sql=notes.lookup('Database Management Systems','SQL, DDL, and DML constructs');assert.deepEqual(sql.tables[0].rows,[['Asha','80']]);
 assert.equal(notes.valid({...graph,diagram:{kind:'graph',nodes:['A'],edges:[[0,99]]}}),false);
});
test('canonical backend copies exactly match the source curriculum and shared engines',()=>{
 for(const [source,target] of [['Frontend/data/mriirs-cse-2023-27.json','Backend/data/mriirs-cse-2023-27.json'],['Frontend/js/academic-notes.js','Backend/src/services/academic-notes.cjs'],['Frontend/js/level-system.js','Backend/src/services/level-system.cjs']])assert.deepEqual(fs.readFileSync(new URL(`../../../${source}`,import.meta.url)),fs.readFileSync(new URL(`../../../${target}`,import.meta.url)));
 assert.equal(catalog.length,155);
});
test('reported programming topic has exact canonical notes without a configured provider',async()=>{
 const input={courseKey:'2:BCS-101A',unitIndex:0,topicIndex:2,level:'Beginner'};
 const ctx=curriculumContext(input),pack=await getStudyNotes(input,{env:{}});
 assert.equal(pack.context.topic,ctx.topic);assert.equal(pack.source,'curated-local');validateNotes(pack);
 assert.deepEqual(pack.diagram.nodes.slice(0,2),['Start (oval)','Read a, b, c (input)']);
 assert.match(pack.code.text,/IF n mod 2 = 0/);assert.equal(pack.answers.length,pack.practice.length);
 assert.equal(notes.lookup('Operating Systems',ctx.topic),null);
});
test('old-backend route errors have a clean actionable message without raw paths',()=>{
 const message=notes.serviceMessage({status:404,message:'Route not found: POST /api/ai/notes'});
 assert.match(message,/updated study service/);assert.doesNotMatch(message,/POST|\/api|Route not found/);
 assert.equal(notes.serviceMessage({message:'Your answer is preserved.'}),'Your answer is preserved.');
});
