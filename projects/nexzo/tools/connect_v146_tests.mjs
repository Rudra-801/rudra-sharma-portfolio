import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('direct messaging page and authenticated client exist',()=>{const h=read('Frontend/messages.html'),j=read('Frontend/js/messages-v146.js');assert.match(h,/Messages/);assert.match(j,/getIdToken/);assert.match(j,/\/messages\/conversations/);assert.match(j,/\/messages\/with\//)});
test('backend direct message routes are participant-scoped',()=>{const s=read('Backend/src/routes/messages.routes.js');assert.match(s,/participants.*includes\(req\.user\.uid\)/s);assert.match(s,/readBy/);assert.match(s,/pushToUsers/)});
test('background push worker and settings token registration exist',()=>{assert.match(read('Frontend/service-worker.js'),/onBackgroundMessage/);assert.match(read('Frontend/js/consent-interactions-v129.js'),/getToken/)});
test('group sends create persisted notifications and push',()=>{const s=read('Backend/src/routes/groups.routes.js');assert.match(s,/createUserNotification/);assert.match(s,/pushToUsers/);assert.match(s,/Mention in/)});
test('group member card links to private message',()=>{assert.match(read('Frontend/js/community-service.js'),/Message privately/);assert.match(read('Frontend/js/community-service.js'),/messages\.html\?user=/)});
