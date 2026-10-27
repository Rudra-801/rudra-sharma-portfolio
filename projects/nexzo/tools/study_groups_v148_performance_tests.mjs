import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const s=fs.readFileSync(new URL('../Frontend/js/community-service.js',import.meta.url),'utf8');
test('group list does not hydrate every wallpaper before rendering',()=>{assert.doesNotMatch(s,/await Promise\.all\(state\.groups\.map\(hydrateLocalGroupMedia\)\)/);});
test('global group list does not create per-group member listeners',()=>{assert.match(s,/function syncGroupMemberListeners\(\)\{ \/\* V148: intentionally lazy/);});
test('opening a room is cache-first and does not await backend context',()=>{const block=s.slice(s.indexOf('async function openGroup'),s.indexOf('const params=',s.indexOf('async function openGroup')));assert.doesNotMatch(block,/await groupAdminApi\(`\/groups\/\$\{encodeURIComponent\(groupId\)\}\/context`\)/);assert.match(block,/state\.myGroupIds\.has\(groupId\)/);});
test('active chat listens to latest 40 messages',()=>assert.match(s,/orderBy\('createdAtMs','desc'\),fb\.limit\(40\)/));
test('logo replacement disables stale cache',()=>assert.match(s,/cacheControl:'no-store,max-age=0'/));
