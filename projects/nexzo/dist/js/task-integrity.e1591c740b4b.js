/* Shared receipt policy: client task edits never manufacture verified outcomes. */
(function(root){
  'use strict';
  const receiptFields=Object.freeze(['evaluationId','serverVerified','evaluationSource','evaluationMode','score','maxScore','percentage','submissionLocked','submittedAnswer','submittedAtMs','evaluatedAtMs','xpGranted','rewardClaimed','aiFeedback']);
  const completionFields=Object.freeze(['completed','done','status','progress','completedAtMs','completedAt','verifiedAt','running','lastStarted','title','subject','academicSubjectId','academicTopicKey','generatedQuestions','type','questionType','level','difficulty']);
  function preserveReceipt(incoming,existing){
    const out={...incoming};
    for(const key of receiptFields){
      if(existing&&Object.prototype.hasOwnProperty.call(existing,key))out[key]=existing[key];
      else delete out[key];
    }
    if(existing?.serverVerified===true)for(const key of completionFields){
      if(Object.prototype.hasOwnProperty.call(existing,key))out[key]=existing[key];
      else delete out[key];
    }
    if(out.source==='server-evaluation'||out.source==='verified-quiz'){
      if(existing?.source)out.source=existing.source;else delete out.source;
    }
    return out;
  }
  const api=Object.freeze({receiptFields,completionFields,preserveReceipt});
  if(typeof module==='object'&&module.exports)module.exports=api;else root.NEXZOTaskIntegrity=api;
})(typeof window==='undefined'?globalThis:window);
