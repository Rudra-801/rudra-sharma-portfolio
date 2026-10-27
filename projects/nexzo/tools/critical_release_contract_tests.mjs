import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
let pass=0, fail=0;
function test(name,ok){if(ok){console.log('PASS',name);pass++;}else{console.error('FAIL',name);fail++;}}
const community=read('Frontend/js/community-service.js');
const academics=read('Frontend/js/academics-controller.js');
const data=read('Frontend/js/data-service.js');
test('study-group workspace uses scoped AbortController',community.includes('groupUiAbort')&&community.includes('signal:groupSignal'));
test('workspace delete confirms Firestore absence',community.includes("Delete was not confirmed by Firestore."));
test('message send has authenticated Firestore fallback',community.includes('async function sendGroupMessage')&&community.includes("'messages'"));
test('member leave has Firestore fallback and read-back',community.includes('Leave fallback was not confirmed by Firestore.'));
test('join request has Firestore fallback',community.includes('async function requestJoinCloud')&&community.includes("'joinRequests'"));
test('failed attachment creation cleans uploaded Storage object',community.includes('await fb.deleteObject(uploadedRef)'));
test('academics Add to Planner waits for flush',academics.includes('const ok=await store.flush?.()')&&academics.includes("Topic confirmed in Planner."));
test('signed-in academic XP waits for cloud persistence',academics.includes('if(!signedIn||persisted.cloud)'));
test('task cloud writes are read back after transaction',data.includes('cloud read-back did not match the saved revision'));
if(fail){console.error(`${fail} critical release contract test(s) failed`);process.exit(1)}
console.log(`Critical release contracts passed: ${pass}/${pass}`);
