(function(){'use strict';
  const IDS=['campusCollege','campusProgram','campusBranch'];
  function restoreMenu(w){const m=w?._nxMenu;if(!w||!m)return;m.hidden=true;m.classList.remove('nx-custom-select-portal');m.style.cssText='';if(m.parentNode!==w)w.appendChild(m)}
  function closeAll(except){document.querySelectorAll('.nx-custom-select.is-open').forEach(w=>{if(w!==except){w.classList.remove('is-open');w.querySelector('.nx-custom-select-button')?.setAttribute('aria-expanded','false');restoreMenu(w)}})}
  function enhance(select){
    if(!select||select.dataset.nxCustomSelect==='true')return;
    select.dataset.nxCustomSelect='true';select.classList.add('nx-custom-select-native');
    const wrap=document.createElement('div');wrap.className='nx-custom-select';
    select.parentNode.insertBefore(wrap,select);wrap.appendChild(select);
    const button=document.createElement('button');button.type='button';button.className='nx-custom-select-button';button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
    const menu=document.createElement('div');menu.className='nx-custom-select-menu';menu.setAttribute('role','listbox');menu.hidden=true;
    wrap.append(button,menu);wrap._nxMenu=menu;
    const render=()=>{
      const options=[...select.options];button.textContent=select.selectedOptions[0]?.textContent||options[0]?.textContent||'Select';
      menu.innerHTML='';options.forEach((opt,index)=>{const row=document.createElement('button');row.type='button';row.className='nx-custom-select-option';row.setAttribute('role','option');row.setAttribute('aria-selected',String(opt.selected));row.dataset.value=opt.value;row.textContent=opt.textContent;row.disabled=opt.disabled;row.addEventListener('click',()=>{select.value=opt.value;select.dispatchEvent(new Event('change',{bubbles:true}));closeAll();render();button.focus()});menu.appendChild(row)});
    };
    const observer=new MutationObserver(render);observer.observe(select,{childList:true,subtree:true,attributes:true});
    select.addEventListener('change',render);
    button.addEventListener('click',()=>{const opening=!wrap.classList.contains('is-open');closeAll(wrap);wrap.classList.toggle('is-open',opening);button.setAttribute('aria-expanded',String(opening));if(opening){const r=button.getBoundingClientRect(),gap=8,spaceBelow=innerHeight-r.bottom-gap,spaceAbove=r.top-gap,useAbove=spaceBelow<220&&spaceAbove>spaceBelow;document.body.appendChild(menu);menu.classList.add('nx-custom-select-portal');menu.hidden=false;menu.style.left=`${Math.round(r.left)}px`;menu.style.width=`${Math.round(r.width)}px`;menu.style.right='auto';menu.style.top=useAbove?'auto':`${Math.round(r.bottom+gap)}px`;menu.style.bottom=useAbove?`${Math.round(innerHeight-r.top+gap)}px`:'auto';menu.style.maxHeight=`${Math.max(160,Math.min(360,(useAbove?spaceAbove:spaceBelow)-4))}px`;const chosen=menu.querySelector('[aria-selected="true"]');chosen?.scrollIntoView({block:'nearest'})}else restoreMenu(wrap)});
    button.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp','Enter',' '].includes(e.key)&&!wrap.classList.contains('is-open')){e.preventDefault();button.click()}});
    render();
  }
  function boot(){IDS.forEach(id=>enhance(document.getElementById(id)));document.addEventListener('click',e=>{if(!e.target.closest('.nx-custom-select')&&!e.target.closest('.nx-custom-select-portal'))closeAll()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAll()});addEventListener('resize',()=>closeAll(),{passive:true});addEventListener('scroll',e=>{if(e.target instanceof Element&&e.target.closest('.nx-custom-select-portal'))return;closeAll()},{passive:true,capture:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
