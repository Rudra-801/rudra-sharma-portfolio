/* NEXZO Personal Recommender Engine v204 — backend-authoritative actionable recommender. */
(function(){
'use strict';
if(window.NEXZOPersonalization?.version>=204)return;
const KEY='nexzo_personal_recommender_v201';
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number(n)||0));
const now=()=>Date.now();
const dayKey=(d=new Date())=>{const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
const clone=v=>JSON.parse(JSON.stringify(v));
const esc=v=>String(v??'').trim();
let activeOwner='local',state=null,cloudTimer=null,cloudUnsub=null,ready=false,switching=false;
const resolveOwner=()=>window.NEXZODataService?.getUser?.()?.uid||window.NEXZOSharedState?.currentUid?.()||window.NEXZOShell?.identity?.()?.uid||'local';
const defaultState=(uid=activeOwner)=>({schemaVersion:204,uid,profile:{course:'',branch:'',semester:'',subjects:[],interests:[],backlogs:[],examDates:{},careerGoal:'',learningGoal:'Improve academics',skillLevel:'Intermediate',preferredMode:'Adaptive',dailyMinutes:60,sessionMinutes:30,language:'Hinglish',explanationStyle:'Concise + examples',confidence:{}},checkins:{},events:[],mastery:{},mistakes:{},recommendations:[],feedback:{},memoryEnabled:true,updatedAtMs:0,cloudUpdatedAtMs:0});
const scopedKey=(uid=activeOwner)=>`${KEY}:${uid}`;
const legacyKey=(uid=activeOwner)=>`${LEGACY}:${uid}`;
function sanitize(raw,uid=activeOwner){const base=defaultState(uid),x=raw&&typeof raw==='object'?raw:{};return {...base,...x,schemaVersion:204,uid,profile:{...base.profile,...(x.profile||{})},checkins:x.checkins||{},events:Array.isArray(x.events)?x.events.slice(-800):[],mastery:x.mastery||{},mistakes:x.mistakes||{},recommendations:Array.isArray(x.recommendations)?x.recommendations:[],feedback:x.feedback||{}}}
function loadLocal(uid=activeOwner){state=defaultState(uid);return state}
function persistLocal({emit=true,cloud=true}={}){state.uid=activeOwner;state.updatedAtMs=now();if(emit)window.dispatchEvent(new CustomEvent('nexzo:personalization-updated',{detail:snapshot()}));if(cloud)scheduleCloud()}
async function cloudContext(){try{const c=await window.NEXZOFirebase?.getContext?.({auth:true});const user=c?.auth?.currentUser;if(!user)return null;return {user}}catch{return null}}
function canonicalToken(v){return esc(v).toLowerCase().replace(/\b(study|revision|revise|practice|practise|learn|learning|notes?|questions?|problems?)\b/g,' ').replace(/[^a-z0-9+#.]+/g,' ').trim().replace(/\s+/g,'-')||'general'}
function normalizeTopic(subject,topic){const sid=canonicalToken(subject||'General'),tid=canonicalToken(topic||subject||'General');return `${sid}::${tid}`}
function assessedEvent(e){return Number.isFinite(Number(e.accuracy))||(Number(e.maxScore)>0&&Number.isFinite(Number(e.score)))}
function topicLabel(key){const [s,t]=String(key).split('::');return {subject:s.replace(/\b\w/g,c=>c.toUpperCase()),topic:t?.replace(/\b\w/g,c=>c.toUpperCase())||s}}
function eventWeight(e){const type=String(e.type||'study');if(type==='quiz')return .34;if(type==='submission')return .32;if(type==='revision')return .2;if(type==='interview')return .22;if(type==='task')return .14;return .1}
function recomputeMastery(){
 const by={};state.events.filter(assessedEvent).forEach(e=>{const key=e.topicKey||normalizeTopic(e.subject,e.topic);(by[key]??=[]).push(e)});const result={};
 Object.entries(by).forEach(([key,events])=>{let totalW=0,weighted=0,last=0,attempts=0,wrong=0;events.sort((a,b)=>(a.atMs||0)-(b.atMs||0)).slice(-30).forEach(e=>{const w=eventWeight(e)*(e.difficulty==='hard'?1.15:e.difficulty==='easy'?.9:1);const acc=Number.isFinite(Number(e.accuracy))?clamp(e.accuracy):clamp(Number(e.score)/Number(e.maxScore)*100);weighted+=acc*w;totalW+=w;attempts++;wrong+=Array.isArray(e.mistakes)?e.mistakes.length:0;last=Math.max(last,e.atMs||0)});let score=totalW?weighted/totalW:0;const days=last?Math.max(0,(now()-last)/86400000):999;score=clamp(score-Math.min(18,Math.max(0,days-7)*.45));const label=topicLabel(key);const assessed=attempts>=2;result[key]={key,...label,score:Math.round(score),assessed,status:!assessed?'Not assessed':score<35?'Critical':score<55?'Weak':score<75?'Improving':'Strong',lastActivityMs:last,attempts,mistakeCount:wrong}});
 (state.profile.subjects||[]).forEach(subject=>{const key=normalizeTopic(subject,subject);if(!result[key])result[key]={key,subject,topic:subject,score:0,assessed:false,status:'Not assessed',lastActivityMs:0,attempts:0,mistakeCount:0}});state.mastery=result;return result;
}
function detectWeaknesses(){recomputeMastery();return Object.values(state.mastery).filter(x=>x.assessed&&x.score<55).sort((a,b)=>a.score-b.score)}
function normalizeText(v){return String(v||'').toLowerCase().replace(/[^a-z0-9+#. ]+/g,' ').replace(/\s+/g,' ').trim()}
function tokenSet(...values){return new Set(values.flatMap(v=>Array.isArray(v)?v:[v]).flatMap(v=>normalizeText(v).split(' ')).filter(Boolean))}
function overlapScore(a,b){const A=tokenSet(a),B=tokenSet(b);if(!A.size||!B.size)return 0;let hit=0;A.forEach(x=>{if(B.has(x))hit++});return clamp(hit/Math.max(1,Math.min(A.size,B.size))*100)}
/*
 * Personalized ML ranker (v1): a tiny, deterministic logistic-regression model
 * trained from the current user's explicit recommendation feedback.  It never
 * replaces the explainable rule engine during cold start: until there are at
 * least six labelled examples with both positive and negative outcomes, the
 * baseline score remains authoritative.  This keeps recommendations safe while
 * allowing ranking to become data-driven as genuine interaction evidence grows.
 */
const ML_FEATURES=['masteryNeed','urgency','interest','behaviour','careerFit','goalFit','plannerFit','mistakes','capacity'];
const mlVector=breakdown=>ML_FEATURES.map(k=>clamp(breakdown?.[k]||0)/100);
const mlLabel=value=>({useful:1,'too-hard':.55,'too-easy':.25,'not-relevant':0,'already-know':0}[value]);
const sigmoid=z=>1/(1+Math.exp(-Math.max(-20,Math.min(20,z))));
function trainPersonalRanker(){
 const samples=Object.values(state.feedback||{}).map(x=>({x:Array.isArray(x?.features)?x.features:null,y:mlLabel(x?.value)})).filter(x=>x.x?.length===ML_FEATURES.length&&Number.isFinite(x.y));
 const positives=samples.filter(x=>x.y>=.6).length,negatives=samples.filter(x=>x.y<=.4).length;
 if(samples.length<6||!positives||!negatives)return {active:false,samples:samples.length,positives,negatives,weights:Array(ML_FEATURES.length).fill(0),bias:0,reason:'cold-start'};
 let w=Array(ML_FEATURES.length).fill(0),b=0;const lr=.16,l2=.012;
 // Deterministic batch SGD: enough for a small per-user online ranker and cheap in-browser.
 for(let epoch=0;epoch<140;epoch++){
   const gw=Array(w.length).fill(0);let gb=0;
   for(const s of samples){const pred=sigmoid(b+w.reduce((z,v,i)=>z+v*s.x[i],0)),err=pred-s.y;for(let i=0;i<w.length;i++)gw[i]+=err*s.x[i];gb+=err}
   for(let i=0;i<w.length;i++)w[i]-=lr*(gw[i]/samples.length+l2*w[i]);b-=lr*gb/samples.length;
 }
 return {active:true,samples:samples.length,positives,negatives,weights:w,bias:b,reason:'trained'};
}
function mlPredict(model,breakdown){if(!model?.active)return null;const x=mlVector(breakdown);return clamp(sigmoid(model.bias+model.weights.reduce((z,v,i)=>z+v*x[i],0))*100)}
function daysUntil(date){const t=new Date(date||'').getTime();return Number.isFinite(t)?Math.ceil((t-now())/86400000):9999}
function recommendationType(m){if(!m.assessed)return 'diagnostic';if(m.score<40)return 'foundation';if(m.score<65)return 'practice';if(m.score<80)return 'application';return 'revision'}
function actionFor(type,mode){const m=String(mode||'Adaptive').toLowerCase();if(type==='diagnostic')return 'Take a short diagnostic to establish your current level';if(type==='foundation')return m.includes('theory')?'Rebuild concepts with concise notes + examples':'Rebuild fundamentals with guided examples + practice';if(type==='practice')return m.includes('revision')?'Revise mistakes, then attempt mixed recall':'Target weak areas with mixed practice + mistake review';if(type==='application')return 'Apply the topic in a mini task or project checkpoint';return 'Use spaced recall to keep this topic strong'}

const SUBJECT_TOPICS={
 'dsa':['Arrays & Strings','Linked Lists','Stacks & Queues','Trees & BST','Graphs & BFS/DFS','Dynamic Programming'],
 'dbms':['SQL Queries','Normalization','Transactions','Indexing','ER Modelling','Joins'],
 'cn':['OSI & TCP/IP','Data Link Layer','IP Addressing & Subnetting','Routing','TCP/UDP','DNS & HTTP'],
 'os':['Processes & Threads','CPU Scheduling','Deadlocks','Memory Management','Virtual Memory','File Systems'],
 'python':['Python Fundamentals','Functions & Modules','OOP in Python','File Handling','Data Structures in Python','APIs & Automation'],
 'java':['Java Fundamentals','OOP','Collections','Exception Handling','Multithreading','JDBC'],
 'oop':['Classes & Objects','Inheritance','Polymorphism','Abstraction','Encapsulation','SOLID Basics'],
 'web development':['HTML & CSS','JavaScript DOM','Async JavaScript','React Fundamentals','REST APIs','Authentication'],
 'ai':['Search & Agents','Knowledge Representation','Machine Learning Basics','Neural Networks','NLP Basics','AI Ethics'],
 'ml':['Data Preprocessing','Regression','Classification','Model Evaluation','Clustering','Feature Engineering']
};
const CAREER_PATHS={
 'software engineer':['DSA','OOP','DBMS','OS','Computer Networks','Git'],
 'full stack developer':['HTML & CSS','JavaScript','React','Node.js','REST APIs','DBMS'],
 'backend developer':['Programming','OOP','DBMS','REST APIs','Authentication','System Design'],
 'data scientist':['Python','Statistics','SQL','Machine Learning','Data Visualization','Feature Engineering'],
 'machine learning engineer':['Python','DSA','Machine Learning','Deep Learning','MLOps','System Design'],
 'frontend developer':['HTML & CSS','JavaScript','React','Accessibility','Performance','Git'],
 'cyber security':['Computer Networks','Operating Systems','Linux','Web Security','Cryptography','Security Testing']
};
const TASK_TEMPLATES={
 'Arrays & Strings':['Solve 8 array/string problems','Revise two-pointer + sliding-window patterns','Write complexity for every solution'],
 'Linked Lists':['Implement reverse + cycle detection','Solve 5 linked-list questions','Explain slow/fast pointer in your own words'],
 'Stacks & Queues':['Implement stack + queue from scratch','Solve 5 stack/queue questions','Practice next-greater-element pattern'],
 'Trees & BST':['Revise traversals','Implement BST insert/search','Solve 4 tree questions'],
 'Graphs & BFS/DFS':['Implement BFS and DFS','Solve 4 graph traversal questions','Write visited/queue/stack mistakes checklist'],
 'Dynamic Programming':['Identify state + transition for 4 problems','Solve 3 starter DP questions','Compare memoization vs tabulation'],
 'SQL Queries':['Write 10 SELECT/JOIN queries','Practice GROUP BY + subqueries','Check query output on sample tables'],
 'Normalization':['Convert one schema to 1NF→3NF','List insertion/update/delete anomalies','Attempt 5 normalization questions'],
 'Transactions':['Revise ACID + schedules','Solve 5 serializability questions','Create one transaction failure example'],
 'Indexing':['Compare clustered vs non-clustered indexes','Explain B/B+ tree use','Pick indexes for 3 sample queries'],
 'OSI & TCP/IP':['Map protocols to OSI/TCP-IP layers','Draw both models once','Attempt 10 layer/protocol MCQs'],
 'IP Addressing & Subnetting':['Solve 6 subnetting problems','Practice CIDR conversion','Verify network/broadcast/host ranges'],
 'Processes & Threads':['Compare process vs thread','Solve 6 concept questions','Draw process-state diagram'],
 'CPU Scheduling':['Solve FCFS/SJF/RR examples','Calculate waiting/turnaround time','Compare algorithms in one table'],
 'Deadlocks':['Revise 4 conditions','Solve Banker algorithm example','Differentiate prevention/avoidance/detection'],
 'Python Fundamentals':['Write 5 small Python programs','Practice loops + collections','Explain mutable vs immutable types'],
 'OOP':['Revise pillars of OOP','Implement one class hierarchy','Answer 5 OOP interview questions'],
 'Git':['Create branch → commit → merge workflow','Practice pull/push/conflict resolution','Write 10 essential Git commands'],
 'React':['Build one reusable component','Practice props/state/hooks','Create one small interactive UI'],
 'REST APIs':['Design 5 REST endpoints','Implement GET/POST/PUT/DELETE','Test status codes and error responses'],
 'Computer Networks':['Revise OSI/TCP-IP + addressing','Solve 10 CN MCQs','Make one-page protocol revision sheet']
};
function taskListFor(r){
 const exact=TASK_TEMPLATES[r.topic]||TASK_TEMPLATES[r.subject];
 if(exact)return exact.slice(0,3);
 if(r.type==='diagnostic')return [`Take a 10-question ${r.subject} diagnostic`,`Mark every uncertain topic`,`Use the result to set your next study task`];
 if(r.type==='foundation')return [`Revise ${r.topic} fundamentals`,`Write a one-page concept summary`,`Attempt 5 basic questions`];
 if(r.type==='practice')return [`Solve 5–8 ${r.topic} questions`,`Review wrong answers immediately`,`Retry the weakest question without notes`];
 if(r.type==='revision')return [`Do 15-minute active recall for ${r.topic}`,`Attempt 5 mixed questions`,`Record any forgotten concept`];
 if(r.kind==='career'||r.kind==='career-skill')return [`Review the ${r.topic} skill requirements`,`Complete one practical checkpoint`,`Add the next missing skill to Planner`];
 return [`Study ${r.topic} for one focused session`,`Complete one practice checkpoint`,`Record what you still find difficult`];
}
function keySubject(v){const n=normalizeText(v);if(n.includes('data structure'))return'dsa';if(n.includes('database')||n==='dbms')return'dbms';if(n.includes('computer network')||n==='cn')return'cn';if(n.includes('operating system')||n==='os')return'os';if(n.includes('machine learning')||n==='ml')return'ml';if(n.includes('artificial intelligence')||n==='ai')return'ai';if(n.includes('web'))return'web development';return n}
function uniqueCandidates(rows){const seen=new Set();return rows.filter(x=>{const k=`${normalizeText(x.subject)}::${normalizeText(x.topic)}::${x.kind}`;if(seen.has(k))return false;seen.add(k);return true})}
function makeCandidate(subject,topic,kind='study',extra={}){return {subject:String(subject||'General'),topic:String(topic||subject||'General'),kind,...extra}}
function generateCandidates(p){
 const out=[];const subjects=(p.subjects||[]).filter(Boolean);const interests=(p.interests||[]).filter(Boolean);const backlogs=(p.backlogs||[]).filter(Boolean);
 subjects.forEach(subject=>{ const k=keySubject(subject), topics=SUBJECT_TOPICS[k]||[`${subject} Fundamentals`,`${subject} Practice`,`${subject} Revision`]; topics.slice(0,6).forEach((topic,i)=>out.push(makeCandidate(subject,topic,i===0?'diagnostic':'study',{source:'subject'}))); });
 backlogs.forEach(subject=>{ const k=keySubject(subject), topics=SUBJECT_TOPICS[k]||[`${subject} Fundamentals`,`${subject} Exam Revision`]; topics.slice(0,4).forEach(topic=>out.push(makeCandidate(subject,topic,'recovery',{source:'backlog',backlog:true}))); });
 interests.forEach(interest=>{const k=keySubject(interest),topics=SUBJECT_TOPICS[k];if(topics)topics.slice(0,4).forEach(topic=>out.push(makeCandidate(interest,topic,'interest',{source:'interest'})));else out.push(makeCandidate(interest,`${interest} Starter Project`,'project',{source:'interest'}))});
 const careerKey=Object.keys(CAREER_PATHS).find(k=>normalizeText(p.careerGoal).includes(k)||k.includes(normalizeText(p.careerGoal)));
 const skills=careerKey?CAREER_PATHS[careerKey]:[];skills.forEach((skill,i)=>out.push(makeCandidate(skill,`${skill} for ${p.careerGoal}`,'career-skill',{source:'career',careerOrder:i+1})));
 if(p.careerGoal)out.push(makeCandidate('Career',`${p.careerGoal} Roadmap`,'career',{source:'career'}));
 return uniqueCandidates(out);
}
function masteryFor(subject,topic){
 const exact=state.mastery[normalizeTopic(subject,topic)];if(exact)return exact;
 const vals=Object.values(state.mastery||{}).filter(m=>normalizeText(m.subject)===normalizeText(subject)||overlapScore(m.topic,topic)>=70);
 if(!vals.length)return {score:0,assessed:false,status:'Not assessed',attempts:0,mistakeCount:0,lastActivityMs:0};
 return vals.sort((a,b)=>(b.attempts||0)-(a.attempts||0))[0];
}
function buildRecommendations(){
 recomputeMastery();
 const p=state.profile||{},today=state.checkins[dayKey()]||{},tasks=window.NEXZOTaskStore?.getAll?.()||[];
 const available=Math.max(15,Number(today.availableMinutes||p.dailyMinutes||60));
 const energy=String(today.energy||'Normal'),workload=String(today.workload||'Normal');
 const mode=String(today.focus&&today.focus!=='Adaptive'?today.focus:p.preferredMode||'Adaptive');
 const recent=(state.events||[]).slice(-80), candidates=generateCandidates(p), rows=[], mlModel=trainPersonalRanker();
 const profileText=[...(p.subjects||[]),...(p.interests||[]),p.careerGoal,p.learningGoal,p.course,p.branch].join(' ');
 candidates.forEach(c=>{
   const m=masteryFor(c.subject,c.topic), assessedNeed=m.assessed?clamp(100-m.score):72;
   const isBacklog=c.backlog||(p.backlogs||[]).some(x=>overlapScore(x,c.subject)>=75);
   const examEntry=Object.entries(p.examDates||{}).find(([k])=>overlapScore(k,c.subject)>=70);const examDays=daysUntil(examEntry?.[1]);
   let urgency=isBacklog?100:24;if(examDays>=0&&examDays<=30)urgency=clamp(urgency+Math.max(20,80-examDays*2));
   const explicit=clamp(Math.max(overlapScore(`${c.subject} ${c.topic}`,profileText),c.source==='interest'?95:0,c.source==='subject'?88:0,c.source==='backlog'?100:0));
   const related=recent.filter(e=>overlapScore(e.subject,c.subject)>=75||overlapScore(e.topic,c.topic)>=60);const behaviour=clamp(related.length*14);
   const careerFit=p.careerGoal?clamp(c.source==='career'?95:Math.max(overlapScore(`${c.subject} ${c.topic}`,p.careerGoal),CAREER_PATHS[Object.keys(CAREER_PATHS).find(k=>normalizeText(p.careerGoal).includes(k))||'']?.some(x=>overlapScore(x,c.subject)>=70)?85:0)):0;
   const goalFit=p.learningGoal?clamp(Math.max(overlapScore(`${c.kind} ${c.topic}`,p.learningGoal),String(p.learningGoal).toLowerCase().includes('exam')&&examDays<=30?90:0,String(p.learningGoal).toLowerCase().includes('placement')&&c.source==='career'?90:0,String(p.learningGoal).toLowerCase().includes('project')&&c.kind==='project'?95:0)):0;
   const pending=tasks.filter(t=>!t.completed&&(overlapScore(t.subject,c.subject)>=75||overlapScore(t.title,c.topic)>=65)).length, plannerFit=clamp(pending*25);
   const mistakeCount=Object.values(state.mistakes||{}).filter(x=>overlapScore(x.subject,c.subject)>=75||overlapScore(x.topic,c.topic)>=60).reduce((n,x)=>n+(Number(x.count)||0),0), mistakeFit=clamp(mistakeCount*22);
   const capacity=clamp((available/Math.max(15,Number(p.sessionMinutes)||30))*50+(energy==='High'?25:energy==='Low'?-8:12)+(workload==='High'?-15:10));
   let score=assessedNeed*.30+urgency*.22+explicit*.16+behaviour*.07+careerFit*.10+goalFit*.07+plannerFit*.03+mistakeFit*.03+capacity*.02;
   if(m.assessed&&m.score>=85&&!isBacklog&&!(examDays>=0&&examDays<=7))score-=24;
   if(!m.assessed&&c.source==='career')score+=8;
   if(isBacklog)score+=12;
   const id=`rec:${canonicalToken(c.subject)}:${canonicalToken(c.topic)}:${c.kind}`,fb=state.feedback[id]?.value;
   if(fb==='useful')score+=10;if(fb==='too-hard')score-=3;if(fb==='too-easy')score-=7;if(fb==='not-relevant'||fb==='already-know')score-=55;
   const duration=Math.round(Math.max(15,Math.min(available,energy==='Low'?25:Number(p.sessionMinutes)||30))/5)*5;
   const type=c.kind==='career'?'career':c.kind==='project'?'project':(!m.assessed?'diagnostic':m.score<45?'foundation':m.score<70?'practice':'revision');
   let action=actionFor(type,mode);let actionLabel='Start in Academics',actionUrl='academics.html';
   if(c.kind==='career'||c.kind==='career-skill'){action=c.kind==='career'?`Open a step-by-step ${p.careerGoal} roadmap`:`Strengthen ${c.subject} for your ${p.careerGoal} goal`;actionLabel='Open Career';actionUrl='career.html'}
   else if(c.kind==='project'){action=`Build a small ${c.subject} project and track it in Planner`;actionLabel='Add Project Task';actionUrl='planner.html'}
   const why=[isBacklog?'Backlog priority':null,examDays>=0&&examDays<=30?`Exam in ${examDays} day${examDays===1?'':'s'}`:null,m.assessed?`Measured mastery ${m.score}%`:'No assessment yet — diagnostic recommended',mistakeCount?`${mistakeCount} repeated mistake signal${mistakeCount===1?'':'s'}`:null,c.source==='interest'?`Matches your interest in ${c.subject}`:null,c.source==='career'&&p.careerGoal?`Required for ${p.careerGoal}`:null,pending?`${pending} related pending Planner task${pending>1?'s':''}`:null].filter(Boolean).slice(0,4);
   const scoreBreakdown={masteryNeed:Math.round(assessedNeed),urgency:Math.round(urgency),interest:Math.round(explicit),behaviour:Math.round(behaviour),careerFit:Math.round(careerFit),goalFit:Math.round(goalFit),plannerFit:Math.round(plannerFit),mistakes:Math.round(mistakeFit),capacity:Math.round(capacity)};
   const baselineScore=clamp(score), learnedScore=mlPredict(mlModel,scoreBreakdown);
   // ML is deliberately an assistant to the contextual engine, not a brittle replacement.
   // 60/40 is enabled only after genuine labelled evidence exists; otherwise baseline=100%.
   const hybridScore=learnedScore==null?baselineScore:clamp(baselineScore*.40+learnedScore*.60);
   const row={id,subject:c.subject,topic:c.topic,type,kind:c.kind,source:c.source,mastery:m.score||0,assessed:!!m.assessed,matchScore:Math.round(hybridScore),priority:hybridScore,baselineScore:Math.round(baselineScore),mlScore:learnedScore==null?null:Math.round(learnedScore),rankingMode:learnedScore==null?'contextual-cold-start':'hybrid-ml',durationMinutes:duration,action,actionLabel,actionUrl,why,scoreBreakdown};row.suggestedTasks=taskListFor(row);rows.push(row);
 });
 const ranked=rows.filter(r=>r.priority>=12).sort((a,b)=>b.priority-a.priority);
 const hi=ranked[0]?.priority||1,lo=ranked[Math.min(ranked.length-1,11)]?.priority||0,span=Math.max(8,hi-lo);
 ranked.forEach((r,i)=>{const relative=58+((r.priority-lo)/span)*38;r.matchScore=Math.round(clamp(relative,25,96));r.rank=i+1;r.priorityBand=r.matchScore>=85?'Top match':r.matchScore>=72?'High priority':r.matchScore>=60?'Recommended':'Explore';});
 state.recommendations=ranked.slice(0,12);
 return state.recommendations;
}
function buildTodayPlan(){
 const p=state.profile||{},today=state.checkins[dayKey()]||{},budget=Math.max(20,Number(today.availableMinutes||p.dailyMinutes||60));
 const recs=(state.recommendations||[]).filter(r=>!(r.assessed&&r.mastery>=90&&r.type==='revision'));
 let used=0;const items=[];
 for(const r of recs){
   const mins=Math.max(15,Math.min(Number(r.durationMinutes)||30,budget-used));
   if(mins<15)break;
   items.push({id:r.id,title:r.topic,subject:r.subject,minutes:mins,matchScore:r.matchScore,reason:(r.why||[])[0]||r.action,task:(r.suggestedTasks||[])[0]||r.action,type:r.type});
   used+=mins;if(items.length>=4||used>=budget-10)break;
 }
 return {budgetMinutes:budget,plannedMinutes:used,remainingMinutes:Math.max(0,budget-used),items};
}
function mergeCloud(remote){const cloud=sanitize(remote,activeOwner);state=cloud;state.cloudUpdatedAtMs=Math.max(Number(remote?.updatedAtMs)||0,Number(remote?.cloudUpdatedAtMs)||0);return true}
async function pushCloud(){const c=await cloudContext();if(!c||c.user.uid!==activeOwner||!window.NEXZOBackendStore)return false;try{const payload={...clone(state),uid:c.user.uid,schemaVersion:204,cloudUpdatedAtMs:now(),updatedAtMs:state.updatedAtMs||now()};const out=await window.NEXZOBackendStore.putState('personalization',payload);state.cloudUpdatedAtMs=Number(out.updatedAtMs)||now();window.dispatchEvent(new CustomEvent('nexzo:personalization-sync',{detail:{status:'synced',uid:activeOwner,atMs:now(),source:'backend'}}));return true}catch(error){window.dispatchEvent(new CustomEvent('nexzo:personalization-sync',{detail:{status:'error',uid:activeOwner,error:error?.message||String(error)}}));return false}}
function scheduleCloud(){clearTimeout(cloudTimer);cloudTimer=setTimeout(pushCloud,350)}
async function subscribeCloud(){const c=await cloudContext();if(!c||c.user.uid!==activeOwner||!window.NEXZOBackendStore)return false;try{const out=await window.NEXZOBackendStore.getState('personalization');if(out.exists&&out.data)mergeCloud(out.data);else if(state.updatedAtMs)await pushCloud();importPlanner(false);buildRecommendations();window.dispatchEvent(new CustomEvent('nexzo:personalization-updated',{detail:snapshot()}));window.dispatchEvent(new CustomEvent('nexzo:personalization-sync',{detail:{status:'synced',uid:activeOwner,atMs:now(),source:'backend'}}));return true}catch(error){window.dispatchEvent(new CustomEvent('nexzo:personalization-sync',{detail:{status:'error',uid:activeOwner,error:error?.message||String(error)}}));return false}}
function updateProfile(patch){state.profile={...state.profile,...clone(patch)};buildRecommendations();persistLocal();return snapshot()}
function dailyCheckin(data){state.checkins[dayKey()]={date:dayKey(),availableMinutes:Math.max(10,Number(data.availableMinutes)||state.profile.dailyMinutes||60),energy:['Low','Normal','High'].includes(data.energy)?data.energy:'Normal',workload:['Low','Normal','High'].includes(data.workload)?data.workload:'Normal',focus:data.focus||'Adaptive',note:esc(data.note).slice(0,300),updatedAtMs:now()};buildRecommendations();persistLocal();return clone(state.checkins[dayKey()])}
function recordEvent(data,{save=true}={}){const e={id:data.id||crypto.randomUUID?.()||`ev_${now()}_${Math.random().toString(36).slice(2)}`,type:data.type||'study',subject:esc(data.subject)||'General',topic:esc(data.topic)||esc(data.subject)||'General',topicKey:normalizeTopic(data.subject,data.topic),score:data.score===null||data.score===undefined?null:Number(data.score),maxScore:data.maxScore===null||data.maxScore===undefined?null:Number(data.maxScore),accuracy:data.accuracy===null||data.accuracy===undefined?null:(Number.isFinite(Number(data.accuracy))?clamp(data.accuracy):null),difficulty:data.difficulty||'medium',durationMinutes:Math.max(0,Number(data.durationMinutes)||0),completed:Boolean(data.completed),mistakes:Array.isArray(data.mistakes)?data.mistakes.map(x=>esc(x)).filter(Boolean).slice(0,10):[],source:data.source||'manual',atMs:Number(data.atMs)||now()};if(state.events.some(x=>x.id===e.id))return e;state.events.push(e);if(state.events.length>800)state.events=state.events.slice(-800);e.mistakes.forEach(m=>{const key=`${e.topicKey}::${m.toLowerCase()}`;const x=state.mistakes[key]||{concept:m,subject:e.subject,topic:e.topic,count:0,lastSeenMs:0};x.count++;x.lastSeenMs=e.atMs;state.mistakes[key]=x});buildRecommendations();if(save)persistLocal();return e}
function importPlanner(save=true){const tasks=window.NEXZOTaskStore?.getAll?.()||[];let added=0;tasks.filter(t=>t.completed).forEach(t=>{const id=`planner:${t.id}:${t.completedAtMs||t.updatedAtMs||0}`;if(state.events.some(e=>e.id===id))return;recordEvent({id,type:'task',subject:t.subject||'General',topic:t.title||t.subject,score:t.score===null||t.score===undefined||t.score===''?null:Number(t.score),maxScore:t.score===null||t.score===undefined||t.score===''?null:10,accuracy:t.score===null||t.score===undefined||t.score===''?null:Number(t.score)*10,difficulty:t.difficulty||t.level||'medium',durationMinutes:Number(t.actualMinutes)||Math.round((Number(t.elapsed)||0)/60000),completed:true,source:'planner',atMs:t.completedAtMs||t.updatedAtMs||now()},{save:false});added++});if(added&&save)persistLocal();return added}
function feedback(id,value){const rec=(state.recommendations||[]).find(r=>r.id===id);state.feedback[id]={value,atMs:now(),features:rec?mlVector(rec.scoreBreakdown):undefined,featureNames:rec?ML_FEATURES:undefined,baselineScore:rec?.baselineScore??rec?.matchScore??null,subject:rec?.subject||'',topic:rec?.topic||''};buildRecommendations();persistLocal()}
function forget(section){if(section==='all')state=defaultState(activeOwner);else if(section==='events'){state.events=[];state.mastery={};state.mistakes={};state.recommendations=[]}else if(section==='profile')state.profile=defaultState(activeOwner).profile;else if(section==='mistakes')state.mistakes={};buildRecommendations();persistLocal()}
function snapshot(){if(!state)state=defaultState(activeOwner);recomputeMastery();buildRecommendations();const assessed=Object.values(state.mastery).filter(x=>x.assessed);const plan=buildTodayPlan();const top=state.recommendations[0]||null;return clone({...state,todayPlan:plan,decisionSummary:{topRecommendation:top?`${top.topic} (${top.matchScore}% match)`:'Add subjects/goals to generate recommendations',nextAction:plan.items[0]?.task||'Complete your profile',plannerTasks:(window.NEXZOTaskStore?.getAll?.()||[]).filter(t=>!t.completed).length},weakTopics:assessed.filter(x=>x.score<55).sort((a,b)=>a.score-b.score),modelSummary:{algorithm:'Hybrid ML recommender (v204 · personalized logistic ranker + explainable contextual fallback)',signals:['Profile inputs','Learning evidence','Exam/backlog urgency','Career fit','Planner activity','Mistakes','Feedback','Daily capacity'],ml:((m)=>({active:m.active,trainingSamples:m.samples,positiveSamples:m.positives,negativeSamples:m.negatives,coldStart:!m.active,features:[...ML_FEATURES]}))(trainPersonalRanker()),assessedTopics:assessed.length,eventCount:state.events.length}})}
async function switchOwner(force=false){if(switching)return;const next=resolveOwner();if(!force&&next===activeOwner&&ready)return;switching=true;try{activeOwner=next;loadLocal(next);if(next!=='local')await subscribeCloud();importPlanner(false);buildRecommendations();ready=true;window.dispatchEvent(new CustomEvent('nexzo:personalization-ready',{detail:snapshot()}))}finally{switching=false}}
async function init(){await switchOwner(true);setTimeout(()=>switchOwner(),800);setTimeout(()=>switchOwner(),2500)}
window.NEXZOPersonalization=Object.freeze({version:204,init,snapshot,updateProfile,dailyCheckin,recordEvent,importPlanner,recomputeMastery,detectWeaknesses,buildRecommendations,feedback,forget,pushCloud,switchOwner,get ready(){return ready},get uid(){return activeOwner}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
['nexzo:data-ready','nexzo:auth-ready','nexzo:profile-updated'].forEach(name=>window.addEventListener(name,()=>switchOwner()));

window.addEventListener('nexzo:ai-learning-complete',e=>{if(!ready)return;const d=e.detail||{};recordEvent({id:d.id||`ai:${d.kind}:${now()}`,type:d.kind==='interview'?'interview':'quiz',subject:d.subject||'Study Assistant',topic:d.topic||d.subject||'Study Assistant',accuracy:Number.isFinite(Number(d.score))?Number(d.score):null,difficulty:d.difficulty||'medium',completed:true,mistakes:Array.isArray(d.mistakes)?d.mistakes:[],source:'assistant'});});
window.addEventListener('nexzo:assistant-feedback',e=>{if(!ready)return;const d=e.detail||{};if(!d.id)return;state.feedback[d.id]={value:d.value||'cleared',kind:'assistant-response',chatId:d.chatId||'',messageId:d.messageId||'',atMs:Number(d.atMs)||now()};persistLocal();});

window.addEventListener('nexzo:task-store',()=>{if(ready){const added=importPlanner(false);buildRecommendations();if(added)persistLocal()}});
})();
