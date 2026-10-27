import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../Frontend/js/level-system.js',import.meta.url),'utf8');
const context={window:{}};vm.createContext(context);vm.runInContext(code,context);
const sys=context.window.NEXZOLevelSystem;
const expected={2:100,5:800,10:3000,20:10000,30:22000,40:40000,50:65000,60:95000,70:130000,80:170000,90:215000,100:270000};
for(const [level,xp] of Object.entries(expected)){
 if(sys.xpGoals[Number(level)-1]!==xp)throw new Error(`Level ${level}: expected ${xp}, got ${sys.xpGoals[Number(level)-1]}`);
 if(sys.resolve(xp).level!==Number(level))throw new Error(`Resolve failed for level ${level}`);
}
const multipliers={1:1,10:1,11:1.1,35:1.3,45:1.4,60:1.5,75:1.7,95:1.9};
for(const [level,m] of Object.entries(multipliers))if(Math.abs(sys.levelMultiplier(Number(level))-m)>1e-9)throw new Error(`Multiplier failed ${level}`);
if(sys.resolve(sys.migrateLegacyXP(261700000000)).level!==60)throw new Error('Legacy Level 60 migration failed');
console.log('XP balance tests passed: milestones, multipliers, and legacy migration.');
