import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../Backend/local-ai-server.mjs',import.meta.url),'utf8');
const launcher=fs.readFileSync(new URL('../START_NEXZO_AI.ps1',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('../Frontend/js/config.js',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../Frontend/js/ai-service.js',import.meta.url),'utf8');
const studyPage=fs.readFileSync(new URL('../Frontend/ai-assistant.html',import.meta.url),'utf8');
const studyClient=fs.readFileSync(new URL('../Frontend/js/ai-clean.js',import.meta.url),'utf8');
const careerPage=fs.readFileSync(new URL('../Frontend/career.html',import.meta.url),'utf8');
const careerClient=fs.readFileSync(new URL('../Frontend/js/career-controller.js',import.meta.url),'utf8');
const plannerPage=fs.readFileSync(new URL('../Frontend/planner.html',import.meta.url),'utf8');
const workflowCss=fs.readFileSync(new URL('../Frontend/css/feature-workflows-v131.css',import.meta.url),'utf8');

test('zero-install local server exposes required AI endpoints',()=>{
  for(const route of ['/api/health/deep','/api/ai/chat/stream','/api/ai/multi-agent/stream','/api/ai/analyze']) assert.match(server,new RegExp(route.replaceAll('/','\\/')));
  assert.match(server,/node:http/);
  assert.doesNotMatch(server,/from ['"]express['"]/);
});

test('launcher validates Gemini before opening browser and needs no npm install',()=>{
  assert.match(launcher,/health\/deep/);
  assert.match(launcher,/geminiReachable/);
  assert.doesNotMatch(launcher,/npm install/);
  assert.match(launcher,/local-ai-server\.mjs/);
});

test('frontend prefers the hosted backend and keeps local endpoints as fallbacks',()=>{
  assert.match(config,/sameOrigin/);
  assert.match(config,/const candidates=\[remote,/);
  assert.match(config,/const primary=remote/);
  assert.match(client,/authHeaders/);
  assert.match(client,/findBackend/);
  assert.match(client,/NEXZOFirebase\?\.getAuthContext/);
});

test('Study Assistant loads production config and authenticates protected API requests',()=>{
  assert.match(studyPage,/js\/config\.js[^>]*>[\s\S]*js\/ai-clean\.js/);
  assert.match(studyClient,/NEXZO_CONFIG\?\.API_BASE_URL/);
  assert.match(studyClient,/nexzo-api-base-url/);
  assert.match(studyClient,/getIdToken/);
  assert.match(studyClient,/NEXZOFirebase\?\.getAuthContext/);
  assert.match(studyClient,/Authorization:`Bearer/);
  assert.match(studyClient,/replace\(\/\^\\\/api/);
  assert.match(studyClient,/els\.input\.disabled=false/);
  assert.match(studyClient,/Your message will stay here/);
  assert.match(studyClient,/remoteBackend\?65000/);
  assert.doesNotMatch(studyClient,/els\.input\.value='';resize\(\);ask\(t\)/);
});

test('Study modes, Career toolkit and Planner colour workflows are functional',()=>{
  for(const mode of ['explain','notes','quiz','interview']){
    assert.match(studyPage,new RegExp(`data-study-mode=["']${mode}`));
    assert.match(studyClient,new RegExp(`${mode}:\\{label:`));
  }
  assert.match(studyClient,/mode:activeStudyMode/);
  assert.match(studyClient,/modeSuggestions/);
  for(const tool of ['paths','roadmap','resume','interview'])assert.match(careerPage,new RegExp(`data-career-tool=["']${tool}`));
  assert.match(careerClient,/bindCareerToolkit/);
  assert.match(careerClient,/nexzo\.ai\.launch/);
  assert.match(plannerPage,/feature-workflows-v131\.css/);
  assert.match(workflowCss,/\.planner-page \.stats \.stat/);
  assert.match(workflowCss,/\.career-page \.career-tool-card/);
});
