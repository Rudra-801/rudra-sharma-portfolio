import fs from 'node:fs';
const js=fs.readFileSync('Frontend/js/community-service.js','utf8');
const rules=fs.readFileSync('firestore.rules','utf8');
const css=fs.readFileSync('Frontend/css/community-chat-v3.css','utf8');
const tests=[
 ['double tick delivery state',js.includes("status='✓✓';statusClass='delivered'")],
 ['bright read state',js.includes("status='✓✓';statusClass='read'")&&css.includes('.nx-msg-status.read')],
 ['all recipients gate',js.includes('recipients.every(m=>Number(m.lastDeliveredAtMs||0)>=created)')],
 ['read-by-all gate',js.includes('recipients.every(m=>Number(m.lastReadAtMs||0)>=created)')],
 ['debounced member receipts',js.includes('receiptWriteTimer=setTimeout')&&js.includes('lastDeliveredAtMs')],
 ['background delivery foreground read',js.includes("document.visibilityState==='visible'")],
 ['rules allow own receipt fields',rules.includes("'lastDeliveredAtMs','lastReadAtMs'")]
];
let pass=0;for(const [n,ok] of tests){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(ok)pass++;}console.log(`${pass}/${tests.length} PASS`);if(pass!==tests.length)process.exit(1);
