/* NEXZO Career Controller v15 */
(function(){
'use strict';
if(document.body?.dataset.page!=='career')return;
const $=s=>document.querySelector(s);
const searchUrl=q=>'https://www.google.com/search?q='+encodeURIComponent(q);
const SELECTED_ROLE_KEY='nexzo.career.selected.v1';
function rememberCareer(c){try{localStorage.setItem(SELECTED_ROLE_KEY,JSON.stringify(c))}catch{}}
function selectedCareer(){try{return JSON.parse(localStorage.getItem(SELECTED_ROLE_KEY)||'null')}catch{return null}}
function launchAssistant(mode,prompt){
  try{localStorage.setItem('nexzo.ai.launch',JSON.stringify({mode,prompt,at:Date.now()}))}catch{}
  location.href=`ai-assistant.html?mode=${encodeURIComponent(mode)}&prompt=${encodeURIComponent(prompt)}`;
}
function closeModal(){document.querySelector('#modalBackdrop')?.remove();document.documentElement.classList.remove('nx-career-modal-open');document.body.classList.remove('nx-career-modal-open');}
const domains = ['CSE & Coding', 'Software Development', 'Frontend', 'Backend', 'Full Stack', 'AI / ML', 'Data Science', 'Cyber Security', 'Cloud', 'DevOps', 'Mobile App', 'UI/UX Tech'];
const careers = {
  'CSE & Coding': [['Software Development Engineer', 'DSA, OOP, DBMS, Git, OS', '₹6 - ₹24 LPA', '#06b6d4', '💻', 'High Demand'], ['Frontend Developer', 'HTML, CSS, JavaScript, React, Tailwind', '₹5 - ₹16 LPA', '#a855f7', '🖥️', 'Creative'], ['Backend API Engineer', 'Node.js, Express, SQL, MongoDB, APIs', '₹6 - ₹20 LPA', '#22c55e', '🗄️', 'Stable'], ['Full Stack Developer', 'React, Node.js, MongoDB, Auth, Deployment', '₹8 - ₹28 LPA', '#ffc107', '⚡', 'Popular']],
  'Software Development': [['SDE 1', 'DSA, Java/C++, OOP, System Design Basics', '₹6 - ₹22 LPA', '#06b6d4', '⌨️', 'Recommended'], ['QA Automation Engineer', 'Testing, Selenium, APIs, JS/Python', '₹4 - ₹12 LPA', '#3b82f6', '🧪', 'Practical'], ['Open Source Developer', 'GitHub, Docs, Issues, PRs', '₹5 - ₹15 LPA', '#22c55e', '🌐', 'Growth']],
  'Frontend': [['React Developer', 'React, Redux, APIs, Tailwind', '₹5 - ₹18 LPA', '#a855f7', '⚛️', 'High Growth'], ['UI Engineer', 'HTML, CSS, JS, Accessibility', '₹5 - ₹14 LPA', '#ec4899', '🎨', 'Creative'], ['Next.js Developer', 'Next.js, SEO, SSR, Vercel', '₹7 - ₹22 LPA', '#06b6d4', '▲', 'Modern']],
  'Backend': [['Node.js Developer', 'Node.js, Express, REST, JWT', '₹6 - ₹20 LPA', '#22c55e', '🟢', 'High Demand'], ['Database Developer', 'SQL, Indexing, Prisma, PostgreSQL', '₹6 - ₹18 LPA', '#3b82f6', '🗃️', 'Core'], ['API Engineer', 'REST, Auth, Validation, Security', '₹7 - ₹22 LPA', '#f97316', '🔌', 'Important']],
  'Full Stack': [['MERN Developer', 'MongoDB, Express, React, Node', '₹7 - ₹24 LPA', '#ffc107', '🚀', 'Popular'], ['SaaS Developer', 'Auth, Payments, Dashboard, APIs', '₹8 - ₹28 LPA', '#ec4899', '💎', 'Premium']],
  'AI / ML': [['ML Engineer', 'Python, ML, DL, NLP', '₹8 - ₹25 LPA', '#f97316', '🧠', 'High Growth'], ['AI App Developer', 'LLM, RAG, APIs, Prompting', '₹10 - ₹30 LPA', '#ec4899', '🤖', 'Trending'], ['Computer Vision Engineer', 'OpenCV, CNN, PyTorch', '₹8 - ₹24 LPA', '#06b6d4', '👁️', 'Advanced']],
  'Data Science': [['Data Scientist', 'Python, Stats, SQL, ML', '₹7 - ₹24 LPA', '#3b82f6', '📊', 'High Growth'], ['Data Analyst', 'Excel, SQL, PowerBI, Python', '₹4 - ₹12 LPA', '#06b6d4', '📈', 'Entry Friendly'], ['Data Engineer', 'SQL, ETL, Python, Cloud', '₹7 - ₹22 LPA', '#22c55e', '🧱', 'Stable']],
  'Cyber Security': [['Security Analyst', 'Network, Linux, SIEM, Python', '₹6 - ₹20 LPA', '#ef4444', '🛡️', 'Critical'], ['SOC Analyst', 'Logs, Alerts, Threat Hunting', '₹5 - ₹16 LPA', '#ec4899', '🚨', 'High Demand'], ['Penetration Tester', 'Web Security, Burp, Linux', '₹7 - ₹25 LPA', '#f97316', '🗡️', 'Advanced']],
  'Cloud': [['Cloud Engineer', 'AWS, Linux, Docker, Networking', '₹7 - ₹22 LPA', '#38bdf8', '☁️', 'High Demand'], ['Cloud Developer', 'Serverless, APIs, Databases', '₹8 - ₹24 LPA', '#3b82f6', '⚙️', 'Modern']],
  'DevOps': [['DevOps Engineer', 'CI/CD, Docker, Kubernetes, Linux', '₹7 - ₹24 LPA', '#22c55e', '🚀', 'High Growth'], ['Site Reliability Engineer', 'Monitoring, Automation, Cloud', '₹10 - ₹30 LPA', '#ffc107', '📡', 'Advanced']],
  'Mobile App': [['Android Developer', 'Kotlin, Java, Firebase', '₹5 - ₹18 LPA', '#22c55e', '📱', 'Popular'], ['Flutter Developer', 'Dart, Firebase, APIs', '₹5 - ₹18 LPA', '#06b6d4', '💙', 'Cross Platform']],
  'UI/UX Tech': [['UI/UX Designer', 'Figma, UX Research, Prototyping', '₹5 - ₹18 LPA', '#ec4899', '🎨', 'Creative'], ['Frontend UI Developer', 'CSS, Motion, JS, Components', '₹5 - ₹16 LPA', '#a855f7', '✨', 'Design + Code']]
};
let curDomain = 'CSE & Coding';
function renderCareer() {
  const tabs = $('#careerTabs'), grid = $('#careerGrid');
  if (!tabs || !grid) return;
  tabs.innerHTML = domains.map(d => `<button type="button" class="tab ${d === curDomain ? 'active' : ''}" data-domain="${d}">${d}</button>`).join('');
  grid.innerHTML = (careers[curDomain] || careers['CSE & Coding']).map((c, i) => `<div class="card career-card reveal delay${i % 4}" style="--c:${c[3]}" data-career='${encodeURIComponent(JSON.stringify(c))}'><div class="career-tag-badge">${c[5]}</div><div class="icon">${c[4]}</div><h3>${c[0]}</h3><p>Build real projects, prepare interviews and create a strong portfolio.</p><p><b style="color:${c[3]}">Skills:</b><br>${c[1]}</p><p><b style="color:${c[3]}">Salary:</b> ${c[2]}</p><button type="button" class="btn" style="--c:${c[3]}">View Details →</button></div>`).join('');
  tabs.querySelectorAll('[data-domain]').forEach(btn => btn.addEventListener('click', () => { curDomain = btn.dataset.domain; renderCareer(); }));
  grid.querySelectorAll('[data-career]').forEach(card => card.addEventListener('click', () => {const raw=decodeURIComponent(card.dataset.career);rememberCareer(JSON.parse(raw));openCareerProfile(raw);}));
}
function openCareerProfile(raw) {
  const c = JSON.parse(raw);
  const [role, skills, salary, color, icon, badge] = c;
  const techMap = {
    'Frontend Developer': ['React', 'JavaScript', 'CSS', 'Tailwind', 'API'], 'React Developer': ['React', 'Redux', 'Vite', 'Tailwind', 'REST'], 'Next.js Developer': ['Next.js', 'SEO', 'SSR', 'Vercel', 'API'],
    'Backend API Engineer': ['Node.js', 'Express', 'SQL', 'JWT', 'Security'], 'Node.js Developer': ['Node.js', 'Express', 'MongoDB', 'JWT', 'REST'], 'Full Stack Developer': ['React', 'Node', 'MongoDB', 'Auth', 'Deploy'], 'MERN Developer': ['MongoDB', 'Express', 'React', 'Node', 'Git'],
    'AI App Developer': ['LLM', 'RAG', 'Python', 'APIs', 'Prompting'], 'ML Engineer': ['Python', 'ML', 'TensorFlow', 'Projects', 'Stats'], 'Data Scientist': ['Python', 'SQL', 'Stats', 'ML', 'PowerBI'],
    'Security Analyst': ['Linux', 'Network', 'SIEM', 'Python', 'Cloud'], 'Cloud Engineer': ['AWS', 'Linux', 'Docker', 'Networking', 'CI/CD'], 'DevOps Engineer': ['Docker', 'Kubernetes', 'CI/CD', 'Linux', 'Cloud']
  };
  const tech = techMap[role] || skills.split(',').map(x => x.trim()).slice(0, 5);
  const desc = role.includes('Frontend') ? 'Build modern responsive interfaces, master UI components and prepare for real product teams.' : role.includes('Backend') ? 'Build APIs, databases, auth systems and scalable server-side applications.' : role.includes('Full') || role.includes('MERN') ? 'Master frontend, backend, deployment and build complete production apps.' : role.includes('AI') || role.includes('ML') ? 'Build intelligent systems, train models and solve real-world problems with AI.' : role.includes('Data') ? 'Analyze data, build dashboards and turn insights into business decisions.' : role.includes('Security') ? 'Protect systems, detect threats and build secure digital products.' : 'Role roadmap, skills, salary path and practice links made for coding/CSE careers.';
  closeModal();
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop career-pop-backdrop" id="modalBackdrop"><section class="career-pop-v3" role="dialog" aria-modal="true" aria-label="${role} career profile" style="--c:${color}"><div class="career-pop-light"></div><div class="career-pop-particles"></div><button type="button" class="career-pop-x" data-career-close aria-label="Close career profile">×</button><header class="career-pop-head"><div class="career-role-icon">${icon}</div><div class="career-pop-title"><span>${badge} • Career Profile</span><h1>${role}</h1><p>${desc}</p></div></header><div class="career-metric-grid"><article class="career-metric-card"><i>⌘</i><small>CORE SKILLS</small><b>${skills}</b></article><article class="career-metric-card"><i>₹</i><small>EXPECTED SALARY</small><b>${salary}</b><em>Average in India</em></article><article class="career-metric-card hot"><i>↗</i><small>CAREER STATUS</small><b>${badge}</b><em>Great opportunities ahead</em></article></div><div class="career-tile-grid"><button type="button" class="career-tile" data-career-ai="roadmap"><span>🗺️</span><b>Personal Roadmap</b><small>Build a step-by-step plan</small><strong>→</strong></button><a class="career-tile" target="_blank" rel="noopener" href="${searchUrl(role + ' complete course free')}"><span>🎓</span><b>Courses</b><small>Find learning resources</small><strong>→</strong></a><button type="button" class="career-tile" data-career-ai="resume"><span>📄</span><b>Resume Plan</b><small>Projects and resume points</small><strong>→</strong></button><button type="button" class="career-tile" data-career-ai="interview"><span>🎯</span><b>Mock Interview</b><small>Practise with AI feedback</small><strong>→</strong></button></div><footer class="career-tech-row"><b>🔥 Trending Tech</b><div>${tech.map(t => `<span>${t}</span>`).join('')}<span>+ More</span></div></footer><button type="button" class="career-close-btn" data-career-close>Close ×</button></section></div>`);
  const backdrop=document.getElementById('modalBackdrop');
  document.documentElement.classList.add('nx-career-modal-open');document.body.classList.add('nx-career-modal-open');
  backdrop?.querySelectorAll('[data-career-close]').forEach(btn=>btn.addEventListener('click',closeModal));
  backdrop?.querySelectorAll('[data-career-ai]').forEach(button=>button.addEventListener('click',()=>{
    const action=button.dataset.careerAi;
    const prompts={
      roadmap:`Create a practical 12-week ${role} roadmap for a university student. Current target skills: ${skills}. Include weekly outcomes, projects, practice and checkpoints.`,
      resume:`Create a resume-readiness plan for a ${role} role. Suggest skills, three realistic portfolio projects, measurable resume bullet points and a gap checklist.`,
      interview:`Start a five-question ${role} mock interview at intermediate level. Ask one question at a time and score my answers.`
    };
    launchAssistant(action==='interview'?'interview':action==='resume'?'notes':'explain',prompts[action]);
  }));
  backdrop?.addEventListener('click',e=>{if(e.target===backdrop)closeModal();});
  const onKey=e=>{if(e.key==='Escape'){closeModal();document.removeEventListener('keydown',onKey);}};document.addEventListener('keydown',onKey);
  backdrop?.querySelector('[data-career-close]')?.focus();
}


function bindCareerToolkit(){
  document.querySelectorAll('[data-career-tool]').forEach(button=>button.addEventListener('click',()=>{
    const action=button.dataset.careerTool;
    const selected=selectedCareer()||(careers[curDomain]||careers['CSE & Coding'])[0];
    const role=selected?.[0]||'Software Development Engineer',skills=selected?.[1]||'DSA, development and projects';
    if(action==='paths'){document.getElementById('careerExplorer')?.scrollIntoView({behavior:'smooth',block:'start'});document.querySelector('#careerTabs button')?.focus();return;}
    if(action==='roadmap'){rememberCareer(selected);openCareerProfile(JSON.stringify(selected));return;}
    if(action==='resume'){launchAssistant('notes',`Create a resume-readiness plan for a ${role} role. My target skills are ${skills}. Suggest projects, quantified resume bullets and a gap checklist.`);return;}
    if(action==='interview')launchAssistant('interview',`Start a five-question ${role} mock interview at intermediate level. Ask one question at a time, evaluate each answer and give a final report.`);
  }));
}
function boot(){window.NEXZOShell?.layout?.('Career');renderCareer();bindCareerToolkit();const search=document.querySelector('.career-page .search');if(search)search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();document.querySelectorAll('#careerGrid .career-card').forEach(card=>card.hidden=q&&!card.textContent.toLowerCase().includes(q));});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
