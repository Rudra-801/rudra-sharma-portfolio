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
  const ids = ['smartPrompt','taskSubject','taskType','taskLevel','taskQuestions','taskDuration','taskPriority','taskPlace','taskDate','taskDeadlineTime','taskDailyHours','aiPreview','roadTitle','roadSub','taskList','modeLabel','promptPanel','recPanel','statTotal','statDone','statTime','statAccuracy','statStreak','statProgress','miniAll','miniRunning','miniDone','miniOverdue','todayDate','todayDay','questionsBack','qTitle','qSub','qList','submitBack','submitTitle','proofFile','fileLabel','filePreview','pasteAnswer','writeAnswer','submitNote','submitError','submitStatus','uploadMode','pasteMode','writeMode','scoreText','scoreRing','evalFeedback'];
  ids.forEach(id=>els[id]=$(id));

  const {SUBJECTS,TYPES,LEVELS,COUNTS,DURATIONS,PRIORITIES,PLACES,HOURS,BANK}=window.NEXZOPlannerData||{};
  let mode='ai', activeSug='Roadmaps', filter='All', submitMode='upload', activeIndex=0, submissionBusy=false;
  let tasks=[];
  let latestAIPlan=null;
  
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
  function normalizeTask(task,index=0){
    const done=Boolean(task?.done||task?.completed||String(task?.status||'').toLowerCase()==='completed'||Number(task?.progress)>=100);
    const submissionLocked=Boolean(task?.submissionLocked);
    const terminal=done||submissionLocked;
    const running=Boolean(!terminal&&task?.running&&task?.lastStarted);
    const deadline=String(task?.deadline||task?.scheduledDate||'').slice(0,10);
    const deadlineTime=String(task?.deadlineTime||'23:59').slice(0,5)||'23:59';
    const parsedDeadlineMs=Number(task?.deadlineMs)||deadlineTimestamp(deadline,deadlineTime);
    return {
      ...task,
      id:taskId(task,index),
      title:String(task?.title||task?.name||'Study Task').slice(0,120),
      subject:String(task?.subject||task?.track||'General').slice(0,80),
      type:String(task?.type||task?.taskType||'Study').slice(0,70),
      level:String(task?.level||task?.difficulty||'Beginner').slice(0,40),
      done,
      completed:done,
      submissionLocked,
      status:done?'completed':submissionLocked?'submitted':running?'in-progress':String(task?.status||'pending').toLowerCase(),
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
    if(window.NEXZOTaskStore?.getAll)return window.NEXZOTaskStore.getAll().map(normalizeTask);
    const arr=safeParse(localStorage.getItem(PRIMARY_KEY)||'[]',[]);
    return Array.isArray(arr)?arr.map(normalizeTask):[];
  }
  function writeLocalCache(){
    const copy=tasks.map(normalizeTask);
    if(window.NEXZOTaskStore?.setAll)window.NEXZOTaskStore.setAll(copy,{cloud:false});
    else localStorage.setItem(PRIMARY_KEY,JSON.stringify(copy));
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
  function subjectBase(sub){return BANK[sub]||BANK['DSA'];}
  function getInput(){return (els.smartPrompt?.value||'').trim();}

  function fillSelect(el, arr, placeholder){
    if(!el) return;
    el.innerHTML = `<option value="">${placeholder}</option>` + arr.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  }
  function initSelects(){
    fillSelect(els.taskSubject,SUBJECTS,'Select Subject');
    fillSelect(els.taskType,TYPES,'Select Task Type');
    fillSelect(els.taskLevel,LEVELS,'Select Level');
    fillSelect(els.taskQuestions,COUNTS,'Select Questions');
    fillSelect(els.taskDuration,DURATIONS,'Select Duration');
    fillSelect(els.taskPriority,PRIORITIES,'Select Priority');
    fillSelect(els.taskPlace,PLACES,'Select Study Place');
    fillSelect(els.taskDailyHours,HOURS,'Select Daily Hours');
    if(els.taskLevel) els.taskLevel.value='Beginner';
    if(els.taskQuestions) els.taskQuestions.value='5 Questions';
    if(els.taskDuration) els.taskDuration.value='2 Days';
    if(els.taskPriority) els.taskPriority.value='Medium';
    if(els.taskPlace) els.taskPlace.value='Home';
    if(els.taskDailyHours){const prefs=safeParse(localStorage.getItem('nexzo_settings')||'{}',{});const desired=String(prefs.defaultStudyTime||'1 Hour').replace('30 Minutes','30 Min');els.taskDailyHours.value=[...els.taskDailyHours.options].some(o=>o.value===desired)?desired:'1 Hour';}
    if(els.taskDate) els.taskDate.value=todayISO(3);
    if(els.taskDeadlineTime) els.taskDeadlineTime.value='23:59';
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

  async function requestAIPlan(){
    if(!window.NEXZOAI?.planner)return null;
    const input=getInput();if(!input)return null;
    const payload={subject:els.taskSubject.value||detectSubject(input)||'General',taskType:els.taskType.value||detectType(input)||'Practice Questions',level:els.taskLevel.value||detectLevel(input)||'Beginner',questionCount:els.taskQuestions.value,duration:els.taskDuration.value,dailyHours:els.taskDailyHours.value,prompt:input};
    if(els.roadSub)els.roadSub.textContent='Preparing personalized suggestions…';
    try{
      const plan=await window.NEXZOAI.planner(payload);latestAIPlan=plan&&typeof plan==='object'?plan:null;
      const rows=(Array.isArray(plan?.tasks)?plan.tasks:[]).flatMap(task=>Array.isArray(task?.questions)&&task.questions.length?task.questions:[task?.description||task?.title]).filter(Boolean).slice(0,countNum());
      if(rows.length&&els.aiPreview){els.roadTitle.textContent=plan.title||'Personalized Study Plan';els.roadSub.textContent=plan.tip||'Generated from your study inputs';els.aiPreview.innerHTML=buildSuggestionMarkup(rows,payload.subject,payload.taskType,payload.level);$('sugCreateBtn')?.addEventListener('click',()=>createTask());$('sugResBtn')?.addEventListener('click',()=>{activeSug='Resources';syncSugTabs();renderSuggestion();});}
      return plan;
    }catch(error){latestAIPlan=null;if(els.roadSub)els.roadSub.textContent=`Local suggestions shown • AI: ${error.message}`;return null;}
  }
  function applyPromptAnalysis(useCloud=false){
    const input=getInput();
    if(!input){latestAIPlan=null;renderSuggestion();return false;}
    const sub=detectSubject(input)||els.taskSubject?.value||'General';
    const type=detectType(input)||els.taskType?.value||'Practice Questions';
    const lvl=detectLevel(input), cnt=detectCount(input);
    if(sub)els.taskSubject.value=sub;if(type)els.taskType.value=type;if(lvl)els.taskLevel.value=lvl;
    if(/urgent|deadline|placement|exam|tomorrow/i.test(input))els.taskPriority.value='High';
    if(cnt){let suffix=(els.taskType.value==='MCQ Practice')?'MCQs':(els.taskType.value==='Coding Practice')?'Coding Problems':'Questions';let val=`${cnt} ${suffix}`;if(![...els.taskQuestions.options].some(o=>o.value===val))els.taskQuestions.insertAdjacentHTML('beforeend',`<option value="${esc(val)}">${esc(val)}</option>`);els.taskQuestions.value=val;}
    renderSuggestion();
    if(useCloud)requestAIPlan();
    return true;
  }

  function levelVariant(question, sub, level, idx){
    const q = String(question || `${sub} practice task ${idx+1}`).replace(/^Q?\d+\.?\s*/,'').trim();
    if(level === 'Beginner'){
      return q
        .replace(/Optimize|advanced|complex/ig,'Explain')
        .replace(/without using extra space/ig,'with basic approach');
    }
    if(level === 'Advanced'){
      if(/array/i.test(q)) return `${q} Also explain the optimized approach, edge cases and time/space complexity.`;
      if(/sql|dbms|normalization|transaction/i.test(q)) return `${q} Include a real database scenario and justify the design decision.`;
      if(/ai|machine|model|bayes/i.test(q)) return `${q} Explain assumptions, limitations and one practical use case.`;
      if(/web|api|react|javascript/i.test(q)) return `${q} Include validation, error handling and performance considerations.`;
      return `${q} Explain with advanced reasoning, edge cases and final conclusion.`;
    }
    return `${q} Explain with an example and clear steps.`;
  }

  function mcqAnswerLetter(i, sub='', level='Beginner'){
    // deterministic mixed answers: A/B/C/D rotate with subject + level + index, never all A
    const seed = (String(sub).length * 7) + (String(level).length * 3) + (i * 5);
    return ['A','B','C','D'][seed % 4];
  }
  function mcqOptions(sub, level, idx){
    const correctByLevel = level === 'Advanced'
      ? 'Optimized and conceptually correct answer considering edge cases'
      : level === 'Intermediate'
        ? 'Correct application of the concept'
        : 'Correct basic concept related to ' + sub;
    const wrong = level === 'Advanced'
      ? ['Naive answer with limitation','Partially correct but misses constraints','Wrong conclusion']
      : level === 'Intermediate'
        ? ['Partially related option','Incorrect approach','Not applicable']
        : ['Partially related option','Incorrect option','Not applicable'];
    const opts = [wrong[0], wrong[1], wrong[2], wrong[0]];
    const pos = ['A','B','C','D'].indexOf(mcqAnswerLetter(idx, sub, level));
    opts[pos] = correctByLevel;
    return opts;
  }

  function buildQuestions(sub,type,level,count,input){
    sub=sub||detectSubject(input)||'General';
    type=type||detectType(input)||'Practice Questions';
    level=level||detectLevel(input)||'Beginner';
    const base=subjectBase(sub).slice();
    const topic=(input||'').replace(/\s+/g,' ').slice(0,120);
    const out=[];
    for(let i=0;i<count;i++){
      const raw=base[i%base.length] || `${sub} practice task ${i+1}`;
      const b=levelVariant(raw, sub, level, i);
      if(type==='MCQ Practice' || /mcq/i.test(type)){
        const opts=mcqOptions(sub, level, i);
        out.push(`Q${i+1}. ${b}\nA) ${opts[0]}\nB) ${opts[1]}\nC) ${opts[2]}\nD) ${opts[3]}`);
      }else if(type==='Coding Practice'){
        const extra = level==='Beginner' ? 'Use simple logic and explain every step.' : level==='Advanced' ? 'Use an optimized solution and mention edge cases plus complexity.' : 'Use efficient logic and explain time complexity.';
        out.push(`Problem ${i+1}: ${b}\nRequirement: Write clean code. ${extra}`);
      }else if(type==='Lab / Practical'){
        out.push(`Practical ${i+1}: ${b}\nAim: Perform the task practically.\nRequired proof: steps, output screenshot/photo and short observation.`);
      }else if(type==='Project Work'){
        const scope = level==='Beginner' ? 'basic working demo' : level==='Advanced' ? 'complete project with validation, storage and deployment notes' : 'functional mini project with clear UI/logic';
        out.push(`Project Task ${i+1}: Build a ${scope} for ${sub} around ${topic||b}.\nDeliverables: explanation, screenshots and final output.`);
      }else if(type==='Previous Year Questions'){
        out.push(`PYQ ${i+1}: ${b}\nWrite an exam-style answer with definition, steps, example/diagram and conclusion.`);
      }else if(type==='Short Questions'){
        out.push(`Short Q${i+1}: ${b}\nAnswer briefly with key points and one example.`);
      }else if(type==='Long Questions'){
        out.push(`Long Q${i+1}: ${b}\nExplain in detail with definition, working/steps, diagram/example, advantages and conclusion.`);
      }else if(type==='Case Study'){
        out.push(`Case Study ${i+1}: Apply ${sub} concept to this scenario: ${topic || b}.\nAnalyze problem, approach, result and limitations.`);
      }else{
        out.push(`${i+1}. ${b}\nComplete with explanation, example and final answer/output.`);
      }
    }
    return out;
  }

  function buildAnswerKey(task){
    const type=task?.type || '';
    const qs=task?.generatedQuestions || [];
    if(/mcq/i.test(type)){
      const key = Array.isArray(task.answerKey) && task.answerKey.length ? task.answerKey : qs.map((_,i)=>mcqAnswerLetter(i, task.subject, task.level));
      return key.map((x,i)=>`Q${i+1}: ${x}`).join(' | ');
    }
    if(/coding/i.test(type)) return 'Expected: correct logic/code, sample output, and time/space complexity.';
    if(/practical|lab/i.test(type)) return 'Expected: proof screenshot/photo, steps performed, output and observation.';
    if(/project/i.test(type)) return 'Expected: working project proof, explanation, screenshots and final output.';
    return 'Expected: clear explanation, correct concept, example/output and complete answer.';
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
      return `<section class="nx-roadmap-summary"><span class="nx-roadmap-icon">🗺️</span><div><h4>Smart Roadmap: ${esc(sub)}</h4><p><b>1.</b> Revise concepts <i>→</i> <b>2.</b> Solve selected questions <i>→</i> <b>3.</b> Submit proof for AI verification.</p></div></section><section class="nx-generated-questions"><header><div><span>📌</span><h4>Generated Questions</h4></div><small>${esc(type)} • ${esc(level)}</small></header><div class="nx-question-list">${rows}</div></section>${actions}`;
    }
    return `<section class="nx-generated-questions nx-generated-questions--${activeSug.toLowerCase()}"><header><div><span>${activeSug==='Mistakes'?'✓':'📌'}</span><h4>${esc(els.roadTitle.textContent)}</h4></div><small>${esc(level)}</small></header><div class="nx-question-list">${rows}</div></section>${actions}`;
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
    const questions=buildQuestions(sub,type,level,countNum(),input);
    els.roadTitle.textContent = activeSug==='Roadmaps'?'Smart Roadmap':activeSug==='Topics'?`${sub} Important Topics`:activeSug==='Practice'?`${sub} ${type}`:activeSug==='Mistakes'?'Submission Mistake Checker':`${sub} Resources`;
    els.roadSub.textContent = activeSug==='Roadmaps'?'Generated from your input':activeSug==='Topics'?'Topics based on your selected task':activeSug==='Practice'?'Questions match your task type and level':activeSug==='Mistakes'?'These points will be checked during submission':'Useful links based on your task';
    if(activeSug==='Resources'){
      const q=encodeURIComponent(`${sub} ${level} ${type}`);
      els.aiPreview.innerHTML=`<div class="nx-resource-grid">${['YouTube Videos','Notes PDF','Practice Questions','Previous Papers','Interview Questions'].map((x,i)=>`<a class="resource-link nx-resource-link" target="_blank" href="https://www.google.com/search?q=${q}+${encodeURIComponent(x)}"><span>${['▶','▤','◎','◫','◆'][i]}</span><b>${x}</b><em>Open →</em></a>`).join('')}</div>`;
      return;
    }
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
    const qs=aiQuestions.length?aiQuestions:buildQuestions(sub,type,level,count,input);
    const shortTitle=(title || latestAIPlan?.title || input.split(/[.!?]/)[0] || `${sub} - ${type}`).slice(0,80);
    const now=new Date();
    return normalizeTask({
      id:window.crypto?.randomUUID?.()||`task_${Date.now()}_${Math.random().toString(36).slice(2,9)}`,
      subject:sub,type,level,questions:els.taskQuestions.value||`${count} Questions`,generatedQuestions:qs,
      answerKey:/mcq/i.test(type)?qs.map((_,i)=>mcqAnswerLetter(i,sub,level)):null,
      duration:els.taskDuration.value||'2 Days',priority:els.taskPriority.value||'Medium',place:els.taskPlace.value||'Home',
      deadline:els.taskDate.value||todayISO(durationDays()),scheduledDate:els.taskDate.value||todayISO(durationDays()),
      deadlineTime:els.taskDeadlineTime?.value||'23:59',
      deadlineMs:deadlineTimestamp(els.taskDate.value||todayISO(durationDays()),els.taskDeadlineTime?.value||'23:59'),
      hours:els.taskDailyHours.value||'1 Hour',time:'10:00',title:shortTitle,progress:0,done:false,completed:false,
      status:'pending',score:null,elapsed:0,running:false,lastStarted:null,autoLock:Boolean(document.getElementById('autoLock')?.checked),
      created:now.toISOString(),createdAtMs:now.getTime(),updatedAtMs:now.getTime(),sessions:[]
    });
  }
  function createTask(ev){
    ev?.preventDefault?.();
    if(mode==='ai' && getInput()) applyPromptAnalysis();
    const task=makeTask();
    if(!task){ window.NEXZOShell?.toast?.('Subject aur Task Type select karo, ya task input likho.','error'); return; }
    tasks.unshift(task);
    saveTasks({immediate:true});
    render(); renderSuggestion();
    if(els.smartPrompt) els.smartPrompt.value='';
    document.getElementById('taskList')?.scrollIntoView({behavior:'smooth',block:'center'});window.NEXZOShell?.toast?.('Task created and saved.','success');
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
    if(t.submissionLocked)return 'Submitted';
    if(isOverdue(t))return 'Overdue';
    if(t.running)return 'In Progress';
    if(Number(t.elapsed)>0)return 'Paused';
    return 'Pending';
  }
  function render(){
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
    const score=t.score?`${t.evaluationMode==='local'?'Local':'AI'} Score ${t.score}/10`:'Submit proof required';
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

  function openQuestions(i){const t=tasks[i]; if(!t)return; els.qTitle.textContent=`Questions: ${t.subject}`; els.qSub.textContent='Generated from your input, subject, task type and level.'; els.qList.innerHTML=(t.generatedQuestions||[]).map((q,idx)=>`<div class="q-item"><b>${idx+1}</b><div><h3>${esc(q).replace(/\n/g,'<br>')}</h3><p class="q-requirement">Answer this question in your submission.</p></div></div>`).join(''); els.questionsBack.classList.add('show');}
  function closeQuestions(){els.questionsBack.classList.remove('show')}
  function openSubmit(i){
    let index=Number(i);
    if(!Number.isInteger(index)||index<0||!tasks[index]||tasks[index].done||tasks[index].submissionLocked||isOverdue(tasks[index])){
      index=tasks.findIndex(t=>!t.done&&!t.submissionLocked&&!isOverdue(t));
    }
    if(index<0){alert(tasks.length?'No task is currently eligible for submission. Completed, already-submitted and overdue tasks are locked.':'Create a task first.');return;}
    activeIndex=index;
    const t=tasks[index];
    if(!t)return;
    els.submitTitle.textContent=`Submit: ${t.title}`;
    if(els.proofFile)els.proofFile.value='';
    if(els.fileLabel)els.fileLabel.textContent='Drag & drop file here or click to browse';
    els.filePreview?.classList.remove('show');
    if(els.pasteAnswer)els.pasteAnswer.value='';if(els.writeAnswer)els.writeAnswer.value='';if(els.submitNote)els.submitNote.value='';
    els.submitError?.classList.remove('show');
    if(els.submitStatus){els.submitStatus.style.display='none';els.submitStatus.textContent='';}
    submitTab('upload');els.submitBack.classList.add('show');
  }
  function closeSubmit(){els.submitBack.classList.remove('show')}
  function submitTab(m){submitMode=m;document.querySelectorAll('[data-submit]').forEach(b=>b.classList.toggle('active',b.dataset.submit===m));els.uploadMode?.classList.toggle('active',m==='upload');els.pasteMode?.classList.toggle('active',m==='paste');els.writeMode?.classList.toggle('active',m==='write');}
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
  function cleanWords(value){
    const stop=new Set('which what when where why how explain define write with without using extra space correct concept related option partially incorrect not applicable theory practice questions task answer requirement complete clearly before submission subject type beginner intermediate advanced'.split(' '));
    return String(value||'').toLowerCase().split(/[^a-z0-9+.#]+/).filter(w=>w.length>2&&!stop.has(w));
  }
  function taskKeywords(t){
    const text=[t.subject,t.type,t.level,t.title,buildAnswerKey(t),...(t.generatedQuestions||[])].join(' ');
    return [...new Set(cleanWords(text))].slice(0,80);
  }
  function mcqLetters(text){
    return (String(text||'').toUpperCase().match(/\b[A-D]\b/g)||[]);
  }
  function verifySubmission(t, text, file){
    const raw = String(text||'').trim();
    const full = raw.toLowerCase();
    const keys = taskKeywords(t);
    const hits = keys.filter(k=>full.includes(k)).length;
    const expectedCount = Number(String(t.questions||'5').match(/\d+/)?.[0]||Math.max(1,(t.generatedQuestions||[]).length)||1);
    const isMcq = /mcq/i.test(t.type||'');
    let score=0, accepted=false, mistakes=[], suggestions=[];
    const wordCount = cleanWords(raw).length;

    if(isMcq){
      const letters = mcqLetters(raw);
      const expected = (Array.isArray(t.answerKey) && t.answerKey.length ? t.answerKey : (t.generatedQuestions||[]).map((_,i)=>mcqAnswerLetter(i,t.subject,t.level))).slice(0, expectedCount);
      // If user wrote a full explanation instead of Q1 A, verify it as a written proof, not as failed MCQ.
      if(!letters.length && wordCount >= 4){
        score = Math.min(10, Math.max(3, hits*2 + (wordCount>10?2:0) + (wordCount>35?2:0) + (file?1:0)));
        accepted = hits >= 1 || wordCount >= 12;
        if(!accepted) mistakes.push('Answer task ke subject/questions se clearly match nahi ho raha.');
        suggestions.push('MCQ ke liye best format Q1 A, Q2 C hai. Written explanation bhi accepted hai agar task se related ho.');
      } else if(!letters.length){
        mistakes.push('MCQ answers readable format me nahi mile.');
        suggestions.push('MCQ ke liye submit karo: Q1 A, Q2 C, Q3 B. Ya short explanation likho jo task se related ho.');
      } else {
        let correct = 0;
        letters.slice(0, expected.length).forEach((x,i)=>{ if(x === expected[i]) correct++; });
        const coverage = Math.min(1, letters.length/Math.max(1, expected.length));
        const accuracy = correct/Math.max(1, Math.min(letters.length, expected.length));
        score = Math.max(1, Math.round((coverage*3) + (accuracy*7)));
        accepted = letters.length >= 1; // submit after checking; score stores performance
        if(letters.length < expected.length) mistakes.push(`Sirf ${letters.length}/${expected.length} MCQ answers mile.`);
        if(correct < Math.min(letters.length, expected.length)) mistakes.push('Kuch MCQ answers correct answer key se match nahi hue.');
        suggestions.push('Har answer question number ke saath likho: Q1 A, Q2 C, Q3 B.');
      }
    } else if(/coding/i.test(t.type||'')){
      const hasCode = /(function|class|return|for\s*\(|while\s*\(|if\s*\(|console|print|def\s+|public\s+static|#include|=>)/i.test(raw);
      score = Math.min(10, Math.max(1, hits*2 + (hasCode?4:0) + (wordCount>8?2:0) + (file?1:0)));
      accepted = hasCode || (hits>=1 && wordCount>=6);
      if(!hasCode) mistakes.push('Code/syntax ya algorithm steps clearly nahi mile.');
      suggestions.push('Code, sample input/output aur short explanation include karo.');
    } else if(/lab|practical|project/i.test(t.type||'')){
      const proofWords = /(step|output|result|screenshot|photo|observation|working|demo|implemented|built|created)/i.test(raw);
      score = Math.min(10, Math.max(1, hits*2 + (proofWords?3:0) + (file?2:0) + (wordCount>8?2:0)));
      accepted = (file && (proofWords || hits>=1)) || (hits>=1 && wordCount>=6);
      if(!file && !proofWords) mistakes.push('Practical/project proof ya output clearly nahi mila.');
      suggestions.push('Steps, output/result, screenshot/photo ya demo proof add karo.');
    } else {
      // Theory, short answer, long answer, revision, notes, assignment etc.
      score = Math.min(10, Math.max(1, hits*2 + (wordCount>=1?1:0) + (wordCount>8?2:0) + (wordCount>35?2:0) + (file?1:0)));
      accepted = hits>=1 || wordCount>=6;
      if(!hits) mistakes.push('Answer me task ke main keywords/topic clearly match nahi ho rahe.');
      if(wordCount<3) mistakes.push('Answer bahut short hai; MCQ/one-word answer allowed hai, par topic se related hona chahiye.');
      suggestions.push('Definition, key points, example/output aur conclusion add karo.');
    }

    if(file && !raw && !String(file?.name||'').match(/\.(txt|js|html|css|py|java|cpp|c|json|md)$/i)){
      accepted=false; score=Math.min(score||1,4);
      mistakes.push('Image/PDF upload hua, lekin local fallback file content read nahi kar sakta.');
      suggestions.push('Upload ke saath note me answer/output summary likho, ya Paste/Write Answer tab use karo.');
    }
    return {accepted, score:Math.max(1,Math.min(10,score||1)), hits, mistakes, suggestions};
  }
  function normalizeAIResult(data){
    const score=Math.max(0,Math.min(10,Number(data?.score)||0));
    const strengths=Array.isArray(data?.strengths)?data.strengths:[data?.strengths].filter(Boolean);
    const improvements=Array.isArray(data?.improvements)?data.improvements:[data?.improvements].filter(Boolean);
    return {score,accepted:score>=4,feedback:String(data?.feedback||''),strengths,improvements,modelAnswer:String(data?.modelAnswer||'')};
  }
  async function submitForAI(){
    const t=tasks[activeIndex];if(!t||submissionBusy)return;
    submissionBusy=true;
    const submitButton=document.querySelector('[data-nx-click="nzpSubmitForAI"]');if(submitButton){submitButton.disabled=true;submitButton.dataset.originalText=submitButton.textContent;submitButton.textContent='Evaluating…';}
    if(t.done||t.submissionLocked){submissionBusy=false;if(submitButton){submitButton.disabled=false;submitButton.textContent=submitButton.dataset.originalText||'Submit for Smart Evaluation';}return showSubmitError('This task has already been submitted. Answers are locked and cannot be changed.');}
    if(isOverdue(t)){submissionBusy=false;if(submitButton){submitButton.disabled=false;submitButton.textContent=submitButton.dataset.originalText||'Submit for Smart Evaluation';}closeSubmit();render();return window.NEXZOShell?.toast?.('Deadline passed. Submission is closed for this task.','error');}
    const file=els.proofFile?.files?.[0];
    const paste=(els.pasteAnswer?.value||'').trim();
    const write=(els.writeAnswer?.value||'').trim();
    const note=(els.submitNote?.value||'').trim();
    let answer=submitMode==='paste'?paste:submitMode==='write'?write:note;
    if(submitMode==='upload'&&!file){submissionBusy=false;if(submitButton){submitButton.disabled=false;submitButton.textContent=submitButton.dataset.originalText||'Submit for Smart Evaluation';}return showSubmitError('Upload a supported image, PDF, text or code file first.');}
    if(submitMode==='paste'&&!paste){submissionBusy=false;if(submitButton){submitButton.disabled=false;submitButton.textContent=submitButton.dataset.originalText||'Submit for Smart Evaluation';}return showSubmitError('Paste answer first.');}
    if(submitMode==='write'&&!write){submissionBusy=false;if(submitButton){submitButton.disabled=false;submitButton.textContent=submitButton.dataset.originalText||'Submit for Smart Evaluation';}return showSubmitError('Write answer first.');}
    els.submitError?.classList.remove('show');
    els.submitStatus.style.display='block';els.submitStatus.className='status show';els.submitStatus.textContent='Checking your submission…';
    let result=null;
    let evaluationMode='ai';
    let aiError='';
    try{
      if(submitMode==='upload'){
        const localText=await readUploadedText(file);
        if(localText.trim())answer=[note,localText].filter(Boolean).join('\n');
        else{
          if(!window.NEXZOAI?.analyze)throw new Error('AI file analysis service is not loaded.');
          const analyzed=await window.NEXZOAI.analyze(file,`Analyze this student submission for the task "${t.title}" (${t.subject}, ${t.type}, ${t.level}). Extract the actual answer/proof, steps and output. Do not invent missing work. Student note: ${note||'none'}`);
          answer=[note,analyzed?.reply].filter(Boolean).join('\n');
        }
      }
      if(!answer.trim())throw new Error('No readable answer was found in the submission.');
      if(!window.NEXZOAI?.evaluate)throw new Error('Evaluation service is not loaded.');
      const question=[t.title,...(t.generatedQuestions||[])].join('\n');
      const data=await window.NEXZOAI.evaluate({question,answer,rubric:`Task type: ${t.type}. Level: ${t.level}. Check accuracy, completeness, understanding, presentation, code/output/proof where applicable.`});
      result=normalizeAIResult(data);
    }catch(error){
      aiError=String(error?.message||error);
      const fallback=verifySubmission(t,answer,file);
      if(!answer.trim()&&file){
        els.submitStatus.className='status show bad';
        els.submitStatus.innerHTML=`❌ File could not be evaluated.<br>${esc(aiError)}<br>Start/configure the Study service or paste a text answer.`;
        submissionBusy=false;if(submitButton){submitButton.disabled=false;submitButton.textContent=submitButton.dataset.originalText||'Submit for Smart Evaluation';}
        return;
      }
      evaluationMode='local';
      result={...fallback,feedback:'Study service unavailable; a local relevance check was used.',strengths:[],improvements:fallback.suggestions||[],modelAnswer:buildAnswerKey(t)};
    }
    updateEval(result.score,result.accepted);
    // A submitted answer is immutable after evaluation, even when the score is below the pass threshold.
    // This prevents answer-changing/retry farming and preserves the original attempt for audit/history.
    const submittedAt=Date.now();
    stopTaskTimer(t,submittedAt);
    Object.assign(t,{submissionLocked:true,submittedAtMs:submittedAt,submittedAt:new Date(submittedAt).toISOString(),submittedAnswer:answer,submissionMode:submitMode,submissionFileName:file?.name||'',score:result.score,evaluationMode,status:result.accepted?'completed':'submitted',aiFeedback:result.feedback,aiStrengths:result.strengths,aiSuggestions:result.improvements,modelAnswer:result.modelAnswer,updatedAtMs:submittedAt});
    // Do not normalize/save an accepted task yet: saveTasks() rebuilds the task array
    // with new objects, which would make `t` stale before the completion fields below are applied.
    // Rejected submissions are persisted inside their branch; accepted submissions commit once, atomically.
    // A genuine evaluated submission is verified learning activity even when it needs
    // improvement. It advances the study streak, while completion/XP still require
    // an accepted answer so the two metrics keep their distinct meaning.
    window.NEXZOStreakSystem?.markStudy?.({source:'planner',id:`submission:${t.id||t.createdAtMs}`,label:t.title||'Submitted Planner task'});
    if(!result.accepted){
      els.submitStatus.className='status show bad';
      els.submitStatus.innerHTML=`❌ Submission needs improvement.<br><b>${evaluationMode==='ai'?'AI':'Local'} score:</b> ${Number(result.score).toFixed(1)}/10<br><b>Feedback:</b> ${esc(result.feedback||'Answer is incomplete or does not match the task.')}<br>${(result.improvements||[]).map(x=>`• ${esc(x)}`).join('<br>')}<br><small>🔒 This attempt is now locked. Answers cannot be edited or resubmitted.</small>${aiError?`<br><small>Study service unavailable; local evaluator was used.</small>`:''}`;
      saveTasks({immediate:true});render();
      submissionBusy=false;if(submitButton){submitButton.disabled=false;submitButton.textContent=submitButton.dataset.originalText||'Submit for Smart Evaluation';}
      return;
    }
    const shouldGrantXP=!t.xpGranted;
    const now=Date.now();
    Object.assign(t,{running:false,lastStarted:null,status:'completed',done:true,completed:true,progress:100,score:result.score,verifiedAt:new Date(now).toISOString(),completedAt:new Date(now).toISOString(),completedAtMs:now,updatedAtMs:now,aiFeedback:result.feedback,aiStrengths:result.strengths,aiSuggestions:result.improvements,modelAnswer:result.modelAnswer,evaluationMode,xpGranted:true});
    saveTasks({immediate:true});render();
    if(shouldGrantXP){
      const difficulty=String(t.level||t.difficulty||'Intermediate');
      const base=window.NEXZOGamificationEngine?.difficultyBase?.(difficulty,60)??60;
      window.NEXZOGamificationEngine?.award?.({
        amount:base,
        source:'planner',
        actionId:String(t.id||t.createdAtMs||t.title),
        reason:`${difficulty} Planner task completed`,
        subject:t.subject||'General',
        questId:'planner',
        difficulty,
        score:Math.max(0,Math.min(100,Number(result.score||0)*10))
      });
    }
      try{
        const profile=window.NEXZODataService?.getProfile?.()||safeParse(localStorage.getItem('nexzoProfileEditableV3')||'{}',{});
        const next={...profile,aiScore:Math.max(Number(profile.aiScore)||0,Math.round(Number(result.score)*10)),updatedAtMs:Date.now()};
        localStorage.setItem('nexzoProfileEditableV3',JSON.stringify(next));
        localStorage.setItem('nexzoProfileV3',JSON.stringify(next));
        window.dispatchEvent(new CustomEvent('nexzo:profile-updated',{detail:{source:'planner',profile:next}}));
        window.NEXZODataService?.saveProfile?.(next);
      }catch(_){}
    els.submitStatus.className='status show good';
    els.submitStatus.innerHTML=`✅ Task completed with ${evaluationMode==='ai'?'connected service':'local fallback'} verification.<br><b>Score:</b> ${Number(result.score).toFixed(1)}/10<br><b>Feedback:</b> ${esc(result.feedback||'Submission accepted.')}<br>${(result.improvements||[]).length?`<b>Improve next:</b><br>${result.improvements.map(x=>`• ${esc(x)}`).join('<br>')}`:''}${aiError?`<br><small>Study service was offline: ${esc(aiError)}</small>`:''}`;
    submissionBusy=false;if(submitButton){submitButton.disabled=false;submitButton.textContent=submitButton.dataset.originalText||'Submit for Smart Evaluation';}
    setTimeout(closeSubmit,700);window.NEXZOShell?.addNotification?.('Task completed',`${t.title} • ${Number(result.score).toFixed(1)}/10`,'planner.html');
  }
  function showSubmitError(msg){els.submitError.textContent=msg;els.submitError.classList.add('show')}
  function updateEval(score,pass,silent=false){const numeric=Math.max(0,Math.min(10,Number(score)||0));const pct=Math.round(numeric*10); if(els.scoreText)els.scoreText.textContent=numeric.toFixed(1); els.scoreRing?.style.setProperty('--score',pct); ['barCorrect','barUnderstand','barComplete','barPresent'].forEach((id,idx)=>{const el=$(id); if(el){const v=pct?Math.max(0,Math.min(100,pct-(idx*3)+(pass?4:0))):0;el.style.setProperty('--w',v+'%'); const b=el.closest('.bar-row')?.querySelector('b'); if(b)b.textContent=v+'%';}}); if(els.evalFeedback&&!silent)els.evalFeedback.textContent=pass?'Verified: answer/proof matches the task requirements.':'The evaluation found it incomplete. Add clearer steps, output or matching proof.'; if(els.evalFeedback&&silent&&!pct)els.evalFeedback.textContent='Submit a task answer/proof to generate your evaluation.'; if(els.statAccuracy)els.statAccuracy.textContent=pct+'%';}
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

  window.nzpAnalyzePrompt=()=>applyPromptAnalysis(true); window.nzpCreateTask=createTask; window.nzpOpenSubmit=openSubmit; window.nzpCloseQuestions=closeQuestions; window.nzpCloseSubmit=closeSubmit; window.nzpSubmitForAI=submitForAI; window.nzpSubmitMode=submitTab;
  window.nzpSetMode=(m)=>{mode=m;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===m)); if(els.modeLabel)els.modeLabel.textContent=m==='ai'?'AI Assist':m==='manual'?'Manual':'Recommended'; if(els.promptPanel)els.promptPanel.style.display=m==='manual'?'none':'block'; els.recPanel?.classList.toggle('active',m==='recommended'); renderSuggestion();};
  window.nzpApplyRec=(name)=>{const map={'DSA Placement Track':['DSA','Coding Practice','Intermediate','10 Questions','5 Days','High','Library','2 Hours','Prepare DSA arrays and linked list for placement with coding problems.'],'DBMS Exam Revision':['DBMS','Previous Year Questions','Intermediate','10 Questions','3 Days','High','Home','2 Hours','Prepare DBMS normalization, SQL joins and ACID for exam.'],'Web Development Project':['Web Dev','Project Work','Intermediate','1 Mini Project','7 Days','Medium','Computer Lab','3 Hours','Create a web development mini project with checklist.']}; const v=map[name]; if(!v)return; [els.taskSubject.value,els.taskType.value,els.taskLevel.value,els.taskQuestions.value,els.taskDuration.value,els.taskPriority.value,els.taskPlace.value,els.taskDailyHours.value,els.smartPrompt.value]=v; renderSuggestion();};
  window.nzpEnhance=(x)=>{const add={placement:' Make it placement-focused.',breakdown:' Break it into daily steps.',deadline:' Add deadline and daily plan.',resources:' Include resources and practice links.'}; if(!getInput()) els.smartPrompt.focus(); els.smartPrompt.value=(getInput()||'')+(add[x]||''); applyPromptAnalysis();};
  window.nzpClearForm=()=>{els.smartPrompt.value='';els.taskSubject.value='';els.taskType.value='';els.taskLevel.value='Beginner';els.taskQuestions.value='5 Questions';els.taskDuration.value='2 Days';els.taskPriority.value='Medium';els.taskPlace.value='Home';els.taskDailyHours.value='1 Hour';els.taskDate.value=todayISO(3);if(els.taskDeadlineTime)els.taskDeadlineTime.value='23:59';renderSuggestion();};
  window.nzpSetSuggestion=(s)=>{activeSug=s;syncSugTabs();renderSuggestion();};
  window.nzpSetFilter=(f)=>{filter=f;document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));render();};
  window.nzpEvalDemo=()=>{
    const pool=(tasks||[]).filter(t=>Number(t.score||t.aiScore||t.evalScore)>0);
    const t=pool[pool.length-1] || tasks[activeIndex] || tasks[tasks.length-1];
    const score=Number(t?.score||t?.aiScore||t?.evalScore||0);
    if(score>0){updateEval(score,true); if(els.evalFeedback)els.evalFeedback.textContent='Latest verified task score loaded from your submissions.';}
    else {updateEval(0,false,true); if(els.evalFeedback)els.evalFeedback.textContent='No verified submission yet. Submit a task to generate a real evaluation.';}
  };

  function init(){
    if(window.__NEXZO_PLANNER_INIT_DONE__) return;
    window.__NEXZO_PLANNER_INIT_DONE__=true;
    tasks=readTasks(); initSelects();
    const d=new Date(); if(els.todayDate)els.todayDate.textContent=d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); if(els.todayDay)els.todayDay.textContent=d.toLocaleDateString('en-US',{weekday:'long'});
    const plannerForm=document.querySelector('.planner-page form.panel');
    if(plannerForm && !plannerForm.dataset.nzpBound){plannerForm.dataset.nzpBound='1';plannerForm.addEventListener('submit',createTask);}
    els.smartPrompt?.addEventListener('input',()=>{clearTimeout(window.__nzpInput); window.__nzpInput=setTimeout(()=>{latestAIPlan=null;applyPromptAnalysis(false)},300)});
    ['taskSubject','taskType','taskLevel','taskQuestions','taskDuration','taskPriority','taskPlace','taskDate','taskDeadlineTime','taskDailyHours'].forEach(id=>$(id)?.addEventListener('change',renderSuggestion));
    els.proofFile?.addEventListener('change',()=>{const f=els.proofFile.files[0]; if(f){els.fileLabel.textContent=f.name; els.filePreview.textContent=`✅ Selected: ${f.name} (${Math.ceil(f.size/1024)} KB)`; els.filePreview.classList.add('show');}});
    document.addEventListener('click',e=>{const q=e.target.closest('[data-questions]');if(q)openQuestions(Number(q.dataset.questions));const submit=e.target.closest('[data-submit-open]');if(submit)openSubmit(Number(submit.dataset.submitOpen));const timer=e.target.closest('[data-timer-btn]');if(timer){e.preventDefault();toggleTimer(Number(timer.dataset.timerBtn));}const edit=e.target.closest('[data-edit-task]');if(edit)editTask(Number(edit.dataset.editTask));});
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
    renderSuggestion();render();clearInterval(window.__nzpTick);window.__nzpTick=setInterval(refreshTimers,1000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
