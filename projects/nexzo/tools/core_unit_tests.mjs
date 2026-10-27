import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context={globalThis:{}};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../Frontend/js/metric-authority.js',import.meta.url),'utf8'),context);
const authority=context.NEXZOMetricAuthority;

test('metric authority chooses trust priority, not largest number',()=>{
  const value=authority.choose([
    {value:20418,priority:10,updatedAtMs:9999},
    {value:1171,priority:100,updatedAtMs:100}
  ]);
  assert.equal(value,1171);
});

test('metric authority uses newest source when trust is equal',()=>{
  assert.equal(authority.choose([{value:10,priority:50,updatedAtMs:1},{value:7,priority:50,updatedAtMs:2}]),7);
});

test('metric authority clamps unsafe metrics',()=>{
  assert.equal(authority.choose([{value:140,priority:1}],{max:100}),100);
  assert.equal(authority.choose([{value:-4,priority:1}],{min:0}),0);
});

test('data service derives level from authoritative XP',()=>{
  const source=fs.readFileSync(new URL('../Frontend/js/data-service.js',import.meta.url),'utf8');
  assert.match(source,/NEXZOMetricAuthority/);
  assert.match(source,/NEXZOLevelSystem\?\.resolve\?\.\(xp\)/);
  assert.doesNotMatch(source,/xp:\s*Math\.max\(num\(localProgress\.xp\)/);
  assert.doesNotMatch(source,/level:\s*Math\.max\(1,\s*num\(localProgress\.level\)/);
  assert.match(source,/authorityVersion:(40|41)/);
});
