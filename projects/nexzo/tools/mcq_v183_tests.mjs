import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMcqBundle,generateQuestionPlan,gradeMcq} from '../Backend/src/services/learning-engines.js';
import {publicTask} from '../Backend/src/services/academic-workflow.js';

test('placeholder and duplicate MCQs are rejected',()=>{
 assert.throws(()=>validateMcqBundle([{question:'Explain the main concept',options:['Correct basic concept','Partially related option','Not applicable','General question'],correctAnswerText:'Correct basic concept'}],1));
 const row={question:'Which structure follows LIFO?',options:['Stack','Queue','Tree','Graph'],correctAnswerText:'Stack'};assert.throws(()=>validateMcqBundle([row,row],2));
});
test('shuffling preserves correct option identity and distinct options',async()=>{
 const plan=await generateQuestionPlan({subject:'DSA',taskType:'MCQ Practice',questionCount:5},{env:{}});const result=gradeMcq(plan.answerKey,plan.answerKey,plan.tasks[0].questions);assert.equal(result.score,10);assert.equal(plan.tasks[0].questions.every(q=>['A)','B)','C)','D)'].every(l=>q.includes(l))),true);
});
test('private answer keys are excluded from public tasks',()=>assert.deepEqual(publicTask({id:'quiz',uid:'test-A',answerKey:['A']}),{id:'quiz'}));
test('missing key cannot invent a correct score',()=>assert.throws(()=>gradeMcq(null,'A',['Which structure?']),e=>e.code==='MCQ_KEY_MISSING'));
test('wrong and partially correct MCQs receive actual marks',()=>{
 assert.equal(gradeMcq(['A','B'],['C','D'],['q1','q2']).score,0);assert.equal(gradeMcq(['A','B'],['A','D'],['q1','q2']).score,5);
});
