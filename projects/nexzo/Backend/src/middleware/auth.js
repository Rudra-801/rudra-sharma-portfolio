import { adminAuth, firebaseProjectId } from "../config/firebase.js";
import { bearerToken, emailVerificationDecision } from "../policies/auth-policy.js";

export async function requireFirebaseAuth(req, res, next){
  try{
    const token = bearerToken(req.headers.authorization);
    if(!token) return res.status(401).json({ message: "Authentication required" });
    req.user = await adminAuth.verifyIdToken(token, true);
    return next();
  }catch(error){
    console.warn(JSON.stringify({
      level:"warn",
      message:"Firebase ID token verification failed",
      projectId:firebaseProjectId,
      detail:error?.message || String(error)
    }));
    return res.status(401).json({
      message:"Firebase session could not be verified. Sign in again and confirm FIREBASE_PROJECT_ID is correct."
    });
  }
}

export function requireVerifiedEmail(req,res,next){
  const decision=emailVerificationDecision(req.user);
  if(decision.allowed) return next();
  return res.status(403).json({ message:"Verify your email before using protected NEXZO cloud features.", code:decision.code });
}
