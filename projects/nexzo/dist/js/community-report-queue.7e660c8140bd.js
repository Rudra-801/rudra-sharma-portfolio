/* NEXZO Community Report Queue v43 — UID-scoped, deduplicated, retryable offline reports. */
(function(root){
  'use strict';
  const normalize=value=>String(value??'').replace(/\s+/g,' ').trim();
  const storageKey=uid=>`nexzo_community_reports_v43:${String(uid||'anonymous')}`;
  const parse=raw=>{try{const value=JSON.parse(raw||'[]');return Array.isArray(value)?value:[]}catch{return []}};
  function validate({postId,reporterUid,reason}={}){
    const cleanReason=normalize(reason);
    if(!String(postId||'').trim())return {ok:false,message:'Post is missing.'};
    if(!String(reporterUid||'').trim())return {ok:false,message:'Please sign in before reporting.'};
    if(cleanReason.length<3)return {ok:false,message:'Add a reason of at least 3 characters.'};
    if(cleanReason.length>300)return {ok:false,message:'Keep the report reason under 300 characters.'};
    return {ok:true,reason:cleanReason};
  }
  function read(storage,uid){return parse(storage?.getItem?.(storageKey(uid)));}
  function write(storage,uid,rows){storage?.setItem?.(storageKey(uid),JSON.stringify(rows.slice(-100)));return rows;}
  function enqueue(storage,payload){
    const checked=validate(payload);if(!checked.ok)return checked;
    const clean={...payload,reason:checked.reason,status:'open',createdAtMs:Number(payload.createdAtMs)||Date.now(),attempts:Number(payload.attempts)||0};
    const rows=read(storage,clean.reporterUid).filter(row=>row.postId!==clean.postId);
    rows.push(clean);write(storage,clean.reporterUid,rows);
    return {ok:true,payload:clean,count:rows.length};
  }
  async function drain(storage,uid,sender){
    const pending=read(storage,uid),failed=[];let sent=0;
    for(const row of pending){
      try{await sender(row);sent+=1;}catch(error){failed.push({...row,attempts:Number(row.attempts||0)+1,lastError:String(error?.message||error||'sync failed').slice(0,180)});}
    }
    write(storage,uid,failed);
    return {sent,failed:failed.length,pending:failed};
  }
  root.NEXZOCommunityReports=Object.freeze({storageKey,validate,read,enqueue,drain});
})(typeof window!=='undefined'?window:globalThis);
