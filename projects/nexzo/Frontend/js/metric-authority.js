/* NEXZO Metric Authority v40 — chooses trusted/newest sources, never the largest number. */
(function(root){
  'use strict';
  const num=value=>Number.isFinite(Number(value))?Number(value):0;
  function choose(candidates,{fallback=0,min=0,max=Number.POSITIVE_INFINITY}={}){
    const valid=(candidates||[]).filter(item=>item&&item.enabled!==false&&Number.isFinite(Number(item.value)));
    valid.sort((a,b)=>(num(b.priority)-num(a.priority))||(num(b.updatedAtMs)-num(a.updatedAtMs)));
    const value=valid.length?num(valid[0].value):num(fallback);
    return Math.min(max,Math.max(min,value));
  }
  function newest(candidates,{fallback=0,min=0,max=Number.POSITIVE_INFINITY}={}){
    const valid=(candidates||[]).filter(item=>item&&item.enabled!==false&&Number.isFinite(Number(item.value)));
    valid.sort((a,b)=>(num(b.updatedAtMs)-num(a.updatedAtMs))||(num(b.priority)-num(a.priority)));
    const value=valid.length?num(valid[0].value):num(fallback);
    return Math.min(max,Math.max(min,value));
  }
  root.NEXZOMetricAuthority=Object.freeze({choose,newest});
})(typeof window!=='undefined'?window:globalThis);
