import fs from 'node:fs';
const s=fs.readFileSync(new URL('../Frontend/js/community-service.js', import.meta.url),'utf8');
const tests=[
 ['logo hydration includes avatar', s.includes("['avatar','avatarURL'],['wallpaper','wallpaperURL']")],
 ['logo upload caches before cloud', s.includes("mediaCacheSet(groupId,'avatar',f)")],
 ['logo cloud success clears pending', s.includes("avatarPending:false,avatarURL:url")],
 ['active snapshot preserves pending avatar', s.includes('localAvatarPending')&&s.includes('keepAvatar')],
 ['wallpaper pending preserved', s.includes('localWallpaperPending')&&s.includes('keepWallpaper')],
 ['wallpaper library retained', (s.match(/name:'/g)||[]).length>=15],
];
let pass=0;for(const [n,ok] of tests){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(ok)pass++;}
console.log(`${pass}/${tests.length} PASS`);if(pass!==tests.length)process.exit(1);
