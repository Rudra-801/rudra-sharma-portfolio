import test from 'node:test';
import assert from 'node:assert/strict';
import notes from '../../src/services/academic-notes.cjs';
import {curriculumContext,getStudyNotes,validateNotes} from '../../src/services/academic-notes.js';
import {academicJson} from '../../src/services/academic-provider.js';

const configured={GEMINI_API_KEY:'fixture-secret',OPENAI_API_KEY:'fixture-secret',OPENAI_MODEL:'fixture-model'};
const input=topicIndex=>({courseKey:'1:BEE-103',unitIndex:0,topicIndex,level:'Beginner'});
for(let i=0;i<8;i++)test(`DC Circuits canonical topic ${i} is available without provider calls or quota reservation`,async()=>{
 let calls=0;
 const unavailable=async()=>{calls++;throw {status:429};};
 const context=curriculumContext(input(i));
 const pack=await getStudyNotes(input(i),{env:configured,transports:{gemini:unavailable,openai:unavailable},beforeRequest:unavailable});
 assert.equal(calls,0);
 assert.equal(pack.source,'curated-local');
 assert.equal(pack.notesSchemaVersion,5);
 assert.equal(pack.context.topic,context.topic);
 assert.equal(pack.context.unit,context.unit);
 validateNotes(pack);
 assert.ok(pack.code.text.length>50);
 assert.ok(pack.example.length>100);
 assert.equal(pack.practice.length,pack.answers.length);
 assert.equal(notes.lookup('Operating Systems',context.topic),null);
});

function close(actual,expected,tolerance=1e-4){assert.ok(Math.abs(actual-expected)<tolerance,`${actual} differs from ${expected}`);}
test('RLC example numbers use SI units and actual element laws',async()=>{
 const p=await getStudyNotes(input(0),{env:{}});
 const current=12/6,power=current**2*6,inductorVoltage=.2*(3-1)/.5,inductorEnergy=.5*.2*3**2,capacitorCurrent=100e-6*5/.01,capacitorEnergy=.5*100e-6*5**2;
 assert.equal(current,2);assert.equal(power,24);close(inductorVoltage,.8);close(inductorEnergy,.9);close(capacitorCurrent,.05);close(capacitorEnergy,.00125,1e-10);
 for(const result of ['I=12/6=2 A','power=12×2=24 W','v=0.8 V','0.9 J','i=0.05 A','0.00125 J'])assert.ok(p.example.includes(result));
 assert.equal(p.tables[0].rows.length,3);
});
test('two-mesh solution satisfies both KVL equations and power balance',async()=>{
 const p=await getStudyNotes(input(2),{env:{}});
 // Solve [4 -2; -2 6] * I = [10 -4] by the determinant formula.
 const determinant=4*6-(-2)*(-2),i1=(10*6-(-2)*(-4))/determinant,i2=(4*(-4)-(-2)*10)/determinant;
 close(4*i1-2*i2,10);close(-2*i1+6*i2,-4);
 close(2*i1**2+4*i2**2+2*(i1-i2)**2,10*i1-4*i2);
 close(i1,2.6);close(i2,.2);assert.match(p.example,/25\.2 W/);
});
test('superposition responses sum to the original node solution; power is not superposed',async()=>{
 const p=await getStudyNotes(input(3),{env:{}});
 const voltage=(10/2+4/2)/(1/2+1/2+1/2),v1=(10/2)/(3/2),v2=(4/2)/(3/2);
 close(voltage,v1+v2);close(voltage**2/2,98/9);assert.match(p.example,/98\/9/);
});
test('Thevenin and Norton reproduce loaded divider voltage',async()=>{
 const thevenin=await getStudyNotes(input(4),{env:{}}),norton=await getStudyNotes(input(5),{env:{}});
 const vth=12*8/(4+8),rth=4*8/(4+8),load=4;
 const original=12*(8*load/(8+load))/(4+8*load/(8+load));
 const il=vth/(rth+load),inorton=vth/rth,nortonLoad=inorton*rth/(rth+load);
 close(il*load,original);close(nortonLoad,il);close(original,4.8);
 assert.match(thevenin.example,/IL=8\/\(8\/3\+4\)=1\.2 A/);assert.match(norton.example,/1\.8\+1\.2=3 A/);
});
test('RL and RC transients meet initial/final limits and their one-time-constant values',async()=>{
 const rl=await getStudyNotes(input(6),{env:{}}),rc=await getStudyNotes(input(7),{env:{}});
 const rlAt=t=>5*(1-Math.exp(-t/.5)),rcAt=t=>12*(1-Math.exp(-t/.1));
 assert.equal(rlAt(0),0);assert.equal(rcAt(0),0);close(rlAt(20),5);close(rcAt(20),12);
 close(rlAt(.5),3.1606);close(rcAt(.1),7.5854);close(10*Math.exp(-1)+2*rlAt(.5),10);
 assert.match(rl.example,/3\.1606 A/);assert.match(rc.example,/7\.5854 V/);
});
test('quota failure attempts each configured provider once and records only sanitized diagnostics',async()=>{
 const diagnostics=[],calls=[];
 const transport=name=>async()=>{calls.push(name);throw {status:429,message:'fixture-secret https://secret-provider/path prompt contents'};};
 await assert.rejects(academicJson('private student submission',v=>v,{env:configured,transports:{gemini:transport('gemini'),openai:transport('openai')},onProviderFailure:d=>diagnostics.push(d)}),e=>e.code==='AI_QUOTA_EXCEEDED'&&!/Evaluation|fixture-secret|https:/.test(e.message));
 assert.deepEqual(calls,['openai','gemini']);
 assert.deepEqual(diagnostics,calls.map(provider=>({event:'academic_provider_failure',provider,code:'AI_QUOTA_EXCEEDED',status:429})));
 assert.doesNotMatch(JSON.stringify(diagnostics),/secret|submission|https:/);
 assert.match(notes.serviceMessage({code:'AI_QUOTA_EXCEEDED'}),/AI-generated notes/);
 assert.doesNotMatch(notes.serviceMessage({code:'AI_QUOTA_EXCEEDED'}),/Evaluation provider/);
});
