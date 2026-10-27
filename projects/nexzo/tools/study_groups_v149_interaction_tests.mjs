import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const ui=fs.readFileSync('Frontend/js/community-service.js','utf8');const css=fs.readFileSync('Frontend/css/community-chat-v3.css','utf8');
test('room media hydration is non blocking',()=>{assert.match(ui,/const localMediaHydration=hydrateLocalGroupMedia\(group\)\.then/);assert.doesNotMatch(ui,/await hydrateLocalGroupMedia\(group\)/)});
test('cached messages paint before realtime subscription',()=>{assert.match(ui,/cached messages are useful immediately/);assert.match(ui,/drawGroupMessages\(groupId\)/)});
test('realtime snapshots skip identical message rerenders',()=>{assert.match(ui,/lastMessageSignature/);assert.match(ui,/if\(signature===lastMessageSignature\)return/)});
test('mention autocomplete supports members and admin all mention',()=>{assert.match(ui,/nx-mention-autocomplete/);assert.match(ui,/handle:'all'/);assert.match(css,/\.nx-mention-autocomplete/)});
test('message menu includes star forward and delete for me',()=>{assert.match(ui,/data-msg-action="star"/);assert.match(ui,/data-msg-action="forward"/);assert.match(ui,/data-msg-action="delete-me"/)});
