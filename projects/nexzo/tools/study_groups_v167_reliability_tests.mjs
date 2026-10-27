import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const js=fs.readFileSync(new URL('../Frontend/js/community-service.js',import.meta.url),'utf8');
const rules=fs.readFileSync(new URL('../storage.rules',import.meta.url),'utf8');
test('wallpaper upload path matches storage rule',()=>{assert.match(js,/groups\/\$\{groupId\}\/branding\/wallpaper`/);assert.match(rules,/match \/groups\/\{groupId\}\/branding\/wallpaper \{/);assert.doesNotMatch(js,/branding\/wallpaper-\$\{Date\.now\(\)\}/)});
test('message click listener is not accidentally duplicated',()=>{assert.doesNotMatch(js,/messageBox\?\.addEventListener\('click',async e=>\{\s*messageBox\?\.addEventListener\('click'/)});
test('receipt tick opens per-member message info',()=>{assert.match(js,/data-msg-status=/);assert.match(js,/Message info/);assert.match(js,/lastDeliveredAtMs/);assert.match(js,/lastReadAtMs/)});
test('more actions remains functional',()=>{assert.match(js,/data-msg-more=/);assert.match(js,/data-msg-action="reply"/);assert.match(js,/data-msg-action="copy"/)});
