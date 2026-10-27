/* NEXZO Community Safety v42 — deterministic client guardrails; server rules remain authoritative. */
(function(root){
  'use strict';
  const normalize=value=>String(value??'').replace(/\s+/g,' ').trim();
  const fingerprint=value=>normalize(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function validateText(value,{min=3,max=2000}={}){
    const text=normalize(value);
    if(text.length<min)return {ok:false,code:'TOO_SHORT',message:`Write at least ${min} characters.`};
    if(text.length>max)return {ok:false,code:'TOO_LONG',message:`Keep it under ${max} characters.`};
    if(/(?:https?:\/\/\S+\s*){6,}/i.test(text))return {ok:false,code:'LINK_SPAM',message:'Too many links in one message.'};
    if(/(.)\1{24,}/.test(text))return {ok:false,code:'REPETITION',message:'Please avoid repeated-character spam.'};
    return {ok:true,text};
  }
  function rateLimit(storage,key,{now=Date.now(),cooldownMs=12000}={}){
    const last=Number(storage?.getItem?.(key)||0);
    const remaining=Math.max(0,cooldownMs-(now-last));
    return {allowed:remaining===0,remainingMs:remaining,commit(){storage?.setItem?.(key,String(now));}};
  }
  function duplicate(storage,key,text,{now=Date.now(),windowMs=120000}={}){
    let previous={};try{previous=JSON.parse(storage?.getItem?.(key)||'{}')||{};}catch{}
    const fp=fingerprint(text),same=fp&&fp===previous.fingerprint&&now-Number(previous.at||0)<windowMs;
    return {duplicate:same,commit(){storage?.setItem?.(key,JSON.stringify({fingerprint:fp,at:now}));}};
  }
  root.NEXZOCommunitySafety=Object.freeze({normalize,fingerprint,validateText,rateLimit,duplicate});
})(typeof window!=='undefined'?window:globalThis);
