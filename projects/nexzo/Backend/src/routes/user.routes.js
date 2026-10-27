import { Router } from "express";
import { requireFirebaseAuth, requireVerifiedEmail } from "../middleware/auth.js";
import { firestore, firebaseAdminDataReady } from "../config/firebase.js";

import {savePlannerTask,publicTask} from '../services/academic-workflow.js';
const router = Router();
const ALLOWED_STATE = new Set(["profile","settings","personalization","stats","semester","academics"]);

function requireAdminData(req,res,next){
  if(!firebaseAdminDataReady || !firestore) return res.status(503).json({ message:"Server-side Firebase data access is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON on the backend." });
  next();
}
function cleanObject(value){
  if(!value || typeof value!=="object" || Array.isArray(value)) return {};
  const out={...value}; delete out.uid; delete out.updatedAt; delete out.createdAt; return out;
}
function stateRef(uid,domain){ return firestore.doc(`users/${uid}/${domain}/main`); }

router.use(requireAdminData);
router.use(requireFirebaseAuth);
router.use(requireVerifiedEmail);

router.get("/state/:domain", async(req,res,next)=>{
  try{
    const domain=String(req.params.domain||"").toLowerCase();
    if(!ALLOWED_STATE.has(domain)) return res.status(400).json({message:"Unsupported state domain."});
    const snap=await stateRef(req.user.uid,domain).get();
    const doc=snap.exists?snap.data():null;
    res.json({ok:true,domain,exists:snap.exists,data:doc?.data||null,updatedAtMs:doc?.updatedAtMs||0});
  }catch(error){next(error)}
});

router.put("/state/:domain", async(req,res,next)=>{
  try{
    const domain=String(req.params.domain||"").toLowerCase();
    if(!ALLOWED_STATE.has(domain)) return res.status(400).json({message:"Unsupported state domain."});
    const data=cleanObject(req.body?.data ?? req.body);
    if(JSON.stringify(data).length>180000) return res.status(413).json({message:"State payload is too large."});
    const ref=stateRef(req.user.uid,domain); const current=await ref.get();
    const payload={data,uid:req.user.uid,updatedBy:req.user.uid,schemaVersion:Number(data.schemaVersion)||201,updatedAtMs:Date.now(),updatedAt:new Date()};
    if(!current.exists) payload.createdAt=new Date();
    await ref.set(payload,{merge:false});
    res.json({ok:true,domain,updatedAtMs:payload.updatedAtMs,data:payload});
  }catch(error){next(error)}
});

router.get('/evaluations',async(req,res,next)=>{try{const snap=await firestore.collection(`users/${req.user.uid}/academicEvaluations`).orderBy('evaluatedAtMs','desc').limit(200).get();res.json({ok:true,evaluations:snap.docs.map(d=>publicTask(d.data()))});}catch(error){next(error);}});

router.get("/tasks",async(req,res,next)=>{
  try{
    const snap=await firestore.collection(`users/${req.user.uid}/tasks`).orderBy("updatedAtMs","desc").limit(500).get();
    res.json({ok:true,tasks:snap.docs.map(d=>publicTask({id:d.id,...d.data()}))});
  }catch(error){next(error)}
});
router.put("/tasks/:taskId",async(req,res,next)=>{
  try{
    const taskId=String(req.params.taskId||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,120);
    if(!taskId)return res.status(400).json({message:"Valid task id required."});
    const data=cleanObject(req.body?.data ?? req.body);
    if(JSON.stringify(data).length>100000)return res.status(413).json({ok:false,message:'Task is too large.'});
    res.json({ok:true,task:await savePlannerTask(firestore,req.user.uid,taskId,data)});
  }catch(error){next(error)}
});
router.delete("/tasks/:taskId",async(req,res,next)=>{
  try{
    const taskId=String(req.params.taskId||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,120);
    if(!taskId)return res.status(400).json({message:"Valid task id required."});
    await firestore.doc(`users/${req.user.uid}/tasks/${taskId}`).delete();
    res.json({ok:true,id:taskId});
  }catch(error){next(error)}
});

router.post("/learning-events",async(req,res,next)=>{
  try{
    const data=cleanObject(req.body?.data ?? req.body); const ref=firestore.collection(`users/${req.user.uid}/learningEvents`).doc();
    const payload={...data,id:ref.id,uid:req.user.uid,createdAtMs:Date.now(),createdAt:new Date()}; await ref.set(payload); res.status(201).json({ok:true,event:payload});
  }catch(error){next(error)}
});

router.get("/dashboard", async (req, res, next) => {
  try{
    const uid = req.user.uid;
    const [tasksSnap, postsSnap, profileSnap, achievementsSnap] = await Promise.all([
      firestore.collection(`users/${uid}/tasks`).get(), firestore.collection("posts").where("uid", "==", uid).get(),
      firestore.doc(`users/${uid}/profile/main`).get(), firestore.collection(`users/${uid}/achievements`).get()
    ]);
    const tasks = tasksSnap.docs.map(d => ({ id:d.id, ...d.data() }));
    const completed = tasks.filter(t => t.completed === true || t.status === "completed").length;
    res.json({totalTasks:tasks.length,completedTasks:completed,progress:tasks.length?Math.round(completed*100/tasks.length):0,posts:postsSnap.size,achievements:achievementsSnap.size,profile:profileSnap.data()||{}});
  }catch(error){ next(error); }
});

export default router;
