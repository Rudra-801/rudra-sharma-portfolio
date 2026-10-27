/* NEXZO Academics Controller v15 */
(function(){
'use strict';
if(document.body?.dataset.page!=='academics')return;
const $=s=>document.querySelector(s);
const subjects = ['AI', 'Machine Learning', 'DSA', 'Python', 'Web Dev', 'DBMS', 'Operating System', 'Computer Networks', 'OOP', 'Cyber Security', 'Cloud Computing', 'Data Science', 'Java', 'C++', 'JavaScript', 'React', 'Node.js', 'SQL', 'Software Engineering', 'Computer Graphics', 'DAA', 'Digital Electronics', 'Discrete Maths', 'IoT'];
const resources = [
  ['Videos', '▶️', '#a855f7', 'Watch concept videos and visual lessons.'],
  ['Notes', '📝', '#ffc107', 'Read structured notes and short revision points.'],
  ['Practice Questions', '🎯', '#ec4899', 'Solve MCQs, coding questions and assignments.'],
  ['Projects', '💻', '#22c55e', 'Build mini projects and apply your skills.'],
  ['Research Papers', '📄', '#ef4444', 'Explore papers, articles and advanced reading.'],
  ['Roadmap', '🗺️', '#3b82f6', 'Follow a step-by-step learning path.'],
  ['PDF Library', '📚', '#f97316', 'Open curated PDFs, cheatsheets and previous papers.'],
  ['Exam Mode', '🔥', '#fb7185', 'Important questions, quick revision and mock tests.']
];
let curSub = 'AI';
let curLvl = 'Beginner';
function searchUrl(q) { return 'https://www.google.com/search?q=' + encodeURIComponent(q); }

function renderAcademics() {
  const st = $('#subjectTabs'), lt = $('#levelTabs'), grid = $('#resourceGrid');
  if (!st || !lt || !grid) return;

  st.innerHTML = subjects.map(s => `<button type="button" class="tab ${s === curSub ? 'active' : ''}" data-subject="${s}">${s}</button>`).join('');
  lt.innerHTML = ['Beginner', 'Intermediate', 'Advanced'].map(l => `<button type="button" class="tab ${l === curLvl ? 'active' : ''}" data-level="${l}">${l}</button>`).join('');
  grid.innerHTML = resources.map((r, i) => {
    let action = `<a class="btn" style="--c:${r[2]}" target="_blank" href="${searchUrl(curSub + ' ' + curLvl + ' ' + r[0])}">Explore →</a>`;
    if (r[0] === 'PDF Library') action = `<button type="button" class="btn" style="--c:${r[2]}" data-academic-action="pdf">Open PDF Hub →</button>`;
    if (r[0] === 'Exam Mode') action = `<button type="button" class="btn" style="--c:${r[2]}" data-academic-action="exam">Start Exam Mode →</button>`;
    return `<div class="card reveal delay${i % 4}" style="--c:${r[2]}"><div class="icon">${r[1]}</div><h3>${r[0]}</h3><p>${r[3]}<br><small>${curSub} • ${curLvl}</small></p>${action}</div>`;
  }).join('');

  st.querySelectorAll('[data-subject]').forEach(btn => btn.addEventListener('click', () => { curSub = btn.dataset.subject; renderAcademics(); }));
  lt.querySelectorAll('[data-level]').forEach(btn => btn.addEventListener('click', () => { curLvl = btn.dataset.level; renderAcademics(); }));
  grid.querySelectorAll('[data-academic-action]').forEach(btn => btn.addEventListener('click', () => {
    const a = btn.dataset.academicAction;
    if (a === 'pdf') openPdfLibrary();
    if (a === 'exam') openExamMode();
  }));
}

function closeModal() { document.querySelector('#modalBackdrop')?.remove(); }
function modal(title, icon, body, actions = '', color = '#06b6d4') {
  const modalType = title.includes('PDF') ? 'pdf-same-ai-modal' : title.includes('Exam') ? 'exam-same-ai-modal' : title.includes('Career') ? 'career-same-ai-modal' : 'ai-same-modal';
  closeModal();
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop ai-backdrop" id="modalBackdrop" data-modal-backdrop><div class="modal-card premium-modal modal-show ${modalType}" style="--c:${color}"><div class="modal-running-light"></div><button class="modal-x" data-close-modal>×</button><div class="ai-orb-wrap"><div class="ai-orb">${icon}</div></div><h2>${title}</h2>${body}<div class="modal-actions">${actions}<button class="btn ghost" data-close-modal>Close</button></div></div></div>`);
}


function aiHistoryKey() {
  const u = getNexzoDisplayUser ? getNexzoDisplayUser() : { email: localStorage.getItem('email') || 'guest' };
  return 'nexzoAIStudyHistory:' + (u.email || 'guest').toLowerCase();
}
function getAIHistory() {
  try { return JSON.parse(localStorage.getItem(aiHistoryKey()) || '[]'); } catch { return []; }
}
function saveAIHistoryItem(item) {
  const list = getAIHistory();
  list.unshift({ ...item, id: Date.now(), createdAt: new Date().toISOString() });
  localStorage.setItem(aiHistoryKey(), JSON.stringify(list.slice(0, 30)));
}
function clearAIHistory() {
  localStorage.removeItem(aiHistoryKey());
  renderAIHistory();
}
function renderAIHistory() {
  const box = $('#aiHistoryList'); if (!box) return;
  const list = getAIHistory();
  if (!list.length) {
    box.innerHTML = '<div class="ai-history-empty">No saved answers yet. Ask a doubt and it will appear here.</div>';
    return;
  }
  box.innerHTML = list.slice(0, 6).map((x, i) => `
    <button class="ai-history-item" onclick="loadAIHistory(${i})">
      <b>${x.question}</b>
      <small>${new Date(x.createdAt).toLocaleString()}</small>
    </button>`).join('');
}
function loadAIHistory(index) {
  const item = getAIHistory()[index];
  if (!item) return;
  const q = $('#aiQuestion'), ans = $('#aiAnswer');
  if (q) q.value = item.question;
  if (ans) {
    ans.classList.remove('empty','loading');
    ans.innerHTML = item.answerHtml;
  }
}
function askFollowup(text) {
  const q = $('#aiQuestion');
  if (!q) return;
  q.value = text;
  q.focus();
  generateAIHelp();
}

function openAIModal() {
  const examples = [`Explain ${curSub} in simple words`, `Give ${curSub} important questions`, `Make a ${curLvl} revision plan`, `Solve my doubt step by step`];

  modal('AI Study Assistant', '🤖', `
    <div class="ai-chat-ui ai-chat-fixed">
      <p class="ai-subtitle">Ask a doubt for <b>${curSub}</b> • <b>${curLvl}</b>. NEXZO gives answer here only, with follow-up questions and saved history.</p>

      <div class="ai-prompt-box">
        <textarea id="aiQuestion" class="modal-textarea ai-input" placeholder="Type your doubt here... Example: explain AI"></textarea>
        <button class="ai-send" data-ai-generate title="Generate answer">➤</button>
      </div>

      <div class="ai-chip-row">
        ${examples.map(x => `<button type="button" class="ai-chip" onclick="setAIPrompt(${JSON.stringify(x)})">${x}</button>`).join('')}
      </div>

      <div id="aiAnswer" class="ai-answer ai-response-card empty">
        <div class="ai-empty-state">
          <span>✨</span>
          <b>Ready to answer</b>
          <small>Ask anything. Answer, example, steps, practice and resources will appear here.</small>
        </div>
      </div>

      <div id="aiFollowups" class="ai-followups" style="display:none"></div>

      <div class="ai-history-panel">
        <div class="ai-history-head">
          <b>Saved AI Answers</b>
          <button type="button" onclick="clearAIHistory()">Clear</button>
        </div>
        <div id="aiHistoryList"></div>
      </div>
    </div>`,
    `<button class="btn primary ai-main-generate" data-ai-generate>Generate Answer →</button>`, '#06b6d4');

  setTimeout(() => {
    renderAIHistory();
    const q = $('#aiQuestion');
    if (q) {
      q.focus();
      q.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') generateAIHelp();
      });
    }
  }, 60);
}
function setAIPrompt(v) { const q = $('#aiQuestion'); if (q) { q.value = v; q.focus(); } }
function quickExplain() { openAIModal(); setTimeout(() => { setAIPrompt(`Explain ${curSub} ${curLvl} important topics for exams`); generateAIHelp(); }, 80); }
function generateAIHelp() {
  const q = ($('#aiQuestion')?.value || '').trim();
  const topic = q || `${curSub} ${curLvl}`;
  const ans = $('#aiAnswer');
  if (!ans) return;

  ans.classList.remove('empty');
  ans.classList.add('loading');
  ans.innerHTML = `<div class="ai-thinking-wrap">
    <div class="ai-thinking"><span></span><span></span><span></span></div>
    <b>Preparing your answer...</b>
    <small>Preparing explanation, example, steps, practice and resources.</small>
  </div>`;

  setTimeout(() => {
    const lower = topic.toLowerCase();
    const subject = typeof curSub !== 'undefined' ? curSub : 'General';
    const level = typeof curLvl !== 'undefined' ? curLvl : 'Beginner';

    const bank = [
      {
        test:/\bai\b|artificial intelligence|machine intelligence/,
        title:'Artificial Intelligence',
        explain:'AI means making computers or machines perform tasks that normally need human intelligence, such as learning, reasoning, problem solving, decision making and understanding language.',
        example:'Example: A spam email detector learns patterns from old emails and decides whether a new email is spam or not.',
        steps:['AI takes input data from users or environment.','It analyzes patterns using rules or trained models.','It makes a decision or prediction.','It improves when more good data and feedback are available.'],
        practice:['Write 5 applications of AI.','Differentiate AI, ML and Deep Learning.','Explain AI with one daily-life example.']
      },
      {
        test:/linear|equation|algebra|math|maths/,
        title:'Linear Equation',
        explain:'A linear equation is an equation where the variable power is 1. The goal is to isolate the variable.',
        example:'2x + 3 = 11 → 2x = 8 → x = 4.',
        steps:['Write the equation clearly.','Move constants to the other side.','Divide by the coefficient.','Check answer by substitution.'],
        practice:['Solve 3x + 5 = 20','Solve 7x - 4 = 31','Solve 2(x+3)=18']
      },
      {
        test:/stack|queue|lifo|fifo/,
        title:'Stack vs Queue',
        explain:'Stack follows LIFO: last in, first out. Queue follows FIFO: first in, first out.',
        example:'Stack: browser back button. Queue: ticket counter line.',
        steps:['Define stack and queue.','Mention LIFO/FIFO.','Write operations.','Give real-life examples.'],
        practice:['Implement stack.','Implement queue.','Write 3 differences.']
      },
      {
        test:/python|javascript|java|c\+\+|code|program|loop|array|string/,
        title:'Programming Logic',
        explain:'Programming means solving a problem using clear steps and converting those steps into code.',
        example:'For word frequency: split text into words, count each word using dictionary/object, print result.',
        steps:['Identify input and output.','Write algorithm/pseudocode.','Code in small blocks.','Test with sample cases.'],
        practice:['Dry run code manually.','Add comments.','Test edge cases.']
      },
      {
        test:/dbms|database|sql|normalization|query/,
        title:'DBMS',
        explain:'DBMS stores and manages data using tables, keys and queries. SQL is used to work with data.',
        example:'SELECT * FROM students WHERE semester = 6;',
        steps:['Identify table.','Identify columns and keys.','Write condition.','Check output.'],
        practice:['Write SELECT query.','Explain primary key.','Explain normalization.']
      },
      {
        test:/network|cn|tcp|udp|osi|ip|dns/,
        title:'Computer Networks',
        explain:'Computer Networks connect devices so they can exchange data using rules called protocols.',
        example:'DNS converts a domain like google.com into an IP address.',
        steps:['Define the concept.','Explain working steps.','Give real example.','Mention advantages or differences.'],
        practice:['OSI layers.','TCP vs UDP.','DNS explanation.']
      }
    ];

    const hit = bank.find(x => x.test.test(lower)) || {
      title: topic,
      explain:`For ${subject}, understand the definition first, then one example, then practice questions. At ${level} level, keep answer simple and step-by-step.`,
      example:`Example approach: define ${topic}, explain where it is used, then give one real-life example.`,
      steps:['Read the question carefully.','Write a simple definition.','Explain step-by-step.','Add example, diagram or code if needed.'],
      practice:[`Make short notes for ${topic}`,`Solve 5 ${subject} questions`,`Revise key terms`]
    };

    const notes = searchUrl(topic + ' notes examples');
    const practice = searchUrl(topic + ' practice questions');
    const video = searchUrl(topic + ' explained');

    const followups = [
      `Explain ${hit.title} in even simpler words`,
      `Give 5 MCQs on ${hit.title}`,
      `Make exam answer for ${hit.title}`,
      `Give short notes on ${hit.title}`
    ];

    const answerHtml = `
      <div class="ai-result-head">✅ Answer Ready</div>
      <h3>${hit.title}</h3>
      <p><b>Simple Explanation:</b> ${hit.explain}</p>
      <p><b>Example:</b> ${hit.example}</p>
      <h4>Step-by-step</h4>
      <div class="ai-step-grid">${hit.steps.map((s, i) => `<div><span>${String(i+1).padStart(2,'0')}</span>${s}</div>`).join('')}</div>
      <div class="ai-practice-box"><b>Practice:</b><ul>${hit.practice.map(p => `<li>${p}</li>`).join('')}</ul></div>
      <div class="ai-action-row">
        <a class="btn primary" target="_blank" href="${notes}">Search Resources →</a>
        <a class="btn ghost" target="_blank" href="${practice}">Practice Questions</a>
        <a class="btn ghost" target="_blank" href="${video}">Video Explanation</a>
      </div>`;

    const followHtml = `<b>Follow-up questions</b><div>${followups.map(f => `<button type="button" onclick="askFollowup(${JSON.stringify(f)})">${f}</button>`).join('')}</div>`;

    ans.classList.remove('loading');
    ans.innerHTML = answerHtml;

    const fbox = $('#aiFollowups');
    if (fbox) {
      fbox.style.display = 'block';
      fbox.innerHTML = followHtml;
    }

    saveAIHistoryItem({ question: topic, answerHtml, followHtml, subject, level });
    renderAIHistory();

    setTimeout(() => {
      ans.scrollIntoView({ behavior:'smooth', block:'nearest' });
    }, 50);
  }, 350);
}

function openPdfLibrary() {
  const color = '#f97316';
  closeModal();
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop resource-pop-backdrop" id="modalBackdrop" data-modal-backdrop><section class="resource-pop-v4 pdf-pop-v4" style="--c:${color}"><div class="resource-pop-light"></div><div class="resource-pop-dots"></div><button class="resource-pop-x" data-close-modal>×</button><header class="resource-pop-head"><div class="resource-pop-icon">📚</div><div><span class="resource-pop-label">PDF RESOURCES</span><h1>PDF Library</h1><p>Curated PDF searches for <b>${curSub}</b> • <b>${curLvl}</b>. Open notes, cheat sheets and previous papers instantly.</p></div></header><div class="resource-list-v4"><a target="_blank" href="${searchUrl(curSub + ' ' + curLvl + ' notes pdf')}"><i>📄</i><div><b>Notes PDF</b><small>Handwritten notes and digital summaries</small></div><strong>Open →</strong></a><a target="_blank" href="${searchUrl(curSub + ' ' + curLvl + ' cheat sheet pdf')}"><i>🧾</i><div><b>Cheat Sheet</b><small>Quick formulas and last-minute revision</small></div><strong>Open →</strong></a><a target="_blank" href="${searchUrl(curSub + ' ' + curLvl + ' previous year questions pdf')}"><i>📚</i><div><b>Previous Papers</b><small>PYQs and exam-style questions</small></div><strong>Open →</strong></a><a target="_blank" href="${searchUrl(curSub + ' ' + curLvl + ' interview questions pdf')}"><i>💼</i><div><b>Interview PDF</b><small>Viva, interview and quick Q&A material</small></div><strong>Open →</strong></a></div><footer class="resource-pop-footer"><a class="resource-main-btn" target="_blank" href="${searchUrl(curSub + ' ' + curLvl + ' pdf resources')}">Open PDF Hub →</a><button class="resource-close-btn" data-close-modal>Close</button></footer></section></div>`);
}
function openExamMode() {
  const color = '#fb7185';
  closeModal();
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop resource-pop-backdrop" id="modalBackdrop" data-modal-backdrop><section class="resource-pop-v4 exam-pop-v4" style="--c:${color}"><div class="resource-pop-light"></div><div class="resource-pop-dots"></div><button class="resource-pop-x" data-close-modal>×</button><header class="resource-pop-head"><div class="resource-pop-icon">🔥</div><div><span class="resource-pop-label">EXAM PREPARATION</span><h1>Exam Mode</h1><p>Fast revision for <b>${curSub}</b> • <b>${curLvl}</b>. Practice important questions, MCQs and revision notes.</p></div></header><div class="exam-cards-v4"><a target="_blank" href="${searchUrl(curSub + ' ' + curLvl + ' important questions')}"><i>❓</i><b>Important Questions</b><small>20 curated questions</small><strong>Open →</strong></a><a target="_blank" href="${searchUrl(curSub + ' ' + curLvl + ' MCQ practice')}"><i>✅</i><b>MCQ Practice</b><small>Fast revision mode</small><strong>Open →</strong></a><a target="_blank" href="${searchUrl(curSub + ' ' + curLvl + ' revision notes formulas')}"><i>📝</i><b>Revision Notes</b><small>Short notes and formulas</small><strong>Open →</strong></a><a target="_blank" href="${searchUrl(curSub + ' ' + curLvl + ' previous year questions')}"><i>📕</i><b>PYQ Practice</b><small>Previous year questions</small><strong>Open →</strong></a></div><footer class="resource-pop-footer"><a class="resource-main-btn" target="_blank" href="${searchUrl(curSub + ' ' + curLvl + ' important questions MCQ')}">Start Practice →</a><button class="resource-close-btn" data-close-modal>Close</button></footer></section></div>`);
}


function bindModalEvents(){
 document.addEventListener('click',event=>{
  if(event.target.matches('[data-close-modal]')||event.target.closest('[data-close-modal]')) closeModal();
  if(event.target.matches('[data-modal-backdrop]')) closeModal();
  if(event.target.closest('[data-ai-generate]')) generateAIHelp();
 });
}
function boot(){window.NEXZOShell?.layout?.('Academics');renderAcademics();bindModalEvents();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
