import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../Frontend/js/home-trajectory.js',import.meta.url),'utf8');
function setup(reduced=false){
  const window=new EventTarget(),document=new EventTarget(),frames=new Map(),elements=new Map();let id=0;
  const element=()=>Object.assign(new EventTarget(),{attributes:{},setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k];},style:{setProperty(){},removeProperty(){}}});
  const chapters=Array.from({length:7},(_,i)=>({offsetTop:i*1000,offsetHeight:1000})),links=chapters.map(element);
  document.hidden=false;document.body={classList:{contains:()=>true}};document.querySelectorAll=selector=>selector==='.chapter'?chapters:selector==='.chapter-progress a'?links:[];
  document.getElementById=key=>{if(!elements.has(key))elements.set(key,element());return elements.get(key);};document.querySelector=()=>document.getElementById('title');
  const motion=new EventTarget();motion.matches=reduced;
  const sandbox={window,document,matchMedia:()=>motion,AbortController,scrollY:0,innerHeight:800,requestAnimationFrame(fn){const key=++id;frames.set(key,fn);return key;},cancelAnimationFrame:key=>frames.delete(key),fetch:async()=>Response.json({courses:[]}),Response};
  vm.runInNewContext(source,sandbox);const flush=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());};
  return {window,document,frames,elements,links,sandbox,flush};
}
test('scroll bursts coalesce into one RAF and idle has no render loop',()=>{const s=setup();for(let i=0;i<50;i++)s.window.dispatchEvent(new Event('scroll'));assert.equal(s.frames.size,1);s.flush();assert.equal(s.frames.size,0);});
test('hidden tab cancels pending work and does not schedule more',()=>{const s=setup();s.document.hidden=true;s.document.dispatchEvent(new Event('visibilitychange'));assert.equal(s.frames.size,0);s.window.dispatchEvent(new Event('scroll'));assert.equal(s.frames.size,0);});
test('reduced motion keeps chapter navigation without path animation',()=>{const s=setup(true);s.flush();assert.equal(s.elements.get('journeyTrajectory').attributes.d,undefined);assert.equal(s.links[0].attributes['aria-current'],'true');});
test('scrolling changes the native trajectory and active chapter',()=>{const s=setup();s.flush();const before=s.elements.get('journeyTrajectory').attributes.d;s.sandbox.scrollY=3000;s.window.dispatchEvent(new Event('scroll'));s.flush();assert.notEqual(s.elements.get('journeyTrajectory').attributes.d,before);assert.equal(s.links[3].attributes['aria-current'],'true');});
test('page teardown removes listeners and cancels all frame work',()=>{const s=setup();s.window.dispatchEvent(new Event('pagehide'));assert.equal(s.frames.size,0);s.window.dispatchEvent(new Event('scroll'));assert.equal(s.frames.size,0);});
