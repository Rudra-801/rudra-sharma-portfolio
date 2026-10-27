import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const ui=fs.readFileSync('Frontend/js/community-service.js','utf8');
const api=fs.readFileSync('Backend/src/routes/groups.routes.js','utf8');
test('group API reuses cached Firebase token',()=>{assert.match(ui,/const token=await current\.getIdToken\(\);/);assert.doesNotMatch(ui,/getIdToken\(true\)/)});
test('chat listens only to latest 80 messages',()=>{assert.match(ui,/orderBy\('createdAtMs','desc'\),fb\.limit\(80\)/)});
test('text send uses optimistic message rendering',()=>{assert.match(ui,/pending_\$\{Date\.now\(\)\}/);assert.match(ui,/optimisticRows/)});
test('backend acknowledges before notification fanout',()=>{const ack=api.indexOf("res.status(201).json({ok:true,messageId:ref.id})");const fan=api.indexOf("const members=await ctx.groupRef.collection('members').get()",ack);assert.ok(ack>0&&fan>ack)});
