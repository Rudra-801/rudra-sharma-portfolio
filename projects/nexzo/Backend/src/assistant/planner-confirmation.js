/* Transaction boundary shared by the real Firestore adapter and behavioural tests. */
export async function confirmPlannerTransaction(db,uid,id,{parse,stamp,now=Date.now()}={}){
  if(!db)throw Object.assign(new Error('Planner cloud save is unavailable. Please retry later.'),{status:503});
  const actionRef=db.collection('users').doc(uid).collection('assistantActions').doc(id);
  const taskId='assistant_'+id,taskRef=db.collection('users').doc(uid).collection('tasks').doc(taskId);
  await db.runTransaction(async tx=>{
    const snap=await tx.get(actionRef),data=snap.exists?snap.data():null;
    if(!data||data.uid!==uid)throw Object.assign(new Error('Action not found.'),{status:404});
    if(data.status==='completed')return;
    if(data.status!=='pending'||Number(data.expiresAtMs)<now)throw Object.assign(new Error('Action expired. Please request a new task.'),{status:409});
    if(data.type!=='planner.createTask')throw Object.assign(new Error('Unsupported action.'),{status:400});
    const p=parse(data.payload),deadlineMs=p.deadlineDate?new Date(`${p.deadlineDate}T${p.deadlineTime}:00`).getTime():null;
    const task={id:taskId,uid,title:p.title,subject:p.subject,type:p.type,taskType:p.type,level:p.level,difficulty:p.level,duration:p.durationMinutes,priority:p.priority,status:'pending',progress:0,completed:false,done:false,elapsed:0,actualMinutes:0,running:false,lastStarted:null,deadline:p.deadlineDate||'',scheduledDate:p.deadlineDate||'',deadlineTime:p.deadlineTime,deadlineMs:Number.isFinite(deadlineMs)?deadlineMs:null,deadlineAt:Number.isFinite(deadlineMs)?new Date(deadlineMs).toISOString():null,sessions:[],source:'nexzo-assistant',assistantActionId:id,created:new Date(now).toISOString(),createdAtMs:now,updatedAtMs:now};
    tx.set(taskRef,{...task,updatedAt:stamp()});
    tx.set(actionRef,{status:'completed',result:{ok:true,type:data.type,task},completedAtMs:now},{merge:true});
  });
  const [actionSnap,taskSnap]=await Promise.all([actionRef.get(),taskRef.get()]);
  const result=actionSnap.data()?.result,task=taskSnap.data();
  if(actionSnap.data()?.uid!==uid||result?.task?.id!==taskId||task?.uid!==uid||task?.assistantActionId!==id)throw Object.assign(new Error('Planner save could not be confirmed. Please retry.'),{status:503});
  return result;
}
