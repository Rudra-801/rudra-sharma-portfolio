import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
test('background cloud retry no longer emits global cloud-unavailable toast',()=>{
 const src=read('Frontend/js/task-store.js');
 assert.equal(src.includes('Cloud sync unavailable. Tasks remain saved on this device.'),false);
 assert.match(src,/Cloud retries are background state/);
});
test('canonical XP table resolves 142 XP to Level 2',()=>{
 const context={window:{}};vm.createContext(context);vm.runInContext(read('Frontend/js/level-system.js'),context);
 assert.equal(context.window.NEXZOLevelSystem.resolve(142).level,2);
 assert.equal(context.window.NEXZOLevelSystem.resolve(270000).level,100);
});
test('profile/state authority preserve verified Level 100 evidence',()=>{
 assert.match(read('Frontend/js/profile-authority.js'),/num\(next\.level\)>=100/);
 assert.match(read('Frontend/js/state-authority.js'),/num\(profile\.level\)>=100/);
});
