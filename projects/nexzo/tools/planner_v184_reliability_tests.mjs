import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generateQuestionPlan,gradeMcq,validateMcqBundle,formatMcqs,evaluateSubmission} from '../Backend/src/services/learning-engines.js';
const ai=fs.readFileSync(new URL('../Frontend/js/ai-service.js',import.meta.url),'utf8');

test('curated MCQs generate and grade when no AI provider is configured',async()=>{
 const plan=await generateQuestionPlan({subject:'DSA',taskType:'MCQ Practice',level:'Beginner',questionCount:5},{env:{}});
 assert.equal(plan.source,'curated-bank');assert.equal(plan.tasks[0].questions.length,5);
 assert.equal(gradeMcq(plan.answerKey,plan.answerKey,plan.tasks[0].questions).score,10);
 assert.ok(plan.tasks[0].questions.every(q=>/A\) .+\nB\) .+\nC\) .+\nD\) /.test(q)));
});

test('missing server key and placeholder generation are rejected',()=>{
 assert.throws(()=>gradeMcq(null,'A',['Old placeholder']),e=>e.code==='MCQ_KEY_MISSING');
 assert.throws(()=>validateMcqBundle([{question:'Explain the main concept',options:['Correct basic concept','Partially related option','Not applicable','Other'],correctAnswerText:'Other'}],1));
});

test('evaluation has one hard frontend deadline and no endpoint failover',()=>{
  assert.doesNotMatch(ai.slice(ai.indexOf('async function evaluate(payload)')),/await probe/);
  assert.match(ai,/timeoutSignal\(30000\),noFailover:true/);
  assert.match(ai,/request\('\/ai\/evaluate'/);
  assert.match(ai,/const candidates=noFailover\?bases\(\)\.slice\(0,1\):bases\(\)/);
});

test('subjective evaluator receives actual questions and validates matching results',async()=>{
 const question='Explain the FIFO invariant of a queue.',answer='A queue removes the oldest inserted element first.';let received='';
 const result=await evaluateSubmission({subject:'DSA',unit:'Queues',topic:'FIFO',taskType:'Theory Study',level:'Beginner',questions:[question],answer},{env:{GEMINI_API_KEY:'fixture'},transports:{gemini:async prompt=>{received=prompt;return JSON.stringify({score:8,feedback:'FIFO is correct; demonstrate enqueue and dequeue.',strengths:['FIFO'],mistakes:[],improvements:['Add a trace'],questionResults:[{question,score:8,feedback:'Correct invariant.'}]});}}});
 assert.match(received,/Subject: DSA/);assert.ok(received.includes(question));assert.ok(received.includes(answer));assert.equal(result.score,8);
 await assert.rejects(evaluateSubmission({questions:[question],answer},{env:{GEMINI_API_KEY:'fixture'},transports:{gemini:async()=>JSON.stringify({...result,questionResults:[{question:'Different question',score:8,feedback:'wrong context'}]})}}),e=>e.code==='INVALID_AI_RESPONSE');
});

test('shuffle retains correct identity and duplicate options are rejected',()=>{
 const rows=[{question:'Which structure removes the oldest inserted element first?',options:['Queue','Stack','Heap','Set'],correctAnswerText:'Queue'}];validateMcqBundle(rows,1);
 for(let i=0;i<30;i++){const bundle=formatMcqs(rows);assert.equal(gradeMcq(bundle.answerKey,bundle.answerKey,bundle.questions).score,10);assert.ok(bundle.questions[0].includes(`${bundle.answerKey[0]}) Queue`));}
 assert.deepEqual(rows[0].options,['Queue','Stack','Heap','Set']);assert.throws(()=>validateMcqBundle([{...rows[0],options:['Queue','Queue','Heap','Set']}],1));
});
