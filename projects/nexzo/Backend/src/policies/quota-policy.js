export function utcDayKey(date=new Date()){
  return date.toISOString().slice(0,10);
}
export function quotaDecision({count=0,limit=1}={}){
  const safeLimit=Math.max(1,Number(limit)||1);
  const safeCount=Math.max(0,Number(count)||0);
  return Object.freeze({
    allowed:safeCount<safeLimit,
    limit:safeLimit,
    current:safeCount,
    next:safeCount+1,
    remaining:Math.max(0,safeLimit-safeCount-1)
  });
}
