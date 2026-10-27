import fs from 'node:fs';
const s=fs.readFileSync(new URL('../Frontend/js/community-service.js',import.meta.url),'utf8');
const c=fs.readFileSync(new URL('../Frontend/css/community-chat-v3.css',import.meta.url),'utf8');
const tests=[
 ['chronological sort', s.includes(".sort((a,b)=>Number(a.createdAtMs||0)-Number(b.createdAtMs||0)")],
 ['group info does not block on refreshMembers', s.includes('async function showInfo(){const media=')],
 ['logo immediate preview', s.includes("previewURL=URL.createObjectURL(f)")],
 ['logo status always settles', s.includes("finally{URL.revokeObjectURL(previewURL)}") && s.includes("connection.textContent='● Connected'")],
 ['receipt-only info rerender guard', s.includes('previousInfoSignature') && s.includes('nextInfoSignature')],
 ['high visibility read tick', c.includes('.nx-msg-status.read{color:#35d7ff')]
];
let pass=0;for(const [name,ok] of tests){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)pass++;}console.log(`${pass}/${tests.length} PASS`);if(pass!==tests.length)process.exit(1);
