import { Router } from 'express';
import { requireFirebaseAuth } from '../middleware/auth.js';
import { firestore, firebaseAdminDataReady } from '../config/firebase.js';
import { pushToUsers, createUserNotification } from '../services/push-notifications.js';

const router=Router();
router.use(requireFirebaseAuth);

function unavailable(res){return res.status(503).json({message:'Group management service is not configured on the backend.'});}

function cleanText(value,max=200){return String(value||'').trim().slice(0,max);}
function cleanGroupId(value){const id=String(value||'').trim();return /^[A-Za-z0-9_-]{12,96}$/.test(id)?id:'';}
async function memberCount(groupRef){try{const aggregate=await groupRef.collection('members').count().get();return Number(aggregate.data()?.count||0);}catch{const snap=await groupRef.collection('members').get();return snap.size;}}
async function syncMemberCount(groupRef){const count=await memberCount(groupRef);await groupRef.update({memberCount:count,updatedAtMs:Date.now()});return count;}
function safeUsername(value,req){
  const raw=cleanText(value,20).replace(/^@/,'').toLowerCase().replace(/[^a-z0-9._]+/g,'.').replace(/^[._]+|[._]+$/g,'');
  if(/^[a-z0-9._]{3,20}$/.test(raw))return raw;
  const emailBase=String(req.user?.email||'student').split('@')[0].toLowerCase().replace(/[^a-z0-9._]+/g,'.').slice(0,14);
  const suffix=String(req.user?.uid||'user').replace(/[^a-z0-9]/gi,'').toLowerCase().slice(0,5);
  return `${emailBase||'student'}.${suffix}`.slice(0,20);
}
function memberPayload(req,role='member',joinedAtMs=Date.now()){
  const isOwner=role==='owner';
  return {
    uid:req.user.uid,
    name:cleanText((isOwner?req.body?.ownerName:req.body?.name)||req.user?.name||req.user?.email?.split('@')[0]||'Student',100)||'Student',
    username:safeUsername(isOwner?req.body?.ownerUsername:req.body?.username,req),
    photoURL:cleanText((isOwner?req.body?.ownerPhotoURL:req.body?.photoURL)||req.user?.picture||'',2048),
    role,joinedAtMs
  };
}

router.post('/',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);
    const name=cleanText(req.body?.name,100),subject=cleanText(req.body?.subject,80),description=cleanText(req.body?.description,500);
    if(!name||!subject)return res.status(400).json({message:'Group name and subject are required.'});
    const requestedId=cleanGroupId(req.body?.groupId||req.body?.idempotencyKey);
    if(!requestedId)return res.status(400).json({message:'A valid client-generated groupId is required for safe retry protection.'});
    const privacy=req.body?.privacy==='private'?'private':'public',now=Date.now();
    const groupRef=firestore.collection('groups').doc(requestedId),ownerRef=groupRef.collection('members').doc(req.user.uid),inviteRef=groupRef.collection('private').doc('invite');
    const inviteCode=requestedId.replace(/[^a-z0-9]/gi,'').slice(-12).toUpperCase();
    const owner=memberPayload(req,'owner',now);
    // New groups keep invite secrets in an owner-scoped private document. The public
    // inviteCode field remains present-but-empty for backward compatibility with the
    // existing group schema and legacy readers.
    const group={ownerUid:req.user.uid,ownerName:owner.name,name,subject,description,memberCount:1,createdAtMs:now,updatedAtMs:now,avatarURL:'',wallpaperURL:'',wallpaperType:'',privacy,inviteCode:'',permissions:{membersCanSend:true,membersCanInvite:true,membersCanEdit:false,historyVisible:true,approvalRequired:privacy==='private'},schemaVersion:240};
    let created=false;
    await firestore.runTransaction(async tx=>{
      const [existingGroup,existingOwner]=await Promise.all([tx.get(groupRef),tx.get(ownerRef)]);
      if(existingGroup.exists){
        const data=existingGroup.data()||{};
        if(data.ownerUid!==req.user.uid)throw Object.assign(new Error('This retry key is already used by another group.'),{status:409});
        if(!existingOwner.exists||existingOwner.data()?.role!=='owner')throw Object.assign(new Error('The existing group is missing its owner membership; no data was changed.'),{status:409});
        return;
      }
      tx.create(groupRef,group);tx.create(ownerRef,owner);tx.create(inviteRef,{code:inviteCode,updatedAtMs:now});created=true;
    });
    const [savedGroup,savedOwner]=await Promise.all([groupRef.get(),ownerRef.get()]);
    if(!savedGroup.exists||!savedOwner.exists||savedOwner.data()?.role!=='owner'||savedGroup.data()?.ownerUid!==req.user.uid){
      throw Object.assign(new Error('Group write was not verified after commit.'),{status:503});
    }
    return res.status(created?201:200).json({ok:true,created,group:{id:groupRef.id,...savedGroup.data()},ownerMembership:{id:savedOwner.id,...savedOwner.data()}});
  }catch(error){next(error);}
});

router.get('/:groupId/context',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);
    const ctx=await groupContext(req.params.groupId,req.user.uid);
    const snap=await ctx.groupRef.collection('members').get();
    const members=snap.docs.map(d=>({id:d.id,...(d.data()||{})}));
    const ownerUid=String(ctx.group.ownerUid||'');
    const ownerValid=Boolean(ownerUid&&members.some(m=>m.id===ownerUid&&m.role==='owner'));
    return res.json({ok:true,group:{id:req.params.groupId,...ctx.group,memberCount:members.length},members,isMember:members.some(m=>m.id===req.user.uid),isOwner:ownerUid===req.user.uid,integrity:{ownerValid,memberCountMatches:Number(ctx.group.memberCount||0)===members.length,needsRepair:!ownerValid||Number(ctx.group.memberCount||0)!==members.length}});
  }catch(error){next(error);}
});

router.post('/:groupId/join',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);
    const {groupId}=req.params,uid=req.user.uid,groupRef=firestore.collection('groups').doc(groupId),memberRef=firestore.collection('groups').doc(groupId).collection('members').doc(uid);
    let joined=false;
    await firestore.runTransaction(async tx=>{
      const [g,m]=await Promise.all([tx.get(groupRef),tx.get(memberRef)]);
      if(!g.exists)throw Object.assign(new Error('Group not found.'),{status:404});
      if(m.exists)return;
      const data=g.data()||{};
      if(data.permissions?.approvalRequired===true){
        const submittedCode=cleanText(req.body?.inviteCode,32);
        const legacyCode=String(data.inviteCode||'');
        const privateInviteRef=groupRef.collection('private').doc('invite');
        const privateInviteSnap=await tx.get(privateInviteRef);
        const privateCode=privateInviteSnap.exists?String(privateInviteSnap.data()?.code||''):'';
        const validInvite=Boolean(submittedCode&&((privateCode&&submittedCode===privateCode)||(legacyCode&&submittedCode===legacyCode)));
        if(!validInvite){
          const r=await tx.get(groupRef.collection('joinRequests').doc(uid));
          if(!r.exists||r.data()?.status!=='approved')throw Object.assign(new Error('This private group requires a valid invite or admin approval before joining.'),{status:403});
        }
      }
      tx.set(memberRef,memberPayload(req,'member',Date.now()));
      tx.update(groupRef,{memberCount:Math.max(0,Number(data.memberCount)||0)+1,updatedAtMs:Date.now()});joined=true;
    });
    const count=await syncMemberCount(groupRef);
    return res.json({ok:true,joined,memberCount:count});
  }catch(error){next(error);}
});

router.post('/:groupId/messages',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);
    const {groupId}=req.params,ctx=await groupContext(groupId,req.user.uid);
    if(!ctx.member&&!ctx.owner)return res.status(403).json({message:'Join the group before sending messages.'});
    if(!ctx.admin&&ctx.group.permissions?.membersCanSend===false)return res.status(403).json({message:'Only admins can send messages right now.'});
    const text=cleanText(req.body?.text,1000),attachment=req.body?.attachment&&typeof req.body.attachment==='object'?req.body.attachment:null;
    if(!text&&!attachment)return res.status(400).json({message:'Message or attachment is required.'});
    const now=Date.now(),payload={uid:req.user.uid,authorName:cleanText(req.body?.authorName||ctx.member?.name||req.user?.name||'Student',100)||'Student',authorUsername:safeUsername(req.body?.authorUsername||ctx.member?.username,req),authorPhoto:cleanText(req.body?.authorPhoto||ctx.member?.photoURL||req.user?.picture||'',2048),text,createdAtMs:now};
    const disappearingMs=Number(ctx.group.permissions?.disappearingMessagesMs||0);if([86400000,604800000,7776000000].includes(disappearingMs))payload.expiresAtMs=now+disappearingMs;
    if(attachment)payload.attachment={kind:cleanText(attachment.kind,20),name:cleanText(attachment.name,180),size:Math.max(0,Number(attachment.size)||0),sizeLabel:cleanText(attachment.sizeLabel,40),contentType:cleanText(attachment.contentType,100),url:cleanText(attachment.url,2048),path:cleanText(attachment.path,1024)};
    const replyTo=req.body?.replyTo&&typeof req.body.replyTo==='object'?req.body.replyTo:null;if(replyTo)payload.replyTo={id:cleanText(replyTo.id,128),authorName:cleanText(replyTo.authorName,100),text:cleanText(replyTo.text,160)};
    const ref=await ctx.groupRef.collection('messages').add(payload);
    // Acknowledge the chat write immediately. Member fan-out and push delivery are
    // intentionally off the critical path so a large group cannot make Send feel slow.
    res.status(201).json({ok:true,messageId:ref.id});
    (async()=>{
      try{
        const members=await ctx.groupRef.collection('members').get();
        const recipients=members.docs.map(d=>d.id).filter(uid=>uid!==req.user.uid);
        const handle=payload.authorUsername?`@${payload.authorUsername}`:'';
        const mentionedAll=/(^|\s)@(all|everyone)(?=\s|[.,!?]|$)/i.test(text);
        const mentionedUids=members.docs.filter(d=>{const m=d.data()||{};return m.username&&new RegExp(`(^|\\s)@${String(m.username).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?=\\s|[.,!?]|$)`,'i').test(text)}).map(d=>d.id);
        const title=`${ctx.group.name||'Study Group'} • ${payload.authorName}`;
        const url=`./community.html?joinGroup=${encodeURIComponent(groupId)}&message=${encodeURIComponent(ref.id)}`;
        const targets=mentionedAll?recipients:[...new Set([...recipients,...mentionedUids])];
        await Promise.allSettled([
          ...targets.map(uid=>createUserNotification(uid,{title:mentionedUids.includes(uid)||mentionedAll?`Mention in ${ctx.group.name||'Study Group'}`:title,body:text||attachment?.name||'Sent an attachment',url,type:mentionedUids.includes(uid)||mentionedAll?'mention':'group',sourceId:ref.id})),
          pushToUsers(targets,{title,body:text||attachment?.name||'Sent an attachment',url,tag:`group-${groupId}`,data:{type:'group',groupId,messageId:ref.id,author:handle}})
        ]);
      }catch(error){console.warn('[groups] async notification fan-out failed',error?.message||error);}
    })();
    return;
  }catch(error){next(error);}
});


router.patch('/:groupId/messages/:messageId',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);
    const {groupId,messageId}=req.params,ctx=await groupContext(groupId,req.user.uid);
    if(!ctx.member&&!ctx.owner)return res.status(403).json({message:'Join the group first.'});
    const ref=ctx.groupRef.collection('messages').doc(messageId),snap=await ref.get();
    if(!snap.exists)return res.status(404).json({message:'Message not found.'});
    const row=snap.data()||{};if(row.uid!==req.user.uid)return res.status(403).json({message:'Only the sender can edit this message.'});
    if(row.deletedForEveryoneAtMs)return res.status(409).json({message:'A deleted message cannot be edited.'});
    const age=Date.now()-Number(row.createdAtMs||0);if(age<0||age>15*60*1000)return res.status(409).json({message:'Messages can only be edited for 15 minutes after sending.'});
    if(row.attachment)return res.status(409).json({message:'Messages with media or attachments cannot be edited.'});
    const text=cleanText(req.body?.text,1000);if(!text)return res.status(400).json({message:'Message cannot be empty.'});
    await ref.update({text,editedAtMs:Date.now(),updatedAtMs:Date.now()});return res.json({ok:true,messageId,text});
  }catch(error){next(error);}
});
router.delete('/:groupId/messages/:messageId',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);
    const {groupId,messageId}=req.params,ctx=await groupContext(groupId,req.user.uid);
    const ref=ctx.groupRef.collection('messages').doc(messageId),snap=await ref.get();if(!snap.exists)return res.json({ok:true,deleted:false});
    const row=snap.data()||{};if(row.uid!==req.user.uid&&!ctx.admin)return res.status(403).json({message:'Only the sender or a group admin can delete this message.'});
    if(row.deletedForEveryoneAtMs)return res.json({ok:true,deleted:true,messageId,alreadyDeleted:true});
    const age=Date.now()-Number(row.createdAtMs||0);if(age<0||age>2*24*60*60*1000)return res.status(409).json({message:'Delete for everyone is available for 2 days after sending.'});
    const now=Date.now();await ref.update({text:'',attachment:null,replyTo:null,reactions:{},deletedForEveryoneAtMs:now,deletedByUid:req.user.uid,deletedByAdmin:row.uid!==req.user.uid,updatedAtMs:now});return res.json({ok:true,deleted:true,messageId});
  }catch(error){next(error);}
});
router.post('/:groupId/messages/:messageId/reactions',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);
    const {groupId,messageId}=req.params,ctx=await groupContext(groupId,req.user.uid);if(!ctx.member&&!ctx.owner)return res.status(403).json({message:'Join the group first.'});
    const emoji=cleanText(req.body?.emoji,8);if(!['👍','❤️','😂','😮','😢','🙏','🔥','✅'].includes(emoji))return res.status(400).json({message:'Unsupported reaction.'});
    const ref=ctx.groupRef.collection('messages').doc(messageId);let removed=false;await firestore.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)throw Object.assign(new Error('Message not found.'),{status:404});const reactions={...(snap.data()?.reactions||{})};if(reactions[req.user.uid]===emoji){delete reactions[req.user.uid];removed=true;}else reactions[req.user.uid]=emoji;tx.update(ref,{reactions,reactionsUpdatedAtMs:Date.now()});});return res.json({ok:true,emoji,removed});
  }catch(error){next(error);}
});
router.post('/:groupId/messages/:messageId/pin',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);const {groupId,messageId}=req.params,ctx=await groupContext(groupId,req.user.uid);
    if(!ctx.admin)return res.status(403).json({message:'Only group admins can pin messages.'});
    const msg=await ctx.groupRef.collection('messages').doc(messageId).get();if(!msg.exists)return res.status(404).json({message:'Message not found.'});
    await ctx.groupRef.collection('pinned').doc(messageId).set({messageId,pinnedBy:req.user.uid,pinnedAtMs:Date.now()});return res.json({ok:true,pinned:true,messageId});
  }catch(error){next(error);}
});
router.delete('/:groupId/messages/:messageId/pin',async(req,res,next)=>{
  try{if(!firebaseAdminDataReady||!firestore)return unavailable(res);const {groupId,messageId}=req.params,ctx=await groupContext(groupId,req.user.uid);if(!ctx.admin)return res.status(403).json({message:'Only group admins can unpin messages.'});await ctx.groupRef.collection('pinned').doc(messageId).delete();return res.json({ok:true,pinned:false,messageId});}catch(error){next(error);}
});

router.delete('/:groupId',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);
    const ctx=await groupContext(req.params.groupId,req.user.uid);
    if(!ctx.owner)return res.status(403).json({message:'Only the group owner can delete this group.'});
    await cleanupDissolvedGroup(ctx.groupRef);return res.json({ok:true,deleted:true});
  }catch(error){next(error);}
});

async function groupContext(groupId,uid){
  const groupRef=firestore.collection('groups').doc(groupId);
  const memberRef=groupRef.collection('members').doc(uid);
  const [groupSnap,memberSnap]=await Promise.all([groupRef.get(),memberRef.get()]);
  if(!groupSnap.exists)throw Object.assign(new Error('Group not found.'),{status:404});
  const group=groupSnap.data()||{}; const member=memberSnap.exists?memberSnap.data()||{}:null;
  const owner=group.ownerUid===uid; const admin=owner||member?.role==='admin';
  return {groupRef,group,member,owner,admin};
}

router.patch('/:groupId/members/:memberUid/role',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);
    const {groupId,memberUid}=req.params; const role=String(req.body?.role||'');
    if(!['member','admin'].includes(role))return res.status(400).json({message:'Role must be member or admin.'});
    const ctx=await groupContext(groupId,req.user.uid);
    if(!ctx.owner)return res.status(403).json({message:'Only the group owner can change admin roles.'});
    if(memberUid===ctx.group.ownerUid)return res.status(409).json({message:'The owner role cannot be changed.'});
    const targetRef=ctx.groupRef.collection('members').doc(memberUid),target=await targetRef.get();
    if(!target.exists)return res.status(404).json({message:'Member not found.'});
    await targetRef.update({role});
    return res.json({ok:true,memberUid,role});
  }catch(error){next(error);}
});

router.post('/:groupId/transfer-ownership',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);
    const {groupId}=req.params; const memberUid=String(req.body?.memberUid||'');
    if(!memberUid)return res.status(400).json({message:'memberUid is required.'});
    const ctx=await groupContext(groupId,req.user.uid);
    if(!ctx.owner)return res.status(403).json({message:'Only the current owner can transfer ownership.'});
    if(memberUid===req.user.uid)return res.status(409).json({message:'You already own this group.'});
    const targetRef=ctx.groupRef.collection('members').doc(memberUid),meRef=ctx.groupRef.collection('members').doc(req.user.uid);
    await firestore.runTransaction(async tx=>{
      const target=await tx.get(targetRef); if(!target.exists)throw Object.assign(new Error('Member not found.'),{status:404});
      const targetData=target.data()||{};
      tx.update(ctx.groupRef,{ownerUid:memberUid,ownerName:String(targetData.name||'Student').slice(0,100),updatedAtMs:Date.now()});
      tx.update(targetRef,{role:'owner'}); tx.update(meRef,{role:'admin'});
    });
    return res.json({ok:true,ownerUid:memberUid});
  }catch(error){next(error);}
});

router.delete('/:groupId/members/:memberUid',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);
    const {groupId,memberUid}=req.params; const ctx=await groupContext(groupId,req.user.uid);
    if(!ctx.admin)return res.status(403).json({message:'Only group admins can remove members.'});
    const targetRef=ctx.groupRef.collection('members').doc(memberUid),targetSnap=await targetRef.get();
    if(!targetSnap.exists)return res.status(404).json({message:'Member not found.'});
    const target=targetSnap.data()||{};
    if(memberUid===ctx.group.ownerUid||target.role==='owner')return res.status(409).json({message:'The group owner cannot be removed.'});
    if(!ctx.owner&&target.role==='admin')return res.status(403).json({message:'Only the owner can remove another admin.'});
    await targetRef.delete();
    const count=await syncMemberCount(ctx.groupRef);
    return res.json({ok:true,memberUid,memberCount:count});
  }catch(error){next(error);}
});

router.patch('/:groupId/permissions',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);
    const {groupId}=req.params; const ctx=await groupContext(groupId,req.user.uid);
    if(!ctx.owner)return res.status(403).json({message:'Only the group owner can change group permissions.'});
    const allowed=['membersCanEdit','membersCanSend','membersCanInvite','historyVisible','approvalRequired'];
    const incoming=req.body?.permissions||{}; const next={...(ctx.group.permissions||{})};
    for(const key of allowed)if(typeof incoming[key]==='boolean')next[key]=incoming[key];
    if('disappearingMessagesMs' in incoming){const ms=Number(incoming.disappearingMessagesMs||0);if(![0,86400000,604800000,7776000000].includes(ms))return res.status(400).json({message:'Disappearing messages must be Off, 24 hours, 7 days, or 90 days.'});next.disappearingMessagesMs=ms;}
    await ctx.groupRef.update({permissions:next,updatedAtMs:Date.now()});
    return res.json({ok:true,permissions:next});
  }catch(error){next(error);}
});

router.post('/:groupId/join-request',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);
    const {groupId}=req.params,ctx=await groupContext(groupId,req.user.uid);
    if(ctx.member||ctx.owner)return res.json({ok:true,requested:false,status:'member'});
    const now=Date.now(),ref=ctx.groupRef.collection('joinRequests').doc(req.user.uid);
    const existing=await ref.get();
    const payload={uid:req.user.uid,name:cleanText(req.body?.name||req.user?.name||req.user?.email?.split('@')[0]||'Student',100)||'Student',username:safeUsername(req.body?.username,req),photoURL:cleanText(req.body?.photoURL||req.user?.picture||'',2048),status:'pending',createdAtMs:existing.exists?Number(existing.data()?.createdAtMs||now):now,updatedAtMs:now};
    await ref.set(payload,{merge:true});
    return res.status(existing.exists?200:201).json({ok:true,requested:true,status:'pending'});
  }catch(error){next(error);}
});

router.get('/:groupId/join-requests',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);
    const ctx=await groupContext(req.params.groupId,req.user.uid);
    if(!ctx.admin)return res.status(403).json({message:'Only group admins can view join requests.'});
    const snap=await ctx.groupRef.collection('joinRequests').orderBy('createdAtMs','desc').limit(100).get();
    const requests=snap.docs.map(d=>({id:d.id,...(d.data()||{})}));
    return res.json({ok:true,requests});
  }catch(error){next(error);}
});

router.post('/:groupId/join-requests/:memberUid/approve',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);
    const {groupId,memberUid}=req.params; const ctx=await groupContext(groupId,req.user.uid);
    if(!ctx.admin)return res.status(403).json({message:'Only group admins can approve join requests.'});
    const reqRef=ctx.groupRef.collection('joinRequests').doc(memberUid),memberRef=ctx.groupRef.collection('members').doc(memberUid);
    await firestore.runTransaction(async tx=>{
      const [requestSnap,memberSnap]=await Promise.all([tx.get(reqRef),tx.get(memberRef)]);
      if(!requestSnap.exists)throw Object.assign(new Error('Join request not found.'),{status:404});
      const r=requestSnap.data()||{};
      if(!memberSnap.exists)tx.set(memberRef,{uid:memberUid,name:String(r.name||'Student').slice(0,100),username:String(r.username||'student').toLowerCase().replace(/[^a-z0-9._]/g,'').slice(0,20)||'student',photoURL:String(r.photoURL||'').slice(0,2048),role:'member',joinedAtMs:Date.now()});
      tx.update(reqRef,{status:'approved',updatedAtMs:Date.now()});
    });
    const count=await syncMemberCount(ctx.groupRef);
    return res.json({ok:true,memberUid,status:'approved',memberCount:count});
  }catch(error){next(error);}
});

router.post('/:groupId/join-requests/:memberUid/reject',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);
    const {groupId,memberUid}=req.params; const ctx=await groupContext(groupId,req.user.uid);
    if(!ctx.admin)return res.status(403).json({message:'Only group admins can reject join requests.'});
    const reqRef=ctx.groupRef.collection('joinRequests').doc(memberUid),snap=await reqRef.get();
    if(!snap.exists)return res.status(404).json({message:'Join request not found.'});
    await reqRef.update({status:'rejected',updatedAtMs:Date.now()});
    return res.json({ok:true,memberUid,status:'rejected'});
  }catch(error){next(error);}
});

router.get('/:groupId/invite',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);
    const {groupId}=req.params,ctx=await groupContext(groupId,req.user.uid);
    const allowed=ctx.owner||ctx.admin||(ctx.member&&ctx.group.permissions?.membersCanInvite!==false);
    if(!allowed)return res.status(403).json({message:'You do not have permission to create an invite for this group.'});
    const snap=await ctx.groupRef.collection('private').doc('invite').get();
    // Legacy groups may still have the historical public inviteCode. Return it only
    // through this authenticated endpoint and do not migrate/delete production data.
    const code=String(snap.exists?snap.data()?.code:(ctx.group.inviteCode||'')).trim();
    if(!code)return res.status(409).json({message:'This group has no active invite code. The owner can reset the invite link.'});
    return res.json({ok:true,inviteCode:code});
  }catch(error){next(error);}
});

router.post('/:groupId/reset-invite',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);
    const {groupId}=req.params; const ctx=await groupContext(groupId,req.user.uid);
    if(!ctx.owner)return res.status(403).json({message:'Only the group owner can reset the invite link.'});
    const inviteCode=Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);
    await ctx.groupRef.collection('private').doc('invite').set({code:inviteCode,updatedAtMs:Date.now()},{merge:true});
    // Blank the legacy public field for newly-reset groups without deleting legacy data.
    await ctx.groupRef.update({inviteCode:'',updatedAtMs:Date.now(),schemaVersion:240});
    const verify=await ctx.groupRef.collection('private').doc('invite').get();
    if(!verify.exists||String(verify.data()?.code||'')!==inviteCode)throw Object.assign(new Error('Invite reset could not be verified.'),{status:503});
    return res.json({ok:true,inviteCode});
  }catch(error){next(error);}
});


async function deleteCollectionDocs(collectionRef){
  const snap=await collectionRef.get();
  for(let i=0;i<snap.docs.length;i+=400){
    const batch=firestore.batch();
    snap.docs.slice(i,i+400).forEach(doc=>batch.delete(doc.ref));
    await batch.commit();
  }
}
async function cleanupDissolvedGroup(groupRef){
  for(const name of ['messages','members','joinRequests','pinned','private']){
    await deleteCollectionDocs(groupRef.collection(name));
  }
  await groupRef.delete().catch(()=>{});
}

router.post('/maintenance/repair-all',async(req,res)=>{
  // Deliberately disabled. Legacy automatic repair/delete flows could remove valid
  // groups during transient listener or owner-membership inconsistencies. Repairs
  // are now explicit and non-destructive per group.
  return res.status(410).json({ok:false,disabled:true,message:'Bulk group repair is disabled. No group data was changed.'});
});

router.post('/:groupId/leave',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);
    const {groupId}=req.params,uid=req.user.uid;
    const groupRef=firestore.collection('groups').doc(groupId),membersRef=groupRef.collection('members');
    const [groupSnap,membersSnap]=await Promise.all([groupRef.get(),membersRef.get()]);
    if(!groupSnap.exists)return res.status(404).json({message:'Group not found.'});
    const group=groupSnap.data()||{},members=membersSnap.docs.map(d=>({id:d.id,...(d.data()||{})}));
    if(!members.some(m=>m.id===uid))return res.json({ok:true,left:false,reason:'not-member'});
    if(group.ownerUid===uid){
      if(members.length>1)return res.status(409).json({message:'Transfer ownership before leaving this group.'});
      await cleanupDissolvedGroup(groupRef);
      return res.json({ok:true,left:true,dissolved:true,reason:'sole-owner-dissolution'});
    }
    await membersRef.doc(uid).delete();
    const count=await syncMemberCount(groupRef);
    return res.json({ok:true,left:true,dissolved:false,ownerUid:group.ownerUid,memberCount:count});
  }catch(error){next(error);}
});

router.post('/:groupId/repair',async(req,res,next)=>{
  try{
    if(!firebaseAdminDataReady||!firestore)return unavailable(res);
    const {groupId}=req.params,groupRef=firestore.collection('groups').doc(groupId),membersRef=groupRef.collection('members');
    const [groupSnap,membersSnap]=await Promise.all([groupRef.get(),membersRef.get()]);
    if(!groupSnap.exists)return res.status(404).json({message:'Group not found.'});
    const group=groupSnap.data()||{},members=membersSnap.docs.map(d=>({id:d.id,...(d.data()||{})}));
    const caller=members.find(m=>m.id===req.user.uid);
    if(group.ownerUid!==req.user.uid&&caller?.role!=='admin')return res.status(403).json({message:'Only the owner or an admin can inspect group integrity.'});
    if(!members.length)return res.status(409).json({ok:false,needsRepair:true,message:'No membership documents exist. No data was deleted.'});
    const owner=members.find(m=>m.id===group.ownerUid);
    if(!owner)return res.status(409).json({ok:false,needsRepair:true,message:'The declared owner membership is missing. Transfer/recovery must be handled explicitly; no data was changed.'});
    const count=members.length;
    await firestore.runTransaction(async tx=>{
      tx.update(groupRef,{memberCount:count,updatedAtMs:Date.now(),schemaVersion:240});
      if(owner.role!=='owner')tx.update(membersRef.doc(owner.id),{role:'owner'});
      for(const member of members)if(member.id!==owner.id&&member.role==='owner')tx.update(membersRef.doc(member.id),{role:'admin'});
    });
    return res.json({ok:true,dissolved:false,ownerUid:owner.id,memberCount:count});
  }catch(error){next(error);}
});

export default router;
