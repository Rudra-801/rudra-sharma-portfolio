import fs from 'node:fs';
const js=fs.readFileSync(new URL('../Frontend/js/community-service.js', import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../Frontend/community.html', import.meta.url),'utf8');
const rules=fs.readFileSync(new URL('../storage.rules', import.meta.url),'utf8');
const checks=[
 ['receipt updates are incremental',js.includes('updateVisibleReceiptStatuses(groupId)') && !js.includes("_receiptSignature=receiptSignature;drawGroupMessages")],
 ['receipt snapshots do not rebuild controls',js.includes('Receipt-only member snapshots are frequent')],
 ['group creation does not block on logo upload',js.includes('const pendingLogoFile=logoFile||null') && js.includes('uploadPermanentGroupLogo(groupId,pendingLogoFile,created).then')],
 ['canonical wallpaper storage path',js.includes('groups/${groupId}/branding/wallpaper')],
 ['wallpaper storage rule exists',rules.includes('match /groups/{groupId}/branding/wallpaper')],
 ['community assets cache-busted',html.includes('community-service.js?v=1550') && html.includes('community-chat-v3.css?v=1550')]
];
let ok=0;for(const [name,pass] of checks){console.log(`${pass?'PASS':'FAIL'} ${name}`);if(pass)ok++;}console.log(`${ok}/${checks.length} PASS`);if(ok!==checks.length)process.exit(1);
