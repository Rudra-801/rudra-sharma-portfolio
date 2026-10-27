import fs from 'node:fs';
const js=fs.readFileSync('Frontend/js/community-service.js','utf8');
const css=fs.readFileSync('Frontend/css/community-chat-v3.css','utf8');
const rules=fs.readFileSync('firestore.rules','utf8');
const tests=[
 ['date separators',js.includes('messageDateLabel')&&css.includes('.nx-message-date-separator')],
 ['full date and time',js.includes('messageFullDateTime')&&js.includes('messageFullDateTime(message.createdAtMs)')],
 ['sender avatar',js.includes('nx-message-avatar')&&js.includes('data-message-member')],
 ['message send status',js.includes("message.pending?'◷':'✓'")&&css.includes('.nx-msg-status')],
 ['admins mention',js.includes("handle:'admins'")&&js.includes("name:'Admins'")],
 ['saved/resources surfaces',js.includes("view==='saved'")&&js.includes("view==='resources'")],
 ['reply fallback rule',rules.includes("'replyTo'")&&rules.includes('request.resource.data.replyTo')],
];
let pass=0;for(const [name,ok] of tests){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)pass++;}console.log(`${pass}/${tests.length} PASS`);if(pass!==tests.length)process.exit(1);
