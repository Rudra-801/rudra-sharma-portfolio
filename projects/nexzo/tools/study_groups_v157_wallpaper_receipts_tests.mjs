import fs from 'node:fs';
const js=fs.readFileSync(new URL('../Frontend/js/community-service.js', import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../Frontend/css/community-chat-v3.css', import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../Frontend/community.html', import.meta.url),'utf8');
const checks=[
 ['Wallpaper navigation restored', js.includes('data-study-view="wallpaper"') && js.includes('<b>Wallpapers</b>')],
 ['Wallpaper uses persistent resolver', js.includes('function effectiveGroupWallpaper(group)') && js.includes('effectiveGroupWallpaper(group)')],
 ['Wallpaper paint helper is used', js.includes('function paintGroupWallpaper(box,url)') && js.includes('paintGroupWallpaper(messageBox,chosen.url)')],
 ['Wallpaper remains visible under lighter overlay', css.includes('rgba(2,4,10,.18)') && css.includes('rgba(2,4,10,.42)')],
 ['Receipt semantics are explicit', js.includes('Delivered to every current group member') && js.includes('Read by every current group member')],
 ['V157 cache busting', html.includes('community-chat-v3.css?v=1570') && html.includes('community-service.js?v=1570')],
];
let fail=0; for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${name}`); if(!ok) fail++;} console.log(`${checks.length-fail}/${checks.length} PASS`); process.exitCode=fail?1:0;
