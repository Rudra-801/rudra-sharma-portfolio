(function(){
 const cfg=window.GAMEPRO_CONFIG||{};
 const title=cfg.title||document.title.replace(/Talha\s*-\s*/i,'').replace(/SnakeMania.*/i,'Snake');
 const controls=cfg.controls||'Use the keyboard or on-screen controls.';
 const goal=cfg.goal||'Play, improve your score and beat your personal best.';
 const tip=cfg.tip||'You can reopen this guide from the ? button.';
 const base=cfg.base||'';
 document.title=title+' • GamePro';
 const top=document.createElement('div'); top.id='gp-topbar';
 top.innerHTML=`<div class="gp-left"><a class="gp-btn" href="${base}games.html">← <span>Games</span></a><span class="gp-brand">GAME<b>PRO</b></span><span style="color:#66718d">/</span><strong>${title}</strong></div><div class="gp-right"><button class="gp-btn" id="gp-guide">? Guide</button><button class="gp-btn" id="gp-sound">🔊</button><button class="gp-btn" id="gp-settings-btn">⚙</button><a class="gp-btn" href="${base}home page.html">⌂ <span class="gp-home-label">Home</span></a></div>`;
 document.body.prepend(top);
 const settings=document.createElement('div');settings.id='gp-settings';settings.innerHTML=`<strong>Game settings</strong><div class="gp-setting-row"><label>Sound</label><button class="gp-btn" id="gp-mute-toggle">On</button></div><div class="gp-setting-row"><label>Volume</label><input class="gp-volume" id="gp-volume" type="range" min="0" max="1" step="0.05" value="${localStorage.getItem('gpVolume')||.7}"></div>`;document.body.append(settings);
 const intro=document.createElement('div');intro.id='gp-intro';intro.innerHTML=`<div class="gp-intro-card"><div class="gp-kicker">GamePro • How to play</div><h1>${title}</h1><p>${cfg.description||'Ready to play? Learn the controls first, then jump straight into the game.'}</p><div class="gp-how"><div><strong>🎯 Goal</strong><span>${goal}</span></div><div><strong>⌨ Controls</strong><span>${controls}</span></div><div><strong>💡 Tip</strong><span>${tip}</span></div></div><div class="gp-actions"><button class="gp-btn primary" id="gp-play">Play now →</button><button class="gp-btn" id="gp-intro-sound">🔊 Sound on</button><button class="gp-btn gp-skip" id="gp-skip">Skip intro</button></div></div>`;document.body.append(intro);
 let muted=localStorage.getItem('gpMuted')==='1';let volume=parseFloat(localStorage.getItem('gpVolume')||'.7');
 function applyAudio(){document.querySelectorAll('audio').forEach(a=>{a.muted=muted;a.volume=volume}); const txt=muted?'🔇':'🔊';document.getElementById('gp-sound').textContent=txt;document.getElementById('gp-mute-toggle').textContent=muted?'Off':'On';document.getElementById('gp-intro-sound').textContent=muted?'🔇 Sound off':'🔊 Sound on'}
 function toggleMute(){muted=!muted;localStorage.setItem('gpMuted',muted?'1':'0');applyAudio()}
 function closeIntro(){intro.style.display='none';localStorage.setItem('gpIntroSeen:'+title,'1'); if(cfg.onStart) cfg.onStart()}
 document.getElementById('gp-play').onclick=closeIntro;document.getElementById('gp-skip').onclick=closeIntro;document.getElementById('gp-guide').onclick=()=>intro.style.display='grid';document.getElementById('gp-sound').onclick=toggleMute;document.getElementById('gp-intro-sound').onclick=toggleMute;document.getElementById('gp-settings-btn').onclick=()=>settings.style.display=settings.style.display==='block'?'none':'block';document.getElementById('gp-mute-toggle').onclick=toggleMute;document.getElementById('gp-volume').oninput=e=>{volume=+e.target.value;localStorage.setItem('gpVolume',volume);applyAudio()};
 new MutationObserver(applyAudio).observe(document.documentElement,{childList:true,subtree:true});applyAudio();
 if(localStorage.getItem('gpIntroSeen:'+title)==='1') intro.style.display='none';
})();
