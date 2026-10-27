import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const ui=fs.readFileSync('Frontend/js/community-service.js','utf8');const api=fs.readFileSync('Backend/src/routes/groups.routes.js','utf8');
test('message collaboration UI exposes reply edit delete react pin',()=>{for(const action of ['reply','edit','delete','react','pin'])assert.ok(ui.includes(`data-msg-action="${action}"`),action)});
test('reply context persists with sent messages',()=>{assert.ok(ui.includes('payload.replyTo'));assert.ok(api.includes('payload.replyTo='))});
test('backend enforces sender/admin message mutation',()=>{assert.ok(api.includes('Only the sender can edit this message.'));assert.ok(api.includes('Only the sender or a group admin can delete this message.'))});
test('reactions and admin pin endpoints exist',()=>{assert.ok(api.includes('/:messageId/reactions'));assert.ok(api.includes('/:messageId/pin'));assert.ok(api.includes('Only group admins can pin messages.'))});
