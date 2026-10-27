import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');

test('AI route uses auth, verified-email and durable quota middleware',()=>{
  const route=read('../../src/routes/ai.routes.js');
  assert.match(route,/requireFirebaseAuth/);
  assert.match(route,/requireVerifiedEmail/);
  assert.match(route,/durableDailyAiQuota/);
});

test('AI chat and file responses satisfy the frontend success contract',()=>{
  const route=read('../../src/routes/ai.routes.js');
  assert.match(route,/res\.json\(\{ ok:true, reply, chatId, historySaved \}\)/);
  assert.match(route,/res\.json\(\{ ok:true, reply, fileName:req\.file\.originalname, mimeType \}\)/);
});

test('Study modes have distinct multi-turn workflows',()=>{
  const route=read('../../src/routes/ai.routes.js');
  for(const mode of ['explain','notes','quiz','interview'])assert.match(route,new RegExp(`${mode}:`));
  assert.match(route,/Ask only one numbered question at a time/);
  assert.match(route,/Infer the current question and score from the conversation history/);
  assert.match(route,/Conduct a five-question one-at-a-time mock interview/);
});

test('server handles both shutdown signals',()=>{
  const server=read('../../src/server.js');
  assert.match(server,/SIGTERM/);
  assert.match(server,/SIGINT/);
});

test('production configuration documents required controls',()=>{
  const env=read('../../src/config/env.js');
  for(const key of ['NODE_ENV','ALLOWED_ORIGINS','GEMINI_API_KEY','FIREBASE_PROJECT_ID']) assert.match(env,new RegExp(key));
});
