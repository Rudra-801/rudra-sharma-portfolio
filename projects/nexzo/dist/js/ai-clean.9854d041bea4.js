(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const els = {
    messages:$('messages'), input:$('input'), composer:$('composer'), send:$('sendBtn'), plus:$('plusBtn'), menu:$('attachMenu'),
    status:$('statusBadge'), historyModal:$('historyModal'), historyList:$('historyList'), historySearch:$('historySearch'), tools:$('toolsPanel'),
    nav:$('navDrawer'), backdrop:$('backdrop'), file:$('fileInput'), folder:$('projectFolderInput'), image:$('imageInput'), preview:$('attachmentPreview'), notice:$('connectionNotice'), retry:$('retryConnection'),
    avatarModal:$('assistantAvatarModal'), reader:$('readerBar'), voiceFeedback:$('voiceFeedback'), stop:$('stopBtn'), projectBar:$('projectContextBar')
  };
  const configuredBase=String(window.NEXZO_CONFIG?.API_BASE_URL||document.querySelector('meta[name="nexzo-api-base-url"]')?.content||'').trim().replace(/\/$/,'');
  const localHost=/^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  const API_BASE=configuredBase||(localHost&&location.port!=='5000'?'http://127.0.0.1:5000/api':'/api');
  const remoteBackend=/^https?:\/\//i.test(API_BASE)&&!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::|\/)/i.test(API_BASE);
  const api=(path)=>`${API_BASE}${String(path||'').replace(/^\/api(?=\/)/,'')}`;
  let storageOwner='guest';
  let STORE='nexzo.ai.clean.sessions.v4:guest';
  const currentStorageKey=()=>`nexzo.ai.clean.current:${encodeURIComponent(storageOwner)}`;
  const MODE_KEY='nexzo_study_mode';
  let sessions=loadSessions();
  let currentId=localStorage.getItem(currentStorageKey()) || sessions[0]?.id || newId();
  let activeStudyMode=['chat','explain','notes','quiz','interview'].includes(localStorage.getItem(MODE_KEY))?localStorage.getItem(MODE_KEY):'chat';
  let pendingFiles=[],pendingKind='files',pendingBundle=null,sending=false,lastFailedRequest=null,lastHealthAt=0,healthInFlight=null,backendHealth=null,backendCapabilities={},activeAdvancedTool='',activeRequestFiles=0,activeRequestKind='files',timerSeconds=Math.max(0,Number(localStorage.getItem('nexzo.focus.seconds')||1500)),timerRun=false,timerHandle=null;
  let activeRequestController=null,receivedLearningEvent=null;
  let activeProject={chatId:'',kind:'files',files:[]};
  let cloud=null, cloudUid='', cloudSaveTimer=null, cloudLoaded=false;
  let speakingIndex=null, activeUtterance=null;
  let speechState={chunks:[],position:0,paused:false,language:'en-IN'};
  let authUser=null;
  let workflowState={type:'',active:false,paused:false,current:0,total:0,title:''};
  let pendingWorkflowAction='';
  let lastAssistantRoute=null;
  let profileIdentity={name:'Student',email:'NEXZO account',photo:''};
  let assistantAvatarURL='favicon.png';
  const attachmentThumbURLs=new Map();
  let thinkingTimer=null,thinkingStartedAt=0;
  function setAgentState(state='ready',detail=''){
    document.body.dataset.agentState=state;
    const labels={ready:'Ready',reading:'Reading attachments',searching:'Searching sources',running:'Running a tool',generating:'Creating an image',saving:'Saving progress',error:'Needs attention'};
    const text=detail||labels[state]||'Working';
    if($('companionText'))$('companionText').textContent=text;
    if($('companionDetail'))$('companionDetail').textContent=`${labels[state]||state}${detail&&detail!==labels[state]?` · ${detail}`:''}`;
  }
  function capability(name){ return backendCapabilities?.[name]===true; }
  const advancedCapability={search:'webSearch',research:'deepResearch',code:'codeExecution',data:'dataAnalysis','artifact:docx':'artifactGeneration','artifact:pdf':'artifactGeneration','artifact:pptx':'artifactGeneration','artifact:xlsx':'artifactGeneration','project-edit':'projectEditing','library-save':'fileLibrary','library-list':'fileLibrary',memory:'memory',schedule:'scheduledTasks',background:'backgroundJobs',connections:'googleConnections'};
  function toolAvailable(tool=''){const key=advancedCapability[tool];return !key||capability(key);}
  function syncToolAvailability(){document.querySelectorAll('[data-advanced]').forEach(btn=>{const tool=btn.dataset.advanced||'',ok=toolAvailable(tool);btn.disabled=!ok;btn.classList.toggle('is-unavailable',!ok);if(!ok)btn.title='This tool is not configured on the current backend.';else btn.removeAttribute('title');});}
  function captureFailure(text,files,kind,tool=''){ return {text:String(text||''),files:[...(files||[])],kind:String(kind||'files'),tool:String(tool||'')}; }


  const modeConfig={
    chat:{label:'Chat',icon:'✦',title:'Ask anything',description:'Have a natural conversation with context-aware follow-ups. Switch modes only when you want a focused workflow.',placeholder:'Message NEXZO…',fileInstruction:'Use the attached material as context and respond naturally to this request: ',suggestions:['Help me understand today’s topic','Plan what I should study next','Continue from our last answer']},
    explain:{label:'Explain',icon:'💡',title:'Explain a concept',description:'Understand the idea from fundamentals, then keep asking follow-up questions in the same context.',placeholder:'What concept should I explain?',fileInstruction:'Explain the attached material clearly, use examples, and answer this request: ',suggestions:['Explain OSI model simply','Compare TCP and UDP','Solve this step by step']},
    notes:{label:'Notes',icon:'📒',title:'Create revision-ready notes',description:'Turn any topic or uploaded material into headings, key points, examples and a quick-revision sheet.',placeholder:'Which topic needs notes?',fileInstruction:'Create structured, exam-ready notes from the attached material for this request: ',suggestions:['Make unit-wise CN notes','Create a one-page cheat sheet','Extract key exam points']},
    quiz:{label:'Quiz',icon:'🧠',title:'Take an interactive quiz',description:'NEXZO asks one MCQ at a time, checks your answer, explains it and tracks your final score.',placeholder:'Enter a quiz topic and difficulty',fileInstruction:'Create an interactive quiz from the attached material. Start with one question only. Request: ',suggestions:['Start a DBMS quiz','Quiz me on DSA arrays','Test Computer Networks basics']},
    interview:{label:'Interview',icon:'🎯',title:'Practise a mock interview',description:'Answer one question at a time and receive follow-up questions, feedback and a final performance report.',placeholder:'Enter a role or interview topic',fileInstruction:'Use the attached material as interview context and begin a one-question-at-a-time mock interview for: ',suggestions:['Frontend developer interview','Java OOP viva practice','HR interview for internship']}
  };
  function workflowLabel(type=''){return type==='quiz'?'Interactive quiz':type==='interview'?'Mock interview':'Study workflow';}
  function renderWorkflowBar(){
    const bar=$('assistantWorkflowBar');if(!bar)return;
    bar.hidden=!workflowState.active;
    document.body.classList.toggle('has-active-workflow',Boolean(workflowState.active));
    document.body.classList.toggle('workflow-paused',Boolean(workflowState.active&&workflowState.paused));
    if(!workflowState.active)return;
    const title=$('assistantWorkflowTitle'),meta=$('assistantWorkflowMeta'),pause=$('workflowPauseBtn'),resume=$('workflowResumeBtn');
    if(title)title.textContent=workflowState.title||workflowLabel(workflowState.type);
    if(meta){const progress=workflowState.total?`Question ${Math.max(1,workflowState.current)}/${workflowState.total} · `:'';meta.textContent=workflowState.paused?`${progress}Paused. Ask anything normally, then press Resume when you want to continue.`:`${progress}Ask any unrelated question at any time — NEXZO will pause this workflow automatically.`;}
    if(pause)pause.hidden=workflowState.paused;if(resume)resume.hidden=!workflowState.paused;
  }
  function updateWorkflowFromReply(reply='',route={}){
    const text=String(reply||'');
    if(/(?:quiz|interview) complete|final score|overall score/i.test(text)){workflowState={type:'',active:false,paused:false,current:0,total:0,title:''};renderWorkflowBar();return;}
    const type=route?.intent==='quiz'||route?.intent==='interview'?route.intent:(/mock interview/i.test(text)?'interview':/quiz started|reply with A, B, C or D/i.test(text)?'quiz':'');
    if(!type)return;
    const q=text.match(/Question\s+(\d+)\s*\/\s*(\d+)/i);
    workflowState={...workflowState,type,active:true,paused:false,current:q?Number(q[1]):workflowState.current||1,total:q?Number(q[2]):workflowState.total||5,title:type==='quiz'?'Interactive quiz':'Mock interview'};
    renderWorkflowBar();
  }
  function looksLikeIndependentQuestion(text='',type=''){
    const value=String(text||'').trim();if(!value)return false;
    if(type==='quiz'&&/^\s*(?:answer\s*)?[A-D](?:[).\s]|$)/i.test(value))return false;
    if(/^\s*(?:answer|my answer|response)\s*:/i.test(value))return false;
    if(/(?:pause|hold|stop for now|different question|another question|off[- ]?topic|change topic|ask anything)/i.test(value))return true;
    if(/[?？]\s*$/.test(value))return true;
    if(/^\s*(?:what|why|how|who|when|where|which|can|could|would|will|is|are|do|does|did|tell me|explain|define|compare|help me|show me|give me)/i.test(value))return true;
    return type==='quiz';
  }
  function currentWorkflowAction(text=''){
    if(!workflowState.active)return '';
    if(pendingWorkflowAction){const a=pendingWorkflowAction;pendingWorkflowAction='';return a;}
    if(workflowState.paused)return 'interrupt';
    if(looksLikeIndependentQuestion(text,workflowState.type)){workflowState.paused=true;renderWorkflowBar();return 'interrupt';}
    return 'continue';
  }
  function applyStudyMode(mode,{focus=true}={}){
    activeStudyMode=modeConfig[mode]?mode:'chat';
    const config=modeConfig[activeStudyMode];
    localStorage.setItem(MODE_KEY,activeStudyMode);
    localStorage.setItem('nexzo.study.mode',activeStudyMode);
    document.body.dataset.studyMode=activeStudyMode;
    document.querySelectorAll('[data-study-mode]').forEach(button=>{
      const selected=button.dataset.studyMode===activeStudyMode;
      button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));
    });
    els.input.placeholder=config.placeholder;
    if($('modeIcon'))$('modeIcon').textContent=config.icon;
    if($('modeTitle'))$('modeTitle').textContent=config.title;
    if($('modeDescription'))$('modeDescription').textContent=config.description;
    if($('modeSuggestions'))$('modeSuggestions').innerHTML=config.suggestions.map(prompt=>`<button type="button" data-mode-prompt="${esc(prompt)}">${esc(prompt)}</button>`).join('');
    if($('composerMode'))$('composerMode').textContent=`${config.icon} ${config.label}`;
    if(focus)els.input.focus();
  }

  function newId(){ return `chat-${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }
  function normalizeTimestamp(value,fallback=Date.now()){
    const raw=Number(value);
    if(!Number.isFinite(raw)||raw<=0)return fallback;
    // Firestore/legacy exports can contain Unix seconds instead of JS milliseconds.
    if(raw<100000000000)return raw*1000;
    return raw;
  }
  function normalizeMessage(message){
    if(!message || typeof message!=='object') return null;
    const role=message.role==='assistant'?'assistant':'user';
    const content=String(message.content??message.text??message.message??'').trim();
    if(!content)return null;
    const attachments=Array.isArray(message.attachments)?message.attachments.map(item=>({name:String(item?.name||'Attachment'),type:String(item?.type||'File'),size:Number(item?.size)||0,path:String(item?.path||item?.name||'Attachment'),kind:String(item?.kind||'file'),...(item?.bundle?{bundle:item.bundle}:{})})).slice(0,24):[];
    return {id:String(message.id||message.messageId||`msg-${Number(message.at||message.createdAt||message.timestamp||Date.now())}-${role}-${content.slice(0,24)}`),role,content,at:normalizeTimestamp(message.at||message.createdAt||message.timestamp),...(attachments.length?{attachments}:{}),...(message.action?{action:message.action}:{}),...(message.imageDataUrl?{imageDataUrl:String(message.imageDataUrl)}:{}),...(message.imageMeta?{imageMeta:message.imageMeta}:{}),...(message.toolMeta?{toolMeta:message.toolMeta}:{}),...(message.rating?{rating:String(message.rating)}:{})};
  }
  function normalizeChat(chat,index=0){
    if(!chat || typeof chat!=='object')return null;
    const rawMessages=Array.isArray(chat.messages)?chat.messages:Array.isArray(chat.history)?chat.history:[];
    const normalizedMessages=rawMessages.map(normalizeMessage).filter(Boolean);
    const messages=[];
    normalizedMessages.forEach(message=>{const previous=messages[messages.length-1];if(previous&&previous.role===message.role&&previous.content===message.content&&Math.abs(Number(message.at)-Number(previous.at))<15000)return;messages.push(message);});
    if(!messages.length)return null;
    const updatedAt=normalizeTimestamp(chat.updatedAt||chat.updatedAtMs||chat.createdAt||chat.createdAtMs);
    return {id:String(chat.id||chat.chatId||`legacy-${updatedAt}-${index}`),title:String(chat.title||messages.find(m=>m.role==='user')?.content||'Recovered chat').slice(0,80),createdAt:normalizeTimestamp(chat.createdAt||chat.createdAtMs||updatedAt,updatedAt),updatedAt,messages};
  }
  function extractLegacyChats(value){
    const rows=Array.isArray(value)?value:Array.isArray(value?.sessions)?value.sessions:Array.isArray(value?.chats)?value.chats:Array.isArray(value?.history)?value.history:[];
    if(rows.length && rows.every(item=>item && typeof item==='object' && ('role' in item || 'content' in item || 'text' in item))){
      return [normalizeChat({id:`legacy-${Date.now()}`,title:'Recovered conversation',messages:rows,updatedAt:Date.now()})].filter(Boolean);
    }
    return rows.map(normalizeChat).filter(Boolean);
  }
  function mergeChats(...groups){
    const map=new Map();
    groups.flat().filter(Boolean).forEach(chat=>{
      const normalized=normalizeChat(chat);
      if(!normalized)return;
      const existing=map.get(normalized.id);
      if(!existing || normalized.updatedAt>existing.updatedAt)map.set(normalized.id,normalized);
    });
    return [...map.values()].sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,50);
  }
  function loadSessions(){
    // Legacy unscoped copies are preserved, but their owner cannot be guessed.
    // Never scan/import another account's history into the current account.
    try{return extractLegacyChats(JSON.parse(localStorage.getItem(STORE)||'[]'));}catch{return [];}
  }
  function persistentSessions(){
    return sessions.slice(0,50).map(chat=>({...chat,messages:(chat.messages||[]).map(message=>{const copy={...message};delete copy.imageDataUrl;delete copy.streaming;delete copy.placeholder;if(Array.isArray(copy.attachments))copy.attachments=copy.attachments.map(item=>{const meta={...item};delete meta.previewUrl;return meta;});return copy;})}));
  }
  const historyEnabled=()=>window.NEXZOSettings?.get?.().aiHistory!==false;
  function save(){ if(historyEnabled()){localStorage.setItem(STORE,JSON.stringify(persistentSessions()));scheduleCloudSave();}else{localStorage.removeItem(STORE);}localStorage.setItem(currentStorageKey(),currentId); }
  function session(){ let s=sessions.find(x=>x.id===currentId);if(!s){s={id:currentId,title:'New chat',createdAt:Date.now(),updatedAt:Date.now(),messages:[]};sessions.unshift(s);save()}return s; }
  function esc(s=''){return String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));}
  function assistantConfirm(title,message,confirmText='Delete'){
    return new Promise(resolve=>{
      const overlay=document.createElement('div');overlay.className='nx-assistant-confirm-overlay';overlay.setAttribute('role','presentation');
      overlay.innerHTML=`<div class="nx-assistant-confirm" role="dialog" aria-modal="true" aria-labelledby="nxConfirmTitle"><div class="nx-assistant-confirm-mark">!</div><div class="nx-assistant-confirm-copy"><h3 id="nxConfirmTitle">${esc(title)}</h3><p>${esc(message)}</p></div><div class="nx-assistant-confirm-actions"><button type="button" data-confirm-cancel>Cancel</button><button type="button" class="danger" data-confirm-ok>${esc(confirmText)}</button></div></div>`;
      document.body.appendChild(overlay);const finish=value=>{document.removeEventListener('keydown',onKey);overlay.remove();resolve(value)},onKey=e=>{if(e.key==='Escape')finish(false)};document.addEventListener('keydown',onKey);overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('[data-confirm-cancel]'))finish(false);else if(e.target.closest('[data-confirm-ok]'))finish(true)});overlay.querySelector('[data-confirm-cancel]')?.focus();
    });
  }
  function assistantAvatarMarkup(){return `<button type="button" class="message-avatar assistant-avatar" data-edit-assistant-avatar aria-label="Change NEXZO assistant avatar" title="Change assistant avatar"><img src="${esc(assistantAvatarURL)}" alt=""></button>`;}
  function userAvatarMarkup(){
    const name=profileIdentity.name||'Student',photo=profileIdentity.photo||'';
    const content=photo?`<img src="${esc(photo)}" alt="">`:esc((name[0]||'S').toUpperCase());
    return `<button type="button" class="message-avatar user-avatar" data-edit-avatar aria-label="Change ${esc(name)} profile avatar" title="Change profile avatar">${content}</button>`;
  }
  function sentAttachmentMarkup(items=[]){
    if(!Array.isArray(items)||!items.length)return '';
    const bundleMeta=items.find(item=>item?.bundle)?.bundle||null;
    if(bundleMeta){
      const title=esc(bundleMeta.name||'Project');
      const count=Math.max(1,Number(bundleMeta.count)||items.length);
      const total=Math.max(0,Number(bundleMeta.totalSize)||items.reduce((sum,item)=>sum+(Number(item?.size)||0),0));
      const kind=bundleMeta.kind==='zip'?'ZIP':'PROJECT';
      return `<div class="sent-attachments sent-project-bundle"><div class="sent-attachment sent-file sent-project-single"><i>${kind}</i><span><b>${title}</b><small>${count} file${count===1?'':'s'}${total?` · ${attachmentSize(total)}`:''}</small></span></div></div>`;
    }
    const images=items.filter(item=>String(item?.kind||'')==='image'||/^(?:Image)$/i.test(String(item?.type||''))||/\.(?:png|jpe?g|webp)$/i.test(String(item?.name||'')));
    const files=items.filter(item=>!images.includes(item));
    const imageCards=images.slice(0,4).map(item=>`<div class="sent-attachment sent-image">${item.previewUrl?`<img src="${esc(item.previewUrl)}" alt="">`:`<i>IMG</i>`}<span><b>${esc(item.name||'Attached image')}</b><small>${esc(item.type||'Image')}${item.size?` · ${attachmentSize(item.size)}`:''}</small></span></div>`).join('');
    const visibleFiles=files.slice(0,3);
    const fileCards=visibleFiles.map(item=>{const glyph=/pdf/i.test(item.type||item.name||'')?'PDF':/zip|archive/i.test(item.type||item.name||'')?'ZIP':/code|javascript|typescript|python|html|css/i.test(item.type||'')?'CODE':'FILE';return `<div class="sent-attachment sent-file"><i>${esc(glyph)}</i><span><b>${esc(item.name||'Attachment')}</b><small>${esc(item.type||'File')}${item.size?` · ${attachmentSize(item.size)}`:''}</small></span></div>`}).join('');
    const extra=Math.max(0,images.length-4)+Math.max(0,files.length-visibleFiles.length);
    const more=extra?`<span class="sent-more-inline">+${extra}</span>`:'';
    return `<div class="sent-attachments${images.length>1?' has-image-grid':''}">${imageCards}${fileCards}${more}</div>`;
  }
  function format(text=''){
    let safe=esc(text).replace(/\r\n/g,'\n');
    const blocks=[];
    safe=safe.replace(/```([\w-]*)\n?([\s\S]*?)```/g,(_,lang,code)=>{const i=blocks.length;blocks.push(`<pre><code data-lang="${esc(lang)}">${code.trim()}</code></pre>`);return `@@CODE${i}@@`;});
    const inline=value=>String(value).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\$([^$\n]+)\$/g,'<span class="math-inline">$1</span>').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    const lines=safe.split('\n'),html=[];let i=0;
    while(i<lines.length){const line=lines[i];
      if(!line.trim()){i++;continue;}
      if(/^@@CODE\d+@@$/.test(line.trim())){html.push(line.trim());i++;continue;}
      if(/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)){html.push('<hr>');i++;continue;}
      const heading=line.match(/^(#{1,6})\s+(.+)$/);if(heading){html.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);i++;continue;}
      if(line.includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1]||'')){
        const cells=value=>value.replace(/^\s*\||\|\s*$/g,'').split('|').map(x=>inline(x.trim()));const head=cells(line);i+=2;const rows=[];while(i<lines.length&&lines[i].includes('|')&&lines[i].trim()){rows.push(cells(lines[i]));i++;}html.push(`<table><thead><tr>${head.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`);continue;
      }
      if(/^\s*[-*]\s+\[[ xX]\]\s+/.test(line)){const items=[];while(i<lines.length&&/^\s*[-*]\s+\[[ xX]\]\s+/.test(lines[i])){const m=lines[i].match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);items.push({done:/[xX]/.test(m?.[1]||''),text:m?.[2]||''});i++;}html.push(`<ul class="assistant-checklist">${items.map(x=>`<li class="${x.done?'done':''}"><span>${x.done?'✓':'○'}</span>${inline(x.text)}</li>`).join('')}</ul>`);continue;}
      if(/^\s*[-*]\s+/.test(line)){const items=[];while(i<lines.length&&/^\s*[-*]\s+/.test(lines[i])){items.push(lines[i].replace(/^\s*[-*]\s+/,''));i++;}html.push(`<ul>${items.map(x=>`<li>${inline(x)}</li>`).join('')}</ul>`);continue;}
      if(/^\s*\d+[.)]\s+/.test(line)){const items=[];while(i<lines.length&&/^\s*\d+[.)]\s+/.test(lines[i])){items.push(lines[i].replace(/^\s*\d+[.)]\s+/,''));i++;}html.push(`<ol>${items.map(x=>`<li>${inline(x)}</li>`).join('')}</ol>`);continue;}
      const paragraph=[];while(i<lines.length&&lines[i].trim()&&!/^(#{1,6})\s+/.test(lines[i])&&!/^@@CODE\d+@@$/.test(lines[i].trim())&&!/^\s*(?:[-*]|\d+[.)])\s+/.test(lines[i])&&!(lines[i].includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1]||''))){paragraph.push(inline(lines[i]));i++;}html.push(`<p>${paragraph.join('<br>')}</p>`);
    }
    return html.join('').replace(/@@CODE(\d+)@@/g,(_,index)=>blocks[Number(index)]||'');
  }
  function toolMetaMarkup(meta={}){
    const sources=Array.isArray(meta.sources)?meta.sources:[];const executions=Array.isArray(meta.executions)?meta.executions:[];const library=Array.isArray(meta.library)?meta.library:[];const trace=Array.isArray(meta.researchTrace)?meta.researchTrace:[];const chart=meta.chart&&Array.isArray(meta.chart.labels)&&Array.isArray(meta.chart.values)?meta.chart:null;
    const next=meta.nextAction&&typeof meta.nextAction==='object'?meta.nextAction:null;
    const max=chart?Math.max(...chart.values.map(Number).filter(Number.isFinite),1):1;
    const nextMarkup=next?`<div class="nexzo-next-actions" role="group" aria-label="Recommendation actions"><button class="nx-next-primary" type="button" data-next-action="study" data-recommendation-id="${esc(next.id||'')}">Start now</button><button class="nx-next-secondary" type="button" data-next-action="planner" data-recommendation-id="${esc(next.id||'')}">Add to Planner</button><a class="nx-next-link" href="personalization.html">View all recommendations</a></div>`:'';
    return `${nextMarkup}${trace.length?`<div class="tool-trace"><small>Research workflow</small>${trace.map((step,i)=>`<span>${i+1}. ${esc(step.stage||'step')} · ${Number(step.sources)||0} source${Number(step.sources)===1?'':'s'}</span>`).join('')}</div>`:''}${executions.length?`<div class="tool-execution"><small>Executed result</small>${executions.map(row=>`<pre><code>${esc(row.output||row.outcome||'Completed')}</code></pre>`).join('')}</div>`:''}${chart?`<div class="tool-chart"><b>${esc(chart.title||'Data visualization')}</b><div class="tool-chart-bars">${chart.labels.slice(0,16).map((label,i)=>`<div><span>${esc(label)}</span><i style="--bar:${Math.max(2,Math.round((Number(chart.values[i])||0)/max*100))}%"></i><em>${esc(chart.values[i])}</em></div>`).join('')}</div></div>`:''}${library.length?`<div class="tool-library">${library.map(file=>`<div class="library-file-row"><span>▤ ${esc(file.name)}</span><button type="button" data-library-download="${esc(file.id)}" data-library-name="${esc(file.name)}">Download</button></div>`).join('')}</div>`:''}${sources.length?`<div class="tool-sources">${sources.slice(0,10).map((src,i)=>`<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${i+1}. ${esc(src.title||'Source')}</a>`).join('')}</div>`:''}`;
  }
  function advancedLabel(tool=''){const map={search:'Web Search',research:'Deep Research',code:'Run Code',data:'Analyze Data','artifact:docx':'Create DOCX','artifact:pdf':'Create PDF','artifact:pptx':'Create PPTX','artifact:xlsx':'Create XLSX'};return map[tool]||tool;}
  function setAdvancedTool(tool=''){
    activeAdvancedTool=String(tool||'');els.composer.dataset.advancedTool=activeAdvancedTool;
    document.querySelector('.advanced-tool-chip')?.remove();
    if(activeAdvancedTool){const chip=document.createElement('div');chip.className='advanced-tool-chip';chip.innerHTML=`<span>✦ ${esc(advancedLabel(activeAdvancedTool))}</span><button type="button" aria-label="Clear selected tool">×</button>`;chip.querySelector('button').onclick=()=>setAdvancedTool('');els.composer.appendChild(chip);els.input.placeholder=`${advancedLabel(activeAdvancedTool)} — describe what you want…`;}
    else els.input.placeholder=modeConfig[activeStudyMode]?.placeholder||'Message NEXZO…';
  }

  function actionMarkup(action={}){
    const preview=action.preview||{},completed=action.status==='completed';
    return `<section class="assistant-action-card ${completed?'is-complete':''}" data-action-card="${esc(action.id||'')}"><div class="assistant-action-icon">${completed?'✓':'✦'}</div><div class="assistant-action-copy"><small>${completed?'ACTION COMPLETED':'CONFIRM ACTION'}</small><b>${esc(action.title||'Planner action')}</b><span>${esc(action.description||'')}</span>${preview.deadlineDate?`<em>${esc(preview.deadlineDate)} · ${esc(preview.deadlineTime||'23:59')} · ${esc(String(preview.priority||'Medium'))} priority</em>`:''}</div>${completed?'<strong>Saved</strong>':`<button type="button" data-confirm-action="${esc(action.id||'')}">Create task</button>`}</section>`;
  }
  function personalizationContext(){
    try{
      const s=window.NEXZOPersonalization?.snapshot?.()||{};const p=s.profile||{};const c=s.checkins?.[new Date().toLocaleDateString('en-CA')]||{};
      const weak=(s.weakTopics||[]).slice(0,4).map(x=>({subject:x.subject,topic:x.topic,mastery:x.score,status:x.status}));
      const next=(s.recommendations||[])[0]||null;
      return {enabled:s.memoryEnabled!==false,course:p.course||'',branch:p.branch||'',semester:p.semester||'',subjects:(p.subjects||[]).slice(0,12),careerGoal:p.careerGoal||'',language:p.language||'Hinglish',explanationStyle:p.explanationStyle||'',dailyMinutes:Number(p.dailyMinutes)||60,today:{availableMinutes:Number(c.availableMinutes)||0,energy:c.energy||'',workload:c.workload||'',focus:c.focus||''},weakTopics:weak,pendingTasks:(window.NEXZOTaskStore?.getAll?.()||[]).filter(t=>!t.completed).slice(0,6).map(t=>({title:t.title,subject:t.subject,deadline:t.deadline||t.deadlineDate||''})),mistakes:Object.values(s.mistakes||{}).sort((x,y)=>(y.count||0)-(x.count||0)).slice(0,6).map(m=>({subject:m.subject,topic:m.topic,concept:m.concept,count:m.count})),backlogs:(p.backlogs||[]).slice(0,8),examDates:p.examDates||{},nextAction:next?{subject:next.subject,topic:next.topic,mastery:next.mastery,durationMinutes:next.durationMinutes,action:next.action}:null};
    }catch{return {}}
  }
  function personalizedWelcome(){
    const pc=personalizationContext(),next=pc.nextAction;if(!pc.enabled||!next||!window.NEXZODataService?.getUser?.()?.uid)return '';
    return `<div class="personalized-welcome"><span>Personalized next</span><b>${esc(next.topic)}</b><small>${esc(next.subject)} · ${next.mastery!=null&&Number.isFinite(Number(next.mastery))?`${Number(next.mastery)}% mastery`:'Mastery not yet measured'}${Number(next.durationMinutes)>0?` · ${Number(next.durationMinutes)} min`:''}</small></div>`;
  }
  function render(){
    const current=session();
    if(!Array.isArray(current.messages)) current.messages=[];
    const list=current.messages;
    document.body.classList.toggle('has-conversation',Boolean(list.length));
    renderWorkflowBar();
    if(!list.length){const first=(($('profileName')?.textContent||'Student').trim().split(/\s+/)[0]||'Student');els.messages.innerHTML=`<div class="empty-state assistant-welcome"><div class="welcome-dashboard"><div class="welcome-head"><span class="welcome-kicker"><i></i>STUDY ASSISTANT</span><h2>Good to see you, ${esc(first)} <span>👋</span></h2><p>Let's learn, build and achieve together. Ask naturally — NEXZO will choose the right workflow.</p></div><div class="welcome-mode-grid"><button data-welcome-mode="chat" data-welcome-prompt=""><i>💬</i><b>Chat</b><small>Get answers</small></button><button data-welcome-mode="explain" data-welcome-prompt="Explain this clearly with a real-life example: "><i>💡</i><b>Explain</b><small>Concepts simply</small></button><button data-welcome-mode="chat" data-welcome-prompt="Solve this step by step: "><i>∑</i><b>Solve</b><small>Step by step</small></button><button data-welcome-mode="notes" data-welcome-prompt="Create notes and MCQs for: "><i>✦</i><b>Generate</b><small>Notes, MCQs, etc.</small></button><button data-welcome-mode="chat" data-welcome-prompt="Create a realistic study plan for: "><i>▣</i><b>Plan</b><small>Study & goals</small></button><button type="button" data-open-welcome-tools="true"><i>•••</i><b>More</b><small>All tools</small></button></div><div class="welcome-section-label"><span>✦</span>Quick actions</div><div class="welcome-quick"><button data-welcome-mode="chat" data-welcome-prompt="Summarize this topic clearly: ">◉ <span>Summarize a topic</span></button><button data-welcome-mode="chat" data-welcome-prompt="Solve this question: ">⌁ <span>Solve a question</span></button><button data-welcome-mode="chat" data-welcome-prompt="Create a study plan for this week: ">▣ <span>Create study plan</span></button><button data-welcome-mode="notes" data-welcome-prompt="Generate revision notes for: ">✦ <span>Generate notes</span></button><button data-welcome-mode="chat" data-welcome-prompt="Find reliable learning resources for: ">⌕ <span>Find resources</span></button></div>${personalizedWelcome()?`<div class="welcome-section-label suggestion-label"><span>◎</span>Suggested for you</div><div class="welcome-suggestions">${personalizedWelcome()}</div>`:''}</div></div>`;return;}
    els.messages.innerHTML=list.map((m,i)=>`<div class="message-row ${m.role==='user'?'user':'assistant'}">${m.role==='assistant'?assistantAvatarMarkup():''}<div class="bubble${m.streaming?' is-streaming':''}${m.imageDataUrl?' has-generated-image':''}${m.attachments?.length?' has-attachments':''}">${m.role==='user'?sentAttachmentMarkup(m.attachments):''}${m.role==='assistant'&&m.streaming&&m.placeholder?thinkingMarkup():format(m.content)}${m.imageDataUrl?`<figure class="generated-image-card"><img src="${esc(m.imageDataUrl)}" alt="NEXZO image"><figcaption><span><b>Image result</b><small>${esc(m.imageMeta?.model||'NEXZO Image')}</small></span><button type="button" data-save-image="${i}">Save image</button></figcaption></figure>`:''}${m.role==='assistant'&&m.action?actionMarkup(m.action):''}${m.role==='assistant'&&m.toolMeta?toolMetaMarkup(m.toolMeta):''}${m.role==='assistant'&&!m.streaming?`<div class="bubble-actions" data-actions="${i}">
          <button class="action-icon" title="Copy" aria-label="Copy answer" data-copy="${i}">⧉</button>
          <button class="action-icon" title="Helpful" aria-label="Mark helpful" data-rate="up" data-index="${i}">♡</button>
          <button class="action-icon" title="Not helpful" aria-label="Mark not helpful" data-rate="down" data-index="${i}">♧</button>
          <button class="action-icon" title="Save to My Resources" aria-label="Save answer to My Resources" data-save-resource="${i}">☆</button>
          <button class="action-icon" title="Download answer" aria-label="Download answer" data-download="${i}">⇩</button>
          <button class="action-icon" title="Regenerate" aria-label="Regenerate answer" data-regenerate="${i}">↻</button>
          <div class="more-wrap">
            <button class="action-icon more-trigger" title="More" aria-label="More actions" aria-expanded="false" data-more="${i}">•••</button>
            <div class="message-more-menu" data-more-menu="${i}" hidden>
              <button data-followup="simpler" data-index="${i}"><span>💡</span><span>Explain simpler</span></button>
              <button data-followup="notes" data-index="${i}"><span>📝</span><span>Make notes</span></button>
              <button data-followup="quiz" data-index="${i}"><span>🧠</span><span>Quiz me</span></button>
              <button data-followup="planner" data-index="${i}"><span>📅</span><span>Add to Planner</span></button>
              <button data-sources="${i}"><span>▣</span><span>View sources</span></button>
              <button data-download="${i}"><span>⇩</span><span>Download answer</span></button>
              <button data-speak="${i}"><span>🔊</span><span>${speakingIndex===i?'Stop reading':'Read aloud'}</span></button>
            </div>
          </div>
        </div>`:''}</div>${m.role==='user'?userAvatarMarkup():''}</div>`).join('');
    els.messages.scrollTop=els.messages.scrollHeight;
  }
  function add(role,content,meta={}){const s=session(),clean=String(content||'').trim(),now=Date.now();if(!clean)return null;const recent=[...s.messages].reverse().find(m=>m.role===role&&m.content.trim()===clean&&now-Number(m.at||0)<5000);if(recent)return recent;const item={id:`msg-${now}-${Math.random().toString(36).slice(2,7)}`,role,content:clean,at:now,...(Array.isArray(meta.attachments)&&meta.attachments.length?{attachments:meta.attachments}:{})};s.messages.push(item);if(role==='user'&&s.title==='New chat')s.title=clean.slice(0,42)||'New chat';s.updatedAt=now;save();render();return item;}
  function addAssistantTool(content,toolMeta={}){const s=session();const item={id:`msg-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,role:'assistant',content:String(content||'').trim(),at:Date.now(),toolMeta};s.messages.push(item);s.updatedAt=Date.now();save();render();return item;}
  async function addAssistant(content){const s=session();const item={id:`msg-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,role:'assistant',content:'',at:Date.now()};s.messages.push(item);s.updatedAt=Date.now();save();const step=Math.max(5,Math.ceil(content.length/80));for(let i=0;i<content.length;i+=step){item.content=content.slice(0,i+step);render();await new Promise(r=>setTimeout(r,10));}item.content=content;save();render();}
  function addAssistantImage({dataUrl,prompt,model,mimeType,interactionId}){
    const safeMime=/^image\/(jpeg|png|webp|gif|bmp|tiff)$/i.test(String(mimeType||''))?String(mimeType).toLowerCase():'image/jpeg';
    const s=session();const item={id:`msg-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,role:'assistant',content:`Created an image for: ${String(prompt||'your request').trim()}`,at:Date.now(),imageDataUrl,imageMeta:{model:model||'NEXZO Image',mimeType:safeMime,interactionId:interactionId||''}};
    s.messages.push(item);s.updatedAt=Date.now();save();render();return item;
  }
  function beginStreamingAssistant(){const s=session();const item={id:`msg-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,role:'assistant',content:'',at:Date.now(),streaming:true,placeholder:true};s.messages.push(item);s.updatedAt=Date.now();render();return item;}
  function updateStreamingAssistant(item,content){const next=String(content||'');if(!next)return;item.content=next;delete item.placeholder;render();}
  function finishStreamingAssistant(item,content){item.content=String(content||'').trim();delete item.streaming;delete item.placeholder;session().updatedAt=Date.now();save();render();return item.content;}
  function removeStreamingAssistant(item){const s=session();s.messages=s.messages.filter(message=>message!==item);save();render();}

  function hubResourceKey(){const u=window.NEXZOSettings?.uid?.()||window.NEXZOSharedState?.currentUid?.()||'guest';return `nexzo_engagement_hub_v3:${u}`;}
  function saveAnswerToResources(index){
    const message=session().messages[Number(index)];if(!message||message.role!=='assistant')return;
    let state={};try{state=JSON.parse(localStorage.getItem(hubResourceKey())||'{}')||{}}catch{}
    const resources=Array.isArray(state.resources)?state.resources:[];
    const title=(session().title||`${modeConfig[activeStudyMode]?.label||'Study'} answer`).slice(0,80);
    const id=`chat-resource-${message.id}`;
    if(resources.some(r=>r.id===id)){window.NEXZOShell?.toast?.('Already saved in My Resources');return;}
    state.resources=[{id,title,type:activeStudyMode==='notes'?'Notes':'Bookmark',subject:'Study Assistant',tags:[activeStudyMode,'saved-chat'],url:message.content,createdAtMs:Date.now(),source:'study-assistant'},...resources].slice(0,200);
    localStorage.setItem(hubResourceKey(),JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('nexzo:hub-state-updated'));
    window.NEXZOShell?.toast?.('Saved to My Resources');
  }
  function dispatchLearningEvent(event={}){
    if(!event?.kind)return;const score=Math.max(0,Math.min(100,Number(event.score)||0));
    window.dispatchEvent(new CustomEvent('nexzo:ai-learning-complete',{detail:{...event,id:event.id||`${event.kind}:${currentId}:${Date.now()}`,subject:event.subject||'Study',topic:event.topic||event.subject||'Study',score}}));
  }
  function structuredCompletion(reply,mode=activeStudyMode){
    const text=String(reply||'');
    if(mode==='quiz'&&/(quiz (?:is )?complete|final score|you scored|score\s*[:=-]\s*\d+\s*\/\s*5)/i.test(text)){
      const m=text.match(/(?:score|scored)[^0-9]*(\d+)(?:\s*\/\s*(\d+))?/i),score=m?Math.round((Number(m[1])/(Number(m[2])||5))*100):70;
      dispatchLearningEvent({kind:'quiz',subject:session().title||'Study',topic:session().title||'Study',score,fallbackDetected:true});
    }
    if(mode==='interview'&&/(interview (?:is )?complete|final score|overall score|strengths[\s\S]{0,300}weak)/i.test(text)){
      const m=text.match(/(?:score|rating)[^0-9]*(\d+)(?:\s*\/\s*(10|100))?/i),score=m?Math.round((Number(m[1])/(Number(m[2])||10))*100):70;
      dispatchLearningEvent({kind:'interview',subject:'Career',topic:session().title||'Interview',score,fallbackDetected:true});
    }
  }

  function thinkingLabel(){
    const elapsed=Math.max(0,Date.now()-thinkingStartedAt);
    if(document.body.dataset.generatingImage==='true'){if(elapsed<1800)return 'Composing your image';if(elapsed<5200)return 'Rendering details';return 'Finishing the image';}
    if(activeRequestFiles){
      if(elapsed<1800)return 'Reading files';
      if(elapsed<4800)return 'Thinking';
      return 'Preparing answer';
    }
    if(elapsed<1600)return 'Understanding your question';
    if(elapsed<4200)return 'Building the answer';
    return 'Finishing the response';
  }
  function thinkingMarkup(){return `<div class="thinking-card"><span class="thinking-spark" aria-hidden="true"></span><span class="thinking-copy"><b>${document.body.dataset.generatingImage==='true'?'Creating':'Thinking'}<span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span></b></span></div>`;}
  function refreshThinking(){
    const row=document.querySelector('.thinking-row .bubble');if(row)row.innerHTML=thinkingMarkup();
    const stream=document.querySelector('.bubble.is-streaming');if(stream&&stream.closest('.assistant')&&stream.textContent.trim()==='')stream.innerHTML=thinkingMarkup();
    const companion=$('nexzoCompanion');if(companion?.classList.contains('is-thinking'))$('companionText')&&( $('companionText').textContent=thinkingLabel()+'.' );
  }
  function setThinking(on){
    document.querySelector('.thinking-row')?.remove();clearInterval(thinkingTimer);thinkingTimer=null;
    const companion=$('nexzoCompanion');companion?.classList.toggle('is-thinking',Boolean(on));
    if(on){thinkingStartedAt=Date.now();els.messages.insertAdjacentHTML('beforeend',`<div class="message-row assistant thinking-row">${assistantAvatarMarkup()}<div class="bubble">${thinkingMarkup()}</div></div>`);els.messages.scrollTop=els.messages.scrollHeight;thinkingTimer=setInterval(refreshThinking,900);}
    else if($('companionText'))$('companionText').textContent='Ready.';
  }
  function setStatus(text,state,detail=''){
    els.status.textContent=text;els.status.className=`status ${state}`;
    const serverReady=state==='online'||state==='limited';
    if(els.notice){
      const importantFailure=Boolean(lastFailedRequest)||text==='Configuration required';
      els.notice.hidden=!importantFailure;
      const friendly=detail || (text==='Configuration required'?'Study Assistant setup needs attention.':'That request could not be completed. Your message is saved.');
      els.notice.querySelector('span').textContent=importantFailure?friendly:'';
    }
    if(els.retry)els.retry.textContent=lastFailedRequest?'Retry':'Reconnect';
    els.input.disabled=false;
    els.input.placeholder=state==='limited'?'Message NEXZO…':(modeConfig[activeStudyMode]?.placeholder||'Message NEXZO…');
    els.send.disabled=sending;
    if(state==='checking'&&!lastFailedRequest){els.status.textContent='Connecting…';els.status.className='status checking';}
    if(state==='offline'&&!lastFailedRequest){els.status.textContent='Backend offline';els.status.className='status offline';}
    if(state==='error'&&lastFailedRequest){els.status.textContent='Retry available';els.status.className='status limited';}
    void serverReady;
  }

  async function fetchWithTimeout(url,options={},timeout=65000){
    const controller=new AbortController();
    const external=options.signal||activeRequestController?.signal;
    const abort=()=>controller.abort();
    if(external?.aborted)controller.abort();else external?.addEventListener?.('abort',abort,{once:true});
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{return await fetch(url,{...options,signal:controller.signal,cache:'no-store'});}finally{clearTimeout(timer);external?.removeEventListener?.('abort',abort);}
  }
  async function readJsonSafely(response){
    const text=await response.text();
    if(!text.trim()) throw new Error(`Server returned an empty response (${response.status})`);
    try{return JSON.parse(text);}catch{throw new Error(`Server returned invalid data (${response.status})`);}
  }
  async function firebaseToken(){
    try{
      let auth;
      if(window.NEXZOFirebase?.getAuthContext){
        ({auth}=await window.NEXZOFirebase.getAuthContext());
      }else if(typeof window.getFirebaseAuthCompat==='function'){
        ({auth}=await window.getFirebaseAuthCompat());
      }
      if(!auth)return '';
      await auth.authStateReady?.();
      return auth.currentUser?await auth.currentUser.getIdToken():'';
    }catch{return ''}
  }
  async function protectedHeaders(headers={}){
    const token=await firebaseToken();
    return {...headers,...(token?{Authorization:`Bearer ${token}`}:{})};
  }
  async function health(deep=false){
    const now=Date.now();
    if(healthInFlight)return healthInFlight;
    if(!deep&&now-lastHealthAt<30000)return els.status.classList.contains('online')||els.status.classList.contains('limited');
    healthInFlight=(async()=>{try{
      const healthTimeout=remoteBackend?4500:3000;
      const r=await fetchWithTimeout(api('/api/health'),{},healthTimeout);
      const d=await readJsonSafely(r);
      if(!r.ok||!d.ok){setStatus('Ready','checking');return false;}
      backendHealth=d;backendCapabilities={...(d.capabilities||{})};syncToolAvailability();
      if(d.geminiConfigured===false){setStatus('Configuration required','offline','The backend is online, but the model is not configured.');return false;}
      setStatus('NEXZO AI Ready','online');
      els.status.title=`Backend ${d.version||'unknown'} · the model is verified after a successful answer · ${Object.entries(backendCapabilities).filter(([,v])=>v===true).map(([k])=>k).join(', ')||'base chat'}`;
      return true;
    }catch{setStatus('Ready','checking');return false;}finally{lastHealthAt=Date.now();healthInFlight=null;}})();
    return healthInFlight;
  }
  async function postJson(url,payload){
    let lastError;
    for(let attempt=0;attempt<3;attempt++){
      try{
        const headers=await protectedHeaders({'Content-Type':'application/json','Accept':'application/json'});
        const r=await fetchWithTimeout(url,{method:'POST',headers,body:JSON.stringify(payload)},65000);
        const d=await readJsonSafely(r);
        if(!r.ok||!d.ok) throw new Error(d.message||`AI request failed (${r.status})`);
        return d;
      }catch(error){lastError=error;if(attempt<2){setStatus('Connecting…','checking','Waking the Study Assistant backend and retrying automatically.');await health(true).catch(()=>false);await new Promise(resolve=>setTimeout(resolve,attempt===0?1200:2500));}}
    }
    throw lastError;
  }
  async function analyzeFile(file,prompt){
    const fd=new FormData();fd.append('file',file);fd.append('prompt',prompt);
    const headers=await protectedHeaders();
    const r=await fetchWithTimeout(api('/api/ai/analyze'),{method:'POST',headers,body:fd},90000);
    const d=await readJsonSafely(r);
    if(!r.ok||!d.ok)throw new Error(d.message||`File analysis failed (${r.status})`);
    return d;
  }
  function isRouteMissing(response,data){
    const message=String(data?.message||'');
    return response?.status===404||/route not found|endpoint not found|cannot post/i.test(message);
  }
  async function legacyProjectFallback(files,prompt,kind='files'){
    const textFiles=[],binaryFiles=[];
    for(const file of files){
      if(/^(?:text\/|application\/(?:json|javascript|xml))/i.test(file.type||'')||/\.(?:txt|md|json|js|mjs|cjs|ts|tsx|jsx|html|css|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sql|xml|ya?ml|toml|vue|svelte|csv)$/i.test(file.name||''))textFiles.push(file);
      else binaryFiles.push(file);
    }
    const sections=[];let used=0;const MAX_CONTEXT=240000;
    for(const file of textFiles){
      if(used>=MAX_CONTEXT)break;
      let text='';try{text=await file.text()}catch{}
      if(!text)continue;
      const path=attachmentPath(file),remaining=MAX_CONTEXT-used,chunk=text.slice(0,remaining);
      sections.push(`\n===== FILE: ${path} =====\n${chunk}`);used+=chunk.length;
    }
    const binaryNotes=[];
    for(const file of binaryFiles.slice(0,4)){
      try{const d=await analyzeFile(file,`Read this attachment as one part of a larger ${kind==='folder'?'project':'multi-file'} request. Extract only the facts, visible content, structure and details needed to answer this user request later: ${prompt.slice(0,1200)}`);if(d?.reply)binaryNotes.push(`\n===== ATTACHMENT: ${attachmentPath(file)} =====\n${d.reply}`);}catch(error){binaryNotes.push(`\n===== ATTACHMENT: ${attachmentPath(file)} =====\nCould not inspect this binary attachment: ${error.message}`)}
    }
    if(!sections.length&&!binaryNotes.length)throw new Error('The deployed Study backend is outdated and these files cannot be processed with compatibility mode. Redeploy the Backend from this ZIP.');
    const manifest=files.map((file,index)=>`${index+1}. ${attachmentPath(file)}`).join('\n');
    const packed=[`NEXZO multi-file compatibility context.\nUser request: ${prompt}\n\nManifest (${files.length} files):\n${manifest}`,sections.join(''),binaryNotes.join('')].join('\n');
    const virtualFile=new File([packed],kind==='folder'?'nexzo-project-context.txt':'nexzo-multifile-context.txt',{type:'text/plain'});
    const d=await analyzeFile(virtualFile,`${prompt}\n\nUse ALL useful information in the attached packed context. Treat each ===== FILE ===== section as a separate original file. If some files were truncated, mention that only if it materially limits the answer.`);
    return {...d,compatibilityMode:true,fileCount:files.length};
  }
  async function analyzeFiles(files,prompt,kind='files'){
    if(files.length===1&&kind!=='folder')return analyzeFile(files[0],prompt);
    // Contract negotiation: never call a route the deployed backend says it does not support.
    if(backendHealth && !capability('projectAnalysis')) return legacyProjectFallback(files,prompt,kind);
    const fd=new FormData();
    files.forEach(file=>{fd.append('files',file,file.name);fd.append('paths',attachmentPath(file))});
    fd.append('prompt',prompt);fd.append('kind',kind);
    const headers=await protectedHeaders();
    const r=await fetchWithTimeout(api('/api/ai/analyze-project'),{method:'POST',headers,body:fd},120000);
    let d;try{d=await readJsonSafely(r)}catch(error){if(r.status===404)return legacyProjectFallback(files,prompt,kind);throw error}
    if(isRouteMissing(r,d))return legacyProjectFallback(files,prompt,kind);
    if(!r.ok||!d.ok)throw new Error(d.message||`Project analysis failed (${r.status})`);
    return d;
  }
  const IMAGE_CREATE_RE=/(?:generate|create|make|draw|design|render|illustrate|visuali[sz]e|bana(?:o|do)?|bna(?:o|do)?|banao|bnado|image bana|photo bana|picture bana|poster bana|logo bana|wallpaper bana).{0,60}(?:image|photo|picture|poster|logo|wallpaper|illustration|art|graphic|diagram|cartoon)|(?:image|photo|picture|poster|logo|wallpaper|illustration|art|graphic|diagram|cartoon).{0,60}(?:generate|create|make|draw|design|render|bana(?:o|do)?|bna(?:o|do)?|banao|bnado)/i;
  const IMAGE_EDIT_RE=/(?:edit|change|replace|remove|add|transform|restyle|style|retouch|enhance|fix|modify|background|crop|upscale|clean|cartoon|anime|cinematic|bana(?:o|do)?|bna(?:o|do)?)/i;
  function wantsImageOutput(text,files=[]){const value=String(text||'').trim();const images=files.filter(file=>/^image\/(png|jpeg|webp)$/i.test(file.type)||/\.(png|jpe?g|webp)$/i.test(file.name||''));return IMAGE_CREATE_RE.test(value)||(images.length>0&&IMAGE_EDIT_RE.test(value));}
  function preferredAspectRatio(text=''){const value=String(text).toLowerCase();if(/16\s*[:x]\s*9|landscape|wallpaper|youtube|banner/.test(value))return'16:9';if(/9\s*[:x]\s*16|portrait|story|reel|phone/.test(value))return'9:16';if(/4\s*[:x]\s*5|instagram post/.test(value))return'4:5';if(/3\s*[:x]\s*2/.test(value))return'3:2';return'1:1';}
  async function generateImage(files,prompt){
    const fd=new FormData();fd.append('prompt',String(prompt||'').trim());fd.append('aspectRatio',preferredAspectRatio(prompt));fd.append('imageSize','1K');
    files.filter(file=>/^image\/(png|jpeg|webp)$/i.test(file.type)||/\.(png|jpe?g|webp)$/i.test(file.name||'')).slice(0,4).forEach(file=>fd.append('images',file,file.name||'reference.png'));
    const headers=await protectedHeaders();const r=await fetchWithTimeout(api('/api/ai/image'),{method:'POST',headers,body:fd},150000);const d=await readJsonSafely(r);
    if(!r.ok||!d.ok)throw new Error(d.message||`Image generation failed (${r.status})`);if(!d.image?.data)throw new Error('Image service returned no image data');
    const mime=/^image\/(jpeg|png|webp|gif|bmp|tiff)$/i.test(String(d.image.mimeType||''))?String(d.image.mimeType).toLowerCase():'image/jpeg';
    const raw=String(d.image.data||'');
    return {...d,dataUrl:raw.startsWith('data:')?raw:`data:${mime};base64,${raw}`};
  }
  async function advancedJson(path,payload){const headers=await protectedHeaders({'Content-Type':'application/json'});const r=await fetchWithTimeout(api(`/api/tools/${path}`),{method:'POST',headers,body:JSON.stringify(payload)},path==='research'||path==='code'?135000:100000);const d=await readJsonSafely(r);if(!r.ok||!d.ok)throw new Error(d.message||`${advancedLabel(activeAdvancedTool)} failed (${r.status})`);return d;}
  function autoToolFor(text='',files=[]){
    const value=String(text||'').trim().toLowerCase();
    const names=files.map(f=>String(f?.name||'').toLowerCase());
    const hasData=names.some(n=>/\.(csv|tsv|xlsx?|json)$/.test(n));
    const hasProject=files.length>1||names.some(n=>/\.(zip|js|ts|tsx|jsx|html|css|py|java|c|cpp|go|rs|php|vue|svelte)$/.test(n));
    const scores={};const add=(tool,points)=>{scores[tool]=(scores[tool]||0)+points};
    if(hasProject){add('project-edit',1);if(/\b(edit|modify|change|fix|repair|implement|refactor|redesign|update|replace|patch|make .* work|sahi kar|thik kar)\b/i.test(value))add('project-edit',7);}
    if(hasData){add('data',2);if(/\b(analy[sz]e|analysis|chart|graph|statistics|average|trend|dataset|spreadsheet|excel|csv|calculate)\b/i.test(value))add('data',6);}
    if(/\b(deep research|research deeply|comprehensive research|multi[- ]source|investigate thoroughly|deeply research)\b/i.test(value))add('research',8);
    if(/\b(search (?:the )?web|web search|look up online|google (?:this|it)|latest|today'?s|current|recent news|right now|live price|current price|current version|current information)\b/i.test(value))add('search',6);
    if(/\b(run|execute|test)\b.{0,24}\b(code|python|javascript|program|script)\b|\b(code execution|calculate using python|use python|run this code)\b/i.test(value))add('code',7);
    const artifactRules=[['artifact:docx',/\b(create|make|generate|export|build)\b.{0,40}\b(docx|word document|word file)\b/i],['artifact:pdf',/\b(create|make|generate|export|build)\b.{0,40}\b(pdf|pdf report|printable report)\b/i],['artifact:pptx',/\b(create|make|generate|export|build)\b.{0,40}\b(pptx|powerpoint|presentation|slide deck|slides)\b/i],['artifact:xlsx',/\b(create|make|generate|export|build)\b.{0,40}\b(xlsx|excel|spreadsheet|workbook)\b/i]];
    artifactRules.forEach(([tool,re])=>{if(re.test(value))add(tool,8)});
    const ranked=Object.entries(scores).filter(([tool])=>toolAvailable(tool)).sort((a,b)=>b[1]-a[1]);
    if(!ranked.length||ranked[0][1]<5)return '';
    // Avoid surprising automation when two different intents are equally plausible.
    if(ranked[1]&&ranked[0][1]===ranked[1][1])return '';
    return ranked[0][0];
  }
  async function modelToolFor(text='',files=[]){
    // Fast path: local intent routing already recognizes every advanced-tool trigger.
    // Do not spend a separate model round-trip before ordinary chat; it was the main
    // cause of the long blank "Thinking" state before streaming even started.
    const fallback=autoToolFor(text,files);
    if(fallback)return fallback;
    return '';
  }
  async function runAdvancedTool(tool,prompt,files=[]){
    if(tool==='search'||tool==='research'||tool==='code')return advancedJson(tool,{prompt});
    if(tool==='data'){
      const fd=new FormData();fd.append('prompt',prompt);if(files[0])fd.append('file',files[0],files[0].name);const headers=await protectedHeaders();const r=await fetchWithTimeout(api('/api/tools/data'),{method:'POST',headers,body:fd},135000);const d=await readJsonSafely(r);if(!r.ok||!d.ok)throw new Error(d.message||`Data analysis failed (${r.status})`);return d;
    }
    if(tool.startsWith('artifact:')){
      const type=tool.split(':')[1],headers=await protectedHeaders({'Content-Type':'application/json'});const r=await fetchWithTimeout(api('/api/tools/artifact'),{method:'POST',headers,body:JSON.stringify({prompt,type,title:session().title||'NEXZO artifact'})},135000);if(!r.ok){let d={};try{d=await r.json()}catch{}throw new Error(d.message||`Artifact creation failed (${r.status})`);}const blob=await r.blob();const disposition=r.headers.get('content-disposition')||'',match=disposition.match(/filename="?([^";]+)"?/i),name=match?.[1]||`nexzo.${type}`;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);return {ok:true,text:`Created **${name}** and started the download.`,artifact:{name,type}};
    }
    if(tool==='project-edit'){
      if(!files.length)throw new Error('Attach a project folder/files first, then use Edit Project.');const fd=new FormData();fd.append('prompt',prompt);files.forEach(file=>{fd.append('files',file,file.name);fd.append('paths',attachmentPath(file))});const headers=await protectedHeaders();const r=await fetchWithTimeout(api('/api/tools/project-edit'),{method:'POST',headers,body:fd},150000);if(!r.ok){let d={};try{d=await r.json()}catch{}throw new Error(d.message||`Project edit failed (${r.status})`);}const blob=await r.blob(),disposition=r.headers.get('content-disposition')||'',name=disposition.match(/filename="?([^";]+)"?/i)?.[1]||'nexzo-edited-project.zip';const summary=decodeURIComponent(r.headers.get('x-nexzo-summary')||'Project edited successfully.');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);return {ok:true,text:`${summary}

Created **${name}** and started the download.`};
    }
    throw new Error('Unknown advanced tool.');
  }
  async function librarySave(){if(!pendingFiles.length){window.NEXZOShell?.toast?.('Attach files first.','error');return;}setThinking(true);try{const fd=new FormData();pendingFiles.slice(0,10).forEach(file=>fd.append('files',file,file.name));const headers=await protectedHeaders();const r=await fetchWithTimeout(api('/api/tools/library'),{method:'POST',headers,body:fd},120000);const d=await readJsonSafely(r);if(!r.ok||!d.ok)throw new Error(d.message||'Cloud save failed');clearAttachments();addAssistantTool(`Saved **${d.files?.length||0} file(s)** to your NEXZO cloud library.`);closeAll();}catch(e){window.NEXZOShell?.toast?.(e.message||'Cloud save failed','error')}finally{setThinking(false)}}
  async function libraryList(){setThinking(true);try{const headers=await protectedHeaders();const r=await fetchWithTimeout(api('/api/tools/library'),{headers},60000);const d=await readJsonSafely(r);if(!r.ok||!d.ok)throw new Error(d.message||'Could not load library');const rows=(d.files||[]).slice(0,25);const content=rows.length?`## Your file library\n\n${rows.map((f,i)=>`${i+1}. **${f.name}** — ${attachmentSize(f.size)}`).join('\n')}`:'Your NEXZO file library is empty.';addAssistantTool(content,{library:rows});closeAll();}catch(e){window.NEXZOShell?.toast?.(e.message||'Could not load library','error')}finally{setThinking(false)}}
  async function showMemory(){setThinking(true);try{const headers=await protectedHeaders();const r=await fetchWithTimeout(api('/api/tools/memory'),{headers},60000);const d=await readJsonSafely(r);if(!r.ok||!d.ok)throw new Error(d.message||'Could not load memory');const m=d.memory||{};addAssistantTool(`## NEXZO memory\n\n**Preferred language:** ${m.preferredLanguage||'Not learned yet'}\n\n**Recent intents:** ${(m.recentIntents||[]).join(', ')||'None'}\n\n**Recent topics:**\n${(m.recentTopics||[]).map(x=>`- ${x}`).join('\n')||'- None yet'}`);closeAll();}catch(e){window.NEXZOShell?.toast?.(e.message||'Could not load memory','error')}finally{setThinking(false)}}
  async function createSchedule(){const title=prompt('Schedule title?','NEXZO check');if(!title)return;const taskPrompt=prompt('What should NEXZO research/check?','Check for updates and summarize anything important.');if(!taskPrompt)return;const when=prompt('Run at (example: 2026-09-03T09:00:00+05:30)?',new Date(Date.now()+3600000).toISOString());if(!when)return;const repeat=(prompt('Repeat: none, daily, or weekly?','none')||'none').toLowerCase();setThinking(true);try{const d=await advancedJson('schedules',{title,prompt:taskPrompt,runAt:new Date(when).toISOString(),repeat:['daily','weekly'].includes(repeat)?repeat:'none'});addAssistantTool(`Scheduled **${d.task.title}** for ${new Date(d.task.runAt).toLocaleString()}${d.task.repeat!=='none'?` · repeats ${d.task.repeat}`:''}. NEXZO checks due tasks while the app/backend is active.`);closeAll();}catch(e){window.NEXZOShell?.toast?.(e.message||'Could not create schedule','error')}finally{setThinking(false)}}
  async function startBackgroundAgent(){const type=(prompt('Agent type: research, search, or code?','research')||'research').toLowerCase();const task=prompt('What should the background agent do?','Research this topic and return the important findings.');if(!task)return;setThinking(true);try{const d=await advancedJson('jobs',{prompt:task,type:['search','code'].includes(type)?type:'research'});const tracker=addAssistantTool(`Background agent **${d.job.id.slice(0,8)}** — queued (0%).`);closeAll();const id=d.job.id;const poll=setInterval(async()=>{try{const headers=await protectedHeaders();const r=await fetchWithTimeout(api(`/api/tools/jobs/${id}`),{headers},30000),x=await readJsonSafely(r);if(!x.ok)return;if(tracker&&['queued','running','retrying'].includes(x.job.status)){tracker.content=`Background agent **${id.slice(0,8)}** — ${x.job.stage||x.job.status} (${Number(x.job.progress)||0}%).`;save();render();}if(x.job.status==='completed'){clearInterval(poll);addAssistantTool(`## Background agent completed\n\n${x.job.result?.text||'Completed.'}`,{sources:x.job.result?.sources||[],executions:x.job.result?.executions||[]});if(Notification.permission==='granted')new Notification('NEXZO agent completed',{body:task.slice(0,100)});}else if(x.job.status==='failed'||x.job.status==='cancelled'){clearInterval(poll);addAssistantTool(x.job.status==='cancelled'?'Background agent cancelled.':`Background agent failed: ${x.job.error||'Unknown error'}`);}}catch{}},5000);}catch(e){window.NEXZOShell?.toast?.(e.message||'Could not start agent','error')}finally{setThinking(false)}}
  function liveVoiceSpeak(text){if(!liveVoiceMode||!('speechSynthesis'in window))return;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(String(text||'').replace(/[#*_`]/g,' ').slice(0,3000));u.lang=/\b(kya|kaise|hai|nahi|mujhe|yaar)\b/i.test(text)?'hi-IN':'en-IN';u.rate=1;u.onend=()=>{if(liveVoiceMode)setTimeout(()=>voice(),350)};window.speechSynthesis.speak(u);}
  function toggleLiveVoice(){liveVoiceMode=!liveVoiceMode;document.body.dataset.liveVoice=String(liveVoiceMode);window.NEXZOShell?.toast?.(liveVoiceMode?'Hands-free voice mode on':'Hands-free voice mode off',liveVoiceMode?'success':'info');closeAll();if(liveVoiceMode){if(Notification.permission==='default')Notification.requestPermission?.();voice();}else{recognition?.stop?.();window.speechSynthesis?.cancel?.();}}
  async function checkSchedules(){try{const headers=await protectedHeaders({'Content-Type':'application/json'});if(!headers.Authorization)return;const r=await fetchWithTimeout(api('/api/tools/schedules/check'),{method:'POST',headers,body:'{}'},135000),d=await readJsonSafely(r);if(!r.ok||!d.ok)return;for(const row of d.due||[]){addAssistantTool(`## Scheduled task: ${row.title}\n\n${row.result||'Completed.'}`,{sources:row.sources||[]});if(Notification.permission==='granted')new Notification(`NEXZO: ${row.title}`,{body:String(row.result||'Completed').slice(0,120)});}}catch{}}

  async function googleApi(path,{method='GET',body=null}={}){const headers=await protectedHeaders(body?{'Content-Type':'application/json'}:{});const r=await fetchWithTimeout(api(`/api/google/${path}`),{method,headers,...(body?{body:JSON.stringify(body)}:{})},90000);const d=await readJsonSafely(r);if(!r.ok||!d.ok)throw new Error(d.message||`Google action failed (${r.status})`);return d;}
  async function googleActions(){
    closeAll();setThinking(true);
    try{
      let status=await googleApi('status');
      if(!status.configured){addAssistantTool('## Google connection needs backend setup\n\nAdd `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, and `GOOGLE_OAUTH_TOKEN_SECRET` on Render. Then this button connects Gmail + Calendar through OAuth without exposing tokens to the browser.');return;}
      if(!status.connected){const d=await googleApi('auth-url');window.open(d.url,'nexzo-google-oauth','width=620,height=760');addAssistantTool('Google authorization opened in a separate window. Approve Gmail + Calendar access, close the window, then press **Google Actions** again.');return;}
      const action=(prompt('Google action: gmail, calendar, draft, event, or disconnect?','gmail')||'gmail').toLowerCase();
      if(action==='gmail'){
        const q=prompt('Gmail search query?','newer_than:30d')||'newer_than:30d';const d=await googleApi(`gmail/search?q=${encodeURIComponent(q)}`);addAssistantTool(`## Gmail results\n\n${(d.messages||[]).map((m,i)=>`${i+1}. **${m.subject}**\n   ${m.from}\n   ${m.date}\n   ${m.snippet}`).join('\n\n')||'No matching messages.'}`);
      }else if(action==='calendar'){
        const d=await googleApi('calendar/events');addAssistantTool(`## Upcoming Calendar events\n\n${(d.events||[]).map((e,i)=>`${i+1}. **${e.summary}** — ${e.start}`).join('\n')||'No upcoming events.'}`);
      }else if(action==='draft'){
        const to=prompt('Draft recipient email?','');if(!to)return;const subject=prompt('Subject?','NEXZO draft');if(!subject)return;const body=prompt('Draft body?','');if(!body)return;const d=await googleApi('gmail/draft',{method:'POST',body:{to,subject,body}});addAssistantTool(`Gmail draft created successfully. Draft ID: **${d.draftId||'created'}**. It was **not sent**.`);
      }else if(action==='event'){
        const summary=prompt('Event title?','Study session');if(!summary)return;const start=prompt('Start date/time (ISO or local parseable)?',new Date(Date.now()+3600000).toISOString());if(!start)return;const end=prompt('End date/time?',new Date(Date.now()+7200000).toISOString());if(!end)return;const d=await googleApi('calendar/events',{method:'POST',body:{summary,start:new Date(start).toISOString(),end:new Date(end).toISOString()}});addAssistantTool(`Calendar event **${d.event.summary}** created successfully.`);
      }else if(action==='disconnect'){
        await googleApi('connection',{method:'DELETE'});addAssistantTool('Google Gmail + Calendar connection removed from NEXZO.');
      }
    }catch(e){window.NEXZOShell?.toast?.(e.message||'Google action failed','error')}finally{setThinking(false)}
  }

  function assistantPayload(message,mode,extraContext={}){
    const history=session().messages.slice(-10,-1);
    const workflowAction=extraContext.workflowAction||'';
    return {message,chatId:currentId,mode,history,context:{app:'NEXZO',mode,profileName:$('profileName')?.textContent||'',localDate:new Date().toLocaleDateString('en-CA'),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Kolkata',personalization:personalizationContext(),workflowAction,workflowType:workflowState.type||'',workflowPaused:Boolean(workflowState.paused),...extraContext}};
  }
  // V213: wake the Render study service as soon as the assistant UI loads so the first
  // teacher/demo question does not pay the full cold-start penalty. This is fire-and-forget.
  try{setTimeout(()=>window.NEXZOAI?.findBackend?.().catch(()=>{}),250);}catch(_){}

  async function runAssistantStream(payload,streamingItem){
    const owner=storageOwner,controller=activeRequestController;
    const current=()=>{if(owner!==storageOwner||payload.chatId!==currentId||controller.signal.aborted)throw new DOMException('Request stopped.','AbortError');};
    if(!window.NEXZOAI?.assistantStream)throw new Error('Study Assistant could not load. Please reload this page.');
    const d=await window.NEXZOAI.assistantStream(payload,{signal:controller.signal,
      onDelta:(_delta,full)=>{current();updateStreamingAssistant(streamingItem,full);},
      onAction:action=>{current();streamingItem.action=action;render();},
      onLearningEvent:event=>{current();receivedLearningEvent=event;dispatchLearningEvent(event);},
      onRoute:route=>{current();lastAssistantRoute=route||null;}});
    current();return d.reply||streamingItem.content||'';
  }

  function isNextActionQuestion(text=''){
    const value=String(text||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
    return /^(?:what should i do next|what do i do next|what should i study next|what should i study|next action|next recommendation|ab kya karu|ab kya karna hai|mujhe ab kya karna chahiye|aage kya karu|aage kya karna hai)$/.test(value);
  }
  function recommendationById(id=''){return (window.NEXZOPersonalization?.snapshot?.().recommendations||[]).find(row=>String(row.id)===String(id))||null;}
  function plannerTaskFromRecommendation(rec){
    const minutes=Math.max(10,Number(rec?.durationMinutes)||30),title=(rec?.suggestedTasks||[])[0]||rec?.action||`Study ${rec?.topic||rec?.subject||'recommended topic'}`;
    return {id:`assistant_rec_${String(rec?.id||Date.now()).replace(/[^a-z0-9_-]/gi,'_')}`,title,subject:rec?.subject||'Study',type:'Personalized Recommendation',taskType:'Personalized Recommendation',difficulty:!rec?.assessed?'Diagnostic':Number(rec?.mastery)<40?'Beginner':Number(rec?.mastery)<70?'Intermediate':'Advanced',plannedMinutes:minutes,hours:`${minutes} Minutes`,duration:'1 Day',status:'pending',completed:false,source:'nexzo-assistant-next-action',recommendationId:rec?.id||'',createdAtMs:Date.now(),updatedAtMs:Date.now()};
  }
  function answerNextActionLocally(){
    const intel=window.NEXZOIntelligence?.snapshot?.(),rec=intel?.decision?.nextAction;
    if(!rec)return false;
    const why=(rec.why||[]).map(x=>String(x||'').trim()).filter(x=>x&&!/^required for\s*$/i.test(x)).slice(0,3);
    const alert=intel?.radar?.alerts?.[0], ecosystem=(intel?.decision?.ecosystem||[]).filter(Boolean).slice(0,3);
    const title=rec.title&&rec.subject&&String(rec.title).toLowerCase()===String(rec.subject).toLowerCase()?rec.title:[rec.title,rec.subject].filter(Boolean).join(' · ');
    const lines=[`## Your best next action`,`**${title||'Recommended next step'}**`,``,rec.action||`Work on ${rec.title||rec.subject||'your next priority'}.`,``,`**${Math.max(10,Number(rec.duration)||30)} min**${Number(rec.match)>0?`  ·  ${Number(rec.match)}% match`:''}`];
    if(why.length)lines.push(``,`### Why this`,...why.map(x=>`- ${x}`));
    if(alert?.title&&alert.title!==rec.title)lines.push(``,`**Keep in mind:** ${alert.title}`);
    if(ecosystem.length){lines.push(``,`### Across NEXZO`);ecosystem.forEach(item=>lines.push(`- **${item.area}:** ${item.label}`));}
    addAssistantTool(lines.join('\n'),{nextAction:rec});
    return true;
  }

  async function ask(text,{retry=false,retryPayload=null}={}){
    const explicitFiles=retryPayload?.files?[...retryPayload.files]:[...pendingFiles];
    const reusingProject=!explicitFiles.length&&activeProject.chatId===currentId&&activeProject.files.length>0;
    const queuedFiles=explicitFiles.length?explicitFiles:[...(reusingProject?activeProject.files:[])],queuedKind=retryPayload?.kind||(reusingProject?activeProject.kind:pendingKind);
    if(retryPayload?.tool!==undefined)activeAdvancedTool=retryPayload.tool;
    const fallback=queuedFiles.length?(queuedKind==='folder'?'Analyze this project folder and answer using the attached code.':'Analyze the attached files and answer using their contents.') : '';
    const typedText=String(text||'').trim();
    const cleanText=String(typedText||fallback).trim();
    const visibleUserText=typedText || (queuedFiles.length ? (queuedKind==='folder' ? 'Attached project' : 'Attached file') : cleanText);
    if(sending||!cleanText)return;
    if(!retry&&!queuedFiles.length&&!activeAdvancedTool&&activeStudyMode==='chat'&&isNextActionQuestion(cleanText)){
      add('user',visibleUserText);
      if(answerNextActionLocally()){els.input.value='';resize();return;}
    }
    const requestOwner=storageOwner,requestChat=currentId;
    const modeSnapshot=activeStudyMode;
    const workflowAction=currentWorkflowAction(cleanText);
    sending=true;receivedLearningEvent=null;els.send.disabled=true;if(els.stop)els.stop.hidden=false;els.send.hidden=true;
    // Do not block the student's first message on a separate health request.
    // The real assistant request is the source of truth; health runs in parallel only
    // to warm Render and update the badge. This removes the long "checking" stall.
    health(false).catch(()=>false);
    const filesSnapshot=[...queuedFiles],kindSnapshot=queuedKind,attachmentSnapshot=reusingProject?[]:messageAttachmentSnapshot(filesSnapshot);
    activeRequestFiles=filesSnapshot.length;activeRequestKind=kindSnapshot;
    els.input.value='';resize();
    if(!retry)add('user',visibleUserText,{attachments:attachmentSnapshot});
    // Once Send succeeds, attachments belong to that message. They must disappear
    // from the composer immediately and never leak into the next prompt.
    if(explicitFiles.length){persistProjectContext(explicitFiles,kindSnapshot);clearAttachments();}
    const requestController=new AbortController();activeRequestController=requestController;
    const requestWatchdog=setTimeout(()=>requestController.abort(),120000);
    setThinking(true);
    setAgentState(filesSnapshot.length?'reading':'running',filesSnapshot.length?`${filesSnapshot.length} attachment${filesSnapshot.length===1?'':'s'} in this message`:'Preparing your request');
    let streamingItem=null;
    try{
      let reply='';
      const automaticTool=activeAdvancedTool||await modelToolFor(cleanText,filesSnapshot);
      if(automaticTool && !wantsImageOutput(cleanText,filesSnapshot)){
        const tool=automaticTool;document.body.dataset.activeAdvancedTool=tool;setAgentState(tool==='search'||tool==='research'?'searching':'running',advancedLabel(tool));const d=await runAdvancedTool(tool,cleanText,filesSnapshot);setThinking(false);delete document.body.dataset.activeAdvancedTool;reply=d.text||d.reply||'Completed.';addAssistantTool(reply,{sources:d.sources||[],executions:d.executions||[],researchTrace:d.researchTrace||[],code:d.code||[],artifact:d.artifact||null,chart:d.chart||null,tool,automatic:!activeAdvancedTool});setAdvancedTool('');
      }
      else if(wantsImageOutput(cleanText,filesSnapshot)){
        document.body.dataset.generatingImage='true';setAgentState('generating','Rendering your image');
        const generated=await generateImage(filesSnapshot,cleanText);
        setThinking(false);delete document.body.dataset.generatingImage;
        addAssistantImage({dataUrl:generated.dataUrl,prompt:cleanText,model:generated.model,mimeType:generated.image?.mimeType,interactionId:generated.interactionId});
        reply=`Created an image for: ${cleanText}`;
      }
      else if(filesSnapshot.length){
        const pc=personalizationContext(),personalized=pc?.enabled===false?'':`\n\nRelevant student context (use only when it helps this request): ${JSON.stringify(pc)}`;
        if(['explain','quiz','interview'].includes(modeSnapshot)){
          const extracted=await analyzeFiles(filesSnapshot,`Extract a concise, accurate source context for a ${modeSnapshot} workflow. Preserve important definitions, facts, examples and file relationships. Do not start the workflow and do not address the student yet. User request: ${cleanText}`,kindSnapshot);
          setThinking(false);streamingItem=beginStreamingAssistant();reply=await runAssistantStream(assistantPayload(cleanText,modeSnapshot,{sourceContext:String(extracted.reply||'').slice(0,14000),workflowAction}),streamingItem);
          if(extracted.compatibilityMode)window.NEXZOShell?.toast?.('Compatibility mode read the project. Redeploy this V158 Backend for the native project route.','info');
        }else{
          const d=await analyzeFiles(filesSnapshot,modeConfig[modeSnapshot].fileInstruction+cleanText+personalized,kindSnapshot);reply=d.reply||'';if(d.compatibilityMode)window.NEXZOShell?.toast?.('Older backend detected — compatibility mode handled these files. Redeploy Backend for the faster native project route.','info');
        }
      }
      else {
        setThinking(false);streamingItem=beginStreamingAssistant();reply=await runAssistantStream(assistantPayload(cleanText,modeSnapshot,{workflowAction}),streamingItem);
      }
      if(requestOwner!==storageOwner||requestChat!==currentId)throw new DOMException('Request stopped.','AbortError');
      if(!reply.trim())throw new Error('Study service returned an empty answer');
      lastFailedRequest=null;setThinking(false);setAgentState('ready','Ready for your next message');delete document.body.dataset.generatingImage;if(streamingItem)reply=finishStreamingAssistant(streamingItem,reply);else if(!session().messages.at(-1)?.imageDataUrl && session().messages.at(-1)?.content!==reply)await addAssistant(reply);updateWorkflowFromReply(reply,lastAssistantRoute||{});if(!receivedLearningEvent)structuredCompletion(reply,modeSnapshot);window.dispatchEvent(new CustomEvent('nexzo:ai-question-answered',{detail:{id:`${currentId}:${Date.now()}`,reason:'Study Assistant question answered',subject:'Study'}}));if(window.NEXZOSettings?.get?.().readAloud){const lastIndex=session().messages.length-1;setTimeout(()=>toggleSpeaking(lastIndex),80);}liveVoiceSpeak(reply);setStatus('NEXZO AI Ready','online');
    }catch(error){
      if(requestOwner!==storageOwner||requestChat!==currentId)return;
      setThinking(false);delete document.body.dataset.generatingImage;if(streamingItem&&(streamingItem.placeholder||!streamingItem.content.trim()))removeStreamingAssistant(streamingItem);else if(streamingItem)finishStreamingAssistant(streamingItem,streamingItem.content);
      if(error?.name==='AbortError'||activeRequestController?.signal.aborted){lastFailedRequest=null;setAgentState('ready','Generation stopped');if(els.notice)els.notice.hidden=true;setStatus('NEXZO AI Ready','online');return;}
      const serverUp=await health(false);
      lastFailedRequest=captureFailure(cleanText,filesSnapshot,kindSnapshot,activeAdvancedTool);setAgentState('error',String(error?.message||'Request failed').slice(0,90));
      if(serverUp){
        const raw=String(error?.message||'Unknown error'),rateLimited=/429|quota|rate.?limit|too many requests/i.test(raw),authFailed=/401|403|sign.?in|token|unauthori[sz]ed|forbidden/i.test(raw),timedOut=/timed? out|timeout/i.test(raw);
        const detail=rateLimited?'The model limit was reached. Your message is saved—retry shortly.':authFailed?'Your login session is missing or expired. Sign in again, then retry.':timedOut?'The response took too long. Your message is saved — retry when ready.':'The study service could not finish this request. Your message is saved locally; please retry.';
        setStatus(rateLimited?'Model rate limited':authFailed?'Sign-in required':timedOut?'Model timed out':'Request failed',rateLimited||timedOut?'limited':'offline',detail);
        if(els.notice)els.notice.hidden=false;
        console.error('[NEXZO Study] request failed',error);
      }else{
        setStatus('Server Offline','offline');
      }
    }finally{clearTimeout(requestWatchdog);activeRequestFiles=0;activeRequestKind='files';sending=false;activeRequestController=null;if(els.stop)els.stop.hidden=true;els.send.hidden=false;els.send.disabled=false;els.input.focus();}
  }
  function newChat(){activeRequestController?.abort();currentId=newId();activeProject={chatId:currentId,kind:'files',files:[]};workflowState={type:'',active:false,paused:false,current:0,total:0,title:''};sessions.unshift({id:currentId,title:'New chat',createdAt:Date.now(),updatedAt:Date.now(),messages:[]});renderWorkflowBar();applyStudyMode('chat',{focus:false});save();renderProjectContext();render();closeAll();requestAnimationFrame(()=>els.input?.focus());}
  function renderHistory(filter=''){const q=String(filter||'').toLowerCase();const rows=sessions.filter(s=>{const title=String(s?.title||'New chat').toLowerCase(),messages=Array.isArray(s?.messages)?s.messages:[];return !q||title.includes(q)||messages.some(m=>String(m?.content||'').toLowerCase().includes(q));});els.historyList.innerHTML=rows.length?rows.map(s=>`<div class="history-item${s.id===currentId?' active':''}"><button type="button" data-open-chat="${esc(s.id)}"><b>${esc(s.title||'New chat')}</b><small>${new Date(normalizeTimestamp(s.updatedAt||s.createdAt)).toLocaleString()}</small></button><div class="history-actions"><button type="button" title="Rename" data-rename-chat="${esc(s.id)}">✎</button><button type="button" title="Delete" data-delete-chat="${esc(s.id)}">🗑</button></div></div>`).join(''):'<div class="empty-state"><p>No conversations yet.</p></div>';}
  function openModal(el){closeAll();el.hidden=false;els.backdrop.hidden=false;}
  function closeAll(){
    els.historyModal.hidden=true;
    els.tools.hidden=true;
    els.menu.hidden=true;
    if(els.avatarModal)els.avatarModal.hidden=true;
    // Pet Zone is managed by the redesign layer, but it must share the same
    // close path so Esc, backdrop clicks and other modal actions cannot leave
    // its overlay stuck above the assistant.
    const petZone=$('petZoneModal');
    if(petZone){
      petZone.hidden=true;
      petZone.setAttribute('aria-hidden','true');
      document.body.classList.remove('pet-zone-open');
    }
    els.nav.classList.remove('open');
    els.nav.setAttribute('aria-hidden','true');
    els.backdrop.hidden=true;
  }
  function openNav(){closeAll();if(window.NEXZONavigation){window.NEXZONavigation.open();return;}const shared=document.querySelector('.nx-slider-trigger');if(shared){shared.click();return;}els.nav.classList.add('open');els.nav.setAttribute('aria-hidden','false');els.backdrop.hidden=false;}
  function pickFile(input){input.click();}
  const LEGACY_PROJECT_CONTEXT_LIMIT=12*1024*1024; // retained contract marker; V159 ZIP extraction has a separate safe expanded cap.
  const ATTACHMENT_EXTENSIONS=/\.(zip|pdf|docx|pptx|xlsx|xls|txt|md|json|js|mjs|cjs|ts|tsx|jsx|html|css|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sql|xml|ya?ml|toml|vue|svelte|csv|tsv|png|jpe?g|webp)$/i;
  const SENSITIVE_ATTACHMENT=/(^|\/)(?:\.env(?:\..*)?|\.git|node_modules|vendor|dist|build|coverage)(?:\/|$)|(?:^|\/)(?:id_rsa|id_ed25519|credentials?|secrets?|service-account|firebase-adminsdk)[^/]*$|\.(?:pem|key|p12|pfx)$/i;
  function attachmentPath(file){return String(file?.nexzoRelativePath||file?.webkitRelativePath||file?.name||'file').replace(/\\/g,'/');}
  function attachmentSize(bytes){if(bytes<1024)return `${bytes} B`;if(bytes<1024*1024)return `${Math.ceil(bytes/1024)} KB`;return `${(bytes/1024/1024).toFixed(1)} MB`;}
  function openProjectDatabase(){
    if(!('indexedDB'in window))return Promise.resolve(null);
    return new Promise((resolve,reject)=>{const request=indexedDB.open('nexzo-assistant-projects-v1',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('projects'))request.result.createObjectStore('projects',{keyPath:'chatId'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  }
  function projectTitle(files=[]){const first=attachmentPath(files[0]||{}),root=first.includes('/')?first.split('/')[0]:'Attached context';return root||'Attached context';}
  function renderProjectContext(){
    if(!els.projectBar)return;const active=activeProject.chatId===currentId&&activeProject.files.length>0;els.projectBar.hidden=!active;
    if(!active)return;const total=activeProject.files.reduce((sum,file)=>sum+(Number(file.size)||0),0);if($('projectContextTitle'))$('projectContextTitle').textContent=activeProject.kind==='folder'?`Project: ${projectTitle(activeProject.files)}`:'Attached file context';if($('projectContextMeta'))$('projectContextMeta').textContent=`${activeProject.files.length} file${activeProject.files.length===1?'':'s'} · ${attachmentSize(total)} · reused in follow-up questions`;
  }
  async function persistProjectContext(files=[],kind='files'){
    if(!files.length)return;activeProject={chatId:currentId,kind,files:[...files]};renderProjectContext();
    try{const db=await openProjectDatabase();if(!db)return;await new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put({chatId:currentId,kind,updatedAt:Date.now(),files:files.map(file=>({name:file.name,path:attachmentPath(file),type:file.type,size:file.size,lastModified:file.lastModified,blob:file.slice(0,file.size,file.type)}))});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}catch(error){console.warn('[NEXZO Study] Project context could not be persisted; it remains available until this tab closes.',error);}
  }
  async function restoreProjectContext(chatId=currentId){
    activeProject={chatId,kind:'files',files:[]};renderProjectContext();
    try{const db=await openProjectDatabase();if(!db)return;const row=await new Promise((resolve,reject)=>{const tx=db.transaction('projects','readonly'),request=tx.objectStore('projects').get(chatId);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);});db.close();if(!row?.files?.length)return;const files=row.files.map(item=>{const file=new File([item.blob],item.name,{type:item.type||'',lastModified:Number(item.lastModified)||Date.now()});try{Object.defineProperty(file,'nexzoRelativePath',{value:item.path||item.name})}catch{}return file;});activeProject={chatId,kind:row.kind||'files',files};renderProjectContext();}catch(error){console.warn('[NEXZO Study] Saved project context could not be restored.',error);}
  }
  async function clearProjectContext(chatId=currentId){
    if(activeProject.chatId===chatId)activeProject={chatId,kind:'files',files:[]};renderProjectContext();
    try{const db=await openProjectDatabase();if(!db)return;await new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').delete(chatId);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}catch{}
  }
  function attachmentType(file){
    const name=String(file?.name||'');
    if(/\.(png|jpe?g|webp)$/i.test(name))return 'Image';
    if(/\.pdf$/i.test(name))return 'PDF';
    if(/\.(html?|css|js|mjs|cjs|ts|tsx|jsx|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|vue|svelte)$/i.test(name))return 'Code';
    if(/\.(md|txt)$/i.test(name))return 'Text';
    if(/\.(json|ya?ml|toml|xml|csv)$/i.test(name))return 'Data';
    return 'File';
  }
  function attachmentGlyph(file){const type=attachmentType(file);return type==='PDF'?'PDF':type==='Code'?'</>':type==='Data'?'{}':type==='Text'?'TXT':'▤';}
  function attachmentThumb(file){
    if(!/\.(png|jpe?g|webp)$/i.test(String(file?.name||'')))return `<i class="attachment-thumb">${esc(attachmentGlyph(file))}</i>`;
    let url=attachmentThumbURLs.get(file);if(!url){url=URL.createObjectURL(file);attachmentThumbURLs.set(file,url);}
    return `<i class="attachment-thumb"><img src="${esc(url)}" alt=""></i>`;
  }
  function renderAttachments(){
    if(!pendingFiles.length){els.preview.hidden=true;els.preview.classList.remove('is-project-compact','project-expanded');els.preview.replaceChildren();return;}
    const total=pendingFiles.reduce((sum,file)=>sum+file.size,0),isProject=pendingKind==='folder',visible=pendingFiles.slice(0,isProject?8:12),more=pendingFiles.length-visible.length;
    if(isProject){
      const title=projectTitle(pendingFiles),label=title&&title!=='Attached context'?title:'Project';
      els.preview.classList.add('is-project-compact');
      els.preview.innerHTML=`<div class="project-attachment-pill"><span class="project-file-icon">⌘</span><span class="project-file-copy"><b>${esc(label)}</b><small>${pendingFiles.length} supported file${pendingFiles.length===1?'':'s'} · ${attachmentSize(total)}</small></span><span class="project-actions"><button type="button" data-toggle-attachments aria-label="Show project files" title="Show project files">⌄</button><button type="button" data-clear-attachments aria-label="Remove project" title="Remove project">×</button></span></div><div class="project-attachment-details">${visible.map((file,index)=>`<span class="attachment-card" title="${esc(attachmentPath(file))}">${attachmentThumb(file)}<span class="attachment-copy"><b>${esc(file.name||attachmentPath(file))}</b><small>${esc(attachmentType(file))} · ${attachmentSize(file.size)}</small></span><button class="attachment-remove" type="button" data-remove-attachment="${index}" aria-label="Remove ${esc(file.name)}">×</button></span>`).join('')}${more?`<span class="attachment-more">+${more} more</span>`:''}</div>`;
    }else{
      els.preview.classList.remove('is-project-compact','project-expanded');
      els.preview.innerHTML=`<div class="attachment-summary"><span><b>Attached</b><small>${pendingFiles.length} file${pendingFiles.length===1?'':'s'} · ${attachmentSize(total)}</small></span><button type="button" data-clear-attachments>Clear all</button></div><div class="attachment-list">${visible.map((file,index)=>`<span class="attachment-card" title="${esc(attachmentPath(file))}">${attachmentThumb(file)}<span class="attachment-copy"><b>${esc(file.name||attachmentPath(file))}</b><small>${esc(attachmentType(file))} · ${attachmentSize(file.size)}</small></span><button class="attachment-remove" type="button" data-remove-attachment="${index}" aria-label="Remove ${esc(file.name)}">×</button></span>`).join('')}${more?`<span class="attachment-more">+${more} more</span>`:''}</div>`;
    }
    els.preview.hidden=false;
  }
  function clearAttachments(){for(const file of pendingFiles){const url=attachmentThumbURLs.get(file);if(url){URL.revokeObjectURL(url);attachmentThumbURLs.delete(file);}}pendingFiles=[];pendingKind='files';pendingBundle=null;renderAttachments();if(els.file)els.file.value='';if(els.folder)els.folder.value='';if(els.image)els.image.value='';}
  function messageAttachmentSnapshot(files=[]){
    const totalSize=files.reduce((sum,file)=>sum+(Number(file?.size)||0),0);
    const bundle=pendingBundle?{...pendingBundle,count:files.length,totalSize}:null;
    return files.slice(0,24).map((file,index)=>({name:String(file?.name||attachmentPath(file)||'Attachment'),path:attachmentPath(file),type:attachmentType(file),size:Number(file?.size)||0,kind:/^image\/(png|jpeg|webp)$/i.test(file?.type||'')||/\.(png|jpe?g|webp)$/i.test(file?.name||'')?'image':'file',previewUrl:(/^image\/(png|jpeg|webp)$/i.test(file?.type||'')||/\.(png|jpe?g|webp)$/i.test(file?.name||''))?URL.createObjectURL(file):'',...(index===0&&bundle?{bundle}:{})}));
  }
  async function inflateZipEntry(bytes,method){
    if(method===0)return bytes;
    if(method!==8)throw new Error('ZIP compression method is not supported.');
    if(!('DecompressionStream' in window))throw new Error('This browser cannot unpack ZIP files. Use Chrome/Edge or upload the extracted folder.');
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function unpackZip(file){
    const buf=new Uint8Array(await file.arrayBuffer()),view=new DataView(buf.buffer,buf.byteOffset,buf.byteLength),decoder=new TextDecoder();
    let eocd=-1;for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--){if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}}
    if(eocd<0)throw new Error('Invalid ZIP archive.');
    const count=view.getUint16(eocd+10,true),central=view.getUint32(eocd+16,true),out=[];let pos=central,total=0;
    for(let n=0;n<count&&out.length<120;n++){
      if(pos+46>buf.length||view.getUint32(pos,true)!==0x02014b50)break;
      const method=view.getUint16(pos+10,true),compressed=view.getUint32(pos+20,true),uncompressed=view.getUint32(pos+24,true),nameLen=view.getUint16(pos+28,true),extraLen=view.getUint16(pos+30,true),commentLen=view.getUint16(pos+32,true),local=view.getUint32(pos+42,true);
      const name=decoder.decode(buf.slice(pos+46,pos+46+nameLen)).replace(/\\/g,'/');pos+=46+nameLen+extraLen+commentLen;
      if(!name||name.endsWith('/')||SENSITIVE_ATTACHMENT.test(name)||!ATTACHMENT_EXTENSIONS.test(name)||/\.zip$/i.test(name))continue;
      if(uncompressed>5*1024*1024||total+uncompressed>30*1024*1024)continue;
      if(local+30>buf.length||view.getUint32(local,true)!==0x04034b50)continue;
      const ln=view.getUint16(local+26,true),le=view.getUint16(local+28,true),start=local+30+ln+le,end=start+compressed;if(end>buf.length)continue;
      const data=await inflateZipEntry(buf.slice(start,end),method);total+=data.byteLength;
      const child=new File([data],name.split('/').pop(),{type:'',lastModified:file.lastModified||Date.now()});try{Object.defineProperty(child,'nexzoRelativePath',{value:name})}catch{}
      out.push(child);
    }
    if(!out.length)throw new Error('No supported study/project files were found inside this ZIP.');
    return out;
  }
  async function addPickedAttachments(fileList,kind='files'){
    const incoming=[...fileList],expanded=[];let usedZip=false;
    for(const file of incoming){if(/\.zip$/i.test(file.name||'')){usedZip=true;try{const unpacked=await unpackZip(file);expanded.push(...unpacked);pendingBundle={kind:'zip',name:String(file.name||'Project.zip'),count:unpacked.length,totalSize:unpacked.reduce((sum,item)=>sum+(Number(item.size)||0),0)};}catch(error){window.NEXZOShell?.toast?.(error.message||'ZIP could not be opened','error');}}else expanded.push(file);}
    if(!usedZip&&kind==='folder'){const first=expanded[0];const root=String(first?.nexzoRelativePath||first?.webkitRelativePath||'Project').split('/')[0]||'Project';pendingBundle={kind:'folder',name:root,count:expanded.length,totalSize:expanded.reduce((sum,item)=>sum+(Number(item.size)||0),0)};}
    addAttachments(expanded,usedZip?'folder':kind);
    if(usedZip&&expanded.length)window.NEXZOShell?.toast?.(`ZIP project ready · ${expanded.length} supported file(s) extracted locally.`,'success');
  }
  function addAttachments(fileList,kind='files'){
    const incoming=[...fileList],accepted=[];let skipped=0,total=pendingFiles.reduce((sum,file)=>sum+file.size,0);
    for(const file of incoming){
      const path=attachmentPath(file);
      if(!ATTACHMENT_EXTENSIONS.test(file.name)||SENSITIVE_ATTACHMENT.test(path)||file.size>5*1024*1024||total+file.size>30*1024*1024){skipped++;continue;}
      if(pendingFiles.some(current=>attachmentPath(current)===path&&current.size===file.size)){skipped++;continue;}
      accepted.push(file);total+=file.size;if(pendingFiles.length+accepted.length>=24)break;
    }
    pendingFiles=[...pendingFiles,...accepted].slice(0,24);pendingKind=kind==='folder'||pendingKind==='folder'?'folder':'files';renderAttachments();closeAll();els.input.focus();
    if(skipped||accepted.length<incoming.length)window.NEXZOShell?.toast?.(`${accepted.length} added; ${incoming.length-accepted.length} unsupported, duplicate, sensitive or oversized file(s) skipped.`,'info');
  }
  function clipboardFiles(event){
    const dt=event.clipboardData;if(!dt)return[];const found=[];
    for(const item of [...(dt.items||[])]){if(item.kind!=='file')continue;const raw=item.getAsFile?.();if(!raw)continue;let file=raw;if(!file.name||file.name==='image.png'){const ext=raw.type==='image/jpeg'?'jpg':raw.type==='image/webp'?'webp':'png';file=new File([raw],`pasted-image-${Date.now()}.${ext}`,{type:raw.type||`image/${ext}`,lastModified:Date.now()});}found.push(file);}
    return found.length?found:[...(dt.files||[])];
  }
  function readEntryFile(entry,path=''){return new Promise(resolve=>entry.file(file=>{try{Object.defineProperty(file,'nexzoRelativePath',{value:`${path}${file.name}`})}catch{}resolve([file])},()=>resolve([])));}
  async function readDirectoryEntries(reader){const rows=[];while(true){const batch=await new Promise(resolve=>reader.readEntries(resolve,()=>resolve([])));if(!batch.length)return rows;rows.push(...batch)}}
  async function walkEntry(entry,path=''){
    if(entry.isFile)return readEntryFile(entry,path);
    if(!entry.isDirectory||SENSITIVE_ATTACHMENT.test(`${path}${entry.name}/`))return [];
    const next=`${path}${entry.name}/`,children=await readDirectoryEntries(entry.createReader()),groups=await Promise.all(children.map(child=>walkEntry(child,next)));return groups.flat();
  }
  async function droppedFiles(dataTransfer){const entries=[...(dataTransfer.items||[])].map(item=>item.webkitGetAsEntry?.()).filter(Boolean);if(!entries.length)return [...(dataTransfer.files||[])];return (await Promise.all(entries.map(entry=>walkEntry(entry)))).flat();}
  let recognition=null,liveVoiceMode=false;
  function listening(active,text='Listening…'){const mic=$('micBtn');mic?.classList.toggle('is-listening',active);mic?.setAttribute('aria-pressed',String(active));if(els.voiceFeedback){els.voiceFeedback.hidden=!active;els.voiceFeedback.textContent=text;}}
  function voice(){
    if(recognition){recognition.stop();return;}
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){window.NEXZOShell?.toast?.('Voice input is not supported in this browser.','error');return;}
    const r=new SR();recognition=r;r.lang='en-IN';r.interimResults=true;r.continuous=false;
    r.onstart=()=>listening(true);
    r.onresult=event=>{const transcript=[...event.results].map(result=>result[0]?.transcript||'').join(' ').trim();if(transcript){els.input.value=transcript;resize();}listening(true,event.results[event.results.length-1]?.isFinal?'Voice captured':'Listening…');};
    r.onerror=event=>{if(event.error!=='aborted')window.NEXZOShell?.toast?.(`Voice input failed: ${event.error||'unknown error'}`,'error');};
    r.onend=()=>{recognition=null;listening(false);const transcript=els.input.value.trim();if(liveVoiceMode&&transcript&&!sending){const spoken=transcript;els.input.value='';resize();ask(spoken);}else els.input.focus();};r.start();
  }
  function setCompanionOpen(open){const panel=$('companionPanel'),orb=$('companionOrb');if(!panel||!orb)return;panel.hidden=!open;orb.setAttribute('aria-expanded',String(open));}
  $('composerToolsBtn')?.addEventListener('click',()=>openModal(els.tools));
  $('companionOrb')?.addEventListener('click',()=>setCompanionOpen($('companionPanel')?.hidden!==false));
  $('companionClose')?.addEventListener('click',()=>setCompanionOpen(false));
  document.querySelectorAll('[data-companion-mode]').forEach(button=>button.addEventListener('click',()=>{applyStudyMode(button.dataset.companionMode||'chat');setCompanionOpen(false);els.input.focus();}));

  document.querySelectorAll('[data-study-mode]').forEach(b=>b.addEventListener('click',()=>applyStudyMode(b.dataset.studyMode)));
  $('modeSuggestions')?.addEventListener('click',event=>{
    const button=event.target.closest('[data-mode-prompt]');if(!button)return;
    els.input.value=button.dataset.modePrompt||'';resize();els.input.focus();
  });
  applyStudyMode(activeStudyMode,{focus:false});
  function consumeLaunchIntent(){
    const params=new URLSearchParams(location.search);let stored=null;
    try{stored=JSON.parse(localStorage.getItem('nexzo.ai.launch')||'null')}catch{}
    const freshStored=stored&&Date.now()-Number(stored.at||0)<10*60*1000?stored:null;
    const requestedMode=params.get('mode')||freshStored?.mode;
    const requestedPrompt=params.get('prompt')||freshStored?.prompt;
    if(requestedMode&&modeConfig[requestedMode])applyStudyMode(requestedMode,{focus:false});
    if(requestedPrompt){els.input.value=String(requestedPrompt).slice(0,6000);resize();els.input.focus();}
    if(stored)localStorage.removeItem('nexzo.ai.launch');
    if(params.has('mode')||params.has('prompt'))history.replaceState(null,'',location.pathname);
  }
  consumeLaunchIntent();
  $('workflowPauseBtn')?.addEventListener('click',()=>{if(!workflowState.active)return;workflowState.paused=true;renderWorkflowBar();els.input.focus();});
  $('workflowResumeBtn')?.addEventListener('click',()=>{if(!workflowState.active)return;workflowState.paused=false;pendingWorkflowAction='continue';renderWorkflowBar();els.input.placeholder=workflowState.type==='quiz'?'Answer with A, B, C or D…':'Answer the current interview question…';els.input.focus();});
  $('workflowEndBtn')?.addEventListener('click',()=>{if(!workflowState.active)return;pendingWorkflowAction='end';const label=workflowLabel(workflowState.type);workflowState.paused=true;renderWorkflowBar();ask(`End the current ${label.toLowerCase()}.`);});
  $('composerModeChip')?.addEventListener('click',()=>openModal(els.tools));
  els.messages?.addEventListener('click',event=>{
    const btn=event.target.closest('[data-followup]');if(!btn)return;
    const i=Number(btn.dataset.index),message=session().messages[i];if(!message)return;
    const action=btn.dataset.followup;
    if(action==='simpler'){applyStudyMode('explain',{focus:false});ask('Explain your previous answer more simply, with one clear example.');}
    else if(action==='notes'){applyStudyMode('notes',{focus:false});ask('Turn your previous answer into concise revision-ready notes.');}
    else if(action==='quiz'){applyStudyMode('quiz',{focus:false});workflowState={type:'',active:false,paused:false,current:0,total:0,title:''};renderWorkflowBar();ask(`Start a 5-question quiz on the main topic from your previous answer.`);}
    else if(action==='planner'){applyStudyMode('chat',{focus:false});ask('Create a Planner task from the most useful study action in your previous answer.');}
  });
  window.NEXZOAssistantWorkflow={get:()=>({...workflowState}),pause:()=>{workflowState.paused=true;renderWorkflowBar();},resume:()=>{workflowState.paused=false;pendingWorkflowAction='continue';renderWorkflowBar();},end:()=>{pendingWorkflowAction='end';}};
  function resize(){els.input.style.height='auto';els.input.style.height=Math.min(96,Math.max(42,els.input.scrollHeight))+'px';}
  function scheduleCloudSave(){
    if(!historyEnabled()||!cloud||!cloudUid||!cloudLoaded||authUser?.uid!==cloudUid)return;
    clearTimeout(cloudSaveTimer);
    const owner=cloudUid,adapter=cloud,chat=sessions.find(item=>item.id===currentId);
    if(!chat)return;
    const payload={uid:owner,id:chat.id,title:chat.title,messages:chat.messages.slice(-80).map(message=>{const copy={...message};delete copy.imageDataUrl;delete copy.streaming;delete copy.placeholder;return copy;}),createdAtMs:chat.createdAt,updatedAtMs:chat.updatedAt};
    cloudSaveTimer=setTimeout(async()=>{
      if(authUser?.uid!==owner||cloudUid!==owner)return;
      try{
        const {doc,runTransaction,getDoc,serverTimestamp}=adapter.tools,ref=doc(adapter.db,'users',owner,'aiChats',payload.id);
        await runTransaction(adapter.db,async tx=>{
          const previous=await tx.get(ref);
          if(previous.exists()&&Number(previous.data().updatedAtMs)>Number(payload.updatedAtMs))throw new Error('A newer conversation exists in the cloud. Reload before editing it.');
          if(authUser?.uid!==owner)throw new Error('Account changed before save.');
          tx.set(ref,{...payload,updatedAt:serverTimestamp()},{merge:true});
        });
        const confirmation=await getDoc(ref);
        if(authUser?.uid!==owner||!confirmation.exists()||confirmation.data().uid!==owner||confirmation.data().id!==payload.id||Number(confirmation.data().updatedAtMs)<payload.updatedAtMs)throw new Error('Conversation save was not confirmed.');
      }catch(error){console.warn('[NEXZO Study] Cloud history save was not confirmed; the account-scoped local copy is retained.',error.name);}
    },450);
  }
  async function loadCloudHistory(user){
    if(!user?.uid)return;
    if(!historyEnabled()){cloudLoaded=true;return;}
    const owner=user.uid;cloudUid=owner;
    try{
      const context=await window.NEXZOFirebase.getContext({auth:true,firestore:true});
      if(authUser?.uid!==owner)return;
      cloud={db:context.db,tools:context.firestoreTools};
      const {collection,getDocs,query,orderBy,limit}=cloud.tools;
      let snapshot;
      try{snapshot=await getDocs(query(collection(cloud.db,'users',cloudUid,'aiChats'),orderBy('updatedAtMs','desc'),limit(50)));}
      catch{snapshot=await getDocs(collection(cloud.db,'users',cloudUid,'aiChats'));}
      if(authUser?.uid!==owner||cloudUid!==owner)return;
      const remote=[];snapshot.forEach(docSnap=>{const row=docSnap.data();if(!row.uid||row.uid===owner)remote.push(row);});
      sessions=mergeChats(sessions,remote);
      if(!sessions.some(item=>item.id===currentId))currentId=sessions[0]?.id||newId();
      cloudLoaded=true;
      if(historyEnabled())localStorage.setItem(STORE,JSON.stringify(sessions));
      render();renderHistory(els.historySearch?.value||'');
    }catch(error){if(authUser?.uid!==owner)return;cloudLoaded=true;console.warn('[NEXZO Study] Cloud history unavailable; using account-scoped local history.',error.name);}
  }
  async function deleteCloudChat(id){
    if(!cloud||!cloudUid)return;
    try{await cloud.tools.deleteDoc(cloud.tools.doc(cloud.db,'users',cloudUid,'aiChats',id));}catch(error){console.warn('[NEXZO Study] Cloud chat delete failed.',error);}
  }
  async function clearCloudHistory(){
    if(!cloud||!cloudUid)return;
    try{
      const snapshot=await cloud.tools.getDocs(cloud.tools.collection(cloud.db,'users',cloudUid,'aiChats'));
      await Promise.all(snapshot.docs.map(item=>cloud.tools.deleteDoc(item.ref)));
    }catch(error){console.warn('[NEXZO Study] Cloud history clear failed.',error);}
  }
  function renderProfileIdentity(){
    $('profileName').textContent=profileIdentity.name;$('profileEmail').textContent=profileIdentity.email;
    const avatar=$('profileAvatar');avatar.replaceChildren();
    if(profileIdentity.photo){const img=document.createElement('img');img.src=profileIdentity.photo;img.alt=`${profileIdentity.name} profile`;img.className='ai-profile-photo';img.addEventListener('error',()=>{avatar.replaceChildren();avatar.textContent=(profileIdentity.name[0]||'S').toUpperCase();},{once:true});avatar.appendChild(img);}else avatar.textContent=(profileIdentity.name[0]||'S').toUpperCase();
    render();
  }
  function applyProfile(user={}){
    let cached={};try{cached=JSON.parse(localStorage.getItem('nexzo_user')||'{}')||{}}catch{}
    const authority=window.NEXZOProfileAuthority?.current?.()||{};
    const name=authority.name||authority.fullName||user.displayName||cached.name||cached.displayName||user.email?.split('@')[0]||cached.email?.split('@')[0]||'Student';
    const email=user.email||authority.email||cached.email||'NEXZO account';
    const photo=authority.photoURL||authority.avatar||authority.photo||localStorage.getItem('profilePhoto')||localStorage.getItem('profileImage')||cached.photoURL||cached.photo||user.photoURL||'';
    profileIdentity={name,email,photo};renderProfileIdentity();
  }
  async function loadProfile(){
    applyProfile({});
    try{const {auth,tools}=await window.NEXZOFirebase.getAuthContext();tools.onAuthStateChanged(auth,user=>{
      const owner=user?.uid||'guest';
      if(storageOwner!==owner){activeRequestController?.abort();clearTimeout(cloudSaveTimer);cloud=null;cloudUid='';cloudLoaded=false;storageOwner=owner;STORE=`nexzo.ai.clean.sessions.v4:${encodeURIComponent(owner)}`;sessions=loadSessions();currentId=localStorage.getItem(currentStorageKey())||sessions[0]?.id||newId();activeProject={chatId:'',kind:'files',files:[]};clearAttachments();lastFailedRequest=null;workflowState={type:'',active:false,paused:false,current:0,total:0,title:''};}
      authUser=user||null;applyProfile(authUser||{});if(user)loadCloudHistory(user);
    });}catch(error){console.warn('[NEXZO Study] Account could not be loaded.',error.name);}
  }
  function blobDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('Could not read this image.'));reader.readAsDataURL(blob);});}
  function persistAvatar(photo){
    const current=window.NEXZOProfileAuthority?.current?.()||{};
    const next={...current,name:current.name||profileIdentity.name,email:current.email||profileIdentity.email,avatar:photo,photo,photoURL:photo,profileConfigured:true,profileConfiguredByUser:true};
    localStorage.setItem('profilePhoto',photo);localStorage.setItem('profileImage',photo);
    let cached={};try{cached=JSON.parse(localStorage.getItem('nexzo_user')||'{}')||{}}catch{}
    localStorage.setItem('nexzo_user',JSON.stringify({...cached,name:next.name,email:next.email,photoURL:photo,photo}));
    window.NEXZOProfileAuthority?.save?.(next);
    profileIdentity={...profileIdentity,photo};renderProfileIdentity();
    window.dispatchEvent(new CustomEvent('nexzo:avatar-updated',{detail:{id:'assistant-profile-avatar'}}));
    window.NEXZOShell?.toast?.('Profile avatar updated everywhere','success');
  }
  async function changeAvatar(file){
    if(!file)return;
    if(!/^image\/(png|jpeg|webp)$/i.test(file.type)){window.NEXZOShell?.toast?.('Choose a PNG, JPG or WEBP image.','error');return;}
    if(file.size>8*1024*1024){window.NEXZOShell?.toast?.('Profile photo must be smaller than 8 MB.','error');return;}
    const button=$('avatarEditBtn');button?.classList.add('is-saving');button?.setAttribute('aria-busy','true');
    let previewUrl='';
    try{
      previewUrl=URL.createObjectURL(file);profileIdentity={...profileIdentity,photo:previewUrl};renderProfileIdentity();
      let photo='';
      try{photo=await window.NEXZOProfileStorage?.upload?.(file)||'';}catch(error){console.warn('[NEXZO Study] Cloud avatar upload deferred; saving a compressed local copy.',error);}
      if(!photo){const compressed=await window.NEXZOProfileStorage?.compress?.(file);photo=compressed?await blobDataUrl(compressed):await blobDataUrl(file);}
      persistAvatar(photo);
    }catch(error){applyProfile(authUser||{});window.NEXZOShell?.toast?.(error?.message||'Avatar could not be updated.','error');}
    finally{if(previewUrl)URL.revokeObjectURL(previewUrl);button?.classList.remove('is-saving');button?.removeAttribute('aria-busy');$('avatarInput').value='';}
  }
  function savedAssistantAvatar(){
    if(window.NEXZOSettings?.get)return String(window.NEXZOSettings.get().assistantAvatarURL||'favicon.png');
    try{return String(JSON.parse(localStorage.getItem('nexzo_settings')||'{}')?.assistantAvatarURL||'favicon.png');}catch{return'favicon.png'}
  }
  function renderAssistantAvatarPreview(){
    const preview=$('assistantAvatarPreview')?.querySelector('img');if(preview)preview.src=assistantAvatarURL;
  }
  function applyAssistantAvatar(url,{rerender=true}={}){
    assistantAvatarURL=String(url||'favicon.png');renderAssistantAvatarPreview();if(rerender)render();
  }
  function saveAssistantAvatar(url){
    const value=String(url||'favicon.png');
    if(window.NEXZOSettings?.set)window.NEXZOSettings.set({assistantAvatarURL:value});
    else{let settings={};try{settings=JSON.parse(localStorage.getItem('nexzo_settings')||'{}')||{}}catch{}localStorage.setItem('nexzo_settings',JSON.stringify({...settings,assistantAvatarURL:value,updatedAtMs:Date.now()}));}
    applyAssistantAvatar(value);window.NEXZOShell?.toast?.(value==='favicon.png'?'NEXZO logo restored':'Assistant avatar updated','success');
  }
  function openAssistantAvatar(){applyAssistantAvatar(savedAssistantAvatar(),{rerender:false});openModal(els.avatarModal);}
  async function changeAssistantAvatar(file){
    if(!file)return;
    if(!/^image\/(png|jpeg|webp)$/i.test(file.type)){window.NEXZOShell?.toast?.('Choose a PNG, JPG or WEBP image.','error');return;}
    if(file.size>8*1024*1024){window.NEXZOShell?.toast?.('Assistant avatar must be smaller than 8 MB.','error');return;}
    const upload=$('uploadAssistantAvatar');if(upload){upload.disabled=true;upload.textContent='Uploading…';}
    let previewUrl='';
    try{
      previewUrl=URL.createObjectURL(file);applyAssistantAvatar(previewUrl,{rerender:false});
      let photo='';try{photo=await window.NEXZOProfileStorage?.uploadAssistant?.(file)||'';}catch(error){console.warn('[NEXZO Study] Assistant avatar cloud upload deferred.',error);}
      if(!photo){const compressed=await window.NEXZOProfileStorage?.compress?.(file);photo=compressed?await blobDataUrl(compressed):await blobDataUrl(file);}
      saveAssistantAvatar(photo);closeAll();
    }catch(error){applyAssistantAvatar(savedAssistantAvatar());window.NEXZOShell?.toast?.(error?.message||'Assistant avatar could not be updated.','error');}
    finally{if(previewUrl)URL.revokeObjectURL(previewUrl);if(upload){upload.disabled=false;upload.textContent='Upload custom image';}$('assistantAvatarInput').value='';}
  }
  function timerTick(){timerSeconds=Math.max(0,timerSeconds-1);localStorage.setItem('nexzo.focus.seconds',String(timerSeconds));const m=String(Math.floor(timerSeconds/60)).padStart(2,'0'),s=String(timerSeconds%60).padStart(2,'0');$('timerText').textContent=`${m}:${s}`;if(!timerSeconds){clearInterval(timerHandle);timerRun=false;}}

  els.tools?.addEventListener('click',event=>{const button=event.target.closest('[data-advanced]');if(!button)return;const tool=button.dataset.advanced;if(tool==='library-save'){librarySave();return}if(tool==='library-list'){libraryList();return}if(tool==='memory'){showMemory();return}if(tool==='schedule'){createSchedule();return}if(tool==='connections'){googleActions();return}if(tool==='background'){startBackgroundAgent();return}if(tool==='live-voice'){toggleLiveVoice();return}setAdvancedTool(tool);closeAll();els.input.focus();});
  els.composer.addEventListener('submit',e=>{e.preventDefault();ask(els.input.value);});
  els.input.addEventListener('input',resize);els.input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();els.composer.requestSubmit();}});
  els.input.addEventListener('paste',e=>{const files=clipboardFiles(e);if(!files.length)return;const text=e.clipboardData?.getData('text/plain')||'';if(!text)e.preventDefault();addAttachments(files,'files');window.NEXZOShell?.toast?.(`${files.length===1?'Image/file':'Files'} pasted from clipboard`,'success');});
  els.plus.addEventListener('click',e=>{e.stopPropagation();els.menu.hidden=!els.menu.hidden;});
  document.addEventListener('click',e=>{if(!els.menu.contains(e.target)&&e.target!==els.plus)els.menu.hidden=true;});
  els.menu.addEventListener('click',e=>{const b=e.target.closest('[data-attach]');if(!b)return;const a=b.dataset.attach;if(a==='file')pickFile(els.file);else if(a==='folder')pickFile(els.folder);else if(a==='image'){els.image.removeAttribute('capture');pickFile(els.image)}else if(a==='camera'){els.image.setAttribute('capture','environment');pickFile(els.image)}else if(a==='voice')voice();else if(a==='generate-image'){els.input.value=els.input.value||'Create an image of ';resize();closeAll();els.input.focus();}else if(a==='tools')openModal(els.tools);});
  els.file.addEventListener('change',()=>addPickedAttachments(els.file.files,'files'));els.folder.addEventListener('change',()=>addPickedAttachments(els.folder.files,'folder'));els.image.addEventListener('change',()=>addPickedAttachments(els.image.files,'files'));
  els.messages.addEventListener('click',async event=>{const button=event.target.closest('[data-library-download]');if(!button)return;try{const headers=await protectedHeaders();const r=await fetchWithTimeout(api(`/api/tools/library/${button.dataset.libraryDownload}/download`),{headers},60000);if(!r.ok)throw new Error(`Download failed (${r.status})`);const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=button.dataset.libraryName||'nexzo-file';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}catch(e){window.NEXZOShell?.toast?.(e.message||'Download failed','error')}});
  els.preview.addEventListener('click',event=>{const toggle=event.target.closest('[data-toggle-attachments]');if(toggle){els.preview.classList.toggle('project-expanded');toggle.textContent=els.preview.classList.contains('project-expanded')?'⌃':'⌄';toggle.setAttribute('aria-label',els.preview.classList.contains('project-expanded')?'Hide project files':'Show project files');return}const remove=event.target.closest('[data-remove-attachment]');if(remove){pendingFiles.splice(Number(remove.dataset.removeAttachment),1);renderAttachments();return}if(event.target.closest('[data-clear-attachments]'))clearAttachments();});
  $('clearProjectContext')?.addEventListener('click',()=>{clearProjectContext();window.NEXZOShell?.toast?.('Project context cleared for this chat.','success');});
  els.stop?.addEventListener('click',()=>activeRequestController?.abort());
  $('micBtn')?.addEventListener('click',voice);$('navOpen')?.addEventListener('click',openNav);$('historyOpen')?.addEventListener('click',()=>{renderHistory();openModal(els.historyModal)});$('toolsOpen')?.addEventListener('click',()=>openModal(els.tools));$('attachOpen')?.addEventListener('click',()=>{els.menu.hidden=false;els.input.focus();});$('assistantAvatarOpen')?.addEventListener('click',openAssistantAvatar);$('newChat')?.addEventListener('click',newChat);$('historyNew')?.addEventListener('click',newChat);
  $('clearHistory').addEventListener('click',async()=>{if(await assistantConfirm('Clear all conversations','Delete all Study Assistant conversations? This cannot be undone.','Clear all')){sessions=[];currentId=newId();localStorage.setItem(STORE,'[]');localStorage.setItem(currentStorageKey(),currentId);clearCloudHistory();renderHistory();render();}});els.historySearch.addEventListener('input',()=>renderHistory(els.historySearch.value));
  els.historyList.addEventListener('click',async e=>{const open=e.target.closest('[data-open-chat]'),del=e.target.closest('[data-delete-chat]'),ren=e.target.closest('[data-rename-chat]');if(open){activeRequestController?.abort();currentId=open.dataset.openChat;localStorage.setItem(currentStorageKey(),currentId);restoreProjectContext(currentId);render();closeAll();}if(del){const target=sessions.find(x=>x.id===del.dataset.deleteChat);if(!await assistantConfirm('Delete conversation',`Delete “${target?.title||'this conversation'}”? This cannot be undone.`))return;if(currentId===del.dataset.deleteChat)activeRequestController?.abort();clearProjectContext(del.dataset.deleteChat);deleteCloudChat(del.dataset.deleteChat);sessions=sessions.filter(s=>s.id!==del.dataset.deleteChat);if(currentId===del.dataset.deleteChat){currentId=sessions[0]?.id||newId();restoreProjectContext(currentId);}save();renderHistory(els.historySearch.value);render();}if(ren){const s=sessions.find(x=>x.id===ren.dataset.renameChat);const n=prompt('Rename conversation',s?.title||'');if(s&&n?.trim()){s.title=n.trim();save();renderHistory(els.historySearch.value);}}});
  els.tools.addEventListener('click',e=>{const b=e.target.closest('[data-tool]');if(b){if(b.dataset.mode)applyStudyMode(b.dataset.mode,{focus:false});els.input.value=`${b.dataset.tool} `;resize();closeAll();els.input.focus();}});
  let speechRunId=0;
  function cleanSpeechText(value=''){
    return String(value||'')
      .replace(/```[\s\S]*?```/g,' There is a code example on the screen. ')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g,' Image: $1. ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
      .replace(/https?:\/\/\S+/g,' link ')
      .replace(/^#{1,6}\s+/gm,'')
      .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/gm,'')
      .replace(/[*_~`>|]/g,'')
      .replace(/&/g,' and ')
      .replace(/\+/g,' plus ')
      .replace(/[\p{Extended_Pictographic}\uFE0F]/gu,' ')
      .replace(/\s*\n\s*/g,'. ')
      .replace(/\.{2,}/g,'. ')
      .replace(/\s+/g,' ')
      .trim();
  }
  const HINGLISH_WORDS=new Set('aaj aap abhi acha accha agar aur bas bhi bolo bolna chahiye chalo dekho fir haan hai hain ham hum iska isme kaise kar karo karke karna kya kyun kyu lekin main mera mere meri mujhe nahi nahin nhi par pe phir raha rahe rahi sahi se sun tha the thi thoda tum tumhara tumhe vala wale wali yaar ye yeh'.split(' '));
  function hinglishScore(text=''){
    const words=String(text).toLowerCase().match(/[a-z]+/g)||[];
    return words.reduce((score,word)=>score+(HINGLISH_WORDS.has(word)?1:0),0);
  }
  function speechLanguage(text=''){
    if(/[\u0900-\u097F]/.test(text))return'hi-IN';
    const words=String(text).match(/[A-Za-z]+/g)||[],matches=hinglishScore(text);
    return matches>=3||matches>=2&&matches/Math.max(1,words.length)>=.12?'hi-IN':'en-IN';
  }
  function speechChunks(text='',limit=210){
    const sentences=text.match(/[^.!?।]+[.!?।]+|[^.!?।]+$/g)||[text];
    const chunks=[];
    sentences.forEach(sentence=>{
      let rest=sentence.trim();
      while(rest.length>limit){let cut=Math.max(rest.lastIndexOf(',',limit),rest.lastIndexOf(';',limit),rest.lastIndexOf(' ',limit));if(cut<70)cut=limit;chunks.push(rest.slice(0,cut).trim());rest=rest.slice(cut).trim();}
      if(rest)chunks.push(rest);
    });
    return chunks.filter(Boolean);
  }
  function voiceScore(voice,language){
    const name=String(voice.name||'').toLowerCase(),lang=String(voice.lang||'').toLowerCase(),wanted=language.toLowerCase();let score=0;
    if(lang===wanted)score+=120;else if(lang.startsWith(wanted.slice(0,2)))score+=70;
    if(/natural|neural|online/.test(name))score+=35;
    if(/microsoft|google/.test(name))score+=22;
    if(language==='en-IN'&&/neerja|prabhat|india/.test(name))score+=28;
    if(language==='hi-IN'&&/swara|madhur|hemant|hindi/.test(name))score+=28;
    if(voice.default)score+=8;if(voice.localService)score+=4;
    return score;
  }
  function availableVoices(){return 'speechSynthesis'in window?window.speechSynthesis.getVoices():[];}
  function preferredVoice(language=speechState.language){
    const voices=availableVoices(),saved=String(window.NEXZOSettings?.get?.().readAloudVoice||localStorage.getItem('nexzo.readAloud.voice')||'');
    return voices.find(voice=>voice.name===saved)||[...voices].sort((a,b)=>voiceScore(b,language)-voiceScore(a,language))[0]||null;
  }
  function populateReaderVoices(){
    const select=$('readerVoice');if(!select)return;
    const voices=availableVoices(),chosen=preferredVoice()?.name||'';
    select.innerHTML=voices.length?voices.map(voice=>`<option value="${esc(voice.name)}" ${voice.name===chosen?'selected':''}>${esc(voice.name)} · ${esc(voice.lang||'')}</option>`).join(''):'<option value="">Automatic system voice</option>';
  }
  let voiceLoadAttempt=0,voiceLoadTimer=null;
  function ensureReaderVoices(){
    if(!('speechSynthesis'in window))return;
    populateReaderVoices();
    if(availableVoices().length){voiceLoadAttempt=0;if(voiceLoadTimer)clearTimeout(voiceLoadTimer);voiceLoadTimer=null;return;}
    const delays=[80,220,500,1000,2000,3500];
    if(voiceLoadAttempt>=delays.length)return;
    if(voiceLoadTimer)clearTimeout(voiceLoadTimer);
    voiceLoadTimer=setTimeout(()=>{voiceLoadTimer=null;voiceLoadAttempt++;ensureReaderVoices()},delays[voiceLoadAttempt]);
  }
  function readerRate(){const value=Number($('readerRate')?.value||window.NEXZOSettings?.get?.().readAloudRate||localStorage.getItem('nexzo.readAloud.rate')||1);return Math.min(1.4,Math.max(.65,value||1));}
  function updateReaderUI(){
    if(!els.reader)return;
    const total=speechState.chunks.length,current=Math.min(total,speechState.position+1),pct=total?Math.round(current/total*100):0;
    $('readerStatus').textContent=speechState.paused?`Paused · ${pct}%`:`${speechState.language==='hi-IN'?'Hindi':'English / Hinglish'} · ${current}/${total}`;
    $('readerPause').textContent=speechState.paused?'Resume':'Pause';
    $('readerPause').setAttribute('aria-label',speechState.paused?'Resume reading':'Pause reading');
    els.reader.classList.toggle('is-paused',speechState.paused);
  }
  function syncSpeakLabels(){
    document.querySelectorAll('[data-speak]').forEach(button=>{
      const index=Number(button.dataset.speak),label=speakingIndex===index?'Stop reading':'Read aloud';
      const text=button.querySelector('span:last-child');if(text)text.textContent=label;else button.textContent=label;
    });
  }
  function stopSpeaking(){
    speechRunId++;
    if('speechSynthesis'in window)window.speechSynthesis.cancel();
    speakingIndex=null;activeUtterance=null;speechState={chunks:[],position:0,paused:false,language:'en-IN'};
    if(els.reader)els.reader.hidden=true;
    syncSpeakLabels();
  }
  function speakCurrentChunk(runId=speechRunId){
    if(runId!==speechRunId||speakingIndex===null)return;
    if(speechState.position>=speechState.chunks.length){stopSpeaking();return;}
    const currentText=speechState.chunks[speechState.position],chunkLanguage=speechLanguage(currentText);
    const utterance=new SpeechSynthesisUtterance(currentText);
    const voice=preferredVoice(chunkLanguage);if(voice){utterance.voice=voice;utterance.lang=voice.lang||chunkLanguage;}else utterance.lang=chunkLanguage;
    utterance.rate=readerRate();utterance.pitch=1;utterance.volume=1;activeUtterance=utterance;updateReaderUI();
    utterance.onend=()=>{if(runId!==speechRunId||activeUtterance!==utterance)return;speechState.position++;speakCurrentChunk(runId);};
    utterance.onerror=event=>{if(runId!==speechRunId||event.error==='canceled'||event.error==='interrupted')return;window.NEXZOShell?.toast?.('This browser voice stopped unexpectedly. Try another voice.','error');stopSpeaking();};
    window.speechSynthesis.speak(utterance);
  }
  function restartReaderChunk(){
    if(speakingIndex===null)return;
    const runId=++speechRunId;window.speechSynthesis.cancel();speechState.paused=false;setTimeout(()=>speakCurrentChunk(runId),40);
  }
  function toggleReaderPause(){
    if(speakingIndex===null)return;
    if(speechState.paused){window.speechSynthesis.resume();speechState.paused=false;}else{window.speechSynthesis.pause();speechState.paused=true;}
    updateReaderUI();
  }
  function toggleSpeaking(index){
    if(!('speechSynthesis'in window)){window.NEXZOShell?.toast?.('Read aloud is not supported in this browser.','error');return;}
    if(speakingIndex===index){stopSpeaking();return;}
    stopSpeaking();
    const message=session().messages[index],text=cleanSpeechText(message?.content||'');if(!text)return;
    const language=speechLanguage(text),chunks=speechChunks(text);if(!chunks.length)return;
    speakingIndex=index;speechState={chunks,position:0,paused:false,language};
    populateReaderVoices();$('readerRate').value=String(readerRate());els.reader.hidden=false;syncSpeakLabels();
    const runId=++speechRunId;setTimeout(()=>speakCurrentChunk(runId),40);
  }
  function closeMessageMenus(exceptIndex=null){
    els.messages.querySelectorAll('[data-more-menu]').forEach(menu=>{
      if(exceptIndex!==null && String(menu.dataset.moreMenu)===String(exceptIndex)) return;
      menu.hidden=true;
      const trigger=els.messages.querySelector(`[data-more="${menu.dataset.moreMenu}"]`);
      trigger?.setAttribute('aria-expanded','false');
    });
  }
  function saveGeneratedImage(index){
    const message=session().messages[index];if(!message?.imageDataUrl)return;
    const mime=String(message.imageMeta?.mimeType||'image/jpeg').toLowerCase();const ext=mime==='image/jpeg'?'jpg':mime.split('/')[1]||'jpg';
    const a=document.createElement('a');a.href=message.imageDataUrl;a.download=`nexzo-image-${Date.now()}.${ext}`;document.body.appendChild(a);a.click();a.remove();
  }
  function downloadAnswer(index){
    const message=session().messages[index];
    if(!message?.content)return;
    const title=(session().title||'NEXZO Study answer').replace(/[^a-z0-9 _-]/gi,'').trim()||'NEXZO Study answer';
    const blob=new Blob([message.content],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=`${title.slice(0,60)}.txt`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
  }
  function showSources(index){
    const message=session().messages[index];
    const sourceLines=String(message?.content||'').split(/\n/).filter(line=>/^\s*(sources?|references?)\s*:/i.test(line));
    alert(sourceLines.length?sourceLines.join('\n'):'No external sources were attached to this answer.');
  }
  function setRating(index,value,button){
    const message=session().messages[index];if(!message)return;
    message.rating=message.rating===value?'':value;save();
    window.dispatchEvent(new CustomEvent('nexzo:assistant-feedback',{detail:{id:`assistant:${message.id}`,value:message.rating||'cleared',chatId:currentId,messageId:message.id,atMs:Date.now()}}));
    const row=button.closest('.bubble-actions');
    row?.querySelectorAll('[data-rate]').forEach(btn=>btn.classList.toggle('active',btn.dataset.rate===message.rating));
  }
  function regenerate(index){
    const list=session().messages;
    let userIndex=index-1;
    while(userIndex>=0&&list[userIndex]?.role!=='user')userIndex--;
    const prompt=list[userIndex]?.content;
    if(!prompt)return;
    list.splice(index,1);save();render();ask(prompt,{retry:true});
  }
  els.messages.addEventListener('click',e=>{
    const nextActionButton=e.target.closest('[data-next-action]');
    if(nextActionButton){
      const rec=recommendationById(nextActionButton.dataset.recommendationId);if(!rec)return;
      if(nextActionButton.dataset.nextAction==='planner'){const store=window.NEXZOTaskStore;if(!store?.upsert){window.NEXZOShell?.toast?.('Planner is still loading.','error');return;}store.upsert(plannerTaskFromRecommendation(rec),{cloud:true,immediate:true});window.NEXZOShell?.toast?.('Recommended task added to Planner.','success');return;}
      applyStudyMode('explain',{focus:false});els.input.value=`Help me start ${rec.topic} in ${rec.subject}. ${rec.action||''}`.trim();resize();els.input.focus();return;
    }
    if(e.target.closest('[data-edit-assistant-avatar]')){openAssistantAvatar();return;}
    if(e.target.closest('[data-edit-avatar]')){$('avatarInput').click();return;}
    if(e.target.closest('[data-open-welcome-tools]')){$('composerToolsBtn')?.click();return;}
    const welcome=e.target.closest('[data-welcome-mode]');
    if(welcome){applyStudyMode(welcome.dataset.welcomeMode);els.input.value=welcome.dataset.welcomePrompt||'';resize();els.input.focus();return;}
    const confirmAction=e.target.closest('[data-confirm-action]');
    if(confirmAction){
      if(confirmAction.disabled)return;confirmAction.disabled=true;confirmAction.textContent='Creating…';
      window.NEXZOAI?.confirmAssistantAction?.(confirmAction.dataset.confirmAction).then(result=>{const message=session().messages.find(item=>item.action?.id===confirmAction.dataset.confirmAction);if(message){message.action={...message.action,status:'completed',result};save();render();}window.NEXZOShell?.toast?.('Planner task created','success');}).catch(error=>{confirmAction.disabled=false;confirmAction.textContent='Retry create';window.NEXZOShell?.toast?.(error.message||'Task could not be created','error');});return;
    }
    const imageSave=e.target.closest('[data-save-image]'),c=e.target.closest('[data-copy]'),saveRes=e.target.closest('[data-save-resource]'),sp=e.target.closest('[data-speak]'),dl=e.target.closest('[data-download]'),src=e.target.closest('[data-sources]'),more=e.target.closest('[data-more]'),rate=e.target.closest('[data-rate]'),regen=e.target.closest('[data-regenerate]');
    if(imageSave){saveGeneratedImage(+imageSave.dataset.saveImage);return;}
    if(saveRes){saveAnswerToResources(saveRes.dataset.saveResource);return;}
    if(c){navigator.clipboard.writeText(session().messages[+c.dataset.copy].content);c.classList.add('active');setTimeout(()=>c.classList.remove('active'),700);}
    if(sp){toggleSpeaking(+sp.dataset.speak);closeMessageMenus();}
    if(dl){downloadAnswer(+dl.dataset.download);closeMessageMenus();}
    if(src){showSources(+src.dataset.sources);closeMessageMenus();}
    if(rate)setRating(+rate.dataset.index,rate.dataset.rate,rate);
    if(regen)regenerate(+regen.dataset.regenerate);
    if(more){
      const index=more.dataset.more,menu=els.messages.querySelector(`[data-more-menu="${index}"]`),willOpen=menu?.hidden;
      closeMessageMenus(willOpen?index:null);
      if(menu){menu.hidden=!willOpen;more.setAttribute('aria-expanded',String(willOpen));}
    }
  });
  document.addEventListener('click',e=>{if(!e.target.closest('.more-wrap'))closeMessageMenus();});
  window.addEventListener('beforeunload',stopSpeaking);
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeAll));els.backdrop.addEventListener('click',closeAll);document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAll();});
  $('timerBtn').addEventListener('click',()=>{timerRun=!timerRun;if(timerRun)timerHandle=setInterval(timerTick,1000);else clearInterval(timerHandle);});
  $('avatarEditBtn')?.addEventListener('click',()=>$('avatarInput').click());
  $('avatarInput')?.addEventListener('change',()=>changeAvatar($('avatarInput').files?.[0]));
  $('assistantAvatarPreview')?.addEventListener('click',()=>$('assistantAvatarInput').click());
  $('uploadAssistantAvatar')?.addEventListener('click',()=>$('assistantAvatarInput').click());
  $('assistantAvatarInput')?.addEventListener('change',()=>changeAssistantAvatar($('assistantAvatarInput').files?.[0]));
  $('resetAssistantAvatar')?.addEventListener('click',()=>{saveAssistantAvatar('favicon.png');closeAll();});
  $('readerPause')?.addEventListener('click',toggleReaderPause);
  $('readerStop')?.addEventListener('click',stopSpeaking);
  $('readerVoice')?.addEventListener('change',()=>{const value=$('readerVoice').value;localStorage.setItem('nexzo.readAloud.voice',value);window.NEXZOSettings?.set?.({readAloudVoice:value});restartReaderChunk();});
  $('readerRate')?.addEventListener('change',()=>{const value=readerRate();localStorage.setItem('nexzo.readAloud.rate',String(value));window.NEXZOSettings?.set?.({readAloudRate:value});restartReaderChunk();});
  if('speechSynthesis'in window){window.speechSynthesis.addEventListener?.('voiceschanged',ensureReaderVoices);ensureReaderVoices();}
  window.addEventListener('nexzo:profile-updated',()=>applyProfile(authUser||{}));
  window.addEventListener('nexzo:settings-changed',()=>applyAssistantAvatar(savedAssistantAvatar()));
  window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',async e=>{e.preventDefault();const files=await droppedFiles(e.dataTransfer);addPickedAttachments(files,files.some(file=>attachmentPath(file).includes('/'))?'folder':'files');});
  els.retry?.addEventListener('click',async()=>{if(lastFailedRequest){const request=lastFailedRequest;setStatus('Retrying…','limited');await ask(request.text,{retry:true,retryPayload:request});return}await health(true);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)ensureReaderVoices();});
  applyAssistantAvatar(savedAssistantAvatar(),{rerender:false});
  loadProfile();
  restoreProjectContext(currentId);
  try{render();}catch(error){
    console.error('[NEXZO] Assistant initial render failed',error);
    if(els.messages&&!els.messages.children.length){
      els.messages.innerHTML='<div class="empty-state assistant-welcome"><div><span class="welcome-mark">N</span><h2>Study Assistant</h2><p>Restoring your conversation…</p></div></div>';
    }
  }
  resize();
  setStatus('Ready','checking');
  health(false);
  // A separate 30-second health poll duplicated real assistant traffic and woke the backend unnecessarily.
  // Requests and explicit Retry are the source of truth; only re-check after returning to the tab when stale.
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastHealthAt>120000)health(false).catch(()=>false);});
  setTimeout(checkSchedules,8000);setInterval(checkSchedules,60000);
})();
