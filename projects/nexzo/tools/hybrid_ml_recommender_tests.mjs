import fs from 'node:fs';
const src=fs.readFileSync('Frontend/js/personalization-engine-v152.js','utf8');
const checks=[
 ['v204 exposed',/version:204/.test(src)],
 ['logistic regression sigmoid',/const sigmoid=/.test(src)&&/trainPersonalRanker/.test(src)],
 ['nine normalized features',/ML_FEATURES=\['masteryNeed','urgency','interest','behaviour','careerFit','goalFit','plannerFit','mistakes','capacity'\]/.test(src)],
 ['cold-start threshold',/samples\.length<6/.test(src)&&/reason:'cold-start'/.test(src)],
 ['class diversity guard',/!positives\|\|!negatives/.test(src)],
 ['feedback stores feature snapshot',/features:rec\?mlVector\(rec\.scoreBreakdown\)/.test(src)],
 ['hybrid 60-40 ranking',/baselineScore\*\.40\+learnedScore\*\.60/.test(src)],
 ['fallback remains baseline',/learnedScore==null\?baselineScore/.test(src)],
 ['ranking mode exposed',/rankingMode:learnedScore==null\?'contextual-cold-start':'hybrid-ml'/.test(src)],
 ['model telemetry exposed',/trainingSamples:m\.samples/.test(src)&&/coldStart:!m\.active/.test(src)]
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)pass++;}
console.log(`Hybrid ML recommender: ${pass}/${checks.length} passed`);if(pass!==checks.length)process.exit(1);
