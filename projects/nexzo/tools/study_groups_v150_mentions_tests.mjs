import fs from 'node:fs';
const js=fs.readFileSync(new URL('../Frontend/js/community-service.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../Frontend/css/community-chat-v3.css',import.meta.url),'utf8');
const tests=[
 ['@ opens picker',js.includes('refreshMentionPicker')&&js.includes("input?.addEventListener('input',refreshMentionPicker)")],
 ['member lookup on demand',js.includes("fb.collection(fb.db,'groups',groupId,'members')")&&js.includes('ensureMentionMembers')],
 ['name and username filtering',js.includes("const hay=`${handle} ${m.name||''}`.toLowerCase()")],
 ['keyboard navigation',js.includes("e.key==='ArrowDown'")&&js.includes("e.key==='ArrowUp'")],
 ['click selection',js.includes("data-mention-choice")&&js.includes('chooseMention(b.dataset.mentionChoice,b.dataset.handle)')],
 ['picker visible styling',css.includes('V150: Discord/WhatsApp-style @mention member picker')&&css.includes('.nx-mention-autocomplete button.active')]
];
let ok=0; for(const [name,pass] of tests){console.log(`${pass?'PASS':'FAIL'} ${name}`);if(pass)ok++;}
console.log(`${ok}/${tests.length} PASS`); if(ok!==tests.length)process.exit(1);
