import fs from 'node:fs';
const js=fs.readFileSync(new URL('../Frontend/js/community-service.js',import.meta.url),'utf8');
const tests=[
 ['receipt renderer uses scoped member records',js.includes("state.memberRecords.get(groupId)||[]")],
 ['no free members reference in receipt renderer',!js.includes('const recipients=members.filter(')],
 ['member records initialized on room bootstrap',js.includes('state.memberRecords.set(groupId,members.slice())')],
 ['member records refreshed from Firestore',js.includes('state.memberRecords.set(groupId,fresh.slice())')],
 ['double tick states retained',js.includes("status='✓✓';statusClass='read'")&&js.includes("status='✓✓';statusClass='delivered'")],
 ['receipt writes remain debounced',js.includes('receiptWriteTimer=setTimeout')],
];
let pass=0;for(const [name,ok] of tests){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)pass++;}
console.log(`${pass}/${tests.length} PASS`);if(pass!==tests.length)process.exit(1);
