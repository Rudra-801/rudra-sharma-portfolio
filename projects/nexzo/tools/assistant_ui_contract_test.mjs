import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('Frontend');
const html=fs.readFileSync(path.join(root,'ai-assistant.html'),'utf8');

test('study assistant has unique element ids',()=>{
  const ids=[...html.matchAll(/\sid=["']([^"']+)["']/g)].map(match=>match[1]);
  const duplicates=ids.filter((id,index)=>ids.indexOf(id)!==index);
  assert.deepEqual([...new Set(duplicates)],[]);
});

test('study assistant loads one authoritative redesign layer',()=>{
  assert.equal((html.match(/study-assistant-v234\.css/g)||[]).length,1);
  assert.equal((html.match(/assistant-redesign-v230\.js/g)||[]).length,1);
  assert.doesNotMatch(html,/study-assistant-v(?:21[5-9]|22[0-9]|23[0-3])\.css/);
  assert.doesNotMatch(html,/assistant-(?:ui-v215|finish-v(?:21[7-9]|22[0-9]))\.js/);
});

test('all local stylesheet and script references exist',()=>{
  const refs=[...html.matchAll(/<(?:link|script)[^>]+(?:href|src)=["']([^"']+)["']/g)]
    .map(match=>match[1].split('?')[0])
    .filter(ref=>!ref.startsWith('http'));
  const missing=refs.filter(ref=>!fs.existsSync(path.join(root,ref)));
  assert.deepEqual(missing,[]);
});

test('intent-first chat and companion controls are present',()=>{
  for(const id of ['messages','composer','input','sendBtn','composerSearchBtn','composerToolsBtn','railNewChat','railHistory','railStudyTools','railUploads','railPetZone','nexzoCompanion','petZoneModal']){
    assert.match(html,new RegExp(`id=["']${id}["']`),`missing #${id}`);
  }
  assert.match(html,/class=["'][^"']*companion-card/);
  assert.match(html,/class=["'][^"']*companion-roster/);
  assert.match(html,/class=["'][^"']*companion-quick-tools/);
  assert.doesNotMatch(html,/class=["'][^"']*assistant-command-strip/);
});

test('six selectable pets and real XP hooks remain available',()=>{
  const kinds=[...html.matchAll(/data-pet-choice=["']([^"']+)["']/g)].map(match=>match[1]);
  assert.deepEqual(kinds.sort(),['cloudie','droppy','flare','nexy','rocky','sprout']);
  assert.match(html,/id=["']activePetXpBar["']/);
  assert.match(html,/id=["']activePetLevel["']/);
});

test('pet zone has a cache-busted, reliable close path',()=>{
  assert.match(html,/id=["']petZoneModal["'][^>]*aria-hidden=["']true["']/);
  assert.match(html,/id=["']petZoneClose["'][^>]*data-close/);
  assert.match(fs.readFileSync(path.join(root,'js','ai-clean.js'),'utf8'),/const petZone=\$\('petZoneModal'\)/);
  assert.match(fs.readFileSync(path.join(root,'js','assistant-redesign-v230.js'),'utf8'),/petZone\.setAttribute\('aria-hidden','false'\)/);
  assert.match(html,/assistant-redesign-v230\.js\?v=235/);
});

test('pet roster uses generated image assets instead of emoji-only placeholders',()=>{
  for(const kind of ['nexy','sprout','flare','droppy','rocky','cloudie']){
    assert.match(html,new RegExp(`assets/pets/${kind}\\.webp`),`missing ${kind} asset`);
  }
  assert.match(html,/id=["']activePetArt["']/);
});
