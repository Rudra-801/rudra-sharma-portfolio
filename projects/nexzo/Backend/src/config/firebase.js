import fs from "node:fs";
import {cert,getApps,initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {getMessaging} from 'firebase-admin/messaging';

const projectId = (process.env.FIREBASE_PROJECT_ID || "personalized-recommendersystem").trim();
const storageBucketName=(process.env.FIREBASE_STORAGE_BUCKET||`${projectId}.firebasestorage.app`).trim();
const emulatorHosts=[process.env.FIRESTORE_EMULATOR_HOST,process.env.FIREBASE_AUTH_EMULATOR_HOST].filter(Boolean);
const emulator=emulatorHosts.length>0;
if(emulator&&(!['test','development'].includes(process.env.NODE_ENV)||!projectId.startsWith('demo-')||emulatorHosts.some(h=>! /^(?:localhost|127\.0\.0\.1):\d+$/.test(h))))throw new Error('Emulators require a demo project, local host and test/development mode.');
let credential = null;
let credentialMode = "project-id-only";
let credentialError = "";

function parseServiceAccountJson(raw){
  const parsed = JSON.parse(raw);
  if(parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  return parsed;
}

function resolveCredential(){
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if(inline){
    try{
      credentialMode = "inline-service-account";
      return cert(parseServiceAccountJson(inline));
    }catch(error){
      credentialError = `Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${error.message}`;
    }
  }

  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if(path){
    try{
      if(!fs.existsSync(path)){
        credentialError = `Credential file not found: ${path}`;
      }else{
        credentialMode = "credential-file";
        const raw = fs.readFileSync(path, "utf8");
        return cert(parseServiceAccountJson(raw));
      }
    }catch(error){
      credentialError = `Credential file could not be loaded: ${error.message}`;
    }
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if(clientEmail && privateKey){
    try{
      credentialMode = "split-service-account";
      return cert({ projectId, clientEmail, privateKey });
    }catch(error){
      credentialError = `Split Firebase credential is invalid: ${error.message}`;
    }
  }

  credentialMode = "project-id-only";
  return null;
}

credential = resolveCredential();

if(!getApps().length){
  // Token verification works with the Firebase project id and Google's public
  // signing certificates. Admin Firestore access additionally needs a service
  // account. Missing/incorrect local credential paths must never crash startup.
  initializeApp({
    ...(credential ? { credential } : {}),
    projectId,
    storageBucket:storageBucketName
  });
}

// Preserve existing route interfaces while using the maintained modular SDK.
export const firebaseAdmin = Object.freeze({firestore:Object.assign(getFirestore,{FieldValue}),messaging:getMessaging});
export const adminAuth = getAuth();
export const firebaseProjectId = projectId;
export const firebaseCredentialMode = credentialMode;
export const firebaseCredentialError = credentialError;
export const firebaseStorageBucket = storageBucketName;
export const firebaseAdminDataReady = Boolean(credential)||emulator;
export const firestore = firebaseAdminDataReady ? getFirestore() : null;
export const storageBucket = credential ? getStorage().bucket(storageBucketName) : null;

let adminProbeCache = { checkedAt:0, ok:false, error:"" };
export async function verifyFirebaseAdminDataAccess({maxAgeMs=60000}={}){
  if(!firebaseAdminDataReady || !firestore){
    return {ok:false,error:firebaseCredentialError || "Firebase Admin data credentials are not configured."};
  }
  const now=Date.now();
  if(adminProbeCache.checkedAt && now-adminProbeCache.checkedAt < maxAgeMs) return {...adminProbeCache};
  try{
    // Read-only probe: proves the configured Admin credential can actually reach Firestore.
    // The document does not need to exist and this never writes production data.
    await firestore.collection("__nexzo_health").doc("ready").get();
    adminProbeCache={checkedAt:now,ok:true,error:""};
  }catch(error){
    adminProbeCache={checkedAt:now,ok:false,error:String(error?.message||"Firebase Admin Firestore probe failed.").slice(0,240)};
  }
  return {...adminProbeCache};
}
