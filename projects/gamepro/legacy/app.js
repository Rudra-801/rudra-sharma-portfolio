(() => {
  const USERS='gamepro_users', SESSION='gamepro_session', ACTIVITY='gamepro_activity';
  const read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
  const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const current=()=>read(SESSION,null);
  const hash=(s)=>{let h=2166136261; for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)} return (h>>>0).toString(16)};
  const signup=document.getElementById('signupForm');
  if(signup) signup.addEventListener('submit',e=>{
    e.preventDefault(); const inputs=signup.querySelectorAll('input');
    const first=inputs[0].value.trim(), last=inputs[1].value.trim(), email=inputs[2].value.trim().toLowerCase(), pass=document.getElementById('password').value;
    const terms=signup.querySelector('input[type=checkbox]').checked; const users=read(USERS,[]);
    if(!first||!last||!email||pass.length<6) return alert('Fill all fields. Password must be at least 6 characters.');
    if(!terms) return alert('Please accept the Terms & Conditions.');
    if(users.some(u=>u.email===email)) return alert('An account with this email already exists.');
    const user={id:Date.now(),first,last,email,password:hash(pass),xp:0,level:1,joined:new Date().toISOString()}; users.push(user); write(USERS,users);
    write(SESSION,{id:user.id,first,last,email}); alert('Account created. Welcome to GamePro!'); location.href='dashboard.html';
  });
  const login=document.getElementById('loginButton');
  if(login) login.addEventListener('click',()=>{
    const email=document.getElementById('email').value.trim().toLowerCase(), pass=document.getElementById('password').value; const users=read(USERS,[]);
    const u=users.find(x=>x.email===email && x.password===hash(pass)); const err=document.getElementById('error-message');
    if(!u){if(err){err.textContent='Incorrect email or password.';err.style.display='block'} return}
    write(SESSION,{id:u.id,first:u.first,last:u.last,email:u.email}); location.href='dashboard.html';
  });
  window.GamePro={
    current, requireAuth(){if(!current()){location.href='login.html';return false}return true},
    logout(){localStorage.removeItem(SESSION);location.href='home page.html'},
    activity(){return read(ACTIVITY,[]).filter(a=>current()&&a.userId===current().id).slice(-8).reverse()},
    track(game){const u=current(); if(!u)return; const a=read(ACTIVITY,[]);a.push({userId:u.id,game,time:new Date().toISOString()});write(ACTIVITY,a);
      const users=read(USERS,[]),x=users.find(v=>v.id===u.id);if(x){x.xp=(x.xp||0)+10;x.level=Math.floor(x.xp/100)+1;write(USERS,users)}} ,
    user(){const s=current();return s?read(USERS,[]).find(u=>u.id===s.id):null}
  };
  document.addEventListener('click',e=>{const a=e.target.closest('a[data-game]');if(a)GamePro.track(a.dataset.game)});
})();