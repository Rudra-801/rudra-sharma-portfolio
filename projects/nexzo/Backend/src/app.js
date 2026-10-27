import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { assistantProvider, assistantConfigured } from './services/assistant-provider.js';
import authRoutes from "./routes/auth.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import assistantRoutes from "./routes/assistant.routes.js";
import userRoutes from "./routes/user.routes.js";
import toolsRoutes from "./routes/tools.routes.js";
import googleRoutes from "./routes/google.routes.js";
import groupsRoutes from "./routes/groups.routes.js";
import communityRoutes from "./routes/community.routes.js";
import messagesRoutes from "./routes/messages.routes.js";
import { notFound, errorHandler } from "./middleware/error.js";
import { firebaseProjectId, firebaseCredentialMode, firebaseCredentialError, firebaseAdminDataReady, verifyFirebaseAdminDataAccess } from "./config/firebase.js";
import { validateEnvironment } from "./config/env.js";
import { originAllowed } from "./policies/cors-policy.js";
import { readiness } from "./policies/readiness-policy.js";

const environmentReport = validateEnvironment();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const defaultOrigins = [
  "http://127.0.0.1:5500", "http://localhost:5500",
  "http://127.0.0.1:5501", "http://localhost:5501",
  "http://127.0.0.1:5502", "http://localhost:5502",
  "http://127.0.0.1:5503", "http://localhost:5503",
  "http://127.0.0.1:5504", "http://localhost:5504",
  "http://127.0.0.1:5505", "http://localhost:5505",
  "https://personalized-recommendersystem.web.app",
  "https://personalized-recommendersystem.firebaseapp.com"
];
const allowedOrigins = new Set([
  ...defaultOrigins,
  ...(process.env.ALLOWED_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean)
]);

app.use((req,res,next)=>{
  const longAiRequest=/^\/api\/(?:assistant\/stream|ai\/(?:evaluate|chat|planner|community|image|analyze|analyze-project)|tools\/(?:search|research|code|data|artifact))/.test(req.path);req.setTimeout(longAiRequest?150000:30000);res.setTimeout(longAiRequest?150000:30000);
  req.requestId=req.get("x-request-id") || crypto.randomUUID();
  req.startedAt=Date.now();
  res.setHeader("x-request-id",req.requestId);
  res.on("finish",()=>console.info(JSON.stringify({level:"info",event:"http_request",requestId:req.requestId,method:req.method,path:req.originalUrl,status:res.statusCode,durationMs:Date.now()-req.startedAt,time:new Date().toISOString()})));
  next();
});
app.use(helmet({ crossOriginResourcePolicy:{ policy:"cross-origin" }, referrerPolicy:{ policy:"no-referrer" } }));
app.use(cors({
  origin(origin, callback){
    if(originAllowed(origin,{production:process.env.NODE_ENV === "production",allowed:[...allowedOrigins]})) return callback(null, true);
    return callback(Object.assign(new Error(`Origin not allowed: ${origin}`), { status:403 }));
  },
  methods:["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders:["Content-Type","Authorization","X-Request-Id"],
  credentials:false,
  maxAge:86400
}));
app.use((req,res,next)=>{
  if(req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit:"256kb", strict:true }));
app.use(express.urlencoded({ extended:false, limit:"64kb" }));
app.use(rateLimit({ windowMs:15*60*1000, limit:300, standardHeaders:true, legacyHeaders:false }));

const health=(req,res)=>res.json({
  evaluationContract:2,
  plannerContract:3,
  buildCommit:process.env.RENDER_GIT_COMMIT||null,
  deterministicMcq:Boolean(firebaseAdminDataReady),
  ok:true,
  service:"nexzo-backend",
  version:process.env.APP_VERSION || "2.5.0-v269",
  apiContract:"2026-09-v1",
  capabilities:(()=>{
    const gemini=Boolean(process.env.GEMINI_API_KEY && !/^YOUR_/i.test(process.env.GEMINI_API_KEY));
    const google=Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    return {
      chat:assistantConfigured(),streaming:assistantConfigured(),fileAnalysis:gemini,projectAnalysis:gemini,imageGeneration:gemini,
      advancedTools:gemini,webSearch:gemini,deepResearch:gemini,codeExecution:gemini,dataAnalysis:gemini,
      artifactGeneration:gemini,projectEditing:gemini,fileLibrary:firebaseAdminDataReady,memory:firebaseAdminDataReady,
      scheduledTasks:firebaseAdminDataReady,backgroundJobs:gemini&&firebaseAdminDataReady,googleConnections:google
    };
  })(),
  environment:process.env.NODE_ENV || "development",
  geminiConfigured:Boolean(process.env.GEMINI_API_KEY && !/^YOUR_/i.test(process.env.GEMINI_API_KEY)),
  multiAgentConfigured:true,
  hybridAssistantConfigured:true,
  assistantProvider:assistantProvider(),
  assistantConfigured:assistantConfigured(),
  firebaseProjectConfigured:Boolean(firebaseProjectId),
  firebaseTokenVerificationConfigured:Boolean(firebaseProjectId),
  firebaseAdminDataConfigured:firebaseAdminDataReady,
  firebaseCredentialMode,
  firebaseCredentialWarning:firebaseCredentialError || (firebaseAdminDataReady ? "" : "Firebase Admin data credentials are not configured; server-side Firestore features are unavailable."),
  requestId:req.requestId,
  time:new Date().toISOString()
});
app.get("/health",health);
app.get("/api/health",health);
app.get("/ready", async (req,res)=>{
  const geminiConfigured=Boolean(process.env.GEMINI_API_KEY && !/^YOUR_/i.test(process.env.GEMINI_API_KEY));
  const adminProbe=await verifyFirebaseAdminDataAccess();
  const status=readiness({
    firebaseProjectConfigured:Boolean(firebaseProjectId),
    geminiConfigured,
    firebaseAdminDataConfigured:firebaseAdminDataReady,
    firebaseAdminDataReachable:adminProbe.ok
  });
  res.status(status.ready ? 200 : 503).json({
    ...status,
    firebaseAdminProbeError:adminProbe.ok ? "" : adminProbe.error,
    environmentWarnings:environmentReport.warnings,
    requestId:req.requestId
  });
});

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const frontendDir=path.resolve(__dirname,"../../Frontend");
app.use(express.static(frontendDir,{extensions:["html"],maxAge:process.env.NODE_ENV==="production"?"1h":0}));
app.get("/",(req,res)=>{
  const homePage=path.join(frontendDir,"Home.html");
  if(fs.existsSync(homePage)) return res.sendFile(homePage);
  return res.json({ok:true,service:"nexzo-backend",health:"/health",api:"/api"});
});

app.use("/api/auth",authRoutes);
app.use("/api/ai",aiRoutes);
app.use("/api/assistant",assistantRoutes);
app.use("/api/user",userRoutes);
app.use("/api/tools",toolsRoutes);
app.use("/api/google",googleRoutes);
app.use("/api/groups",groupsRoutes);
app.use("/api/community",communityRoutes);
app.use("/api/messages",messagesRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
