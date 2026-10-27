import fs from 'node:fs';
const html=fs.readFileSync('Frontend/ai-assistant.html','utf8');
const js=fs.readFileSync('Frontend/js/living-pet.js','utf8');
const css=fs.readFileSync('Frontend/css/living-pet.css','utf8');
const rules=fs.readFileSync('firestore.rules','utf8');
const checks=[
 ['living pet loaded',html.includes('js/living-pet.js')&&html.includes('css/living-pet.css')],
 ['original primary name',js.includes("name:'Nyro'")],
 ['autonomous state machine',js.includes('function randomIdle')&&js.includes('setAnimation(')],
 ['cursor awareness',js.includes('pointermove')&&js.includes('--pet-look-x')],
 ['NEXZO event reactions',js.includes('nexzo:level-up')&&js.includes('nexzo:academics-quiz')&&js.includes('nexzo:ai-status')],
 ['hidden tab throttling',js.includes('visibilitychange')&&js.includes('document.hidden')],
 ['cloud pet persistence',js.includes("'users',user.uid,'pet','main'")&&rules.includes('match /pet/{docId}')],
 ['reduced motion',css.includes('prefers-reduced-motion')],
 ['single engine guard',js.includes('__NEXZO_LIVING_PET__')],
 ['3d render used',html.includes('assets/pets/nyro-3d.webp')]
];
let fail=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)fail++;}
if(fail)process.exit(1);
console.log(`Living pet contracts: ${checks.length}/${checks.length} PASS`);
