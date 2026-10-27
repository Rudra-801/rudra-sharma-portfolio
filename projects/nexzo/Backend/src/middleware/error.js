import { ZodError } from "zod";

export function notFound(req, res){
  res.status(404).json({ ok:false, message: `Route not found: ${req.method} ${req.originalUrl}`, requestId:req.requestId });
}

export function errorHandler(error, req, res, next){
  const isValidation = error instanceof ZodError || error?.name === "ZodError";
  const isUploadTooLarge = error?.code === "LIMIT_FILE_SIZE";
  const isTooManyFiles = error?.code === "LIMIT_FILE_COUNT" || error?.code === "LIMIT_UNEXPECTED_FILE";
  const status = isValidation ? 400 : isUploadTooLarge ? 413 : isTooManyFiles ? 400 : (Number(error?.status) || 500);
  console.error(JSON.stringify({
    level:"error",
    requestId:req?.requestId || null,
    status,
    code:error?.code,
    errorType:error?.name || 'Error',
    issues:isValidation ? error.issues : undefined
  }));
  const safeAcademic=['AI_QUOTA_EXCEEDED','MODEL_UNAVAILABLE','AUTH_CONFIGURATION_ERROR','PROVIDER_TIMEOUT','INVALID_AI_RESPONSE','BACKEND_UNAVAILABLE'].includes(error?.code);
  res.status(status).json({
    ...(error?.code?{code:error.code,retryable:!!error.retryable}:{}),
    ok:false,
    message: isValidation ? "Invalid request data" : isUploadTooLarge ? "An uploaded file is larger than 5 MB" : isTooManyFiles ? "The upload contains too many files" : (safeAcademic ? error.message : status >= 500 ? "This request could not finish. Please retry; no successful save or score is confirmed." : error.message),
    ...(isValidation ? { issues:error.issues.map(issue=>({ path:issue.path.join('.'), message:issue.message })) } : {}),
    ...(process.env.NODE_ENV !== "production" && !isValidation && !safeAcademic ? { detail:error.message } : {}),
    requestId:req?.requestId || null
  });
}
