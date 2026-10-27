/* NEXZO Planner Controller - isolated working controller
   Owns planner form, tasks, timer, questions, submission and evaluation.
*/
try { if (typeof window.layout === 'function') window.layout('Planner'); } catch (_) {}
(function(){
  'use strict';
  if (!document.querySelector('.planner-page')) return;
  if (window.__NEXZO_PLANNER_CONTROLLER_V7__) return;
  window.__NEXZO_PLANNER_CONTROLLER_V7__ = true;
  const $ = (id)=>document.getElementById(id);
  const els = {};
  const ids = ['smartPrompt','taskSubject','taskType','taskLevel','taskQuestions','taskDuration','taskPriority','taskPlace','taskDate','taskDeadlineTime','taskDailyHours','aiPreview','roadTitle','roadSub','taskList','modeLabel','promptPanel','recPanel','statTotal','statDone','statTime','statAccuracy','statStreak','statProgress','miniAll','miniRunning','miniDone','miniOverdue','todayDate','todayDay','questionsBack','qTitle','qSub','qList','submitBack','submitTitle','proofFile','fileLabel','filePreview','pasteAnswer','writeAnswer','submitNote','submitError','submitStatus','mcqMode','uploadMode','pasteMode','writeMode','scoreText','scoreRing','evalFeedback'];
  ids.forEach(id=>els[id]=$(id));

  const {SUBJECTS,TYPES,LEVELS,COUNTS,DURATIONS,PRIORITIES,PLACES,HOURS,BANK}=window.NEXZOPlannerData||{};
  let mode='ai', activeSug='Roadmaps', filter='All', submitMode='upload', activeIndex=0, submissionBusy=false;
  let tasks=[];
  let activeTaskId='';
  const submissionOwner=()=>window.NEXZODataService?.getUser?.()?.uid||localStorage.getItem('nexzo_canonical_cache_owner')||'local';
  let latestAIPlan=null, previousPlanQuestions=[], previousPlanSignature='';
  
  function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
  const PRIMARY_KEY=window.NEXZOTaskStore?.PRIMARY_KEY||'nexzo_tasks_v2';
  const COMPAT_KEYS=[PRIMARY_KEY,'nexzo_planner_tasks_v6'];
  let cloudSaveTimer=null;
  let lastTimerCacheWrite=0;

  function safeParse(raw,fallback=[]){try{const value=JSON.parse(raw);return value??fallback}catch{return fallback}}
  function taskId(task,index=0){
    const id=task?.id||task?._id||task?.taskId;
    if(id)return String(id);
    return `task_${Date.now()}_${index}_${Math.random().toString(36).slice(2,8)}`;
  }
  function importedQuestionProfile(task){
    const title=String(task?.title||task?.name||'');
    const subject=String(task?.subject||task?.track||detectSubject(title)||'General').slice(0,80);
    const rawType=String(task?.type||task?.taskType||'Study');
    const lower=`${title} ${rawType}`.toLowerCase();
    let type=rawType;
    // The task title is authoritative for legacy recovery quizzes. Older builds could
    // save an MCQ-labelled recovery task as Revision/Study, which opened the theory submit UI.
    if(!task?.questionPlanId&&/quiz|mcq|mock test/.test(lower)) type='MCQ Practice';
    else if(!task?.questionPlanId&&/personalized recommendation|study|general/i.test(rawType)){
      if(/diagnostic/.test(lower)) type='Practice Questions';
      else if(/code|coding|implement|program|leetcode/.test(lower)) type='Coding Practice';
      else if(/revise|revision|review/.test(lower)) type='Revision';
      else if(/interview/.test(lower)) type='Short Questions';
      else if(/project|build/.test(lower)) type='Project Work';
      else type='Practice Questions';
    }
    const level=String(task?.level||task?.difficulty||(/diagnostic/.test(lower)?'Intermediate':'Beginner')).slice(0,40);
    const explicit=Number(String(task?.questions||task?.questionCount||title).match(/(\d+)\s*(?:-|\s)?(?:question|mcq|problem)/i)?.[1]);
    const count=Math.min(25,Math.max(1,Number.isFinite(explicit)&&explicit?explicit:(/diagnostic|quiz|mock test/.test(lower)?10:5)));
    return {subject,type,level,count,title};
  }
  function isPlaceholderMcqQuestion(value){
    return /correct basic concept|correct application of the concept|optimized and conceptually correct|partially related option|incorrect option|incorrect approach|not applicable|naive answer with limitation|wrong conclusion/i.test(String(value||''));
  }
  function isMcqTask(task){return task?.questionFormat==='mcq'||/mcq|quiz|diagnostic/i.test(String(task?.type||task?.questionType||''));}
  function validMcqBundle(questions,planId){return typeof planId==='string'&&!!planId&&Array.isArray(questions)&&questions.length>0&&questions.every(q=>!isPlaceholderMcqQuestion(q)&&['A','B','C','D'].every(l=>new RegExp('(?:^|\\n)'+l+'[).:]').test(q)));}
  function ensureTaskQuestions(task){
    const existing=Array.isArray(task.generatedQuestions)?task.generatedQuestions:[];
    const mcq=isMcqTask(task);
    return {generatedQuestions:existing,questionType:importedQuestionProfile(task).type,questionCount:existing.length,mcqNeedsRegeneration:mcq&&!validMcqBundle(existing,task.questionPlanId)};
  }
  function normalizeTask(task,index=0){
    const done=Boolean(task?.done||task?.completed||String(task?.status||'').toLowerCase()==='completed'||Number(task?.progress)>=100);
    const submissionLocked=Boolean(task?.submissionLocked);
    const terminal=done||submissionLocked;
    const running=Boolean(!terminal&&task?.running&&task?.lastStarted);
    const deadline=String(task?.deadline||task?.scheduledDate||'').slice(0,10);
    const deadlineTime=String(task?.deadlineTime||'23:59').slice(0,5)||'23:59';
    const parsedDeadlineMs=Number(task?.deadlineMs)||deadlineTimestamp(deadline,deadlineTime);
    const q=ensureTaskQuestions(task||{});
    return {
      ...task,
      ...q,
      id:taskId(task,index),
      title:String(task?.title||task?.name||'Study Task').slice(0,120),
      subject:String(task?.subject||task?.track||detectSubject(task?.title||'')||'General').slice(0,80),
      type:String(importedQuestionProfile(task).type||q.questionType||task?.type||task?.taskType||'Study').slice(0,70),
      level:String(task?.level||task?.difficulty||'Beginner').slice(0,40),
      done,
      completed:done,
      submissionLocked,
      status:done?'completed':submissionLocked?(task?.score!=null?'needs-improvement':'submitted'):running?'in-progress':String(task?.status||'pending').toLowerCase(),
      progress:done?100:Math.max(0,Math.min(99,Number(task?.progress)||0)),
      elapsed:Math.max(0,Number(task?.elapsed)||Number(task?.actualMinutes||0)*60000),
      running,
      lastStarted:running?Number(task.lastStarted):null,
      created:task?.created||task?.createdAt||new Date().toISOString(),
      createdAtMs:Number(task?.createdAtMs)||new Date(task?.created||task?.createdAt||Date.now()).getTime()||Date.now(),
      updatedAtMs:Number(task?.updatedAtMs)||Date.now(),
      deadline,deadlineTime,deadlineMs:parsedDeadlineMs,scheduledDate:String(task?.scheduledDate||deadline),
      sessions:Array.isArray(task?.sessions)?task.sessions:[]
    };
  }
  function readTasks(){
    const raw=window.NEXZOTaskStore?.getAll?window.NEXZOTaskStore.getAll():safeParse(localStorage.getItem(PRIMARY_KEY)||'[]',[]);
    // Preserve old malformed recovery records. Regeneration is an explicit action.
    return (Array.isArray(raw)?raw:[]).map(task=>normalizeTask({...task,title:String(task.title||'').replace(/^(?:Recovery:\s*)+/i,'Recovery: ')}));
  }
  function writeLocalCache(){
    const copy=tasks.map(normalizeTask);
    try{
      if(window.NEXZOTaskStore?.setAll)window.NEXZOTaskStore.setAll(copy,{cloud:false});
      else localStorage.setItem(PRIMARY_KEY,JSON.stringify(copy));
    }catch{window.dispatchEvent(new CustomEvent('nexzo:cache-status',{detail:{state:'unavailable',message:'Device cache is full; answers remain in this open task. Account save can still proceed.'}}));}
  }
  function queueCloudSave(immediate=false){
    clearTimeout(cloudSaveTimer);
    const run=()=>{
      const copy=tasks.map(normalizeTask);
      window.NEXZOTaskStore?.setAll?.(copy,{cloud:true});
      window.dispatchEvent(new CustomEvent('nexzo:planner-updated',{detail:{source:'planner',count:copy.length,tasks:copy}}));
    };
    if(immediate)run();else cloudSaveTimer=setTimeout(run,700);
  }
  function saveTasks(options={}){
    tasks=tasks.map(normalizeTask);
    writeLocalCache();
    if(options.cloud!==false)queueCloudSave(Boolean(options.immediate));
  }
  async function confirmSubmissionSave(){
    if(!window.NEXZODataService?.getUser?.())return {cloud:false,message:'Saved on this device (guest).'};
    try{
      const saved=await window.NEXZOTaskStore?.flush?.();
      if(saved===true)return {cloud:true,message:'Saved to your account.'};
    }catch(error){console.warn('Planner save acknowledgement failed',error);}
    return {cloud:false,message:'Saved on this device only. Cloud sync pending — account/re-login persistence is not confirmed.'};
  }
  function countNum(){const raw=els.taskQuestions?.value||'5 Questions'; const m=raw.match(/\d+/); return Math.min(25,Math.max(1,m?Number(m[0]):5));}
  function todayISO(offset=0){const d=new Date();d.setDate(d.getDate()+offset);return d.toISOString().slice(0,10)}
  function durationDays(){const m=(els.taskDuration?.value||'2 Days').match(/\d+/); return m?Number(m[0]):2;}
  function deadlineParts(task){
    const date=String(task?.deadline||task?.scheduledDate||'').slice(0,10);
    const time=String(task?.deadlineTime||'23:59').slice(0,5)||'23:59';
    return {date,time};
  }
  function deadlineTimestamp(date,time='23:59'){
    if(!date)return null;
    const ms=new Date(`${date}T${time||'23:59'}:00`).getTime();
    return Number.isFinite(ms)?ms:null;
  }
  function displayDeadline(task){const d=deadlineParts(task);return d.date?`${d.date} ${d.time}`:'No deadline';}
  function subjectBase(sub){return BANK[sub]||BANK['General'];}
  function getInput(){return (els.smartPrompt?.value||'').trim();}

  function fillSelect(el, arr, placeholder){
    if(!el) return;
    el.innerHTML = `<option value="">${placeholder}</option>` + arr.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  }
  function subjectOptions(subject){
    const s=String(subject||'').toLowerCase();
    const coding=/dsa|data structure|algorithm|machine learning|\bai\b|programming|c programming|python|java|c\+\+|javascript|web dev|html|css|react|node|oop|software testing|git|linux|system design|dbms|sql|operating system|computer network|cyber|cloud|data science|computer graphic|compiler/.test(s);
    const numerical=/math|discrete|physics|electrical|chemistry|biology|digital electronic|aptitude/.test(s);
    if(coding&&!numerical)return {types:['Theory Study','Practice Questions','Short Questions','Long Questions','Coding Practice','Debugging','MCQ Practice','Previous Year Questions','Revision','Project Work'],counts:['3 Coding Problems','5 Coding Problems','5 Questions','10 Questions','15 Questions','20 Questions','5 MCQs','10 MCQs']};
    if(numerical)return {types:['Theory Study','Numerical Problems','MCQ Practice','Short Questions','Long Questions','Previous Year Questions','Revision','Notes Making'],counts:['5 Questions','10 Questions','15 Questions','20 Questions','5 MCQs','10 MCQs','20 MCQs']};
    return {types:['Theory Study','MCQ Practice','Practice Questions','Short Questions','Long Questions','Previous Year Questions','Revision','Notes Making','Research / Reading'],counts:['3 Questions','5 Questions','10 Questions','15 Questions','20 Questions','5 MCQs','10 MCQs','20 MCQs']};
  }
  function targetOptionsForType(type,subject){
    const t=String(type||'').toLowerCase();
    if(/mcq|quiz|mock/.test(t))return ['5 MCQs','10 MCQs','15 MCQs','20 MCQs','25 MCQs'];
    if(/coding|debug/.test(t))return ['3 Coding Problems','5 Coding Problems','10 Coding Problems'];
    if(/project/.test(t))return ['1 Mini Project','2 Mini Projects','3 Mini Projects'];
    if(/revision|notes|research|reading/.test(t))return ['3 Topics','5 Topics','10 Topics','Complete Notes'];
    if(/lab|practical/.test(t))return ['1 Practical','3 Practicals','5 Practicals'];
    return ['3 Questions','5 Questions','10 Questions','15 Questions','20 Questions','25 Questions'];
  }
  function refreshTargetOptions(){
    if(!els.taskQuestions)return;
    const subject=els.taskSubject?.value||'';
    const type=els.taskType?.value||'';
    const current=els.taskQuestions.value||'';
    if(!subject || !type){
      fillSelect(els.taskQuestions,[],'Select Questions / Targets');
      els.taskQuestions.value='';
      els.taskQuestions.disabled=true;
      return;
    }
    const counts=targetOptionsForType(type,subject);
    fillSelect(els.taskQuestions,counts,'Select Questions / Targets');
    els.taskQuestions.disabled=false;
    els.taskQuestions.value=counts.includes(current)?current:'';
  }
  function refreshTaskOptions(){
    const subject=els.taskSubject?.value||'';
    const currentType=els.taskType?.value||'';
    if(!subject){
      fillSelect(els.taskType,[],'Select Task Type');
      els.taskType.value='';
      els.taskType.disabled=true;
      refreshTargetOptions();
      return;
    }
    const cfg=subjectOptions(subject);
    fillSelect(els.taskType,cfg.types,'Select Task Type');
    els.taskType.disabled=false;
    els.taskType.value=cfg.types.includes(currentType)?currentType:'';
    refreshTargetOptions();
  }
  function syncedAcademicSubjects(){
    const values=[];
    try{const profile=window.NEXZOPersonalization?.snapshot?.()?.profile||{};if(Array.isArray(profile.subjects))values.push(...profile.subjects)}catch{}
    return [...new Set(values.map(x=>String(x||'').trim()).filter(Boolean))];
  }
  function refreshPlannerSubjects(){
    if(!els.taskSubject)return;
    const current=els.taskSubject.value;
    const merged=[...new Set([...syncedAcademicSubjects(),...(SUBJECTS||[])])];
    fillSelect(els.taskSubject,merged,'Select Subject');
    if(merged.includes(current))els.taskSubject.value=current;
  }
  function initSelects(){
    refreshPlannerSubjects();
    fillSelect(els.taskType,TYPES,'Select Task Type');
    fillSelect(els.taskLevel,LEVELS,'Select Level');
    fillSelect(els.taskQuestions,COUNTS,'Select Questions');
    fillSelect(els.taskDuration,DURATIONS,'Select Duration');
    fillSelect(els.taskPriority,PRIORITIES,'Select Priority');
    fillSelect(els.taskPlace,PLACES,'Select Study Place');
    fillSelect(els.taskDailyHours,HOURS,'Select Daily Hours');
    if(els.taskLevel) els.taskLevel.value='Beginner';
    if(els.taskQuestions) els.taskQuestions.value='';
    if(els.taskDuration) els.taskDuration.value='2 Days';
    if(els.taskPriority) els.taskPriority.value='Medium';
    if(els.taskPlace) els.taskPlace.value='Home';
    if(els.taskDailyHours){const prefs=safeParse(localStorage.getItem('nexzo_settings')||'{}',{});const desired=String(prefs.defaultStudyTime||'1 Hour').replace('30 Minutes','30 Min');els.taskDailyHours.value=[...els.taskDailyHours.options].some(o=>o.value===desired)?desired:'1 Hour';}
    if(els.taskDate) els.taskDate.value=todayISO(3);
    if(els.taskDeadlineTime) els.taskDeadlineTime.value='23:59';
    refreshTaskOptions();
    window.addEventListener('nexzo:academics-updated',refreshPlannerSubjects);
    window.addEventListener('storage',e=>{if(e.key?.startsWith('nexzo_academics_v235:')||e.key?.startsWith('nexzo_personalization'))refreshPlannerSubjects()});
  }

  function detectSubject(text){
    const t=text.toLowerCase();
    const rules=[['DBMS',/dbms|sql|database|normalization|acid|transaction|er\s*diagram/],['Web Dev',/web|html|css|javascript|frontend|backend|react|node|api/],['Python',/python|pandas|numpy|django|flask/],['AI',/\bai\b|artificial intelligence|search algorithm|chatbot|bayes/],['Machine Learning',/machine learning|\bml\b|regression|classification|model|overfitting/],['Operating System',/operating system|\bos\b|process|thread|deadlock|scheduling|memory/],['Computer Networks',/network|\bcn\b|osi|tcp|udp|dns|ip address/],['Cyber Security',/cyber|security|owasp|hacking|vulnerability/],['Cloud Computing',/cloud|aws|azure|docker|devops|deployment/],['IoT',/iot|arduino|esp32|sensor|mqtt|rfid/],['Aptitude',/aptitude|percentage|ratio|profit|average|time and work/],['Maths',/math|maths|algebra|linear equation|matrix|probability/],['DSA',/dsa|data structure|array|linked list|stack|queue|tree|graph|leetcode|placement/]];
    return (rules.find(([,r])=>r.test(t))||[])[0]||'';
  }
  function detectType(text){
    const t=text.toLowerCase();
    if(/mcq|multiple choice|quiz/.test(t)) return 'MCQ Practice';
    if(/coding|code|program|leetcode|problem/.test(t)) return 'Coding Practice';
    if(/practical|lab|experiment/.test(t)) return 'Lab / Practical';
    if(/project|mini project|build/.test(t)) return 'Project Work';
    if(/previous|pyq|past paper/.test(t)) return 'Previous Year Questions';
    if(/short/.test(t)) return 'Short Questions';
    if(/long|explain/.test(t)) return 'Long Questions';
    if(/case study/.test(t)) return 'Case Study';
    if(/debug/.test(t)) return 'Debugging';
    if(/notes/.test(t)) return 'Notes Making';
    if(/revision|revise/.test(t)) return 'Revision';
    if(/theory|study|learn/.test(t)) return 'Theory Study';
    return '';
  }
  function detectLevel(text){const t=text.toLowerCase(); if(/advanced|hard|expert/.test(t))return 'Advanced'; if(/beginner|basic|easy|simple/.test(t))return 'Beginner'; if(/intermediate|medium/.test(t))return 'Intermediate'; return '';}
  function detectCount(text){const m=text.match(/(\d+)\s*(mcq|questions?|problems?|tasks?|topics?)/i); return m?Math.min(25,Math.max(1,Number(m[1]))):0;}


  let generationBusy=false;
  let replacementContext=null;
  const bounded=(promise,ms,label)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Object.assign(new Error(`${label} took too long. Your work is preserved; retry.`),{code:'PROVIDER_TIMEOUT'})),ms);Promise.resolve(promise).then(resolve,reject).finally(()=>clearTimeout(timer));});
  const planInput=()=>({...replacementContext,subject:els.taskSubject.value||detectSubject(getInput())||'',taskType:els.taskType.value||detectType(getInput())||'',level:els.taskLevel.value||'Beginner',questionCount:els.taskQuestions.value,duration:els.taskDuration.value,dailyHours:els.taskDailyHours.value,prompt:getInput()});
  async function requestAIPlan(){
    if(generationBusy)return;
    const basePayload=planInput(),payload={...basePayload,excludeQuestions:previousPlanSignature===JSON.stringify(basePayload)?previousPlanQuestions:[],generationNonce:`${Date.now()}-${Math.random().toString(36).slice(2,10)}`},ownerAtStart=submissionOwner(),signature=JSON.stringify(basePayload);
    if(!payload.subject||!payload.taskType||!payload.questionCount)return window.NEXZOShell?.toast?.('Select subject, type and target first.','error');
    generationBusy=true;latestAIPlan=null;els.roadSub.textContent='Generating preview…';
    try{
      const plan=await bounded(window.NEXZOAI.planner(payload),35000,'Question generation');
      if(ownerAtStart!==submissionOwner()||JSON.stringify(planInput())!==signature)throw new Error('Account or form changed. Generate a new preview.');
      if(!plan?.planId||!Array.isArray(plan.tasks)||plan.tasks.flatMap(t=>t.questions||[]).length!==countNum())throw new Error('Incomplete question preview. Nothing was saved.');
      if(plan.questionFormat==='mcq'&&!validMcqBundle(plan.tasks.flatMap(t=>t.questions||[]),plan.planId))throw new Error('Malformed MCQs. No task was created.');
      previousPlanQuestions=plan.tasks.flatMap(t=>t.questions||[]);previousPlanSignature=signature;
      latestAIPlan={...plan,inputSignature:signature};renderSuggestion();return true;
    }catch(error){els.aiPreview.innerHTML=`<p role="alert">${esc(error.message)} No task was created.</p><button type="button" data-generate-preview>Retry generation</button>`;els.roadSub.textContent='Generation unavailable';return false;}
    finally{generationBusy=false;}
  }
  async function regenerateLegacyTask(id){
    const task=tasks.find(t=>t.id===id);if(!task||task.serverVerified)return;
    const subject=task.originalSubject||task.subject||detectSubject(task.title);
    if(!subject||subject==='General')return window.NEXZOShell?.toast?.('Choose the original subject and topic in the form first. The legacy task is preserved.','error');
    replacementContext={unit:task.unit||task.syllabus?.unit||'',topic:task.topic||task.syllabus?.topic||'',courseCode:task.syllabus?.courseCode||''};
    els.taskSubject.value=subject;refreshTaskOptions();els.taskType.value=importedQuestionProfile(task).type;refreshTargetOptions();
    const count=task.questionCount||task.generatedQuestions?.length||5;const label=/mcq/i.test(els.taskType.value)?`${count} MCQs`:`${count} Questions`;
    if(![...els.taskQuestions.options].some(o=>o.value===label))els.taskQuestions.add(new Option(label,label));els.taskQuestions.value=label;
    els.smartPrompt.value='';closeQuestions();const generated=await requestAIPlan();
    if(generated)window.NEXZOShell?.toast?.('Replacement preview prepared. Review it before creating a new task; the original is preserved.','info');
  }
  function applyPromptAnalysis(useCloud=false){
    const input=getInput();
    if(!input){latestAIPlan=null;renderSuggestion();return false;}
    const sub=detectSubject(input)||els.taskSubject?.value||'General';
    const type=detectType(input)||els.taskType?.value||'Practice Questions';
    const lvl=detectLevel(input), cnt=detectCount(input);
    if(sub)els.taskSubject.value=sub;refreshTaskOptions();if(type&&[...els.taskType.options].some(o=>o.value===type))els.taskType.value=type;if(lvl)els.taskLevel.value=lvl;
    if(/urgent|deadline|placement|exam|tomorrow/i.test(input))els.taskPriority.value='High';
    if(cnt){let suffix=(els.taskType.value==='MCQ Practice')?'MCQs':(els.taskType.value==='Coding Practice')?'Coding Problems':'Questions';let val=`${cnt} ${suffix}`;if(![...els.taskQuestions.options].some(o=>o.value===val))els.taskQuestions.insertAdjacentHTML('beforeend',`<option value="${esc(val)}">${esc(val)}</option>`);els.taskQuestions.value=val;}
    renderSuggestion();
    if(useCloud)requestAIPlan();
    return true;
  }

  function buildSuggestionMarkup(items,sub,type,level){
    const rows=items.map((item,index)=>{
      const full=String(item||'');
      const firstLine=full.split('\n')[0]
        .replace(/^Q?\d+\.?\s*/,'')
        .replace(/^Problem\s+\d+:\s*/i,'')
        .replace(/^Practical\s+\d+:\s*/i,'')
        .replace(/^Project Task\s+\d+:\s*/i,'');
      const detail=full.split('\n').slice(1).join(' • ');
      return `<button type="button" class="nx-generated-question" data-pick="${esc(full)}"><span class="nx-question-index">${index+1}</span><span class="nx-question-copy"><b>${esc(firstLine)}</b>${detail?`<small>${esc(detail)}</small>`:''}</span><em>${activeSug==='Mistakes'?'Check':esc(level)}</em></button>`;
    }).join('');
    const actions='<div class="sug-actions"><button type="button" class="btn primary" id="sugCreateBtn">Create Task</button><button type="button" class="btn" id="sugResBtn">Open Resources</button></div>';
    if(activeSug==='Roadmaps'){
      return `<section class="nx-roadmap-summary"><div><h4>Smart Roadmap: ${esc(sub)}</h4><p><b>1.</b> Revise concepts <i>→</i> <b>2.</b> Solve selected questions <i>→</i> <b>3.</b> Submit proof for AI verification.</p></div></section><section class="nx-generated-questions"><header><div><h4>Generated Questions</h4></div><small>${esc(type)} • ${esc(level)}</small></header><div class="nx-question-list">${rows}</div></section>${actions}`;
    }
    return `<section class="nx-generated-questions nx-generated-questions--${activeSug.toLowerCase()}"><header><div><h4>${esc(els.roadTitle.textContent)}</h4></div><small>${esc(level)}</small></header><div class="nx-question-list">${rows}</div></section>${actions}`;
  }

  function renderSuggestion(){
    if(!els.aiPreview) return;
    const input=getInput();
    const sub=els.taskSubject.value || detectSubject(input) || (input?'General':'');
    const type=els.taskType.value || detectType(input) || (input?'Practice Questions':'');
    const level=els.taskLevel.value || detectLevel(input) || 'Beginner';
    if(!input && !sub && mode==='ai'){
      els.roadTitle.textContent='Smart Roadmap';
      els.roadSub.textContent='Generated from your input';
      els.aiPreview.innerHTML='<div class="nx-ai-empty"><span>✦</span><div><h3>Write your task first</h3><p>Describe what you want to study. NEXZO will detect the subject and generate a roadmap with questions.</p></div></div>';
      return;
    }
    if(!sub || !type){
      els.roadTitle.textContent='Smart Suggestions';
      els.roadSub.textContent='Select subject/type or write your task input.';
      els.aiPreview.innerHTML='<div class="nx-ai-empty"><span>✦</span><div><h3>Add a little more detail</h3><p>Choose a subject and task type, or write your study goal in the task box.</p></div></div>';
      return;
    }
    const aiRows=latestAIPlan?.inputSignature===JSON.stringify(planInput())?latestAIPlan.tasks.flatMap(t=>t.questions||[]):[];
    const questions=aiRows;
    els.roadTitle.textContent = activeSug==='Roadmaps'?'Smart Roadmap':activeSug==='Topics'?`${sub} Important Topics`:activeSug==='Practice'?`${sub} ${type}`:activeSug==='Mistakes'?'Submission Mistake Checker':`${sub} Resources`;
    els.roadSub.textContent = activeSug==='Roadmaps'?'Generated from your input':activeSug==='Topics'?'Topics based on your selected task':activeSug==='Practice'?'Questions match your task type and level':activeSug==='Mistakes'?'These points will be checked during submission':'Useful links based on your task';
    if(activeSug==='Resources'){
      const q=encodeURIComponent(`${sub} ${level} ${type}`);
      els.aiPreview.innerHTML=`<div class="nx-resource-grid">${['YouTube Videos','Notes PDF','Practice Questions','Previous Papers','Interview Questions'].map((x,i)=>`<a class="resource-link nx-resource-link" target="_blank" href="https://www.google.com/search?q=${q}+${encodeURIComponent(x)}"><span>${['▶','▤','◎','◫','◆'][i]}</span><b>${x}</b><em>Open →</em></a>`).join('')}</div>`;
      return;
    }
    if(!questions.length){els.roadSub.textContent='Generate → review preview → create task';els.aiPreview.innerHTML='<p>Select your subject, task type and targets, then generate the content.</p><button type="button" data-generate-preview>Generate preview</button>';return;}
    let arr=questions;
    if(activeSug==='Topics') arr=questions.map(x=>x.split(/[:\n]/)[0].replace(/^Q?\d+\.?\s*/,'')).slice(0,countNum());
    if(activeSug==='Mistakes') arr=['Answer does not match generated questions','Missing steps/example/output','Too short or incomplete explanation','No screenshot/file proof for practical task','Wrong concept, syntax or final answer'];
    els.aiPreview.innerHTML=buildSuggestionMarkup(arr,sub,type,level);
    els.aiPreview.querySelectorAll('[data-pick]').forEach(b=>b.addEventListener('click',()=>{ b.classList.toggle('picked'); }));
    $('sugCreateBtn')?.addEventListener('click',()=>createTask());
    $('sugResBtn')?.addEventListener('click',()=>{activeSug='Resources';syncSugTabs();renderSuggestion();});
  }

  function syncSugTabs(){document.querySelectorAll('[data-sug]').forEach(b=>b.classList.toggle('active',b.dataset.sug===activeSug));}
  function makeTask(title){
    const input=getInput();
    const sub=els.taskSubject.value || detectSubject(input) || (input?'General':'');
    const type=els.taskType.value || detectType(input) || (input?'Practice Questions':'');
    const level=els.taskLevel.value || detectLevel(input) || 'Beginner';
    if(!sub || !type) return null;
    const count=countNum();
    const aiQuestions=(Array.isArray(latestAIPlan?.tasks)?latestAIPlan.tasks:[]).flatMap(item=>Array.isArray(item?.questions)&&item.questions.length?item.questions:[item?.description||item?.title]).filter(Boolean).slice(0,count);
    const qs=aiQuestions;
    const shortTitle=(title || latestAIPlan?.title || input.split(/[.!?]/)[0] || `${sub} - ${type}`).slice(0,80);
    const now=new Date();
    return normalizeTask({
      id:`planner_${latestAIPlan.planId}`,
      subject:sub,type,level,questions:els.taskQuestions.value||`${count} Questions`,generatedQuestions:qs,
      questionPlanId:latestAIPlan.planId,questionFormat:latestAIPlan.questionFormat,unit:latestAIPlan.unit||'',topic:latestAIPlan.topic||'',
      duration:els.taskDuration.value||'2 Days',priority:els.taskPriority.value||'Medium',place:els.taskPlace.value||'Home',
      deadline:els.taskDate.value||todayISO(durationDays()),scheduledDate:els.taskDate.value||todayISO(durationDays()),
      deadlineTime:els.taskDeadlineTime?.value||'23:59',
      deadlineMs:deadlineTimestamp(els.taskDate.value||todayISO(durationDays()),els.taskDeadlineTime?.value||'23:59'),
      hours:els.taskDailyHours.value||'1 Hour',time:'10:00',title:shortTitle,progress:0,done:false,completed:false,
      status:'pending',score:null,elapsed:0,running:false,lastStarted:null,autoLock:Boolean(document.getElementById('autoLock')?.checked),
      created:now.toISOString(),createdAtMs:now.getTime(),updatedAtMs:now.getTime(),sessions:[]
    });
  }
  let creationBusy=false;
  async function createTask(ev){
    ev?.preventDefault?.();if(creationBusy||generationBusy)return;
    // One-click Smart Task flow: generate a fresh, server-owned question plan first
    // whenever the current form does not already have a matching preview.
    if(!latestAIPlan?.planId||latestAIPlan.inputSignature!==JSON.stringify(planInput())){
      const generated=await requestAIPlan();
      if(!generated)return;
    }
    const task=makeTask();if(!task)return;
    const expected=countNum();
    if(!task.questionPlanId||!Array.isArray(task.generatedQuestions)||task.generatedQuestions.length!==expected){
      return window.NEXZOShell?.toast?.(`Could not create task: expected ${expected} generated questions.`,'error');
    }
    const uid=submissionOwner();creationBusy=true;
    try{
      if(!window.NEXZOBackendStore?.putTask)throw new Error('Cloud task service is unavailable.');
      const result=await bounded(window.NEXZOBackendStore.putTask(task.id,task),25000,'Task save');
      if(submissionOwner()!==uid||!result.ok||result.task?.id!==task.id)throw new Error('Task cloud confirmation failed.');
      const confirmed=normalizeTask(result.task);
      if(!confirmed.questionPlanId||confirmed.generatedQuestions.length!==expected)throw new Error('Cloud task is missing its generated questions.');
      tasks=[confirmed,...tasks.filter(t=>t.id!==task.id)];saveTasks({cloud:false});
      window.NEXZOTaskStore?.upsert?.(confirmed,{cloud:false});
      filter='Pending';render();window.NEXZOShell?.toast?.(`${expected} questions generated and task saved.`,'success');
      latestAIPlan=null;renderSuggestion();
    }catch(e){
      // Do not create an unusable local-only academic task. Evaluation requires the
      // server-owned question plan/answer key to exist in the same account.
      window.NEXZOShell?.toast?.('Task was not created. '+e.message,'error');
    }
    finally{creationBusy=false;}
  }

  function startOfWeekMs(){
    const d=new Date();
    const prefs=safeParse(localStorage.getItem('nexzo_settings')||'{}',{});
    const day=String(prefs.weekStart||'Monday')==='Sunday'?d.getDay():(d.getDay()+6)%7;
    d.setHours(0,0,0,0);d.setDate(d.getDate()-day);
    return d.getTime();
  }
  function weeklyElapsed(t){
    const start=startOfWeekMs();
    const sessionMs=(Array.isArray(t.sessions)?t.sessions:[]).reduce((sum,session)=>{
      const ended=Number(session?.endedAt)||0;
      return sum+(ended>=start?Math.max(0,Number(session?.durationMs)||0):0);
    },0);
    // Weekly study time must never reuse a task's lifetime elapsed value.
    // Only sessions that actually ended in the current configured week count.
    // A currently running session contributes only when it started this week.
    const runningMs=t.running&&Number(t.lastStarted)>=start?Math.max(0,Date.now()-Number(t.lastStarted)):0;
    return sessionMs+runningMs;
  }
  function taskStatus(t){
    if(t.done)return 'Completed';
    if(t.submissionLocked)return t.score!=null?'Needs Improvement':'Submitted';
    if(isOverdue(t))return 'Overdue';
    if(t.running)return 'In Progress';
    if(Number(t.elapsed)>0)return 'Paused';
    return 'Pending';
  }
  function render(){
    const syncEl=$('plannerSyncStatus');
    if(syncEl){const sync=window.NEXZOTaskStore?.syncStatus?.(),state=sync?.state;syncEl.textContent=sync?.cacheAvailable===false&&state!=='cloud'?'Device cache full · Account sync pending':state==='cloud'?'Saved to cloud':state==='pending'?'Saved on this device · Cloud sync pending':'Saved on this device';}
    const canonical=window.NEXZOStateAuthority?.stats?.()||window.NEXZOTaskStore?.stats?.()||{};
    const total=Number(canonical.total??tasks.length)||0;
    const done=Number(canonical.completed??tasks.filter(t=>t.done).length)||0;
    const overdue=Number(canonical.overdue??tasks.filter(isOverdue).length)||0;
    const running=Number(canonical.running??tasks.filter(t=>t.running&&!t.done&&!isOverdue(t)).length)||0;
    const progress=Number(canonical.progress??(total?Math.round(done/total*100):0))||0;
    const weekMs=Math.max(0,Number(canonical.weekMinutes)||0)*60000;
    const accuracy=Math.max(0,Math.min(100,Number(canonical.accuracy)||0));
    if(els.statAccuracy)els.statAccuracy.textContent=accuracy+'%';
    updateEval(accuracy/10,Boolean(accuracy),true);
    if(els.statTotal)els.statTotal.textContent=total;
    if(els.statDone)els.statDone.textContent=done;
    if(els.statProgress)els.statProgress.textContent=progress+'%';
    if(els.statStreak)els.statStreak.textContent=Math.max(0,Number(canonical.streak)||0);
    if(els.statTime)els.statTime.textContent=weekMs?`${Math.floor(weekMs/3600000)}h ${Math.floor((weekMs%3600000)/60000)}m`:'0h';
    if(els.miniAll)els.miniAll.textContent=total;
    if(els.miniRunning)els.miniRunning.textContent=running;
    if(els.miniDone)els.miniDone.textContent=done;
    if(els.miniOverdue)els.miniOverdue.textContent=overdue;
    if(!els.taskList)return;
    let list=tasks.map((t,i)=>({...t,i}));
    if(filter==='Today')list=list.filter(isToday);
    if(filter==='Running')list=list.filter(t=>t.running&&!t.done&&!isOverdue(t));
    if(filter==='Pending')list=list.filter(t=>!t.done&&!t.submissionLocked&&!isOverdue(t));
    if(filter==='Completed')list=list.filter(t=>t.done);
    if(filter==='Overdue')list=list.filter(isOverdue);
    if(!list.length){els.taskList.innerHTML=`<div class="empty"><h3>No ${esc(filter)} tasks</h3><p>Create a smart task using your own input or selected options.</p></div>`;return;}
    els.taskList.innerHTML='<div class="table-head"><span>Time</span><span>Task</span><span>Subject</span><span>Type</span><span>Priority</span><span>Status</span><span>Action</span></div>'+list.map(rowHTML).join('');
    const openTaskUid=window.NEXZOSharedState?.currentUid?.()||window.NEXZOSharedState?.uid?.()||window.NEXZOFirebase?.auth?.currentUser?.uid||'guest';
    const openTaskKey=`nexzo:open-task-id:${openTaskUid}`;
    const requested=localStorage.getItem(openTaskKey);
    if(requested){const idx=tasks.findIndex(t=>String(t.id)===String(requested));const target=els.taskList.querySelector(`[data-task-row-id="${CSS.escape(String(requested))}"]`);if(target){target.classList.add('nx-task-target');setTimeout(()=>target.scrollIntoView({behavior:'smooth',block:'center'}),80);setTimeout(()=>target.classList.remove('nx-task-target'),2800);localStorage.removeItem(openTaskKey);}}
  }
  function rowHTML(t){
    const color=t.priority==='High'||t.priority==='Urgent'?'#ef4444':t.priority==='Medium'?'#f59e0b':'#22c55e';
    const status=taskStatus(t);
    const terminal=Boolean(t.done||t.submissionLocked);
    const timer=(!terminal&&!isOverdue(t))?`<div class="run-tools"><span class="task-timer" data-timer-index="${t.i}">⏱ ${formatTimer(elapsed(t))}</span><button type="button" class="timer-btn ${t.running?'pause':''}" data-timer-btn="${t.i}" aria-pressed="${t.running?'true':'false'}">${t.running?'Stop':'Start'}</button></div>`:'';
    const score=t.score!=null?`Score ${t.score}/10`:'Submit proof required';
    const blocked=isOverdue(t);
    const submitBtn=(t.done||t.submissionLocked)?'<button type="button" class="icon-btn" title="Submission locked" disabled style="opacity:.55;cursor:not-allowed">✓</button>':blocked?'<button type="button" class="icon-btn" title="Deadline passed — submission closed" disabled style="opacity:.45;cursor:not-allowed">⛔</button>':`<button type="button" class="icon-btn" data-submit-open="${t.i}" title="Submit task">⇧</button>`;
    const editBtn=t.locked||t.done||t.submissionLocked||blocked?'':`<button type="button" class="icon-btn" data-edit-task="${t.i}" title="Edit task">✎</button>`;
    return `<div class="task-row ${t.done?'done':t.submissionLocked?'submitted':isOverdue(t)?'overdue':''}" data-task-row-id="${esc(t.id)}" style="--x:${color}"><div class="time">${esc(t.time||'10:00')}<br><small>${Number(String(t.time||'10:00').split(':')[0])>=12?'PM':'AM'}</small></div><div class="task-title"><b>${esc(t.title)}</b><small>${esc(t.questions)} • ${esc(t.duration)} • ${esc(t.hours)} daily • 📍 ${esc(t.place)} • Deadline: ${esc(displayDeadline(t))}</small></div><div class="tag" style="--x:#a855f7">${esc(t.subject)}</div><div class="tag" style="--x:#06b6d4">${esc(t.type)}</div><div class="tag" style="--x:${color}">${esc(t.priority)}</div><div class="status-area"><span class="status-pill ${t.done?'done':t.submissionLocked?'submitted':isOverdue(t)?'overdue':t.running?'running':''}">${t.done?'✅':t.submissionLocked?'📨':isOverdue(t)?'⚠️':t.running?'▶':'⏸'} ${status}</span>${timer}<div class="progress"><span data-progress-index="${t.i}" style="--w:${t.done?100:(t.progress||0)}%"></span></div><span class="score-note">${esc(score)}</span></div><div class="actions"><button type="button" class="icon-btn" data-questions="${t.i}">?</button>${editBtn}${submitBtn}</div></div>`;
  }

  function isToday(t){
    const date=String(t.scheduledDate||t.deadline||t.created||'').slice(0,10);
    return date===todayISO(0);
  }
  function isOverdue(t){
    if(t.done||t.submissionLocked)return false;
    const parts=deadlineParts(t);
    const ms=Number(t.deadlineMs)||deadlineTimestamp(parts.date,parts.time);
    return Boolean(ms&&ms<=Date.now());
  }
  function elapsed(t){return Math.max(0,Number(t.elapsed)||0)+(t.running&&t.lastStarted?Math.max(0,Date.now()-Number(t.lastStarted)):0)}
  function formatTimer(ms){const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return h?`${h}h ${String(m).padStart(2,'0')}m`:`${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`}
  function stopTaskTimer(t,endedAt=Date.now()){
    if(!t)return false;
    const startedAt=Number(t.lastStarted)||0;
    if(t.running&&startedAt){
      const duration=Math.max(0,Number(endedAt)-startedAt);
      t.elapsed=Math.max(0,Number(t.elapsed)||0)+duration;
      t.actualMinutes=Math.max(0,Math.round(t.elapsed/60000));
      t.sessions=[...(Array.isArray(t.sessions)?t.sessions:[]),{startedAt,endedAt:Number(endedAt),durationMs:duration}].slice(-300);
    }
    const changed=Boolean(t.running||t.lastStarted);
    t.running=false;t.lastStarted=null;
    return changed;
  }
  function toggleTimer(i){
    const t=tasks[i];if(!t||t.done||t.submissionLocked||isOverdue(t))return;
    const now=Date.now();
    if(t.running){
      stopTaskTimer(t,now);t.status='paused';
      window.NEXZOShell?.toast?.(`Timer stopped at ${formatTimer(t.elapsed)}.`,'success');
    }else{
      t.running=true;t.lastStarted=now;t.status='in-progress';
      if(t.autoLock)t.locked=true;
      window.NEXZOShell?.toast?.('Study timer started.','success');
    }
    t.updatedAtMs=now;
    saveTasks({immediate:true});render();
  }

  function editTask(i){
    const t=tasks[i];if(!t||t.done||t.submissionLocked||t.locked)return;
    const title=prompt('Task title',t.title);if(title===null)return;
    const deadline=prompt('Deadline date (YYYY-MM-DD)',t.deadline||todayISO(1));if(deadline===null)return;
    const deadlineTime=prompt('Deadline time (HH:MM)',t.deadlineTime||'23:59');if(deadlineTime===null)return;
    t.title=title.trim()||t.title;t.deadline=deadline.trim()||t.deadline;t.scheduledDate=t.deadline;t.deadlineTime=(deadlineTime.trim()||'23:59').slice(0,5);t.deadlineMs=deadlineTimestamp(t.deadline,t.deadlineTime);t.updatedAtMs=Date.now();
    saveTasks({immediate:true});render();
  }

  function openQuestions(i){
    let t=tasks[i]; if(!t)return;
    const before=Array.isArray(t.generatedQuestions)?t.generatedQuestions.length:0;
    t=tasks[i]=normalizeTask(t,i);
    const list=Array.isArray(t.generatedQuestions)?t.generatedQuestions:[];
    if(!before&&list.length) saveTasks({immediate:true});
    els.qTitle.textContent=`Questions: ${t.subject}`;
    els.qSub.textContent=`${list.length} generated questions • ${t.level} • ${t.questionType||t.type}`;
    els.qList.innerHTML=list.length?list.map((q,idx)=>`<div class="q-item"><b>${idx+1}</b><div><h3>${esc(q).replace(/\n/g,'<br>')}</h3><p class="q-requirement">Answer this question in your submission.</p></div></div>`).join(''):`<div class="nx-ai-empty"><span>?</span><div><h3>${isMcqTask(t)?'Fresh quiz required':'No questions available'}</h3><p>${isMcqTask(t)?'This older/invalid MCQ task has no trustworthy answer key. Create a fresh MCQ task; NEXZO will not invent answers.':'Regenerate this task from Smart Suggestions.'}</p></div></div>`;
    if(t.submissionLocked&&t.score!=null){
      els.qList.innerHTML+=`<section class="q-item"><div><h3>Saved evaluation: ${esc(t.score)}/10 — ${esc(taskStatus(t))}</h3><p>${esc(t.aiFeedback||'No feedback was returned.')}</p><p>Source: ${esc(t.evaluationMode||'Not recorded')}</p><p>${esc(t.submittedAt||'')}</p>${[['Correctness',t.correctness],['Understanding',t.understanding],['Completeness',t.completeness],['Presentation',t.presentation]].map(([l,v])=>`<p>${l}: ${v==null?'Not provided':`${esc(v)}%`}</p>`).join('')}${(t.aiStrengths||t.strengths||[]).map(x=>`<p>Strength: ${esc(x)}</p>`).join('')}${(t.aiSuggestions||t.improvements||[]).map(x=>`<p>Improve: ${esc(x)}</p>`).join('')}<details><summary>Submitted answer</summary><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(t.submittedAnswer||'No text was recorded.')}</p></details></div></section>`;
    }
    if(!t.questionPlanId&&!t.serverVerified)els.qList.innerHTML+=`<button type="button" data-regenerate-task="${esc(t.id)}">Generate replacement preview</button>`;
    els.questionsBack.classList.add('show');
  }
  function closeQuestions(){els.questionsBack.classList.remove('show')}
  function openSubmit(i){
    if(submissionBusy)return;
    let index=Number(i);
    if(!Number.isInteger(index)||index<0||!tasks[index]||tasks[index].done||tasks[index].submissionLocked||isOverdue(tasks[index])){
      index=tasks.findIndex(t=>!t.done&&!t.submissionLocked&&!isOverdue(t));
    }
    if(index<0){alert(tasks.length?'No task is currently eligible for submission. Completed, already-submitted and overdue tasks are locked.':'Create a task first.');return;}
    activeIndex=index;
    activeTaskId=tasks[index].id;
    const t=tasks[index];
    if(!t)return;
    if(isMcqTask(t)&&!validMcqBundle(t.generatedQuestions,t.questionPlanId)){
      window.NEXZOShell?.toast?.('This MCQ task has no trustworthy saved answer key. Create a fresh randomized MCQ task.','error');
      openQuestions(index);return;
    }
    els.submitTitle.textContent=`Submit: ${t.title}`;
    if(els.proofFile)els.proofFile.value='';
    if(els.fileLabel)els.fileLabel.textContent='Drag & drop file here or click to browse';
    els.filePreview?.classList.remove('show');
    if(els.pasteAnswer)els.pasteAnswer.value=t.submissionDraftMode==='paste'?String(t.submissionDraftAnswer||''):'';if(els.writeAnswer)els.writeAnswer.value=t.submissionDraftMode==='write'?String(t.submissionDraftAnswer||''):'';if(els.submitNote)els.submitNote.value=t.submissionDraftMode==='upload'?String(t.submissionDraftNote||''):'';
    els.submitError?.classList.remove('show');
    if(els.submitStatus){els.submitStatus.style.display='none';els.submitStatus.textContent='';}
    const isMcq=isMcqTask(t);
    if(isMcq){renderMcqAttempt(t);submitTab('mcq');els.submitBack?.classList.add('mcq-submit');}
    else{submitTab('upload');els.submitBack?.classList.remove('mcq-submit');}
    els.submitBack.classList.add('show');
  }
  function closeSubmit(){if(!submissionBusy){els.submitBack.classList.remove('show','mcq-submit')}}
  function parseMcqQuestionBlock(value,index){
    const lines=String(value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const question=(lines.shift()||`Question ${index+1}`).replace(/^Q?\s*\d+\s*[.)-]?\s*/i,'').trim();
    const options={};
    for(const line of lines){const m=line.match(/^([A-D])\s*[).:-]\s*(.+)$/i);if(m)options[m[1].toUpperCase()]=m[2].trim();}
    return {question,options};
  }
  function renderMcqAttempt(task){
    if(!els.mcqMode)return;
    const qs=Array.isArray(task?.generatedQuestions)?task.generatedQuestions:[];
    const saved=parseMcqSubmission(String(task?.submissionDraftAnswer||''),qs.length);
    els.mcqMode.innerHTML=`<div class="nx-mcq-intro"><b>Answer the quiz</b><span>${qs.length} questions • one option per question • marked instantly from the saved answer key</span></div>`+qs.map((raw,i)=>{const row=parseMcqQuestionBlock(raw,i);return `<fieldset class="nx-mcq-card" data-mcq-question="${i}"><legend><span>Q${i+1}</span>${esc(row.question)}</legend><div class="nx-mcq-options">${['A','B','C','D'].map(letter=>`<label class="nx-mcq-option"><input type="radio" name="nx-mcq-${i}" value="${letter}" ${saved[i]===letter?'checked':''}><span class="nx-mcq-letter">${letter}</span><span>${esc(row.options[letter]||`Option ${letter}`)}</span></label>`).join('')}</div></fieldset>`}).join('');
  }
  function collectMcqAttempt(task){
    const total=Array.isArray(task?.generatedQuestions)?task.generatedQuestions.length:0,answers=[];
    for(let i=0;i<total;i++){const picked=els.mcqMode?.querySelector(`input[name="nx-mcq-${i}"]:checked`);answers.push(picked?.value||'');}
    return answers;
  }
  function submitTab(m){submitMode=m;document.querySelectorAll('[data-submit]').forEach(b=>{b.classList.toggle('active',b.dataset.submit===m);b.hidden=m==='mcq';});els.mcqMode?.classList.toggle('active',m==='mcq');els.uploadMode?.classList.toggle('active',m==='upload');els.pasteMode?.classList.toggle('active',m==='paste');els.writeMode?.classList.toggle('active',m==='write');}
  function readUploadedText(file){
    return new Promise(resolve=>{
      if(!file) return resolve('');
      const name=(file.name||'').toLowerCase();
      const type=(file.type||'').toLowerCase();
      const canRead=type.startsWith('text/') || /\.(txt|js|html|css|py|java|cpp|c|json|md)$/i.test(name);
      if(!canRead) return resolve('');
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||''));
      reader.onerror=()=>resolve('');
      reader.readAsText(file);
    });
  }
  function parseMcqSubmission(text,total){
    const source=String(text||'').toUpperCase();
    const answers=new Array(total).fill('');
    const explicit=/Q(?:UESTION)?\s*(\d+)\s*(?:[-—:.)]|=>)?\s*(?:ANSWER\s*[:=-]?\s*)?([A-D])\b/g;
    let match;
    while((match=explicit.exec(source))){const index=Number(match[1])-1;if(index>=0&&index<total)answers[index]=match[2];}
    if(answers.filter(Boolean).length<total){
      const lines=source.split(/\n+/).map(x=>x.trim()).filter(Boolean);
      for(const line of lines){
        const m=line.match(/^(?:Q)?\s*(\d+)\s*(?:[-—:.)]|=>)?\s*([A-D])\b/);if(m){const i=Number(m[1])-1;if(i>=0&&i<total&&!answers[i])answers[i]=m[2];}
      }
    }
    if(answers.filter(Boolean).length===0){
      const only=source.match(/\b[A-D]\b/g)||[];
      if(only.length===total)only.forEach((letter,i)=>answers[i]=letter);
    }
    return answers;
  }

  function normalizeAIResult(data){
    if(data?.score==null||data.score===''||typeof data.score==='boolean'||!Number.isFinite(Number(data.score))||Number(data.score)<0||Number(data.score)>10||typeof data.feedback!=='string'||!data.feedback.trim())throw new Error('Evaluator returned an invalid score or missing feedback. No result was saved.');
    const score=Number(data.score);
    const strengths=Array.isArray(data?.strengths)?data.strengths:[data?.strengths].filter(Boolean);
    const improvements=Array.isArray(data?.improvements)?data.improvements:[data?.improvements].filter(Boolean);
    const metric=(...values)=>{const value=values.find(v=>v!==undefined&&v!==null&&v!=='');return Number.isFinite(Number(value))?Math.max(0,Math.min(100,Number(value))):null;};
    return {score,accepted:score>=4,feedback:String(data.feedback),strengths,improvements,modelAnswer:String(data?.modelAnswer||''),correctness:metric(data.correctness,data.correct),understanding:metric(data.understanding,data.comprehension),completeness:metric(data.completeness,data.complete),presentation:metric(data.presentation,data.clarity)};
  }

  async function submitForAI(){
    const t=tasks.find(task=>task.id===activeTaskId);if(!t||submissionBusy)return;
    const taskId=t.id,ownerAtStart=submissionOwner(),modeAtStart=submitMode,isMcq=isMcqTask(t);
    const submitButton=document.querySelector('[data-nx-click="nzpSubmitForAI"]');
    submissionBusy=true;
    if(submitButton){submitButton.disabled=true;submitButton.textContent='Evaluating…';}
    let quick=null;
    const sameOwner=()=>submissionOwner()===ownerAtStart;
    const present=(result,saved=false)=>{
      updateEval(result.score,result.accepted,false,result);
      const rows=result.questionResults||[];
      const correct=rows.filter(q=>Number(q.score)===10).length;
      const counts=isMcq&&rows.length?`Score: ${correct} / ${rows.length} · ${Math.round(correct/rows.length*100)}% · Correct: ${correct} · Incorrect: ${rows.length-correct}`:`${result.score.toFixed(1)}/10`;
      els.submitStatus.className='status show '+(result.accepted?'good':'bad');
      els.submitStatus.innerHTML=`<b>${result.accepted?(saved?'Completed':'Passed'):'Needs improvement'} · ${esc(counts)}</b><p>${esc(result.feedback)}</p>${rows.map((q,i)=>`<p>Q${i+1}: ${esc(q.feedback)}</p>`).join('')}<p>${saved?(result.replay?'Saved result already confirmed. No rewards added on replay.':`Saved to your account. ${Number(result.receipt.xpAwarded)||0} XP confirmed by the server.`):'Marked by the server. Saving result; completion and XP await confirmation.'}</p>`;
    };
    try{
      if(t.serverVerified&&t.evaluationId&&t.score!=null){present({...normalizeAIResult({score:t.score,feedback:t.aiFeedback||t.feedback,strengths:t.aiStrengths,improvements:t.aiSuggestions}),questionResults:t.questionResults||[],receipt:{xpAwarded:0},replay:true},true);return;}
      if(t.done||t.submissionLocked)throw new Error('This task has already been submitted. Its saved result is preserved.');
      if(isOverdue(t))throw new Error('Deadline passed. Submission is closed for this task.');
      const file=els.proofFile?.files?.[0],paste=(els.pasteAnswer?.value||'').trim(),write=(els.writeAnswer?.value||'').trim(),note=(els.submitNote?.value||'').trim();
      const choices=isMcq?collectMcqAttempt(t):[];
      let answer=isMcq?choices.map((x,i)=>`Q${i+1}—${x}`).join(', '):(modeAtStart==='paste'?paste:modeAtStart==='write'?write:note);
      if(isMcq&&(!choices.length||choices.some(x=>!x)))throw new Error(`Answer every MCQ before submitting (${choices.filter(Boolean).length}/${choices.length} answered).`);
      if(!isMcq&&modeAtStart==='upload'&&!file)throw new Error('Upload a supported image, PDF, text or code file first.');
      if(!isMcq&&modeAtStart==='paste'&&!paste)throw new Error('Paste answer first.');
      if(!isMcq&&modeAtStart==='write'&&!write)throw new Error('Write answer first.');
      els.submitError?.classList.remove('show');
      Object.assign(t,{submissionDraftMode:modeAtStart,submissionDraftAnswer:modeAtStart==='upload'?'':answer,submissionDraftNote:note,submissionDraftUpdatedAtMs:Date.now(),updatedAtMs:Date.now()});
      // Drafts are device cache; do not resave every task through cloud before marking.
      saveTasks({cloud:false});
      els.submitStatus.style.display='block';els.submitStatus.className='status show';els.submitStatus.textContent='Checking your submission…';
      if(!isMcq&&modeAtStart==='upload'){
        const localText=await bounded(readUploadedText(file),5000,'Reading submission');
        if(localText.trim())answer=[note,localText].filter(Boolean).join('\n');
        else{
          if(!window.NEXZOAI?.analyze)throw new Error('AI file analysis service is not loaded.');
          const analyzed=await bounded(window.NEXZOAI.analyze(file,`Extract the actual student answer for ${t.title} (${t.subject}, ${t.type}, ${t.level}). Do not invent missing work. Note: ${note}`),30000,'File analysis');
          answer=[note,analyzed?.reply].filter(Boolean).join('\n');
        }
      }
      if(!answer.trim())throw new Error('No readable answer was found in the submission.');
      if(isMcq){
        if(!window.NEXZOAI?.gradeMcq)throw new Error('Instant MCQ marker is not loaded.');
        const raw=await bounded(window.NEXZOAI.gradeMcq({taskId:t.id,answer}),12000,'MCQ marking');
        if(!sameOwner())return;
        quick={...normalizeAIResult(raw),questionResults:raw.questionResults||[]};present(quick);
        if(submitButton)submitButton.textContent='Saving result…';
      }
      if(!window.NEXZOAI?.evaluate)throw new Error('Evaluation service is not loaded.');
      const data=await bounded(window.NEXZOAI.evaluate({taskId:t.id,answer}),isMcq?12000:30000,'Saving verified evaluation');
      if(!sameOwner())return;
      if(!data?.persisted||!data.serverVerified||data.task?.id!==taskId)throw new Error('Evaluation cloud confirmation failed. Retry safely to read its saved result.');
      const result={...normalizeAIResult(data),questionResults:data.questionResults||[],receipt:data};
      const saved=data.task;
      tasks=[...tasks.filter(x=>x.id!==taskId),normalizeTask(saved)];saveTasks({cloud:false});render();present(result,true);
      try{window.NEXZOStreakSystem?.markStudy?.({source:'planner',id:`submission:${taskId}`,label:saved.title});}catch{/* A confirmed evaluation remains successful when optional device streak cache is full. */}
      window.dispatchEvent(new CustomEvent('nexzo:planner-updated',{detail:{source:'server-evaluation',task:saved}}));
      // Reward refresh is background work; its failure cannot strand the Evaluate button.
      if(window.NEXZOGamificationEngine?.refreshVerifiedRewards)bounded(Promise.resolve().then(()=>window.NEXZOGamificationEngine.refreshVerifiedRewards()),8000,'Reward refresh').catch(error=>window.dispatchEvent(new CustomEvent('nexzo:cloud-status',{detail:{area:'rewards',status:'offline',message:error.message}})));
    }catch(error){
      if(!sameOwner())return;
      els.submitStatus.style.display='block';
      if(quick){present(quick);els.submitStatus.innerHTML+=`<p role="alert">Result save not confirmed: ${esc(error.message)} Your selections are preserved. Retry saving safely; XP is not duplicated.</p>`;}
      else{els.submitStatus.className='status show bad';els.submitStatus.innerHTML=`<p role="alert">Evaluation failed: ${esc(error.message)}</p><p>No score, completion or XP was awarded by this failed attempt. Your answers are preserved; retry.</p>`;}
    }finally{
      submissionBusy=false;
      if(submitButton){submitButton.disabled=false;submitButton.textContent='Evaluate submission';}
    }
  }
  function showSubmitError(msg){els.submitError.textContent=msg;els.submitError.classList.add('show')}
  function updateEval(score,pass,silent=false,detail={}){
    const numeric=Math.max(0,Math.min(10,Number(score)||0));
    if(els.scoreText)els.scoreText.textContent=numeric.toFixed(1);
    els.scoreRing?.style.setProperty('--score',Math.round(numeric*10));
    ['barCorrect','barUnderstand','barComplete','barPresent'].forEach((id,index)=>{const el=$(id);if(el){const value=detail[['correctness','understanding','completeness','presentation'][index]];el.style.setProperty('--w',value==null?'0%':`${value}%`);const b=el.closest('.bar-row')?.querySelector('b');if(b){b.textContent=value==null?'—':`${value}%`;if(value==null)b.dataset.missingRubric='true';else delete b.dataset.missingRubric;}}});
    if(els.evalFeedback)els.evalFeedback.textContent=detail.feedback||'No saved evaluation yet.';
  }
  let lastDeadlineRefreshBucket=-1;
  function refreshTimers(){
    let changed=false,deadlineChanged=false;
    document.querySelectorAll('[data-timer-index]').forEach(el=>{const t=tasks[Number(el.dataset.timerIndex)];if(t)el.textContent='⏱ '+formatTimer(elapsed(t));});
    tasks.forEach(t=>{
      if(t.submissionLocked&&t.running){
        stopTaskTimer(t,Number(t.submittedAtMs)||Date.now());t.status=t.done?'completed':'submitted';t.updatedAtMs=Date.now();deadlineChanged=true;changed=true;
      }else if(isOverdue(t)&&t.running){
        const now=Date.now(),duration=Math.max(0,now-Number(t.lastStarted||now));
        t.elapsed=Math.max(0,Number(t.elapsed)||0)+duration;t.running=false;t.lastStarted=null;t.status='overdue';t.updatedAtMs=now;deadlineChanged=true;changed=true;
      }else if(t.running){changed=true;t.progress=Math.min(95,Math.max(Number(t.progress)||0,Math.round((elapsed(t)/3600000)*20)));t.updatedAtMs=Date.now();}
    });
    const bucket=Math.floor(Date.now()/30000);
    if(bucket!==lastDeadlineRefreshBucket){lastDeadlineRefreshBucket=bucket;render();}
    if(deadlineChanged)saveTasks({immediate:true});
    else if(changed&&Date.now()-lastTimerCacheWrite>=15000){lastTimerCacheWrite=Date.now();saveTasks({cloud:false});}
  }

  window.nzpAnalyzePrompt=()=>{if(getInput())applyPromptAnalysis(false);return requestAIPlan();}; window.nzpCreateTask=createTask; window.nzpOpenSubmit=openSubmit; window.nzpCloseQuestions=closeQuestions; window.nzpCloseSubmit=closeSubmit; window.nzpSubmitForAI=submitForAI; window.nzpSubmitMode=submitTab;
  window.nzpSetMode=(m)=>{mode=m;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===m)); if(els.modeLabel)els.modeLabel.textContent=m==='ai'?'AI Assist':m==='manual'?'Manual':'Recommended'; if(els.promptPanel)els.promptPanel.style.display=m==='manual'?'none':'block'; els.recPanel?.classList.toggle('active',m==='recommended'); renderSuggestion();};
  window.nzpApplyRec=(name)=>{const map={'DSA Placement Track':['DSA','Coding Practice','Intermediate','5 Coding Problems','5 Days','High','Library','2 Hours','Prepare DSA arrays and linked list for placement with coding problems.'],'DBMS Exam Revision':['DBMS','Previous Year Questions','Intermediate','10 Questions','3 Days','High','Home','2 Hours','Prepare DBMS normalization, SQL joins and ACID for exam.'],'Web Development Project':['Web Dev','Project Work','Intermediate','1 Mini Project','7 Days','Medium','Computer Lab','3 Hours','Create a web development mini project with checklist.']}; const v=map[name]; if(!v)return;els.taskSubject.value=v[0];refreshTaskOptions();[els.taskType.value,els.taskLevel.value,els.taskQuestions.value,els.taskDuration.value,els.taskPriority.value,els.taskPlace.value,els.taskDailyHours.value,els.smartPrompt.value]=v.slice(1); renderSuggestion();};
  window.nzpEnhance=(x)=>{const add={placement:' Make it placement-focused.',breakdown:' Break it into daily steps.',deadline:' Add deadline and daily plan.',resources:' Include resources and practice links.'}; if(!getInput()) els.smartPrompt.focus(); els.smartPrompt.value=(getInput()||'')+(add[x]||''); applyPromptAnalysis();};
  window.nzpClearForm=()=>{els.smartPrompt.value='';els.taskSubject.value='';refreshTaskOptions();els.taskType.value='';els.taskLevel.value='Beginner';els.taskQuestions.value='';els.taskDuration.value='2 Days';els.taskPriority.value='Medium';els.taskPlace.value='Home';els.taskDailyHours.value='1 Hour';els.taskDate.value=todayISO(3);if(els.taskDeadlineTime)els.taskDeadlineTime.value='23:59';renderSuggestion();};
  window.nzpSetSuggestion=(s)=>{activeSug=s;syncSugTabs();renderSuggestion();};
  window.nzpSetFilter=(f)=>{filter=f;document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));render();};
  window.nzpEvalDemo=()=>{
    const pool=(tasks||[]).filter(t=>Number(t.score||t.aiScore||t.evalScore)>0);
    const t=pool[pool.length-1] || tasks[activeIndex] || tasks[tasks.length-1];
    const score=Number(t?.score||t?.aiScore||t?.evalScore||0);
    if(score>0){updateEval(score,true,false,t);}
    else {updateEval(0,false,true,{}); if(els.evalFeedback)els.evalFeedback.textContent='No saved evaluation yet.';}
  };

  function init(){
    if(window.__NEXZO_PLANNER_INIT_DONE__) return;
    window.__NEXZO_PLANNER_INIT_DONE__=true;
    tasks=readTasks(); initSelects();
    const d=new Date(); if(els.todayDate)els.todayDate.textContent=d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); if(els.todayDay)els.todayDay.textContent=d.toLocaleDateString('en-US',{weekday:'long'});
    const plannerForm=document.querySelector('.planner-page form.panel');
    if(plannerForm && !plannerForm.dataset.nzpBound){plannerForm.dataset.nzpBound='1';plannerForm.addEventListener('submit',createTask);}
    els.smartPrompt?.addEventListener('input',()=>{clearTimeout(window.__nzpInput); window.__nzpInput=setTimeout(()=>{latestAIPlan=null;applyPromptAnalysis(false)},80)});
    $('taskSubject')?.addEventListener('change',()=>{latestAIPlan=null;replacementContext=null;refreshTaskOptions();renderSuggestion()});
    $('taskType')?.addEventListener('change',()=>{latestAIPlan=null;refreshTargetOptions();renderSuggestion()});
    $('taskQuestions')?.addEventListener('change',()=>{latestAIPlan=null;renderSuggestion()});
    ['taskLevel','taskQuestions','taskDuration','taskPriority','taskPlace','taskDate','taskDeadlineTime','taskDailyHours'].forEach(id=>$(id)?.addEventListener('change',renderSuggestion));
    els.proofFile?.addEventListener('change',()=>{const f=els.proofFile.files[0]; if(f){els.fileLabel.textContent=f.name; els.filePreview.textContent=`✅ Selected: ${f.name} (${Math.ceil(f.size/1024)} KB)`; els.filePreview.classList.add('show');}});
    document.addEventListener('click',e=>{if(e.target.closest('[data-generate-preview]'))return requestAIPlan();if(e.target.closest('[data-regenerate-task]'))return regenerateLegacyTask(e.target.closest('[data-regenerate-task]').dataset.regenerateTask);const q=e.target.closest('[data-questions]');if(q)openQuestions(Number(q.dataset.questions));const submit=e.target.closest('[data-submit-open]');if(submit)openSubmit(Number(submit.dataset.submitOpen));const timer=e.target.closest('[data-timer-btn]');if(timer){e.preventDefault();toggleTimer(Number(timer.dataset.timerBtn));}const edit=e.target.closest('[data-edit-task]');if(edit)editTask(Number(edit.dataset.editTask));});
    const refreshFromStorage=()=>{
      const latest=readTasks();
      const before=JSON.stringify(tasks.map(t=>[t.id,t.updatedAtMs,t.done,t.progress,t.elapsed]));
      const after=JSON.stringify(latest.map(t=>[t.id,t.updatedAtMs,t.done,t.progress,t.elapsed]));
      if(before!==after){tasks=latest;render();renderSuggestion();}
    };
    window.addEventListener('storage',event=>{if([PRIMARY_KEY,'nexzo_planner_tasks_v5','nexzoTasks','plannerTasks'].includes(event.key))refreshFromStorage();});
    window.NEXZOTaskStore?.subscribe?.(event=>{if(!['local','set-all'].includes(event.source)){const latest=event.tasks.map(normalizeTask);const before=JSON.stringify(tasks.map(t=>[t.id,t.updatedAtMs]));const after=JSON.stringify(latest.map(t=>[t.id,t.updatedAtMs]));if(before!==after){tasks=latest;render();renderSuggestion();}}});
    window.addEventListener('nexzo:tasks-updated',event=>{if(event.detail?.source==='firestore')refreshFromStorage();});
    const persistRunning=()=>{
      const now=Date.now();
      tasks.forEach(t=>{if(t.running){const duration=Math.max(0,now-Number(t.lastStarted||now));t.elapsed=Math.max(0,Number(t.elapsed)||0)+duration;t.sessions=[...(t.sessions||[]),{startedAt:Number(t.lastStarted)||now,endedAt:now,durationMs:duration}].slice(-300);t.lastStarted=now;t.updatedAtMs=now;}});
      saveTasks({cloud:false});
      window.NEXZOTaskStore?.flush?.();
    };
    window.addEventListener('pagehide',persistRunning);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persistRunning();});
    // Warm Render once while the student reads the page; never block UI or retry in a loop.
    if(window.NEXZOAI?.probe)window.NEXZOAI.probe(window.NEXZOAI.apiBase(),5000).catch(()=>{});
    renderSuggestion();render();clearInterval(window.__nzpTick);window.__nzpTick=setInterval(refreshTimers,1000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
