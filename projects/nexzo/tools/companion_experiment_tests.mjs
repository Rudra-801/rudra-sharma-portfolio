import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createState, validateState, applyAction, applyReward, settle, levelProgress } from '../Frontend/experiments/companion/state.mjs';
import { CompanionEngine } from '../Frontend/experiments/companion/engine.mjs';
import { createStorage } from '../Frontend/experiments/companion/storage.mjs';
import { plannerReward, quizReward } from '../Frontend/experiments/companion/events.mjs';
import { CONFIG, STATES, LOCAL_HOST } from '../Frontend/experiments/companion/config.mjs';
import { GLTFLoader } from '../Frontend/assets/vendor/three/GLTFLoader.js';
import { buildCreature, animateCreature, creatureFromModel } from '../Frontend/experiments/companion/creature.mjs';
import * as T from '../Frontend/assets/vendor/three/three.module.js';
const now = 1000000, initial = () => createState(now);
test('original GLB actually parses offline with articulated pivots and instanced fur',async()=>{
  const file=fs.readFileSync(new URL('../Frontend/experiments/companion/assets/nyro-nightfox.glb',import.meta.url));
  const model=await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
  const parts=creatureFromModel(model.scene.getObjectByName('NYRO'));assert.ok(parts);assert.equal(model.animations.length,0);
  let strands=0,triangles=0;model.scene.traverse(o=>{if(o.isMesh){const count=o.isInstancedMesh?o.count:1;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*count;if(o.isInstancedMesh)strands+=o.count;for(const v of o.geometry.attributes.position.array)assert.ok(Number.isFinite(v));}});
  assert.equal(strands,1100);assert.ok(triangles<150000,`triangle budget: ${triangles}`);assert.ok(file.length<200000);
});
test('all creature states animate real geometry; Sleep closes eyes and Wake restores them',()=>{
  const c=buildCreature(T);for(const state of STATES){animateCreature(c,state,1.2,true);c.root.updateMatrixWorld();c.root.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)));}
  animateCreature(c,'SLEEP',1.2,true);assert.equal(c.eyes[0].scale.y,0.06);assert.equal(c.head.rotation.x,0.2);
  animateCreature(c,'IDLE',1.2,true);assert.equal(c.eyes[0].scale.y,1);assert.equal(c.head.rotation.x,0);
  animateCreature(c,'THINKING',1.2,true);assert.equal(c.head.rotation.z,0.16);
  animateCreature(c,'PLAY',1.2,true);assert.notEqual(c.root.rotation.z,0);assert.notEqual(c.tail.rotation.z,0);
});
test('reduced-motion sculpture is stable across elapsed time and still communicates Sleep',()=>{
  const c=buildCreature(T);animateCreature(c,'IDLE',1,false);c.root.updateMatrixWorld();const before=c.head.matrixWorld.toArray();
  animateCreature(c,'IDLE',18,false);c.root.updateMatrixWorld();assert.deepEqual(c.head.matrixWorld.toArray(),before);
  animateCreature(c,'SLEEP',18,false);assert.equal(c.eyes[0].scale.y,0.06);assert.equal(c.tail.rotation.z,0);
});
function memory() { let state = initial(); return {mode:'Test memory', read:async()=>state, transact:async fn => {const result=fn(state);state=result.state;return result;},close(){}}; }
function engine(storage = memory()) { const timers = new Map(); let next=0, clock=now; const e=new CompanionEngine(storage,{now:()=>clock,schedule:fn=>{timers.set(++next,fn);return next},cancel:id=>timers.delete(id)}); return {e, advance:ms=>{clock+=ms}, finish:()=>{const items=[...timers.values()];timers.clear();items.forEach(fn=>fn())}}; }
test('new companion has zero XP and no fabricated student progress',()=>{const s=initial();assert.equal(s.xp,0);assert.equal(s.bond,0);assert.equal(s.level,1);assert.ok(!('studentXP' in s));});
test('Play improves mood and spends energy, but gives no XP',()=>{const r=applyAction(initial(),'play',now);assert.equal(r.state.energy,96);assert.equal(r.state.mood,66);assert.equal(r.state.xp,0);assert.equal(r.animation,'PLAY');});
test('Play spam and cooldown survives serialization/reload',()=>{const first=applyAction(initial(),'play',now).state;const r=applyAction(validateState(JSON.parse(JSON.stringify(first)),now),'play',now+1);assert.equal(r.ok,false);assert.equal(r.state.bond,1);assert.equal(r.state.xp,0);assert.equal(applyAction(first,'play',now+60000).ok,true);});
test('Feed cannot be spammed and cannot award XP',()=>{const s=initial();s.energy=50;const first=applyAction(s,'feed',now);assert.equal(first.state.energy,58);const r=applyAction(first.state,'feed',now+1);assert.equal(r.ok,false);assert.equal(r.state.xp,0);});
test('Interact earns bond only and respects cooldown',()=>{const first=applyAction(initial(),'interact',now);assert.equal(first.state.bond,1);assert.equal(first.state.xp,0);assert.equal(applyAction(first.state,'interact',now+1).ok,false);});
test('Rest recovers energy with actual elapsed time, not repeated button presses',()=>{const s=initial();s.energy=40;const r=applyAction(s,'rest',now);assert.equal(r.state.energy,40);assert.equal(settle(r.state,now+3600000).energy,52);assert.equal(applyAction(r.state,'rest',now).state.energy,40);});
test('long absence cannot kill pet or erase bond/XP',()=>{const s=initial();s.energy=30;s.bond=15;s.xp=200;const r=settle(s,now+365*86400000);assert.equal(r.energy,25);assert.equal(r.bond,15);assert.equal(r.xp,200);});
test('unverified completions award nothing',()=>{assert.equal(applyReward(initial(),{kind:'planner',id:'task'},now).state.xp,0);});
test('verified task awards once even after reload',()=>{const event={kind:'planner',id:'task',verified:true};const first=applyReward(initial(),event,now);assert.equal(first.state.xp,15);const r=applyReward(validateState(JSON.parse(JSON.stringify(first.state)),now),event,now+500);assert.equal(r.ok,false);assert.equal(r.state.xp,15);});
test('reward ledger is never pruned to allow replay farming',()=>{const s=initial();for(let i=0;i<4096;i++)s.rewards['quiz:'+i]=now;assert.equal(applyReward(s,{kind:'quiz',id:'new',verified:true},now).ok,false);assert.equal(Object.keys(s.rewards).length,4096);});
test('companion levels follow earned XP only',()=>{assert.deepEqual(levelProgress(100),{level:2,current:0,target:200,percent:0});assert.equal(levelProgress(299).level,2);assert.equal(levelProgress(300).level,3);});
test('corrupt local state resets only the companion safely',()=>{for(const raw of [null,{}, {...initial(),xp:-1},{...initial(),mood:NaN},{...initial(),cooldowns:{play:'later'}},{...initial(),rewards:[]}])assert.equal(validateState(raw,now).xp,0);});
test('missing browser persistence is disclosed as session only',async()=>{const s=await createStorage('test',{});assert.equal(s.persistent,false);assert.match(s.mode,/Session only/);s.close();});
test('storage adapter works offline without any network client',async()=>{const s=await createStorage('test',{});await s.transact(v=>applyAction(v,'interact'));assert.equal((await s.read()).bond,1);s.close();});
test('thinking, completion and timed return animate without XP',async()=>{const {e,finish}=engine();await e.init();e.thinking(true);assert.equal(e.animation,'THINKING');e.complete();assert.equal(e.animation,'HAPPY');finish();assert.equal(e.animation,'IDLE');assert.equal(e.state.xp,0);e.dispose();});
test('idle becomes sleep; waking changes state without XP',async()=>{const {e,advance}=engine();await e.init();advance(CONFIG.idleMs+1);await e.tick();assert.equal(e.animation,'SLEEP');await e.wake();assert.equal(e.animation,'IDLE');assert.equal(e.state.xp,0);e.dispose();});
test('explicit Rest remains asleep until Wake interaction',async()=>{const {e}=engine();await e.init();await e.action('rest');await e.wake();assert.equal(e.animation,'SLEEP');await e.action('rest');assert.equal(e.animation,'CURIOUS');e.dispose();});
test('all declared states have a real transition',async()=>{const {e}=engine();await e.init();for(const state of STATES){e.transition(state);assert.equal(e.animation,state)}e.transition('BAD');assert.equal(e.animation,'EAT');e.dispose();});
test('verified task causes brief celebration then returns idle',async()=>{const {e,finish}=engine();await e.init();await e.reward({kind:'planner',id:'complete',verified:true});assert.equal(e.animation,'CELEBRATE');finish();assert.equal(e.animation,'IDLE');e.dispose();});
test('double click while saving cannot perform two actions',async()=>{const {e}=engine();await e.init();const results=await Promise.all([e.action('play'),e.action('play')]);assert.equal(results.filter(r=>r.ok).length,1);assert.equal(e.state.bond,1);e.dispose();});
test('duplicate and simultaneous reward events are serialized, no XP is lost or duplicated',async()=>{const {e}=engine();await e.init();const events=[{kind:'planner',id:'one',verified:true},{kind:'planner',id:'one',verified:true},{kind:'quiz',id:'two',verified:true}];await Promise.all([e.action('play'),...events.map(x=>e.reward(x))]);assert.equal(e.state.xp,25);e.dispose();});
test('save failure cannot claim a reward or update displayed XP',async()=>{const storage=memory(),{e}=engine(storage);await e.init();storage.transact=async()=>{throw new Error('disk full')};const r=await e.reward({kind:'quiz',id:'fail',verified:true});assert.equal(r.ok,false);assert.equal(e.state.xp,0);e.dispose();});
test('Planner adapter requires actual successful server-confirmed fields',()=>{const d={source:'server-evaluation',task:{id:'t',evaluationId:'e',serverVerified:true,status:'completed'}};assert.equal(plannerReward(d).id,'t');assert.equal(plannerReward({...d,source:'local'}),null);assert.equal(plannerReward({...d,task:{...d.task,status:'needs-improvement'}}),null);assert.equal(plannerReward({...d,task:{...d.task,serverVerified:false}}),null);});
test('quiz adapter requires persisted receipt and a passing score',()=>{const d={evaluationId:'e',serverAwarded:true,score:40};assert.equal(quizReward(d).id,'e');for(const v of [{...d,score:20},{...d,score:101},{...d,serverAwarded:false},{...d,evaluationId:null}])assert.equal(quizReward(v),null);});
test('local-only guard does not activate on production domains',()=>{assert.equal(LOCAL_HOST.test('personalized-recommendersystem.web.app'),false);assert.equal(LOCAL_HOST.test('nexzo-backend.onrender.com'),false);assert.equal(LOCAL_HOST.test('localhost'),true);assert.equal(LOCAL_HOST.test('192.168.1.2'),true);});
test('actual HTML loader starts on normal Go Live URLs, supports opt-out, never starts in production',()=>{
  for(const page of ['ai-assistant','planner','academics']){
    const html=fs.readFileSync(new URL(`../Frontend/${page}.html`,import.meta.url),'utf8');
    const script=[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('experiments/companion/bootstrap.mjs'))[1].replace('import(', 'loadModule(');
    for(const [hostname,search,expected] of [['localhost','',1],['127.0.0.1','',1],['192.168.1.3','',1],['localhost','?companion=0',0],['personalized-recommendersystem.web.app','?companion=1',0]]){
      const calls=[];vm.runInNewContext(script,{location:{hostname,search,href:`http://${hostname}/${page}.html${search}`},URL,URLSearchParams,loadModule:url=>{calls.push(url);return Promise.resolve()}});assert.equal(calls.length,expected,`${page}: ${hostname}${search}`);
    }
  }
  const main=fs.readFileSync(new URL('../Frontend/experiments/companion/main.mjs',import.meta.url),'utf8');assert.match(main,/if \(!headless\)/);
});
