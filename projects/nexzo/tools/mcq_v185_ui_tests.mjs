import fs from 'node:fs';
const js=fs.readFileSync(new URL('../Frontend/js/planner-controller.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../Frontend/planner.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../Frontend/css/planner-submit-v168.css',import.meta.url),'utf8');
const tests=[
 ['MCQ workspace exists',html.includes('id="mcqMode"')],
 ['MCQ opens interactive attempt',js.includes("renderMcqAttempt(t);submitTab('mcq')")],
 ['radio answers collected',js.includes('collectMcqAttempt(t)')&&js.includes('input[name="nx-mcq-${i}"]:checked')],
 ['all questions required',js.includes('Answer every MCQ before submitting')],
 ['legacy tabs hidden for MCQ',css.includes('#submitBack.mcq-submit .submit-tabs{display:none!important}')],
 ['server-owned marking replaces exposed client keys',js.includes('NEXZOAI.evaluate({taskId:t.id,answer})')&&!js.includes('function evaluateMcqExactly')],
];
let fail=0;for(const [n,ok] of tests){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)fail++;}if(fail)process.exit(1);
