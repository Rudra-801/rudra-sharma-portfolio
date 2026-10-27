export function readiness({firebaseProjectConfigured=false,geminiConfigured=false,firebaseAdminDataConfigured=false,firebaseAdminDataReachable=false}={}){
  const checks={
    firebaseProjectConfigured:Boolean(firebaseProjectConfigured),
    geminiConfigured:Boolean(geminiConfigured),
    firebaseAdminDataConfigured:Boolean(firebaseAdminDataConfigured),
    firebaseAdminDataReachable:Boolean(firebaseAdminDataReachable)
  };
  return Object.freeze({ready:Object.values(checks).every(Boolean),...checks});
}
