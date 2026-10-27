import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadBrowserScript(file, name){
  const sandbox={globalThis:{},window:{},console}; sandbox.window=sandbox.globalThis;
  vm.createContext(sandbox); vm.runInContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file});
  return sandbox.globalThis[name];
}

test('tags normalize, dedupe and cap at four',()=>{
  const c=loadBrowserScript('Frontend/js/community-contracts.js','NEXZOCommunityContracts');
  assert.deepEqual(Array.from(c.tags(' #DSA, dsa,  DBMS ,AI ')),['dsa','dbms','ai']);
  assert.throws(()=>c.tags('a,b,c,d,e'),/maximum of four/i);
  assert.throws(()=>c.tags('x'.repeat(25)),/24 characters/i);
});

test('group logo validation accepts only supported images <=2MB',()=>{
  const c=loadBrowserScript('Frontend/js/community-contracts.js','NEXZOCommunityContracts');
  assert.equal(c.logo({type:'image/png',size:2*1024*1024}),true);
  assert.equal(c.logo({type:'image/jpeg',size:123}),true);
  assert.equal(c.logo({type:'image/webp',size:123}),true);
  assert.throws(()=>c.logo({type:'image/gif',size:123}),/PNG, JPG or WebP/i);
  assert.throws(()=>c.logo({type:'image/png',size:2*1024*1024+1}),/2 MB/i);
});

test('group creation is retry-safe and bootstraps owner atomically',()=>{
  const js=fs.readFileSync('Backend/src/routes/groups.routes.js','utf8');
  assert.match(js,/cleanGroupId\(req\.body\?\.groupId\|\|req\.body\?\.idempotencyKey\)/);
  assert.match(js,/firestore\.runTransaction/);
  assert.match(js,/tx\.create\(groupRef,group\)/);
  assert.match(js,/tx\.create\(ownerRef,owner\)/);
  assert.match(js,/tx\.create\(inviteRef/);
  assert.match(js,/savedOwner\.data\(\)\?\.role!=='owner'/);
});

test('group lifecycle keeps destructive repair disabled and owner deletion explicit',()=>{
  const js=fs.readFileSync('Backend/src/routes/groups.routes.js','utf8');
  assert.match(js,/repair-all[\s\S]*status\(410\)/);
  assert.match(js,/Only the group owner can delete this group/);
  assert.match(js,/Transfer ownership before leaving this group/);
  assert.match(js,/\['messages','members','joinRequests','pinned','private'\]/);
});

test('community offline actions do not masquerade as persisted cloud changes',()=>{
  const js=fs.readFileSync('Frontend/js/community-service.js','utf8');
  assert.match(js,/Reconnect to update likes\. No cloud state was changed\./);
  assert.match(js,/Reconnect to publish this comment\. Nothing was added to the shared post\./);
  assert.match(js,/Reconnect to change saved posts\. No cloud state was changed\./);
  assert.match(js,/Reconnect before deleting a shared comment\. No cloud data was changed\./);
});

test('community post creation verifies Firestore and tag renderer escapes values',()=>{
  const js=fs.readFileSync('Frontend/js/community-service.js','utf8');
  assert.match(js,/const verify=await fb\.getDoc\(ref\);if\(!verify\.exists\(\)\)throw new Error\('Post write could not be verified\.'\)/);
  assert.match(js,/\(post\.tags\|\|\[\]\)\.map\(tag=>`<span>#\$\{esc\(tag\)\}<\/span>`\)/);
});
