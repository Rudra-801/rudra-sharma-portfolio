/* NEXZO Community Maintenance v43 — safe chunk planning for Firestore batch limits. */
(function(root){
  'use strict';
  function chunks(items,size=450){
    const safeSize=Math.max(1,Math.min(450,Number(size)||450)),rows=Array.from(items||[]),out=[];
    for(let i=0;i<rows.length;i+=safeSize)out.push(rows.slice(i,i+safeSize));
    return out;
  }
  root.NEXZOCommunityMaintenance=Object.freeze({chunks});
})(typeof window!=='undefined'?window:globalThis);
