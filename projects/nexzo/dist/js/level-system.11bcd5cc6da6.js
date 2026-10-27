/* NEXZO Level System v19 — balanced 100-level authority (Level 100 = 270,000 XP). */
(function(){'use strict';if(window.NEXZOLevelSystem?.version>=19)return;
const xpGoals=Object.freeze([0,100,333,567,800,1240,1680,2120,2560,3000,3700,4400,5100,5800,6500,7200,7900,8600,9300,10000,11200,12400,13600,14800,16000,17200,18400,19600,20800,22000,23800,25600,27400,29200,31000,32800,34600,36400,38200,40000,42500,45000,47500,50000,52500,55000,57500,60000,62500,65000,68000,71000,74000,77000,80000,83000,86000,89000,92000,95000,98500,102000,105500,109000,112500,116000,119500,123000,126500,130000,134000,138000,142000,146000,150000,154000,158000,162000,166000,170000,174500,179000,183500,188000,192500,197000,201500,206000,210500,215000,220500,226000,231500,237000,242500,248000,253500,259000,264500,270000]);
const legacyXpGoals=Object.freeze([0,100,250,450,750,1125,1500,2000,3000,4500,6800,10200,15300,23000,34500,51800,77700,116600,174900,262300,393600,590400,885600,1328400,1992600,2988900,4483400,6725100,10087700,15131600,22697400,34046100,51069200,76603800,114905700,172358600,258537900,387806900,581710400,872565600,1308848400,1963272600,2944908900,4417363400,6626045100,9939067700,14908601600,22362902400,33544353600,50000000000,59000000000,69620000000,82150000000,96940000000,114400000000,135000000000,159300000000,188000000000,221800000000,261700000000,308800000000,364400000000,430000000000,507400000000,598700000000,706500000000,833700000000,983800000000,1161000000000,1370000000000,1617000000000,1908000000000,2251000000000,2656000000000,3134000000000,3698000000000,4364000000000,5150000000000,6077000000000,7171000000000,8462000000000,9985000000000,11780000000000,13900000000000,16400000000000,19350000000000,22830000000000,26940000000000,31790000000000,37510000000000,44260000000000,52230000000000,61630000000000,72720000000000,85810000000000,101300000000000,119500000000000,141000000000000,166400000000000,196400000000000]);
const tierData=Object.freeze([

{range:'1 - 10',name:'Green Foundation',icon:'🌿',a:'#39ff57',b:'#c7ff35'},
{range:'11 - 20',name:'Purple Explorer',icon:'💎',a:'#b64cff',b:'#f35bff'},
{range:'21 - 30',name:'Gold Achiever',icon:'🏆',a:'#ffc400',b:'#ff7a18'},
{range:'31 - 40',name:'Diamond Expert',icon:'💠',a:'#17c7ff',b:'#6ad5ff'},
{range:'41 - 50',name:'Master Legend',icon:'👑',a:'#ff335d',b:'#ff8b1f'},
{range:'51 - 60',name:'Cyan Master',icon:'🔷',a:'#16e6e9',b:'#65fff2'},
{range:'61 - 70',name:'Grandmaster',icon:'🔮',a:'#7057ff',b:'#b778ff'},
{range:'71 - 80',name:'Champion',icon:'⚔️',a:'#ff7417',b:'#ffc12e'},
{range:'81 - 90',name:'Conqueror',icon:'🛡️',a:'#ff2e91',b:'#ff70c8'},
{range:'91 - 100',name:'Ultimate',icon:'❄️',a:'#dcecff',b:'#63cfff'}

]);
function rank(level){const l=Math.max(1,Math.min(100,Number(level)||1));if(l<=3)return'STARTER';if(l<=7)return'EXPLORER';if(l<=14)return'SCHOLAR';if(l<=24)return'ACHIEVER';if(l<=34)return'CHAMPION';if(l<=44)return'MASTER';if(l<=49)return'GRANDMASTER';if(l<=60)return'LEGEND';if(l<=70)return'ELITE';if(l<=80)return'CONQUEROR';if(l<=90)return'MYTHIC';if(l<=99)return'IMMORTAL';return'ULTIMATE'}
function resolveFromGoals(value,goals){const xp=Math.max(0,Math.floor(Number(value)||0));let level=1;for(let i=1;i<goals.length;i++){if(xp>=goals[i])level=i+1;else break}level=Math.min(100,level);const start=goals[level-1]||0;const next=level>=100?start:(goals[level]||start);const earned=Math.max(0,xp-start);const required=level>=100?0:Math.max(1,next-start);const pct=level>=100?100:Math.max(0,Math.min(100,earned/required*100));return {xp,level,start,next,earned,required,pct}}
function resolve(value){const r=resolveFromGoals(value,xpGoals);return Object.freeze({...r,prev:r.start,rank:rank(r.level),nextLevel:r.level>=100?null:r.level+1})}
function resolveLegacy(value){return resolveFromGoals(value,legacyXpGoals)}
function migrateLegacyXP(value){const raw=Math.max(0,Math.floor(Number(value)||0));if(raw<=270000)return raw;const old=resolveLegacy(raw);if(old.level>=100)return xpGoals[99];const newStart=xpGoals[old.level-1]||0,newNext=xpGoals[old.level]||newStart;return Math.round(newStart+(newNext-newStart)*(old.pct/100))}
function levelMultiplier(level){const l=Math.max(1,Math.min(100,Number(level)||1));return 1+Math.floor((l-1)/10)*0.10}
window.NEXZOLevelSystem=Object.freeze({version:19,xpPlanVersion:2,xpGoals,legacyXpGoals,tierData,rank,resolve,resolveLegacy,migrateLegacyXP,levelMultiplier});window.xpGoals=xpGoals;
})();
