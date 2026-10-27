import { Router } from "express";
import { z } from "zod";
import { adminAuth, firestore, firebaseAdmin, firebaseAdminDataReady, storageBucket } from "../config/firebase.js";
import { requireFirebaseAuth, requireVerifiedEmail } from "../middleware/auth.js";

const router = Router();
const tokenSchema = z.object({ idToken: z.string().min(20) });

router.post("/firebase", async (req, res, next) => {
  try{
    const { idToken } = tokenSchema.parse(req.body);
    const decoded = await adminAuth.verifyIdToken(idToken, true);
    let userRecord = null;
    if(firebaseAdminDataReady){
      try{ userRecord = await adminAuth.getUser(decoded.uid); }catch(_){ userRecord = null; }
    }
    const email = userRecord?.email || decoded.email || "";
    const user = {
      uid: decoded.uid,
      name: userRecord?.displayName || decoded.name || email.split("@")[0] || "Student",
      email,
      photoURL: userRecord?.photoURL || decoded.picture || ""
    };
    let cloudProfileSaved = false;
    if(firebaseAdminDataReady && firestore){
      await firestore.doc(`users/${decoded.uid}`).set({
        ...user,
        updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      cloudProfileSaved = true;
    }
    res.json({ user, token: idToken, cloudProfileSaved });
  }catch(error){ next(error); }
});

router.get("/me", requireFirebaseAuth, async (req, res, next) => {
  try{
    const profile = firebaseAdminDataReady && firestore
      ? (await firestore.doc(`users/${req.user.uid}`).get()).data() || {}
      : {};
    res.json({ user: { uid:req.user.uid, email:req.user.email || "", name:req.user.name || req.user.email?.split("@")[0] || "Student", ...profile }, cloudProfileAvailable:Boolean(firebaseAdminDataReady && firestore) });
  }catch(error){ next(error); }
});

async function deleteRecursively(ref){
  if(typeof firestore.recursiveDelete==="function") return firestore.recursiveDelete(ref);
  const children=await ref.listCollections?.()||[];
  for(const collection of children){
    const snap=await collection.get();
    for(const doc of snap.docs) await deleteRecursively(doc.ref);
  }
  await ref.delete().catch(()=>{});
}

async function deleteInteraction(docRef,counterField){
  const parentRef=docRef.parent.parent;
  if(!parentRef||!counterField){await deleteRecursively(docRef);return;}
  await firestore.runTransaction(async transaction=>{
    const [child,parent]=await Promise.all([transaction.get(docRef),transaction.get(parentRef)]);
    if(!child.exists)return;
    transaction.delete(docRef);
    if(parent.exists){
      const next=Math.max(0,Number(parent.data()?.[counterField]||0)-1);
      transaction.update(parentRef,{[counterField]:next,updatedAt:firebaseAdmin.firestore.FieldValue.serverTimestamp(),updatedAtMs:Date.now()});
    }
  });
}

async function cleanupCollectionGroup(collectionId,uid,counterField=""){
  const snap=await firestore.collectionGroup(collectionId).where("uid","==",uid).get();
  const docs=snap.docs;
  for(let offset=0;offset<docs.length;offset+=10){
    await Promise.all(docs.slice(offset,offset+10).map(doc=>deleteInteraction(doc.ref,counterField)));
  }
  return docs.length;
}

router.delete("/account", requireFirebaseAuth, requireVerifiedEmail, async (req, res, next) => {
  try{
    if(!firebaseAdminDataReady || !firestore){
      return res.status(503).json({ message:"Account deletion requires Firebase Admin service-account credentials on the backend." });
    }
    const authAgeSeconds=Math.floor(Date.now()/1000)-Number(req.user.auth_time||0);
    if(!req.user.auth_time||authAgeSeconds>600){
      return res.status(401).json({ message:"For security, sign in again before deleting your account.", code:"RECENT_LOGIN_REQUIRED" });
    }
    const uid=req.user.uid;
    const removed={likes:0,comments:0,memberships:0,messages:0,posts:0,groups:0,storageFiles:0};

    removed.likes=await cleanupCollectionGroup("likes",uid,"likes");
    removed.comments=await cleanupCollectionGroup("comments",uid,"replies");
    removed.memberships=await cleanupCollectionGroup("members",uid,"memberCount");
    removed.messages=await cleanupCollectionGroup("messages",uid);

    const postSnap=await firestore.collection("posts").where("uid","==",uid).get();
    removed.posts=postSnap.size;
    for(const doc of postSnap.docs) await deleteRecursively(doc.ref);

    const groupSnap=await firestore.collection("groups").where("ownerUid","==",uid).get();
    removed.groups=groupSnap.size;
    for(const doc of groupSnap.docs) await deleteRecursively(doc.ref);

    const userRef=firestore.doc(`users/${uid}`);
    await deleteRecursively(userRef);

    if(storageBucket){
      const [files]=await storageBucket.getFiles({prefix:`users/${uid}/`});
      removed.storageFiles=files.length;
      if(files.length)await Promise.all(files.map(file=>file.delete({ignoreNotFound:true}).catch(()=>{})));
    }

    await adminAuth.deleteUser(uid);
    console.info(JSON.stringify({level:"info",event:"account_deleted",uid,removed,time:new Date().toISOString()}));
    res.json({ ok:true, removed });
  }catch(error){ next(error); }
});

export default router;
