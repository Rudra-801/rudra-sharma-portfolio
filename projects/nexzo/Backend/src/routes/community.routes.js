import { Router } from 'express';
import { requireFirebaseAuth } from '../middleware/auth.js';
import { firestore, firebaseAdminDataReady } from '../config/firebase.js';
const router=Router(); router.use(requireFirebaseAuth);
router.delete('/posts/:postId',async(req,res,next)=>{try{
  if(!firebaseAdminDataReady||!firestore)return res.status(503).json({message:'Community backend is not configured.'});
  const ref=firestore.collection('posts').doc(req.params.postId),snap=await ref.get();
  if(!snap.exists)return res.status(404).json({message:'Post not found.'});
  if(snap.data()?.uid!==req.user.uid)return res.status(403).json({message:'Only the post owner can delete it.'});
  for(const sub of ['comments','likes']){const rows=await ref.collection(sub).get();for(let i=0;i<rows.docs.length;i+=400){const b=firestore.batch();rows.docs.slice(i,i+400).forEach(d=>b.delete(d.ref));await b.commit();}}
  await ref.delete(); return res.json({ok:true,deleted:true});
}catch(e){next(e)}});

router.delete('/posts/:postId/comments/:commentId',async(req,res,next)=>{try{
  if(!firebaseAdminDataReady||!firestore)return res.status(503).json({message:'Community backend is not configured.'});
  const postRef=firestore.collection('posts').doc(req.params.postId);
  const commentRef=postRef.collection('comments').doc(req.params.commentId);
  const [postSnap,commentSnap]=await Promise.all([postRef.get(),commentRef.get()]);
  if(!postSnap.exists)return res.status(404).json({message:'Post not found.'});
  if(!commentSnap.exists)return res.status(404).json({message:'Comment not found.'});
  const post=postSnap.data()||{},comment=commentSnap.data()||{};
  const allowed=comment.uid===req.user.uid||post.uid===req.user.uid;
  if(!allowed)return res.status(403).json({message:'Only the comment author or post owner can delete this comment.'});
  await firestore.runTransaction(async tx=>{
    const fresh=await tx.get(postRef);
    if(!fresh.exists)return;
    tx.delete(commentRef);
    tx.update(postRef,{replies:Math.max(0,Number(fresh.data()?.replies||0)-1),updatedAtMs:Date.now()});
  });
  return res.json({ok:true,deleted:true});
}catch(e){next(e)}});

export default router;
