const text=(value,max=160)=>typeof value==='string'?value.slice(0,max):'';
const read=snap=>snap.exists?(snap.data()?.data||snap.data()||{}):{};
export async function trustedAssistantInput(db,uid,input){
  const context=input.context||{};
  const safeContext={mode:input.mode,localDate:text(context.localDate,10),timeZone:text(context.timeZone,80),
    workflowAction:text(context.workflowAction,20),sourceContext:text(context.sourceContext,14000),subject:text(context.subject),difficulty:text(context.difficulty,30)};
  if(input.personalization===false||context.personalization?.enabled===false)return {...input,personalization:false,context:{...safeContext,personalization:{enabled:false}}};
  if(!db)return {...input,personalization:false,context:{...safeContext,personalization:{enabled:false}}};
  const settings=read(await db.doc(`users/${uid}/settings/main`).get());
  if(settings.personalizationConsent===false||settings.personalization===false)return {...input,personalization:false,context:{...safeContext,personalization:{enabled:false}}};
  const stored=read(await db.doc(`users/${uid}/personalization/main`).get()),profile=stored.profile||{};
  const personal={enabled:true,course:text(profile.course),branch:text(profile.branch),semester:text(String(profile.semester||'')),
    subjects:(Array.isArray(profile.subjects)?profile.subjects:[]).filter(v=>typeof v==='string').slice(0,12),language:text(settings.language||profile.language,40),explanationStyle:text(profile.explanationStyle)};
  // Workload is useful for planning, not for every definition or code question.
  if(/\b(plan|schedule|task|exam|deadline|today|tomorrow|kal)\b/i.test(input.message)){
    personal.careerGoal=text(profile.careerGoal);
    if(Number.isFinite(Number(profile.dailyMinutes)))personal.dailyMinutes=Number(profile.dailyMinutes);
    const tasks=await db.collection(`users/${uid}/tasks`).limit(30).get();
    personal.pendingTasks=tasks.docs.map(s=>s.data()).filter(t=>!t.completed&&!t.done&&t.status!=='completed').slice(0,6).map(t=>({title:text(t.title),subject:text(t.subject),deadline:text(t.deadline||t.scheduledDate,20)}));
  }
  return {...input,personalization:true,context:{...safeContext,personalization:personal}};
}
