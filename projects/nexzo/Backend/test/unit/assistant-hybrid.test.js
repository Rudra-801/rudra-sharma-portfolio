import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { routeAssistant, greetingReply } from '../../src/assistant/intent-router.js';

test('hybrid router keeps greetings on the zero-model fast path',()=>{
  assert.deepEqual(routeAssistant({message:'hello',mode:'chat'}),{intent:'conversation',strategy:'fast',agents:[]});
  assert.match(greetingReply('hello','Rudra Sharma'),/^Hey Rudra!/);
});
test('hybrid router sends quiz and interview to stateful workflows',()=>{
  assert.equal(routeAssistant({message:'DBMS',mode:'quiz'}).strategy,'workflow');
  assert.equal(routeAssistant({message:'Frontend developer',mode:'interview'}).intent,'interview');
});
test('hybrid router detects confirmed Planner actions',()=>{
  const route=routeAssistant({message:'Kal CN Unit 3 ka task bana do',mode:'chat'});
  assert.equal(route.intent,'planner-action');assert.equal(route.strategy,'tool');
});
test('assistant endpoint and canonical Planner tool are wired',()=>{
  const app=fs.readFileSync(new URL('../../src/app.js',import.meta.url),'utf8');
  const route=fs.readFileSync(new URL('../../src/routes/assistant.routes.js',import.meta.url),'utf8');
  const tools=fs.readFileSync(new URL('../../src/assistant/tools.js',import.meta.url),'utf8')+fs.readFileSync(new URL('../../src/assistant/planner-confirmation.js',import.meta.url),'utf8');
  assert.match(app,/\/api\/assistant/);assert.match(route,/actions\/:actionId\/confirm/);assert.match(tools,/collection\('tasks'\)/);assert.match(tools,/status:'pending'/);
});
test('disabled personalization does not load or update assistant memory',()=>{
  const engine=fs.readFileSync(new URL('../../src/assistant/assistant-engine.js',import.meta.url),'utf8');
  assert.match(engine,/input\.personalization===false\?\{\}:await getMemory/);assert.match(engine,/input\.personalization!==false\)await rememberInteraction/);
});
