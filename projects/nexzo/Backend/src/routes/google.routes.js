import { Router } from 'express';
import { z } from 'zod';
import { requireFirebaseAuth, requireVerifiedEmail } from '../middleware/auth.js';
import { googleIntegrationReady, googleAuthUrl, completeGoogleOAuth, googleStatus, disconnectGoogle, searchGmail, createGmailDraft, listCalendar, createCalendarEvent } from '../services/google-integration.js';

const router=Router();
router.get('/callback',async(req,res,next)=>{try{const code=z.string().min(1).parse(req.query.code),state=z.string().min(1).parse(req.query.state);await completeGoogleOAuth(code,state);res.type('html').send(`<!doctype html><meta charset="utf-8"><title>NEXZO Google connected</title><style>body{font-family:system-ui;background:#090909;color:#eee;display:grid;place-items:center;height:100vh;margin:0}.card{border:1px solid #5c4a16;border-radius:18px;padding:28px;background:#15130d}b{color:#f1ce57}</style><div class="card"><b>Google connected to NEXZO.</b><p>You can close this window and return to Study Assistant.</p></div><script>setTimeout(()=>window.close(),1800)</script>`);}catch(e){next(e)}});
router.use(requireFirebaseAuth,requireVerifiedEmail);
router.get('/status',async(req,res,next)=>{try{res.json({ok:true,...await googleStatus(req.user.uid)});}catch(e){next(e)}});
router.get('/auth-url',async(req,res,next)=>{try{res.json({ok:true,url:googleAuthUrl(req.user.uid),configured:googleIntegrationReady()});}catch(e){next(e)}});
router.delete('/connection',async(req,res,next)=>{try{res.json(await disconnectGoogle(req.user.uid));}catch(e){next(e)}});
router.get('/gmail/search',async(req,res,next)=>{try{const q=z.string().trim().max(500).catch('newer_than:30d').parse(req.query.q||'newer_than:30d');res.json({ok:true,messages:await searchGmail(req.user.uid,q)});}catch(e){next(e)}});
router.post('/gmail/draft',async(req,res,next)=>{try{const input=z.object({to:z.string().email(),subject:z.string().trim().min(1).max(300),body:z.string().trim().min(1).max(20000)}).parse(req.body);const draft=await createGmailDraft(req.user.uid,input);res.json({ok:true,draftId:draft.id||''});}catch(e){next(e)}});
router.get('/calendar/events',async(req,res,next)=>{try{res.json({ok:true,events:await listCalendar(req.user.uid)});}catch(e){next(e)}});
router.post('/calendar/events',async(req,res,next)=>{try{const input=z.object({summary:z.string().trim().min(1).max(300),description:z.string().trim().max(5000).optional(),start:z.string().datetime(),end:z.string().datetime()}).parse(req.body);const event=await createCalendarEvent(req.user.uid,{summary:input.summary,description:input.description||'',start:{dateTime:input.start},end:{dateTime:input.end}});res.json({ok:true,event:{id:event.id,htmlLink:event.htmlLink||'',summary:event.summary||input.summary}});}catch(e){next(e)}});
export default router;
