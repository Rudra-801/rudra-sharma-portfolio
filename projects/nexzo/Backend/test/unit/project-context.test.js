import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route=fs.readFileSync(new URL('../../src/routes/ai.routes.js',import.meta.url),'utf8');
const service=fs.readFileSync(new URL('../../src/services/gemini.js',import.meta.url),'utf8');
const engine=fs.readFileSync(new URL('../../src/assistant/assistant-engine.js',import.meta.url),'utf8');

test('project context endpoint is authenticated by the router and bounded',()=>{
  assert.ok(route.indexOf('router.use(requireFirebaseAuth)')<route.indexOf("router.post('/analyze-project'"));
  assert.match(route,/files:24/);
  assert.match(route,/fileSize:5\*1024\*1024/);
  assert.match(route,/totalBytes>12\*1024\*1024/);
  assert.match(route,/sensitiveProjectPath/);
});

test('multi-file Gemini context preserves file paths and text budget',()=>{
  assert.match(service,/export async function analyzeGeminiFiles/);
  assert.match(service,/textBudget=600000/);
  assert.match(service,/FILE: '\+label/);
  assert.match(service,/inlineData/);
});

test('Explain workflow expires and supports a direct-answer escape hatch',()=>{
  assert.match(engine,/freshBaseline/);
  assert.match(engine,/30\*60\*1000/);
  assert.match(engine,/wantsDirectExplanation/);
  assert.match(engine,/await clearWorkflow\(uid,input\.chatId\)/);
});
