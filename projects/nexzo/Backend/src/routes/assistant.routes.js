import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireFirebaseAuth, requireVerifiedEmail } from '../middleware/auth.js';
import { durableDailyAiQuota } from '../middleware/ai-quota.js';
import { streamAssistant } from '../assistant/assistant-engine.js';
import { trustedAssistantInput } from '../assistant/student-context.js';
import { firestore, firebaseAdminDataReady } from '../config/firebase.js';
import { confirmAction } from '../assistant/tools.js';

const router=Router();
const historyItem=z.object({role:z.enum(['user','assistant']),content:z.string().trim().max(6000)});
const inputSchema=z.object({message:z.string().trim().min(1).max(6000),chatId:z.string().trim().min(1).max(120),mode:z.enum(['chat','explain','notes','quiz','interview']).default('chat'),history:z.array(historyItem).max(16).default([]),context:z.record(z.any()).optional(),personalization:z.boolean().default(true)});

router.use(requireFirebaseAuth);
router.post('/stream',requireVerifiedEmail,rateLimit({windowMs:60_000,limit:Number(process.env.AI_RATE_LIMIT_PER_MINUTE||20),keyGenerator:req=>req.user.uid,standardHeaders:true,legacyHeaders:false}),durableDailyAiQuota(),async(req,res,next)=>{
  try{
    const input=await trustedAssistantInput(firebaseAdminDataReady?firestore:null,req.user.uid,inputSchema.parse(req.body));const controller=new AbortController();res.on('close',()=>controller.abort());input.signal=controller.signal;res.status(200);res.setHeader('Content-Type','text/event-stream; charset=utf-8');res.setHeader('Cache-Control','no-cache, no-transform');res.setHeader('Connection','keep-alive');res.flushHeaders?.();
    for await(const event of streamAssistant(req.user.uid,input)){if(controller.signal.aborted)break;res.write(`data: ${JSON.stringify(event)}\n\n`);}
    res.end();
  }catch(error){if(res.destroyed)return;if(res.headersSent){res.write(`data: ${JSON.stringify({type:'error',message:error.status===429?'Study Assistant is busy. Wait a moment and retry.':'The answer could not finish. Your message is preserved; please retry.'})}\n\n`);res.end();return;}next(error);}
});
router.post('/actions/:actionId/confirm',requireVerifiedEmail,async(req,res,next)=>{try{const actionId=z.string().uuid().parse(req.params.actionId);res.json(await confirmAction(req.user.uid,actionId));}catch(error){next(error)}});

export default router;
