import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const acad=read('Frontend/js/academics-controller.js');
const acadHtml=read('Frontend/academics.html');
const comm=read('Frontend/js/community-service.js');
const careerCss=read('Frontend/css/career-production-v240.css');
const build=read('tools/build_production.py');
const sw=read('Frontend/service-worker.js');
const tests=[
 ['Academics Add button persists immediately and cloud-confirms when signed in',()=>{assert.match(acad,/async function toggleSubject/);assert.match(acad,/saveLocal\(\{cloud:false\}\)/);assert.match(acad,/const persisted=await saveCloudNow\(\)/)}],
 ['Academics reacts to auth/data owner readiness',()=>{assert.match(acad,/nexzo:auth-ready/);assert.match(acad,/nexzo:data-ready/);assert.match(acad,/refreshOwner/)}],
 ['obsolete user-facing unit gate is removed',()=>{assert.doesNotMatch(acadHtml,/unit-mastery-gate-v23[67]/)}],
 ['Study Groups do not auto-claim orphan ownership',()=>{assert.doesNotMatch(comm,/await claimOrphanOwnership\(/);assert.match(comm,/repairLegacyOwnership/);assert.match(comm,/data-info-repair-owner/)}],
 ['legacy owner repair requires owner-role membership and Firestore read-back',()=>{assert.match(comm,/hasOwnerRole\(\)/);assert.match(comm,/Owner repair was not confirmed by Firestore/)}],
 ['Study Group delete remains confirmation-based and exposes permission diagnostics',()=>{assert.match(comm,/Delete was not confirmed by Firestore/);assert.match(comm,/Permission denied — deploy the latest Firestore rules or repair the legacy owner record/)}],
 ['Career v250 consolidation is present',()=>{assert.match(careerCss,/v250 final Career Explorer consolidation/);assert.match(careerCss,/grid-template-columns:282px minmax\(0,1fr\)/)}],
 ['production builder emits one ordered CSS bundle per page',()=>{assert.match(build,/pageCssBundles/);assert.match(build,/page_bundles/);assert.match(build,/link_re\.sub/)}],
 ['production worker keeps Firebase background notifications after clean build',()=>{assert.match(sw,/firebase-messaging-compat/);assert.match(sw,/onBackgroundMessage/);assert.match(sw,/notificationclick/)}],
 ['notification clicks are restricted to the NEXZO origin',()=>{assert.match(sw,/resolved\.origin===self\.location\.origin/);assert.match(sw,/Home\.html/)}],
];
let pass=0;for(const [name,fn] of tests){try{fn();pass++;console.log(`PASS ${name}`)}catch(e){console.error(`FAIL ${name}: ${e.message}`);process.exitCode=1}}
console.log(`V250 release contracts: ${pass}/${tests.length}`);
