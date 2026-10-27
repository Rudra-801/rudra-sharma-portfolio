export function bearerToken(header=''){
  const value=String(header||'');
  if(!value.startsWith('Bearer ')) return '';
  return value.slice(7).trim();
}

export function emailVerificationDecision(user={}){
  const provider=user?.firebase?.sign_in_provider||'';
  const requiresVerification=provider==='password'&&Boolean(user?.email);
  return {
    allowed:!requiresVerification||user?.email_verified===true,
    code:requiresVerification&&user?.email_verified!==true?'EMAIL_NOT_VERIFIED':''
  };
}
