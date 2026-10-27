import { firestore, firebaseAdminDataReady, firebaseAdmin } from "../config/firebase.js";
import { quotaDecision, utcDayKey } from "../policies/quota-policy.js";

export function durableDailyAiQuota(){
  const limit = Math.max(1, Number(process.env.AI_RATE_LIMIT_PER_DAY || 500));
  return async function aiQuota(req, res, next){
    if(!firebaseAdminDataReady || !firestore){
      if(process.env.NODE_ENV === "production"){ const error=new Error("AI quota service is unavailable."); error.status=503; return next(error); }
      return next();
    }
    try{
      const day = utcDayKey();
      const ref = firestore.collection("systemUsage").doc(`ai_${req.user.uid}_${day}`);
      let count = 0;
      await firestore.runTransaction(async transaction => {
        const snap = await transaction.get(ref);
        count = Number(snap.data()?.count || 0);
        const decision=quotaDecision({count,limit});
        if(!decision.allowed){
          const error = new Error("Daily AI request limit reached. Try again tomorrow.");
          error.status = 429;
          throw error;
        }
        transaction.set(ref, {
          uid:req.user.uid,
          day,
          count:firebaseAdmin.firestore.FieldValue.increment(1),
          updatedAt:firebaseAdmin.firestore.FieldValue.serverTimestamp(),
          expiresAt:new Date(Date.now() + 35 * 24 * 60 * 60 * 1000)
        }, { merge:true });
      });
      const decision=quotaDecision({count,limit});
      res.setHeader("x-ai-daily-limit", String(decision.limit));
      res.setHeader("x-ai-daily-remaining", String(decision.remaining));
      next();
    }catch(error){ next(error); }
  };
}
