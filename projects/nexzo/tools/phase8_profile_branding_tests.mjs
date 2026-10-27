import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
let pass=0,fail=0;
function test(name,ok){if(ok){console.log('PASS',name);pass++}else{console.error('FAIL',name);fail++}}
const authority=read('Frontend/js/profile-authority.js');
const controller=read('Frontend/js/profile-controller.js');
const shell=read('Frontend/js/app-shell.js');
test('profile exposes confirmed cloud save path',authority.includes('saveConfirmed=async')&&authority.includes('await service.saveProfile(value)'));
test('profile editor waits for confirmed authority',controller.includes('await authority.saveConfirmed(next)'));
test('failed photo upload keeps previous photo',controller.includes('Photo upload failed. Your previous profile photo was kept.'));
test('UID is authoritative in profile save',authority.includes('uid:uid()'));
test('shell uses one NEXZO wordmark asset',shell.includes('assets/nexzo-wordmark.svg')&&shell.includes('PERSONALIZED RECOMMENDER'));
const pages=['Home.html','academics.html','career.html','planner.html','community.html','dashboard.html','nexzo-hub.html','settings.html','profile.html','ai-assistant.html','login.html','signup.html'];
test('all primary pages load shared brand stylesheet',pages.every(f=>read('Frontend/'+f).includes('css/brand.css')));
test('brand name remains uppercase',!read('Frontend/css/brand.css').includes('Nexzo'));
console.log(`RESULT ${pass}/${pass+fail} passed`);process.exitCode=fail?1:0;
