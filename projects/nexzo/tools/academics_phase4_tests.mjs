import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const js=read('Frontend/js/academics-controller.js');
const html=read('Frontend/academics.html');
const data=JSON.parse(read('Frontend/data/mriirs-cse-2023-27.json'));
const tests=[
['topic-bound selection',()=>{for(const s of ['unitIndex','topicIndex','difficulty','questionCount'])assert.match(js,new RegExp(s));}],
['deterministic topic fallback',()=>{assert.match(js,/deterministicTemplates/);assert.match(js,/stableHash\(`\$\{course\.code\}\|\$\{unit\.title\}\|\$\{topic\}\|\$\{difficulty\}`\)/);assert.doesNotMatch(js,/Explain the main concept in simple words/);}],
['real AI verification honesty',()=>{assert.match(js,/NEXZOAI\.evaluate/);assert.match(js,/No score, mastery or XP was awarded/);assert.match(js,/Your answer is preserved for retry/);assert.match(js,/Not provided/);}],
['attempt persistence fields',()=>{for(const s of ['answer,score:result.score','feedback:result.feedback','strengths:result.strengths','improvements:result.improvements','evaluationSource:result.source','submittedAtMs'])assert.ok(js.includes(s),s);}],
['planner dedupe',()=>{assert.match(js,/plannerTaskId/);assert.match(js,/already in Planner/);assert.match(js,/source:'academics-v240'/);}],
['connected AI loaded',()=>assert.match(html,/js\/ai-service\.js/)],
['curriculum has unrelated topics',()=>{const cn=data.courses.find(x=>x.code==='BCS-DS-405');const other=data.courses.find(x=>x.code!==cn.code&&x.units?.some(u=>u.topics?.length));assert.ok(cn&&other);assert.notEqual(cn.units[0].topics?.[0],other.units[0].topics?.[0]);}],
['cloud state path present',()=>assert.match(js,/NEXZOBackendStore\.putState\('academics'/)]
];
let pass=0;for(const [n,f] of tests){try{f();pass++;console.log('PASS',n)}catch(e){console.error('FAIL',n,':',e.message);process.exitCode=1}}console.log(`Academics Phase 4: ${pass}/${tests.length} passed.`);
