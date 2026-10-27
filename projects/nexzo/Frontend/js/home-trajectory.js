/* One trajectory, seven native scroll chapters. No continuously running RAF. */
(function(){
  'use strict';
  if(!document.body.classList.contains('nx-journey'))return;
  const abort=new AbortController(),signal=abort.signal;
  const chapters=[...document.querySelectorAll('.chapter')],links=[...document.querySelectorAll('.chapter-progress a')];
  const path=document.getElementById('journeyTrajectory'),echo=document.getElementById('journeyEcho');
  links.forEach(link=>link.addEventListener('click',event=>{
    const target=document.querySelector(link.getAttribute('href'));
    if(!target)return;
    event.preventDefault();
    target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    try{history.replaceState(null,'',link.getAttribute('href'));}catch(_e){}
  },{signal}));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const points=[
    [[-50,650],[210,650],[440,280],[640,280],[1050,50]],
    [[-50,520],[240,390],[480,640],[730,190],[1050,310]],
    [[-50,520],[280,520],[500,180],[740,350],[1050,120]],
    [[-50,200],[260,200],[260,510],[700,510],[1050,510]],
    [[-50,640],[300,640],[500,400],[700,170],[1050,170]],
    [[-50,680],[220,380],[470,550],[740,190],[1050,490]],
    [[-50,100],[250,290],[500,680],[750,290],[1050,100]]
  ];
  let frame=0;
  function draw(){
    frame=0;if(document.hidden)return;
    const y=scrollY+innerHeight*.42;
    let i=chapters.findLastIndex(ch=>ch.offsetTop<=y);i=Math.max(0,i);
    links.forEach((link,n)=>link.setAttribute('aria-current',String(n===i)));
    const progressNav=document.querySelector('.chapter-progress');
    if(progressNav)progressNav.style.setProperty('--chapter-active',String(i));
    if(reduced.matches)return;
    const progress=Math.min(1,Math.max(0,(y-chapters[i].offsetTop)/chapters[i].offsetHeight));
    const a=points[i],b=points[Math.min(i+1,points.length-1)],t=progress*progress*(3-2*progress);
    const coords=a.map((p,n)=>p.map((v,k)=>v+(b[n][k]-v)*t));
    path.setAttribute('d',coords.map((p,n)=>(n?'L':'M')+' '+p.join(' ')).join(' '));
    echo.setAttribute('d',coords.map((p,n)=>(n?'L':'M')+' '+(p[0]+8)+' '+(p[1]+8)).join(' '));
    const arrival=document.querySelector('.arrival h1');
    arrival.style.setProperty('transform','translateX('+Math.min(60,scrollY*.05)+'px)');
    arrival.style.setProperty('opacity',String(Math.max(.2,1-scrollY/innerHeight*.7)));
  }
  function schedule(){if(!frame&&!document.hidden)frame=requestAnimationFrame(draw);}
  window.addEventListener('scroll',schedule,{passive:true,signal});window.addEventListener('resize',schedule,{passive:true,signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else schedule();},{signal});
  reduced.addEventListener('change',()=>{document.querySelector('.arrival h1').style.removeProperty('transform');document.querySelector('.arrival h1').style.removeProperty('opacity');schedule();},{signal});
  const contexts={
    'Software engineering':'Connect programming skills to projects and a practical roadmap.',
    'Artificial intelligence':'Connect mathematical foundations to model building and applied projects.',
    Data:'Connect statistics and databases to analysis and decision-making.',
    Cloud:'Connect networking and systems to infrastructure and deployment.',
    Cybersecurity:'Connect networking and operating systems to defensive security.'
  };
  document.querySelectorAll('[data-direction]').forEach(button=>button.addEventListener('click',()=>{
    document.querySelectorAll('[data-direction]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
    document.getElementById('journeyDirectionContext').textContent=button.dataset.direction+' — '+contexts[button.dataset.direction];
    document.getElementById('journeyCareerLink').textContent='Explore '+button.dataset.direction+' in Career ↗';
    const branch=Object.keys(contexts).indexOf(button.dataset.direction);
    points[2][4][1]=120+branch*110;
    schedule();
  },{signal}));
  async function curriculum(){
    try{
      const response=await fetch('data/mriirs-cse-2023-27.json',{signal});if(!response.ok)throw new Error('Curriculum unavailable');
      const data=await response.json(),courses=(data.courses||[]).filter(c=>c.title&&c.id).slice(0,8);
      if(!courses.length)return;
      const field=document.getElementById('journeySubjects');field.replaceChildren();
      courses.forEach(course=>{const button=document.createElement('button');button.type='button';button.textContent=course.title;button.setAttribute('aria-pressed','false');
        const select=()=>{field.querySelectorAll('button').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));document.getElementById('journeySubjectTitle').textContent=course.code+' / '+course.title;document.getElementById('journeySubjectDetail').textContent=(course.units||[]).map(unit=>unit.title||unit.name).filter(Boolean).slice(0,3).join(' · ')||'Explore this subject’s resources in Academics.';};
        button.addEventListener('click',select,{signal});button.addEventListener('focus',select,{signal});field.append(button);});
    }catch(error){if(error.name!=='AbortError')document.getElementById('journeySubjectDetail').textContent='Curriculum preview is unavailable. Your Academics workspace remains accessible.';}
  }
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);abort.abort();},{once:true});
  curriculum();schedule();
})();
